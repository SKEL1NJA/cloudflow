import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryCountdown } from './retry-countdown';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RetryCountdown', () => {
  it('counts down every second and says when the retry is happening', () => {
    render(<RetryCountdown at="2026-10-20T12:00:04.000Z" />);
    expect(screen.getByText('in 4 seconds')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('in 3 seconds')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('in 1 second')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('retrying now')).toBeInTheDocument();
  });

  it('shows minutes for long waits', () => {
    render(<RetryCountdown at="2026-10-20T12:02:05.000Z" />);
    expect(screen.getByText('in 2m 5s')).toBeInTheDocument();
  });
});
