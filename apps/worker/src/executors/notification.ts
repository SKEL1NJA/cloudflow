import type { JsonValue, NotificationConfig } from '@cloudflow/shared';
import type { StepContext } from './types.js';

export async function runNotification(
  config: NotificationConfig,
  ctx: StepContext,
): Promise<JsonValue> {
  await ctx.log('INFO', `Notification: ${config.message}`);
  if (config.webhookUrl) {
    await ctx.log('WARN', 'Webhook delivery is not implemented yet, so no request was sent');
    return { delivered: 'log', webhook: 'skipped' };
  }
  return { delivered: 'log' };
}
