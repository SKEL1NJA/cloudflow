terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

variable "region" { default = "ap-south-1" }
variable "image_tag" {}

provider "aws" { region = var.region }

module "vpc" {
  source             = "terraform-aws-modules/vpc/aws"
  name               = "cloudflow"
  cidr               = "10.0.0.0/16"
  azs                = ["${var.region}a", "${var.region}b"]
  public_subnets     = ["10.0.0.0/24", "10.0.1.0/24"]
  private_subnets    = ["10.0.10.0/24", "10.0.11.0/24"]
  database_subnets   = ["10.0.20.0/24", "10.0.21.0/24"]
  enable_nat_gateway = true
}

resource "aws_db_instance" "postgres" {
  identifier                  = "cloudflow"
  engine                      = "postgres"
  engine_version              = "17"
  instance_class              = "db.t4g.medium"
  allocated_storage           = 50
  multi_az                    = true
  storage_encrypted           = true
  db_subnet_group_name        = module.vpc.database_subnet_group_name
  username                    = "cloudflow"
  manage_master_user_password = true
  backup_retention_period     = 7
  deletion_protection         = true
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "cloudflow-redis"
  family = "redis7"
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "cloudflow"
  description                = "queue and event stream"
  engine                     = "redis"
  node_type                  = "cache.t4g.small"
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  parameter_group_name       = aws_elasticache_parameter_group.redis.name
  subnet_group_name          = module.vpc.elasticache_subnet_group_name
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

resource "aws_ecs_cluster" "main" { name = "cloudflow" }

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.app.id]
  }
  lifecycle { ignore_changes = [desired_count] }
}

resource "aws_appautoscaling_target" "worker" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 1
  max_capacity       = 20
}

resource "aws_appautoscaling_policy" "worker_backlog" {
  name               = "backlog-per-slot"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  target_tracking_scaling_policy_configuration {
    target_value       = 2
    scale_in_cooldown  = 300
    scale_out_cooldown = 30
    customized_metric_specification {
      namespace   = "CloudFlow"
      metric_name = "BacklogPerSlot"
      statistic   = "Average"
    }
  }
}