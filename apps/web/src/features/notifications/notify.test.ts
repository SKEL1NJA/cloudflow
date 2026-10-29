import type { RealtimeEvent } from '@cloudflow/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyExecution, resetNotified, type Notice } from './notify';
import {
  DEFAULT_PREFERENCES,
  getNotificationPreferences,
  resetNotificationPreferences,
  setNotificationPreference,
} from './preferences';

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const EXECUTION = '01a14cec-f85d-7079-b268-9c29038eb40d';

function event(
  status: 'FAILED' | 'SUCCESS' | 'CANCELLED' | 'RUNNING',
  overrides: Partial<RealtimeEvent> = {},
): RealtimeEvent {
  return {
    type: 'execution.updated',
    workflowId: '01a14cec-f85d-7079-b268-9c29038eb32d',
    executionId: EXECUTION,
    status,
    at: new Date(NOW - 2000).toISOString(),
    ...overrides,
  } as RealtimeEvent;
}

const open = vi.fn();
let shown: Notice[];
const show = (notice: Notice) => {
  shown.push(notice);
};

beforeEach(() => {
  shown = [];
  resetNotified();
  resetNotificationPreferences();
});

describe('notifyExecution', () => {
  it('announces a failed execution by default, with a link to it', () => {
    notifyExecution(event('FAILED'), { open, now: NOW, show });

    expect(shown).toEqual([
      {
        kind: 'failed',
        title: 'Execution failed',
        description: 'exec_038eb40d',
        path: `/executions/${EXECUTION}`,
      },
    ]);
  });

  it('stays quiet about successes and cancellations until they are turned on', () => {
    notifyExecution(event('SUCCESS'), { open, now: NOW, show });
    notifyExecution(event('CANCELLED', { executionId: '01a14cec-f85d-7079-b268-9c29038eb41d' }), {
      open,
      now: NOW,
      show,
    });
    expect(shown).toHaveLength(0);

    setNotificationPreference('succeeded', true);
    notifyExecution(event('SUCCESS'), { open, now: NOW, show });
    expect(shown.map((notice) => notice.kind)).toEqual(['succeeded']);
  });

  it('respects a turned-off failure preference', () => {
    setNotificationPreference('failed', false);
    notifyExecution(event('FAILED'), { open, now: NOW, show });
    expect(shown).toHaveLength(0);
  });

  it('ignores states that are not final', () => {
    notifyExecution(event('RUNNING'), { open, now: NOW, show });
    notifyExecution({ ...event('FAILED'), type: 'step.updated' } as unknown as RealtimeEvent, {
      open,
      now: NOW,
      show,
    });
    expect(shown).toHaveLength(0);
  });

  it('ignores old events, which appear when a reconnect replays recent history', () => {
    notifyExecution(event('FAILED', { at: new Date(NOW - 61_000).toISOString() }), {
      open,
      now: NOW,
      show,
    });
    expect(shown).toHaveLength(0);
  });

  it('announces each execution outcome only once', () => {
    notifyExecution(event('FAILED'), { open, now: NOW, show });
    notifyExecution(event('FAILED'), { open, now: NOW, show });
    notifyExecution(event('FAILED', { executionId: '01a14cec-f85d-7079-b268-9c29038eb41d' }), {
      open,
      now: NOW,
      show,
    });
    expect(shown).toHaveLength(2);
  });
});

describe('preferences', () => {
  it('start with only failures turned on and can be changed and reset', () => {
    expect(getNotificationPreferences()).toEqual(DEFAULT_PREFERENCES);
    setNotificationPreference('cancelled', true);
    expect(getNotificationPreferences().cancelled).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem('cloudflow-notifications') ?? '{}'),
    ).toMatchObject({ cancelled: true });

    resetNotificationPreferences();
    expect(getNotificationPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});
