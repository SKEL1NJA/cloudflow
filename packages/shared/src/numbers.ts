import { z } from 'zod';

export function wholeNumber(min: number, max: number) {
  const message = `Use a whole number from ${min} to ${max}`;
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}
