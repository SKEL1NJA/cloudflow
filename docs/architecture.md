# Cloud architecture and scaling

This describes how CloudFlow would run on AWS. It is a design, not a deployment. Prices and limits must be checked against current AWS documentation before use.

## Mapping

| Local component  | AWS service                                         | Notes                                                                                             |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| web (nginx)      | S3 + CloudFront                                     | Static build with SPA fallback. Security headers set by a CloudFront response headers policy.     |
| api container    | ECS Fargate service behind an ALB                   | Stateless. Health check on /health, readiness on /health/ready.                                   |
| worker container | ECS Fargate service                                 | Stateless. Scales on backlog. Runs in private subnets with a NAT gateway for outbound HTTP steps. |
| migrate job      | ECS one-off task run by the deploy pipeline         | Runs before the new API and worker task definitions are rolled out.                               |
| postgres         | RDS for PostgreSQL, Multi-AZ                        | Private subnets, encrypted at rest, automated backups and point-in-time recovery.                 |
| redis            | ElastiCache for Redis (replication group, Multi-AZ) | noeviction policy and AOF are required, see Risks.                                                |
| env_file secrets | Secrets Manager injected into task definitions      | JWT secret, database URL, metrics token.                                                          |
| logs and metrics | CloudWatch Logs and metrics                         | Pino JSON logs ship as is. Prometheus metrics are scraped or converted.                           |
| images           | ECR                                                 | Replaces GHCR when deploying inside AWS.                                                          |

## Network

One VPC across two availability zones. Public subnets hold the ALB and NAT gateways. Private subnets hold ECS tasks. Isolated subnets hold RDS and ElastiCache with no route to the internet. Security groups allow ALB to API, API and worker to RDS and Redis, and nothing else inbound. This is the same segmentation as the compose stack, enforced by AWS instead of Docker networks.

## Scaling by tier

**Workers.** Throughput is bounded by job slots (tasks times WORKER_CONCURRENCY). The scaling signal is backlog per slot, computed from the waiting and delayed counts the queue already exposes. A small publisher (or the API's existing queue endpoint scraped on a schedule) writes it as a CloudWatch metric, and ECS target tracking keeps it near a target such as 2 waiting jobs per slot. Scale out is quick, scale in is slow, and the long stop_grace_period plus graceful shutdown means a scaled-in worker finishes its running step first. Set the ECS stop timeout above the longest step.

**API.** CPU-bound on Argon2 during sign-in and JSON work otherwise. Target tracking on CPU, with ALB request count per target as a second signal. Minimum two tasks across two zones. Server-sent event connections are long lived, so scale in must drain connections, and the client already reconnects with resync.

**Database.** Start with a single Multi-AZ instance. The first bottleneck is the dashboard and list queries (aggregations over executions and logs), so add a read replica and route read-only monitoring queries to it before anything else. Then partition execution_logs and step_executions by time, with a retention job that drops old partitions. Keep connections bounded with RDS Proxy or PgBouncer once task count grows.

**Redis.** One shard is enough for a long time. BullMQ uses Lua scripts and expects its keys on one node, so cluster mode needs hash-tagged queue names. Scale vertically first. The Redis Streams event log is trimmed, so it does not grow without bound.

**Frontend.** CloudFront absorbs static traffic. Hashed asset filenames allow a one year cache, and index.html is never cached.

## Failure modes

| Failure                   | What happens                                                                | Why it is safe                                                      |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Worker task dies mid-step | The job stalls, the reconciler requeues it, the attempt count rises         | At-least-once delivery, idempotency key sent on outbound HTTP calls |
| All workers down          | Waiting count grows, the queue page warns, autoscaling starts tasks         | Work is durable in Redis and Postgres                               |
| API task dies             | ALB stops routing, ECS replaces it, clients reconnect                       | No session state in the process                                     |
| Redis failover            | Brief errors, workers and API reconnect, reconciler recovers lost publishes | Postgres is the source of truth, Redis holds delivery state         |
| RDS failover              | A short outage of about a minute                                            | Health chip shows degraded, no restart needed                       |
| Bad deploy                | Rolling update fails health checks and rolls back                           | Migrations are additive and run before the rollout                  |
| AZ outage                 | Tasks and data stores in the other zone continue                            | Multi-AZ everywhere                                                 |

## Deployment

The pipeline from the CI milestone builds and scans images. A deploy stage would push to ECR, run the migrate task, wait for it to exit 0, then update the API and worker services. Authentication from GitHub to AWS uses OIDC with a role limited to that repository and branch, so no long lived keys are stored.

## Cost picture

The always-on floor is the NAT gateways, the ALB, RDS Multi-AZ, ElastiCache with a replica, and two small API tasks plus one worker. That is a few hundred dollars per month at small sizes, dominated by data stores and NAT. A single-AZ, no-replica variant for a demo costs roughly a third of that. Use the AWS pricing calculator for real figures. Worker cost scales with backlog, which is the point of scaling on queue depth.

## Risks and limits

- Redis eviction or loss of persistence can lose queued work. Use noeviction and AOF, and rely on the reconciler as the backstop.
- Header values in workflow steps are stored in plain text in Postgres. Production needs encryption at rest with application-level encryption or secret references.
- Single region. A regional outage means downtime until recovery from backups in another region.
- Access tokens cannot be revoked instantly (15 minute window).
- No per-tenant quotas, so one user can fill the queue. Per-user concurrency limits would be the next addition.
- The SSRF guard blocks private ranges by address, but DNS rebinding needs the connect-time check the HTTP executor performs. An egress proxy would add defense in depth.
