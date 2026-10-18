import type { JsonValue, TransformConfig } from '@cloudflow/shared';
import { StepError } from './types.js';

function readPath(root: JsonValue, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(key)) return undefined;
      current = current[Number(key)];
    } else {
      if (!Object.hasOwn(current, key)) return undefined;
      current = current[key];
    }
  }
  return current;
}

export function runTransform(config: TransformConfig, input: JsonValue): JsonValue {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new StepError('Transform input must be a JSON object', false);
  }

  const entries = config.mappings.map(({ target, source }): [string, JsonValue] => {
    const value = readPath(input, source);
    if (value === undefined) {
      throw new StepError(`Source path "${source}" was not found in the step input`, false);
    }
    return [target, value];
  });

  return Object.fromEntries(entries);
}