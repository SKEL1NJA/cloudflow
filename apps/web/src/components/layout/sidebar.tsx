import {
  Layers,
  LayoutDashboard,
  LogOut,
  Play,
  ScrollText,
  Server,
  Settings,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { useSession } from '@/auth/use-session';
import { signOut } from '@/auth/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/theme/theme-toggle';
import { LogoMark } from './logo-mark';

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const MAIN_NAV: NavEntry[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/executions', label: 'Executions', icon: Play },
  { to: '/workers', label: 'Workers', icon: Server },
  { to: '/queue', label: 'Queue', icon: Layers },
  { to: '/logs', label: 'Logs', icon: ScrollText },
];

const SETTINGS_NAV: NavEntry = { to: '/settings', label: 'Settings', icon: Settings };

function NavItem({
  entry,
  onNavigate,
}: {
  entry: NavEntry;
  onNavigate?: (() => void) | undefined;
}) {
  const { to, label, icon: Icon, end } = entry;

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          isActive && 'bg-accent font-medium text-foreground',
        )
      }
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const user = session.status === 'authenticated' ? session.user : null;
  const displayName = user?.name ?? user?.email ?? '';

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
        <LogoMark className="size-6" />
        <span className="font-semibold tracking-tight">CloudFlow</span>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {MAIN_NAV.map((entry) => (
          <NavItem key={entry.to} entry={entry} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t p-2">
        <NavItem entry={SETTINGS_NAV} onNavigate={onNavigate} />
        <div className="px-2.5 py-1">
          <ThemeToggle />
        </div>
        {user ? (
          <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5">
            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              aria-hidden="true"
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              {user.name ? (
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Sign out"
              title="Sign out"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
