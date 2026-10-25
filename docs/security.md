# Security notes

## Scope and trust boundaries

CloudFlow has four boundaries: browser to API, API and worker to Postgres and Redis, worker to the internet (user-controlled URLs), and operators to the metrics and documentation endpoints. Everything a user sends is untrusted, including workflow definitions, which the worker later executes.

## Threats and mitigations

| Threat                                    | Mitigation                                                                                                                                             | Residual risk                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Password guessing and credential stuffing | Argon2id hashing, identical errors for unknown email and wrong password, failure lockouts per address and email and per address, per-address login cap | A botnet guessing one account from many addresses is only slowed by hashing cost. MFA or CAPTCHA would address it |
| Stolen access token                       | 15 minute lifetime, algorithm pinned to HS256, kept in browser memory only                                                                             | Valid until expiry. No server-side revocation of access tokens                                                    |
| Stolen refresh token                      | httpOnly, SameSite=Strict, path-scoped cookie, hashed at rest, single-use rotation, reuse revokes the whole family, 30 day absolute cap                | Two tabs refreshing at once look like reuse, so the client must serialize refreshes                               |
| CSRF                                      | Data endpoints use bearer tokens, not cookies. Cookie endpoints check Origin and rely on SameSite=Strict                                               | Requires the frontend and API to share a site                                                                     |
| XSS                                       | Tokens not readable by scripts, JSON responses carry a restrictive CSP                                                                                 | Script running in the page can still call the API while the page is open                                          |
| SSRF through HTTP steps                   | Private and internal ranges blocked at connect time, no redirects, response size and time limits, IP literals checked                                  | Per-tenant allow lists would be stronger                                                                          |
| Injection                                 | Prisma parameterization, tagged raw queries, Zod validation on bodies, params and queries                                                              | None known                                                                                                        |
| Broken access control                     | Every query scoped to the owner, foreign resources return 404, cross-user tests                                                                        | None known                                                                                                        |
| API key leakage                           | Stored as hashes, shown once, revocable, cannot manage keys, invalid-key throttling                                                                    | Keys have no scopes or expiry                                                                                     |
| Denial of service                         | 256 KB body limit, request timeout, layered rate limits, step time and size limits, worker concurrency                                                 | Fixed-window limiter allows boundary bursts and fails open if Redis is down                                       |
| Information leakage                       | Generic 500 responses, request ids, redacted auth headers in logs, docs and metrics can be restricted                                                  | Step configuration, including HTTP headers, is stored as plain JSON                                               |
| Supply chain                              | Lockfile, audit, Dependabot, major versions pinned                                                                                                     | Transitive dependencies are trusted                                                                               |

## Known limitations

Secrets inside step configuration are not encrypted at rest. There is no MFA, email verification or password reset. The signing key has no rotation scheme. Security events are logged but not kept in a dedicated audit trail.

## Production checklist

Set a long random JWT_SECRET and METRICS_TOKEN. Set CORS_ORIGINS to the real frontend origin only. Terminate TLS in front of the API and set TRUST_PROXY to match. Leave DOCS_ENABLED off or protect it. Keep Postgres and Redis off the public network and require Redis authentication. Run the worker with HTTP_ALLOW_PRIVATE_NETWORK off.
