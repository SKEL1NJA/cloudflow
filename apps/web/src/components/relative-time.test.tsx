import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelativeTime } from './relative-time';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-20T12:00:10.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('RelativeTime', () => {
  it('shows the elapsed time as a time element with the exact timestamp', () => {
    render(<RelativeTime iso="2026-10-20T12:00:00.000Z" />);

    const element = screen.getByText('10s ago');
    expect(element.tagName).toBe('TIME');
    expect(element).toHaveAttribute('datetime', '2026-10-20T12:00:00.000Z');
    expect(element).toHaveAttribute('title');
  });

  it('only refreshes when its own interval passes, not on every tick of the shared clock', () => {
    render(<RelativeTime iso="2026-10-20T12:00:00.000Z" />);

    advance(10_000);
    expect(screen.getByText('10s ago')).toBeInTheDocument();

    advance(10_000);
    expect(screen.getByText('30s ago')).toBeInTheDocument();
  });

  it('refreshes every second when asked to', () => {
    render(<RelativeTime iso="2026-10-20T12:00:00.000Z" intervalMs={1000} />);

    advance(1000);
    expect(screen.getByText('11s ago')).toBeInTheDocument();
    advance(2000);
    expect(screen.getByText('13s ago')).toBeInTheDocument();
  });

  it('stops its timer when nothing is using the clock any more', () => {
    const { unmount } = render(<RelativeTime iso="2026-10-20T12:00:00.000Z" />);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares one timer between many timestamps', () => {
    render(
      <>
        {Array.from({ length: 20 }, (_, index) => (
          <RelativeTime key={index} iso="2026-10-20T12:00:00.000Z" />
        ))}
      </>,
    );
    expect(vi.getTimerCount()).toBe(1);
  });
});
