export type PolicyRole = 'anonymous' | 'user' | 'broker' | 'dealer' | 'admin';

/** Check if a route is considered public discovery or auth fallback. */
export function isPublicRoute(route: string): boolean {
  const [path] = route.split('?');
  const clean = path.split('#')[0];
  if (clean === '/' || clean === '/discover' || clean === '/schools' || clean === '/trends') {
    return true;
  }
  if (clean.startsWith('/listing/')) {
    return true;
  }
  if (clean.startsWith('/trends/')) {
    return true;
  }
  if (clean === '/auth' || clean === '/auth/callback') {
    return true;
  }
  return false;
}

/** Check if a route requires authentication (not public). */
export function isProtectedRoute(route: string): boolean {
  return !isPublicRoute(route);
}

/** Check if a route is restricted to admin role. */
export function isAdminRoute(route: string): boolean {
  const [path] = route.split('?');
  const clean = path.split('#')[0];
  return clean.startsWith('/admin');
}

/** Check if a route is a broker workspace route. */
export function isBrokerRoute(route: string): boolean {
  const [path] = route.split('?');
  const clean = path.split('#')[0];
  return clean.startsWith('/broker');
}

/** Determine if a given role can access a target route. */
export function canAccessRoute(route: string, role?: string | null): boolean {
  const [path] = route.split('?');
  const clean = path.split('#')[0];
  const r = (role || 'anonymous') as PolicyRole | string;

  // Public routes are accessible by everyone
  if (isPublicRoute(clean)) {
    return true;
  }

  // Anonymous users cannot access any protected route
  if (r === 'anonymous') {
    return false;
  }

  // Admin users can access admin routes, public routes, and listing create/edit routes
  if (r === 'admin') {
    if (isAdminRoute(clean) || clean === '/notifications') {
      return true;
    }
    if (clean === '/broker/listings/new' || (clean.startsWith('/broker/listings/') && clean.endsWith('/edit'))) {
      return true;
    }
    return false;
  }

  // Admin routes can ONLY be accessed by admin
  if (isAdminRoute(clean)) {
    return false;
  }

  // Broker / Dealer roles
  if (r === 'broker' || r === 'dealer') {
    if (isBrokerRoute(clean) || clean === '/notifications') {
      return true;
    }
    // Consumer Saved hidden / blocked unless product requires it
    return false;
  }

  // Normal signed-in user ('user')
  if (r === 'user') {
    if (clean === '/saved-areas' || clean === '/my-bookings' || clean === '/notifications' || clean === '/onboarding') {
      return true;
    }
    // Listing create / edit routes are allowed for normal consumers to list properties
    if (clean === '/broker/listings/new' || (clean.startsWith('/broker/listings/') && clean.endsWith('/edit'))) {
      return true;
    }
    return false;
  }

  return false;
}

/** Get default landing route after login for a role. */
export function getDefaultLandingForRole(role?: string | null): string {
  const r = (role || 'anonymous') as PolicyRole | string;
  switch (r) {
    case 'admin':
      return '/admin/listings/pending';
    case 'broker':
    case 'dealer':
      return '/broker/dashboard';
    case 'user':
    case 'anonymous':
    default:
      return '/discover';
  }
}

/** Get visible navigation flags for a role. */
export function getVisibleNavigationForRole(role?: string | null): {
  showPublicDiscovery: boolean;
  showListProperty: boolean;
  showConsumerActivity: boolean; // Saved, My bookings, Notifications
  showBrokerWorkspace: boolean; // Broker dashboard, New listing, Broker workspace dropdown
  showAdminConsole: boolean; // Admin Console
} {
  const r = (role || 'anonymous') as PolicyRole | string;
  switch (r) {
    case 'anonymous':
      return {
        showPublicDiscovery: true,
        showListProperty: true, // opens auth modal / preserves intent
        showConsumerActivity: false,
        showBrokerWorkspace: false,
        showAdminConsole: false,
      };
    case 'user':
      return {
        showPublicDiscovery: true,
        showListProperty: true,
        showConsumerActivity: true,
        showBrokerWorkspace: false,
        showAdminConsole: false,
      };
    case 'broker':
    case 'dealer':
      return {
        showPublicDiscovery: true,
        showListProperty: false, // already has New listing inside broker workspace
        showConsumerActivity: false,
        showBrokerWorkspace: true,
        showAdminConsole: false,
      };
    case 'admin':
      return {
        showPublicDiscovery: true,
        showListProperty: false,
        showConsumerActivity: false,
        showBrokerWorkspace: false,
        showAdminConsole: true,
      };
    default:
      return {
        showPublicDiscovery: true,
        showListProperty: true,
        showConsumerActivity: false,
        showBrokerWorkspace: false,
        showAdminConsole: false,
      };
  }
}
