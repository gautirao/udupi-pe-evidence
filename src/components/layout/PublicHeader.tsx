import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MapPin, LogOut } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';

/**
 * Public-facing marketing header for the consumer Discover experience (Issue #1588).
 *
 * Distinct from the role-aware dashboard chrome in {@link AppLayout} (broker/admin/internal
 * pages keep that). This is intentionally a separate, reusable public shell so other
 * public-facing pages can adopt it later without inheriting the dashboard nav.
 *
 * Auth behaviour is preserved verbatim from AppLayout: signed-in users get the avatar
 * dropdown + Sign out (returns home); signed-out users get a Sign in link carrying
 * ?returnTo= so they land back where they started. No new auth behaviour.
 */
const PUBLIC_NAV = [
  { name: 'Discover', href: '/discover' },
  { name: 'Schools', href: '/discover?journey=school-first' },
  { name: 'Agricultural land', href: '/discover?journey=agri-first' },
  { name: 'Trends', href: '/trends' },
] as const;

export function PublicHeader() {
  const { user, isAdmin, isBroker, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const initials = user?.email?.split('@')[0].slice(0, 2).toUpperCase() || 'U';
  const roleLabel = isAdmin ? 'Administrator' : isBroker ? 'Broker' : 'User';

  const isActive = (href: string) => {
    const [path, query] = href.split('?');
    if (path === '/discover') {
      if (!query) return location.pathname.startsWith('/discover') && (!location.search.includes('journey=') || location.search.includes('journey=area-first'));
      return location.pathname.startsWith('/discover') && location.search.includes(query);
    }
    return location.pathname.startsWith(href);
  };

  return (
    <header className="flex h-[60px] flex-none items-center gap-7 border-b border-border bg-card px-7 font-sans">
      {/* Logo lockup */}
      <Link to="/discover" className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <MapPin className="h-[18px] w-[18px] text-primary-foreground" aria-hidden="true" />
        </span>
        <span className="hidden leading-tight sm:flex sm:flex-col">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Udupi Property Tracker
          </span>
          <span className="text-[11px] text-muted-foreground">Real estate trends</span>
        </span>
      </Link>

      {/* Primary nav */}
      <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
        {PUBLIC_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              to={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-[13.5px] font-semibold transition-colors',
                active
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-3.5">
        {user && <NotificationBell />}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 font-medium text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.email}</p>
                  <p className="text-xs leading-none text-muted-foreground">{roleLabel}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2.5">
            <Link
              to="/auth?redirect=/broker/listings/new&returnTo=/broker/listings/new"
              className="rounded-md border border-input bg-card px-3.5 py-2 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              List your property
            </Link>
            <Link
              to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
              className="rounded-md bg-primary px-[18px] py-2 text-[13.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

