import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  MapPin,
  BarChart3,
  LogOut,
  Menu,
  Users,
  FileText,
  Home,
  Shield,
  ShieldCheck,
  Chrome,
  Sparkles,
  Copy,
  ClipboardList,
  Building2,
  Plus,
  Bell,
  Bookmark,
  CalendarCheck2,
  ChevronDown,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

// ─── Static nav arrays (defined once at module level) ───────────────────────

const adminPrimaryNavigation = [
  { name: 'Map', href: '/', icon: MapPin },
  { name: 'Insights', href: '/insights', icon: BarChart3 },
];

const adminNavigation = [
  { name: 'Feed Runs', href: '/admin/feeds', icon: FileText },
  { name: 'Facebook Groups', href: '/admin/groups', icon: Users },
  { name: 'Manual Posts', href: '/admin/posts', icon: FileText },
  { name: 'Process Posts', href: '/admin/process', icon: Sparkles },
  { name: 'Listings', href: '/admin/listings', icon: Home },
  { name: 'Pending Approval', href: '/admin/listings/pending', icon: ClipboardList },
  { name: 'Duplicates', href: '/admin/duplicates', icon: Copy },
  { name: 'Chrome Extension', href: '/admin/extension', icon: Chrome },
  { name: 'Locality Normalizer', href: '/admin/localities', icon: MapPin },
  { name: 'Audit Log', href: '/admin/audit-log', icon: Shield },
  { name: 'Trust Review', href: '/admin/trust-review', icon: ShieldCheck },
];

const brokerNavigation = [
  { name: 'Dashboard', href: '/broker/dashboard', icon: Home },
  { name: 'My Listings', href: '/broker/listings', icon: Building2 },
  { name: 'New Listing', href: '/broker/listings/new', icon: Plus },
  { name: 'Bookings', href: '/broker/bookings', icon: CalendarCheck2 },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

const ownerNavigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Insights', href: '/insights', icon: BarChart3 },
  { name: 'My Saved Areas', href: '/saved-areas', icon: Bookmark },
  { name: 'My Listings', href: '/broker/listings', icon: Building2 },
  { name: 'New Listing', href: '/broker/listings/new', icon: Plus },
  { name: 'My Bookings', href: '/my-bookings', icon: CalendarCheck2 },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

const loggedOutNavigation = [
  { name: 'Home', href: '/', icon: Home },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AppLayout({ children }: AppLayoutProps) {
  const { user, isAdmin, isBroker, userRole, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = user?.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U';

  const roleLabel = isAdmin ? 'Administrator' : isBroker ? 'Broker' : 'User';

  const primaryNav = isAdmin
    ? adminPrimaryNavigation
    : isBroker
    ? brokerNavigation
    : user
    ? ownerNavigation
    : loggedOutNavigation;

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn('flex', mobile ? 'flex-col gap-1' : 'items-center gap-1')}>
      {primaryNav.map((item) => {
        const isActive = item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href);
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={() => mobile && setMobileOpen(false)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        );
      })}

      {isAdmin && mobile && (
        <>
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
            Admin
          </div>
          {adminNavigation.map((item) => {
            const isActive = item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </>
      )}

      {isAdmin && !mobile && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors h-auto',
                location.pathname.startsWith('/admin')
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              Admin
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {adminNavigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <DropdownMenuItem key={item.name} asChild>
                  <Link
                    to={item.href}
                    className={cn(
                      'flex items-center gap-2 w-full',
                      isActive ? 'text-primary font-medium' : ''
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-4">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader>
                <SheetTitle className="sr-only">Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <span className="font-semibold">Udupi Tracker</span>
              </div>
              <NavLinks mobile />
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold hidden sm:inline">Udupi Property Tracker</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 ml-6">
            <NavLinks />
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Admin badge */}
          {isAdmin && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Shield className="h-3 w-3" />
              Admin
            </div>
          )}

          {/* Notifications */}
          <NotificationBell />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.email}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {roleLabel}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
