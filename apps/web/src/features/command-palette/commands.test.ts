import { describe, expect, it, vi } from 'vitest';
import {
  buildCommands,
  filterCommands,
  scoreCommand,
  toSections,
  workflowCommands,
} from './commands';

const commands = buildCommands({ navigate: vi.fn(), toggleTheme: vi.fn() });
const labels = (list: { label: string }[]) => list.map((command) => command.label);

describe('buildCommands', () => {
  it('includes every command from the product brief', () => {
    expect(labels(commands)).toEqual(
      expect.arrayContaining([
        'Search workflows',
        'Create workflow',
        'View executions',
        'View failed executions',
        'View workers',
        'Open settings',
        'Toggle theme',
      ]),
    );
  });

  it('sends each command to the right place', () => {
    const navigate = vi.fn();
    const toggleTheme = vi.fn();
    const built = buildCommands({ navigate, toggleTheme });
    const run = (label: string) => built.find((command) => command.label === label)?.run();

    run('Create workflow');
    run('View failed executions');
    run('Open settings');
    run('Toggle theme');

    expect(navigate.mock.calls.map(([to]) => to)).toEqual([
      '/workflows/new',
      '/executions?status=FAILED',
      '/settings',
    ]);
    expect(toggleTheme).toHaveBeenCalledOnce();
  });
});

describe('scoreCommand', () => {
  const command = {
    label: 'View failed executions',
    keywords: ['errors', 'broken'],
  };

  it('prefers the start of the label, then word starts, then anything inside', () => {
    expect(scoreCommand(command, 'view')).toBe(4);
    expect(scoreCommand(command, 'fail')).toBe(3);
    expect(scoreCommand(command, 'ailed')).toBe(2);
    expect(scoreCommand(command, 'errors')).toBe(1);
  });

  it('needs every word of the query to match', () => {
    expect(scoreCommand(command, 'failed exec')).toBe(6);
    expect(scoreCommand(command, 'failed settings')).toBe(0);
  });

  it('is not case sensitive and treats an empty query as a match', () => {
    expect(scoreCommand(command, 'VIEW')).toBe(4);
    expect(scoreCommand(command, '   ')).toBe(1);
  });
});

describe('filterCommands', () => {
  it('keeps the default order when nothing is typed', () => {
    expect(filterCommands(commands, '')).toEqual(commands);
  });

  it('ranks better matches first and keeps ties in their original order', () => {
    expect(labels(filterCommands(commands, 'view'))).toEqual([
      'View executions',
      'View failed executions',
      'View workers',
      'View queue',
      'View logs',
      'Go to Overview',
    ]);

    expect(labels(filterCommands(commands, 'work')).slice(0, 3)).toEqual([
      'Search workflows',
      'View workers',
      'Create workflow',
    ]);
  });

  it('finds commands through their keywords', () => {
    expect(labels(filterCommands(commands, 'dark'))).toEqual(['Toggle theme']);
    expect(labels(filterCommands(commands, 'api keys'))).toEqual(['Open settings']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterCommands(commands, 'zzzz')).toEqual([]);
  });
});

describe('sections and workflow results', () => {
  it('lists workflows first, then navigation and actions, with the text search last', () => {
    const dynamic = workflowCommands('vid', [{ id: 'w1', name: 'Video Processing' }], vi.fn());
    const sections = toSections([...commands, ...dynamic]);

    expect(sections.map((section) => section.group)).toEqual([
      'Workflows',
      'Go to',
      'Actions',
      'Search',
    ]);
    expect(labels(sections[0]?.items ?? [])).toEqual(['Video Processing']);
    expect(labels(sections[3]?.items ?? [])).toEqual(['Search workflows for "vid"']);
  });

  it('skips groups that have nothing in them', () => {
    const actions = commands.filter((command) => command.group === 'Actions');

    expect(toSections(actions).map((section) => section.group)).toEqual(['Actions']);
  });

  it('opens a workflow, or searches the list with the text escaped', () => {
    const navigate = vi.fn();
    const [open, search] = workflowCommands('a&b c', [{ id: 'w1', name: 'A and B' }], navigate);

    open?.run();
    search?.run();

    expect(navigate.mock.calls.map(([to]) => to)).toEqual([
      '/workflows/w1',
      '/workflows?q=a%26b%20c',
    ]);
  });

  it('still offers the text search when no workflow matched', () => {
    expect(labels(workflowCommands('zzz', [], vi.fn()))).toEqual(['Search workflows for "zzz"']);
  });

  it('offers nothing before anything is typed', () => {
    expect(workflowCommands('', [{ id: 'w1', name: 'A' }], vi.fn())).toEqual([]);
  });
});
