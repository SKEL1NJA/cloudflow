-- AlterTable
ALTER TABLE "workflow_executions" ADD COLUMN     "backoff_base_ms" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "max_attempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_max_attempts_check" CHECK ("max_attempts" BETWEEN 1 AND 10);
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_backoff_base_ms_check" CHECK ("backoff_base_ms" >= 100);
