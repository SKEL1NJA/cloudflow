export type StepOutcomeKind = 'success' | 'retry' | 'failed';

export interface StepObserver {
  stepFinished(event: { type: string; outcome: StepOutcomeKind; durationMs: number }): void;
}