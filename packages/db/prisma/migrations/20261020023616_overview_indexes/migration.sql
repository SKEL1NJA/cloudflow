-- CreateIndex
CREATE INDEX "step_executions_finished_at_idx" ON "step_executions"("finished_at");

-- CreateIndex
CREATE INDEX "workflow_executions_user_id_status_idx" ON "workflow_executions"("user_id", "status");
