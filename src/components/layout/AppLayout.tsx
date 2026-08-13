import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { useToast } from '@/hooks/use-toast';
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
  Heart,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { getDiscoverRoute, getTrendsRoute, getSavedRoute } from '@/lib/navUtils';
import { getVisibleNavigationForRole, PolicyRole } from '@/lib/routeAccess';

interface AppLayoutProps {
  children: React.ReactNode;
}

// ─── Static nav arrays (defined once at module level) ───────────────────────

const adminNavigation = [
  { name: 'City launch', href: '/admin/city-launch', icon: Building2 },
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
  { name: 'Saved', href: '/saved-areas', icon: Bookmark },
  // Issue #1566 — persist saved homes; mirrors the "Saved" (areas) slot above.
  { name: 'Saved homes', href: '/saved-homes', icon: Heart },
  { name: 'My bookings', href: '/my-bookings', icon: CalendarCheck2 },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function RoleAwareHeader({ selectedCity }: { selectedCity?: string } = {}) {
  const { user, isAdmin, isBroker, signOut, isLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const policyRole: PolicyRole = !user ? 'anonymous' : isAdmin ? 'admin' : isBroker ? 'broker' : 'user';
  const navVisibility = getVisibleNavigationForRole(policyRole);

  const handleSignOut = async () => {
    await signOut();
    const isProtected = location.pathname.startsWith('/broker') ||
      location.pathname.startsWith('/admin') ||
      location.pathname.startsWith('/my-bookings') ||
      location.pathname.startsWith('/saved-areas') ||
      location.pathname.startsWith('/saved-homes') ||
      location.pathname.startsWith('/onboarding') ||
      location.pathname.startsWith('/auth');
    if (isProtected) {
      navigate('/discover', { replace: true });
    }
    toast({
      description: 'You have been signed out.',
    });
  };

  const initials = user?.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U';

  const roleLabel = isAdmin ? 'Administrator' : isBroker ? 'Broker' : 'User';

  const currentCity = selectedCity || new URLSearchParams(location.search).get('city') || DEFAULT_CITY;
  const currentJourney = new URLSearchParams(location.search).get('journey');

  const publicDiscoveryNavigation = [
    { name: 'Discover', href: getDiscoverRoute(currentCity), icon: MapPin },
    { name: 'Schools', href: getDiscoverRoute(currentCity, 'school-first'), icon: GraduationCap },
    { name: 'Agricultural land', href: getDiscoverRoute(currentCity, 'agri-first'), icon: Sprout },
    { name: 'Trends', href: getTrendsRoute(currentCity), icon: BarChart3 },
  ];

  const isItemActive = (href: string, name: string) => {
    if (name === 'Discover') {
      const onDiscover = location.pathname === '/' || location.pathname.startsWith('/discover');
      return onDiscover && (!currentJourney || currentJourney === 'area-first');
    }
    if (name === 'Schools') {
      return location.pathname.startsWith('/discover') && currentJourney === 'school-first';
    }
    if (name === 'Agricultural land') {
      return location.pathname.startsWith('/discover') && currentJourney === 'agri-first';
    }
    const [path] = href.split('?');
    return location.pathname.startsWith(path);
  };

  const NavItem = ({ item, mobile = false, onClick }: { item: { name: string; href: string; icon: any }; mobile?: boolean; onClick?: () => void }) => {
    const active = isItemActive(item.href, item.name);
    return (
      <Link
        to={item.href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
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
        Explore
      </div>
      {navVisibility.showPublicDiscovery && publicDiscoveryNavigation.map((item) => (
        <NavItem key={item.name} item={item} mobile onClick={() => setMobileOpen(false)} />
      ))}

      {user && navVisibility.showConsumerActivity && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
            My activity
          </div>
          <NavItem item={{ name: 'Saved', href: '/saved-areas', icon: Bookmark }} mobile onClick={() => setMobileOpen(false)} />
          <NavItem item={{ name: 'Saved homes', href: '/saved-homes', icon: Heart }} mobile onClick={() => setMobileOpen(false)} />
          <NavItem item={{ name: 'My bookings', href: '/my-bookings', icon: CalendarCheck2 }} mobile onClick={() => setMobileOpen(false)} />
          <NavItem item={{ name: 'Notifications', href: '/notifications', icon: Bell }} mobile onClick={() => setMobileOpen(false)} />
        </>
      )}

      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
        Workspace
      </div>
      {!user ? (
        <>
          {navVisibility.showListProperty && (
            <Link
              to="/auth?redirect=/broker/listings/new&returnTo=/broker/listings/new"
              onClick={(e) => {
                e.preventDefault();
                setMobileOpen(false);
                openAuthModal({ redirect: '/broker/listings/new', returnTo: '/broker/listings/new' });
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              List property
            </Link>
          )}
          <Link
            to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
            onClick={(e) => {
              e.preventDefault();
              setMobileOpen(false);
              openAuthModal({ returnTo: location.pathname + location.search });
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-primary hover:bg-secondary transition-colors"
          >
            <LogOut className="h-4 w-4 rotate-180" />
            Sign in
          </Link>
        </>
      ) : navVisibility.showAdminConsole ? (
        <>
          <div className="px-3 py-1 text-xs font-medium text-primary">Admin Console</div>
          {adminNavigation.map((item) => (
            <NavItem key={item.name} item={item} mobile onClick={() => setMobileOpen(false)} />
          ))}
        </>
      ) : navVisibility.showBrokerWorkspace ? (
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
      ) : navVisibility.showConsumerActivity ? (
        <>
          <NavItem item={{ name: 'List property', href: '/broker/listings/new', icon: Plus }} mobile onClick={() => setMobileOpen(false)} />
        </>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm font-sans">
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
                  <span className="font-semibold leading-tight">PropertySignal</span>
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
              <span className="font-semibold leading-tight">PropertySignal</span>
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
            {isLoading ? null : !user ? (
              navVisibility.showListProperty ? (
                <Link
                  to="/auth?redirect=/broker/listings/new&returnTo=/broker/listings/new"
                  onClick={(e) => {
                    e.preventDefault();
                    openAuthModal({ redirect: '/broker/listings/new', returnTo: '/broker/listings/new' });
                  }}
                  className="text-sm font-semibold text-foreground hover:bg-secondary transition-colors px-3 py-1.5 rounded-md border border-input"
                >
                  List property
                </Link>
              ) : null
            ) : navVisibility.showAdminConsole ? (
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
                    Admin Console
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
            ) : navVisibility.showBrokerWorkspace ? (
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
            ) : navVisibility.showConsumerActivity ? (
              userRoleNavigation.map((item) => (
                <NavItem key={item.name} item={item} />
              ))
            ) : null}
          </div>

          {/* Notifications */}
          {!isLoading && user && <NotificationBell />}

          {/* Zone 4: Account */}
          {isLoading ? null : user ? (
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
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
              onClick={(e) => {
                e.preventDefault();
                openAuthModal({ returnTo: location.pathname + location.search });
              }}
              className="text-sm font-semibold text-foreground hover:bg-secondary transition-colors px-3 py-1.5 rounded-md border border-input"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
    );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <RoleAwareHeader />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

