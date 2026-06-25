import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  GraduationCap,
  Sprout,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

// ─── Static nav arrays (defined once at module level) ───────────────────────

const publicDiscoveryNavigation = [
  { name: 'Discover', href: '/discover', icon: MapPin },
  { name: 'Schools', href: '/discover?journey=school-first', icon: GraduationCap },
  { name: 'Agricultural land', href: '/discover?journey=agri-first', icon: Sprout },
  { name: 'Trends', href: '/trends', icon: BarChart3 },
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
  { name: 'Intelligence', href: '/admin/intelligence', icon: BarChart3 },
];

const brokerRoleNavigation = [
  { name: 'Broker dashboard', href: '/broker/dashboard', icon: Home },
  { name: 'New listing', href: '/broker/listings/new', icon: Plus },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

const brokerDetailedNavigation = [
  { name: 'Dashboard', href: '/broker/dashboard', icon: Home },
  { name: 'My Listings', href: '/broker/listings', icon: Building2 },
  { name: 'Bookings', href: '/broker/bookings', icon: CalendarCheck2 },
  { name: 'Listing Quality', href: '/broker/listing-quality', icon: Sparkles },
  { name: 'Demand Gaps', href: '/broker/demand-gaps', icon: BarChart3 },
  { name: 'Preferences', href: '/broker/preferences', icon: Users },
];

const userRoleNavigation = [
  { name: 'List property', href: '/broker/listings/new', icon: Plus },
  { name: 'My bookings', href: '/my-bookings', icon: CalendarCheck2 },
  { name: 'Saved areas', href: '/saved-areas', icon: Bookmark },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AppLayout({ children }: AppLayoutProps) {
  const { user, isAdmin, isBroker, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const initials = user?.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U';

  const roleLabel = isAdmin ? 'Administrator' : isBroker ? 'Broker' : 'User';

  const isItemActive = (href: string) => {
    const [path, query] = href.split('?');
    if (path === '/' || path === '/discover') {
      const onDiscover = location.pathname === '/' || location.pathname.startsWith('/discover');
      if (!query) return onDiscover && (!location.search.includes('journey=') || location.search.includes('journey=area-first'));
      return onDiscover && location.search.includes(query);
    }
    return location.pathname.startsWith(path);
  };

  const NavItem = ({ item, mobile = false, onClick }: { item: { name: string; href: string; icon: typeof Home }; mobile?: boolean; onClick?: () => void }) => {
    const active = isItemActive(item.href);
    return (
      <Link
        to={item.href}
        onClick={onClick}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        <item.icon className="h-4 w-4" />
        {item.name}
      </Link>
    );
  };

  const MobileNavigation = () => (
    <div className="flex flex-col gap-1">
      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Public Discovery
      </div>
      {publicDiscoveryNavigation.map((item) => (
        <NavItem key={item.name} item={item} mobile onClick={() => setMobileOpen(false)} />
      ))}

      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
        Actions
      </div>
      {!user ? (
        <Link
          to="/auth?redirect=/broker/listings/new&returnTo=/broker/listings/new"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Plus className="h-4 w-4" />
          List your property
        </Link>
      ) : isAdmin ? (
        <>
          <div className="px-3 py-1 text-xs font-medium text-primary">Admin console</div>
          {adminNavigation.map((item) => (
            <NavItem key={item.name} item={item} mobile onClick={() => setMobileOpen(false)} />
          ))}
        </>
      ) : isBroker ? (
        <>
          {brokerRoleNavigation.map((item) => (
            <NavItem key={item.name} item={item} mobile onClick={() => setMobileOpen(false)} />
          ))}
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
            Broker workspace
          </div>
          {brokerDetailedNavigation.map((item) => (
            <NavItem key={item.name} item={item} mobile onClick={() => setMobileOpen(false)} />
          ))}
        </>
      ) : (
        <>
          {userRoleNavigation.map((item) => (
            <NavItem key={item.name} item={item} mobile onClick={() => setMobileOpen(false)} />
          ))}
          <Link
            to="/broker/listings"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Building2 className="h-4 w-4" />
            My listings
          </Link>
        </>
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
            <SheetContent side="left" className="w-64 p-4 overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="sr-only">Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold leading-tight">Udupi Tracker</span>
                  <span className="text-xs text-muted-foreground leading-tight">Real Estate Trends</span>
                </div>
              </div>
              <MobileNavigation />
            </SheetContent>
          </Sheet>

          {/* Zone 1: Brand Logo */}
          <Link to="/discover" className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-semibold leading-tight">Udupi Property Tracker</span>
              <span className="text-xs text-muted-foreground leading-tight">Real Estate Trends</span>
            </div>
          </Link>

          {/* Zone 2: Public discovery nav */}
          <nav aria-label="Public discovery" className="hidden lg:flex items-center gap-1 ml-6">
            {publicDiscoveryNavigation.map((item) => (
              <NavItem key={item.name} item={item} />
            ))}
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

          {/* Zone 3: Role/workspace actions */}
          <div aria-label="Role actions" className="hidden lg:flex items-center gap-1">
            {!user ? (
              <Link
                to="/auth?redirect=/broker/listings/new&returnTo=/broker/listings/new"
                className="text-sm font-semibold text-foreground hover:bg-secondary transition-colors px-3 py-1.5 rounded-md border border-input"
              >
                List your property
              </Link>
            ) : isAdmin ? (
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
                    Admin console
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {adminNavigation.map((item) => {
                    const active = location.pathname.startsWith(item.href);
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link
                          to={item.href}
                          className={cn('flex items-center gap-2 w-full', active ? 'text-primary font-medium' : '')}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.name}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : isBroker ? (
              <>
                {brokerRoleNavigation.map((item) => (
                  <NavItem key={item.name} item={item} />
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:bg-secondary hover:text-foreground h-auto"
                    >
                      Broker workspace
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {brokerDetailedNavigation.map((item) => {
                      const active = location.pathname.startsWith(item.href);
                      return (
                        <DropdownMenuItem key={item.name} asChild>
                          <Link
                            to={item.href}
                            className={cn('flex items-center gap-2 w-full', active ? 'text-primary font-medium' : '')}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              userRoleNavigation.map((item) => (
                <NavItem key={item.name} item={item} />
              ))
            )}
          </div>

          {/* Notifications */}
          {user && <NotificationBell />}

          {/* Zone 4: Account */}
          {user ? (
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
                    <p className="text-sm font-medium leading-none">{user.email}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {roleLabel}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isAdmin && !isBroker && (
                  <DropdownMenuItem asChild>
                    <Link to="/broker/listings" className="flex items-center gap-2 w-full cursor-pointer">
                      <Building2 className="mr-2 h-4 w-4" />
                      My listings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
              className="text-sm font-semibold text-foreground hover:bg-secondary transition-colors px-3 py-1.5 rounded-md border border-input"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

