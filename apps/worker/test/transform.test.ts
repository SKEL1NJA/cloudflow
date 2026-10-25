import { describe, expect, it } from 'vitest';
import { runTransform } from '../src/executors/transform.js';
import { StepError } from '../src/executors/types.js';

describe('runTransform', () => {
  it('copies nested values and array items to the target keys', () => {
    const output = runTransform(
      {
        mappings: [
          { target: 'id', source: 'data.user.id' },
          { target: 'first', source: 'items.0' },
        ],
      },
      { data: { user: { id: 7 } }, items: ['a', 'b'] },
    );
    expect(output).toEqual({ id: 7, first: 'a' });
  });

  it('fails without retry when a source path is missing', () => {
    try {
      runTransform({ mappings: [{ target: 'x', source: 'nope.here' }] }, {});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StepError);
      expect((err as StepError).retryable).toBe(false);
    }
  });

  it('cannot read inherited properties', () => {
    expect(() =>
      runTransform({ mappings: [{ target: 'x', source: 'constructor.name' }] }, {}),
    ).toThrow(StepError);
  });

  it('cannot pollute the prototype through a target key', () => {
    const output = runTransform(
      { mappings: [{ target: '__proto__', source: 'a' }] },
      { a: { polluted: true } },
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(output as object, '__proto__')).toBe(true);
  });
});
