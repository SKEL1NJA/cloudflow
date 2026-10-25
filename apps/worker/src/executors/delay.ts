import type { DelayConfig, JsonValue } from '@cloudflow/shared';
import { setTimeout as sleep } from 'node:timers/promises';
import type { StepContext } from './types.js';

export async function runDelay(config: DelayConfig, ctx: StepContext): Promise<JsonValue> {
  await ctx.log('INFO', `Waiting ${config.durationMs}ms`);
  await sleep(config.durationMs);
  return { waitedMs: config.durationMs };
}
