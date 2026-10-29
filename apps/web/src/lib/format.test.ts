import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatCountdown,
  formatDuration,
  formatLogTime,
  formatRelativeTime,
  formatUptime,
  shortExecutionId,
} from './format';

describe('formatDuration', () => {
  it.each([
    [null, '-'],
    [undefined, '-'],
    [0, '0ms'],
    [421, '421ms'],
    [999, '999ms'],
    [1000, '1.0s'],
    [4200, '4.2s'],
    [59_950, '59.9s'],
    [60_000, '1m'],
    [125_000, '2m 5s'],
    [3_600_000, '1h'],
    [5_400_000, '1h 30m'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it.each([
    [0, 'just now'],
    [4, 'just now'],
    [5, '5s ago'],
    [59, '59s ago'],
    [60, '1m ago'],
    [3599, '59m ago'],
    [3600, '1h ago'],
    [86_399, '23h ago'],
    [86_400, '1d ago'],
    [3 * 86_400, '3d ago'],
  ])('shows %s seconds as %s', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(expected);
  });

  it('treats timestamps slightly in the future as just now', () => {
    expect(formatRelativeTime(ago(-3), now)).toBe('just now');
  });
});

describe('small helpers', () => {
  it('shortens execution ids to the random tail', () => {
    expect(shortExecutionId('01a14cec-f85d-7079-b268-9c29038eb32d')).toBe('exec_038eb32d');
  });

  it('formats counts with grouping', () => {
    expect(formatCount(1234567)).toBe(new Intl.NumberFormat().format(1234567));
  });
});

describe('formatCountdown', () => {
  it.each([
    [1, '1 second'],
    [4, '4 seconds'],
    [59, '59 seconds'],
    [60, '1m'],
    [125, '2m 5s'],
  ])('shows %s seconds as %s', (seconds, expected) => {
    expect(formatCountdown(seconds)).toBe(expected);
  });
});

describe('formatLogTime', () => {
  it('shows local time with milliseconds', () => {
    expect(formatLogTime(new Date(2026, 9, 20, 14, 5, 9, 7).toISOString())).toBe('14:05:09.007');
  });
});

describe('formatUptime', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [60, '1m 0s'],
    [125, '2m 5s'],
    [3600, '1h 0m'],
    [7500, '2h 5m'],
    [86_400, '1d 0h'],
    [200_000, '2d 7h'],
  ])('shows %s seconds as %s', (seconds, expected) => {
    expect(formatUptime(seconds)).toBe(expected);
  });
});
