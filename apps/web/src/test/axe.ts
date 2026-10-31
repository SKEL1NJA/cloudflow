import axe, { type Result } from 'axe-core';
import { expect } from 'vitest';

const POPUP_MARKER = 'data-radix-popper-content-wrapper';

function isInsidePopup(node: Result['nodes'][number]): boolean {
  return node.target.some((selector) => String(selector).includes(POPUP_MARKER));
}

export async function findViolations(context: Element = document.body): Promise<Result[]> {
  const results = await axe.run(context, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });

  return results.violations
    .map((violation) =>
      violation.id === 'region'
        ? { ...violation, nodes: violation.nodes.filter((node) => !isInsidePopup(node)) }
        : violation,
    )
    .filter((violation) => violation.nodes.length > 0);
}

export function describeViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `  ${String(node.target)}\n  ${node.html.slice(0, 160)}`)
        .join('\n');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${nodes}`;
    })
    .join('\n\n');
}

export async function expectNoViolations(context?: Element): Promise<void> {
  const violations = await findViolations(context);
  expect(violations, describeViolations(violations)).toEqual([]);
}
