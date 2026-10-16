-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('HTTP_REQUEST', 'DELAY', 'TRANSFORM', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRYING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "backoff_base_ms" INTEGER NOT NULL DEFAULT 2000,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "StepType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" TEXT,
    "input" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_executions" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_id" UUID,
    "position" INTEGER NOT NULL,
    "type" "StepType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" "StepExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "worker_id" TEXT,
    "next_retry_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "step_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" BIGSERIAL NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_execution_id" UUID,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "workflows_user_id_updated_at_idx" ON "workflows"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "workflows_user_id_name_key" ON "workflows"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_id_position_key" ON "workflow_steps"("workflow_id", "position");

-- CreateIndex
CREATE INDEX "workflow_executions_workflow_id_created_at_idx" ON "workflow_executions"("workflow_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_executions_user_id_created_at_idx" ON "workflow_executions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_executions_status_created_at_idx" ON "workflow_executions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_executions_user_id_idempotency_key_key" ON "workflow_executions"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "step_executions_step_id_idx" ON "step_executions"("step_id");

-- CreateIndex
CREATE UNIQUE INDEX "step_executions_execution_id_position_key" ON "step_executions"("execution_id", "position");

-- CreateIndex
CREATE INDEX "execution_logs_execution_id_id_idx" ON "execution_logs"("execution_id", "id");

-- CreateIndex
CREATE INDEX "execution_logs_step_execution_id_idx" ON "execution_logs"("step_execution_id");

-- CreateIndex
CREATE INDEX "execution_logs_created_at_idx" ON "execution_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_step_execution_id_fkey" FOREIGN KEY ("step_execution_id") REFERENCES "step_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_max_attempts_check" CHECK ("max_attempts" BETWEEN 1 AND 10);
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_backoff_base_ms_check" CHECK ("backoff_base_ms" >= 100);
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_position_check" CHECK ("position" >= 0);
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_attempts_check" CHECK ("attempts" >= 0);