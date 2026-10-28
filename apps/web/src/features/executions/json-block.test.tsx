import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { JsonBlock } from './json-block';

describe('JsonBlock', () => {
  it('shows pretty-printed JSON', () => {
    render(<JsonBlock label="Output" value={{ id: 42, tags: ['a'] }} />);
    expect(screen.getByLabelText('Output')).toHaveTextContent('"id": 42');
  });

  it('says so when there is no data', () => {
    render(<JsonBlock label="Input" value={null} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });

  it('shows a preview of large values and reveals the rest on request', async () => {
    const large = { text: 'x'.repeat(10_000) };
    render(<JsonBlock label="Output" value={large} />);

    expect(screen.getByLabelText('Output').textContent?.length ?? 0).toBeLessThan(4100);
    await userEvent.click(screen.getByRole('button', { name: /Show all/ }));

    expect(screen.getByLabelText('Output').textContent?.length ?? 0).toBeGreaterThan(10_000);
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('does not crash when copying is not available', async () => {
    render(<JsonBlock label="Output" value={{ a: 1 }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });
});
