import {
  Layers,
  LayoutDashboard,
  Play,
  Plus,
  ScrollText,
  Search,
  Server,
  Settings,
  SunMoon,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

export const GROUP_ORDER = ['Workflows', 'Go to', 'Actions', 'Search'] as const;
export type CommandGroup = (typeof GROUP_ORDER)[number];

export interface Command {
  id: string;
  label: string;
  group: CommandGroup;
  icon: LucideIcon;
  keywords: readonly string[];
  run: () => void;
}

export interface CommandSection {
  group: CommandGroup;
  items: Command[];
}

export interface CommandContext {
  navigate: (to: string) => void;
  toggleTheme: () => void;
}

export function buildCommands({ navigate, toggleTheme }: CommandContext): Command[] {
  return [
    {
      id: 'overview',
      label: 'Go to Overview',
      group: 'Go to',
      icon: LayoutDashboard,
      keywords: ['dashboard', 'home'],
      run: () => navigate('/'),
    },
    {
      id: 'search-workflows',
      label: 'Search workflows',
      group: 'Go to',
      icon: Search,
      keywords: ['find', 'list'],
      run: () => navigate('/workflows'),
    },
    {
      id: 'executions',
      label: 'View executions',
      group: 'Go to',
      icon: Play,
      keywords: ['runs', 'history'],
      run: () => navigate('/executions'),
    },
    {
      id: 'failed-executions',
      label: 'View failed executions',
      group: 'Go to',
      icon: TriangleAlert,
      keywords: ['errors', 'broken', 'problems'],
      run: () => navigate('/executions?status=FAILED'),
    },
    {
      id: 'workers',
      label: 'View workers',
      group: 'Go to',
      icon: Server,
      keywords: ['processes', 'status'],
      run: () => navigate('/workers'),
    },
    {
      id: 'queue',
      label: 'View queue',
      group: 'Go to',
      icon: Layers,
      keywords: ['jobs', 'backlog'],
      run: () => navigate('/queue'),
    },
    {
      id: 'logs',
      label: 'View logs',
      group: 'Go to',
      icon: ScrollText,
      keywords: ['output', 'debug'],
      run: () => navigate('/logs'),
    },
    {
      id: 'settings',
      label: 'Open settings',
      group: 'Go to',
      icon: Settings,
      keywords: ['preferences', 'account', 'api keys', 'profile'],
      run: () => navigate('/settings'),
    },
    {
      id: 'create-workflow',
      label: 'Create workflow',
      group: 'Actions',
      icon: Plus,
      keywords: ['new', 'add', 'builder'],
      run: () => navigate('/workflows/new'),
    },
    {
      id: 'toggle-theme',
      label: 'Toggle theme',
      group: 'Actions',
      icon: SunMoon,
      keywords: ['dark', 'light', 'appearance', 'mode'],
      run: toggleTheme,
    },
  ];
}

export function scoreCommand(command: Pick<Command, 'label' | 'keywords'>, query: string): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  const label = command.label.toLowerCase();
  const words = label.split(/\s+/);
  const haystack = `${label} ${command.keywords.join(' ').toLowerCase()}`;
  let score = 0;

  for (const token of tokens) {
    if (!haystack.includes(token)) return 0;
    if (label.startsWith(token)) score += 4;
    else if (words.some((word) => word.startsWith(token))) score += 3;
    else if (label.includes(token)) score += 2;
    else score += 1;
  }
  return score;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (query.trim() === '') return commands;

  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(command, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}

export function toSections(commands: Command[]): CommandSection[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: commands.filter((command) => command.group === group),
  })).filter((section) => section.items.length > 0);
}

export function workflowCommands(
  query: string,
  results: readonly { id: string; name: string }[],
  navigate: (to: string) => void,
): Command[] {
  if (query === '') return [];

  return [
    ...results.map((workflow): Command => ({
      id: `workflow-${workflow.id}`,
      label: workflow.name,
      group: 'Workflows',
      icon: Play,
      keywords: [],
      run: () => navigate(`/workflows/${workflow.id}`),
    })),
    {
      id: 'search-workflows-for',
      label: `Search workflows for "${query}"`,
      group: 'Search',
      icon: Search,
      keywords: [],
      run: () => navigate(`/workflows?q=${encodeURIComponent(query)}`),
    },
  ];
}
