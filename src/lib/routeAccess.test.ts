import { describe, it, expect } from 'vitest';
import {
  canAccessRoute,
  getDefaultLandingForRole,
  getVisibleNavigationForRole,
  isPublicRoute,
  isProtectedRoute,
  isAdminRoute,
  isBrokerRoute,
} from './routeAccess';

describe('routeAccess governance module (Issue #1633)', () => {
  it('1. anonymous accessing public discovery route (e.g. /discover or /) is allowed', () => {
    expect(canAccessRoute('/', 'anonymous')).toBe(true);
    expect(canAccessRoute('/discover?city=udupi', 'anonymous')).toBe(true);
    expect(canAccessRoute('/schools', 'anonymous')).toBe(true);
    expect(canAccessRoute('/trends', 'anonymous')).toBe(true);
  });

  it('2. anonymous accessing protected routes (/broker/listings/new, /saved-areas, /admin/feeds) is blocked', () => {
    expect(canAccessRoute('/broker/listings/new', 'anonymous')).toBe(false);
    expect(canAccessRoute('/saved-areas', 'anonymous')).toBe(false);
    expect(canAccessRoute('/my-bookings', 'anonymous')).toBe(false);
    expect(canAccessRoute('/admin/feeds', 'anonymous')).toBe(false);
  });

  it('3. normal user accessing consumer routes (/saved-areas, /my-bookings, /broker/listings/new) is allowed', () => {
    expect(canAccessRoute('/saved-areas', 'user')).toBe(true);
    expect(canAccessRoute('/my-bookings', 'user')).toBe(true);
    expect(canAccessRoute('/notifications', 'user')).toBe(true);
    expect(canAccessRoute('/broker/listings/new', 'user')).toBe(true);
    expect(canAccessRoute('/broker/listings/123/edit', 'user')).toBe(true);
  });

  it('3b. regression (#1566) — normal user accessing /saved-homes is allowed; anonymous/missing role is blocked', () => {
    expect(canAccessRoute('/saved-homes', 'user')).toBe(true);
    expect(canAccessRoute('/saved-homes', 'anonymous')).toBe(false);
    expect(canAccessRoute('/saved-homes', null)).toBe(false);
  });

  it('4. normal user accessing broker workspace (/broker/dashboard, /broker/listings) is blocked', () => {
    expect(canAccessRoute('/broker/dashboard', 'user')).toBe(false);
    expect(canAccessRoute('/broker/listings', 'user')).toBe(false);
    expect(canAccessRoute('/broker/bookings', 'user')).toBe(false);
  });

  it('5. normal user accessing admin console (/admin/feeds) is blocked', () => {
    expect(canAccessRoute('/admin/feeds', 'user')).toBe(false);
    expect(canAccessRoute('/admin/groups', 'user')).toBe(false);
  });

  it('6. broker accessing broker dashboard / new listing is allowed', () => {
    expect(canAccessRoute('/broker/dashboard', 'broker')).toBe(true);
    expect(canAccessRoute('/broker/listings', 'broker')).toBe(true);
  });

  it('7. broker accessing admin console or consumer saved is blocked', () => {
    expect(canAccessRoute('/admin/feeds', 'broker')).toBe(false);
    expect(canAccessRoute('/saved-areas', 'broker')).toBe(false);
  });

  it('8. admin accessing admin console is allowed', () => {
    expect(canAccessRoute('/admin/feeds', 'admin')).toBe(true);
    expect(canAccessRoute('/admin/listings', 'admin')).toBe(true);
    expect(canAccessRoute('/notifications', 'admin')).toBe(true);
  });

  it('9. admin accessing broker/user workspace links (/broker/dashboard, /saved-areas) is blocked', () => {
    expect(canAccessRoute('/broker/dashboard', 'admin')).toBe(false);
    expect(canAccessRoute('/saved-areas', 'admin')).toBe(false);
    expect(canAccessRoute('/my-bookings', 'admin')).toBe(false);
  });

  it('11. /broker/listings/new/commercial deep link matches /broker/listings/new access for every role (#1741 follow-up)', () => {
    // Allowed roles — same as /broker/listings/new
    expect(canAccessRoute('/broker/listings/new/commercial', 'user')).toBe(true);
    expect(canAccessRoute('/broker/listings/new/commercial', 'broker')).toBe(true);
    expect(canAccessRoute('/broker/listings/new/commercial', 'dealer')).toBe(true);
    expect(canAccessRoute('/broker/listings/new/commercial', 'admin')).toBe(true);

    // Blocked — same as /broker/listings/new
    expect(canAccessRoute('/broker/listings/new/commercial', 'anonymous')).toBe(false);
    expect(canAccessRoute('/broker/listings/new/commercial', 'guest')).toBe(false);
  });

  it('12. regression — /broker/listings/new access is unchanged after the commercial deep-link fix', () => {
    expect(canAccessRoute('/broker/listings/new', 'user')).toBe(true);
    expect(canAccessRoute('/broker/listings/new', 'broker')).toBe(true);
    expect(canAccessRoute('/broker/listings/new', 'dealer')).toBe(true);
    expect(canAccessRoute('/broker/listings/new', 'admin')).toBe(true);
    expect(canAccessRoute('/broker/listings/new', 'anonymous')).toBe(false);

    // Sibling/subpaths must NOT be accidentally broadened by the exact-match fix
    expect(canAccessRoute('/broker/listings/new/residential', 'user')).toBe(false);
    expect(canAccessRoute('/broker/listings/new/commercial/extra', 'user')).toBe(false);
    expect(canAccessRoute('/broker/listings/newcommercial', 'user')).toBe(false);
  });

  it('10. navigation visibility and landing helpers align with role policy', () => {
    expect(getDefaultLandingForRole('anonymous')).toBe('/discover');
    expect(getDefaultLandingForRole('user')).toBe('/discover');
    expect(getDefaultLandingForRole('broker')).toBe('/broker/dashboard');
    expect(getDefaultLandingForRole('admin')).toBe('/admin/listings/pending');

    const anonNav = getVisibleNavigationForRole('anonymous');
    expect(anonNav.showPublicDiscovery).toBe(true);
    expect(anonNav.showListProperty).toBe(true);
    expect(anonNav.showConsumerActivity).toBe(false);
    expect(anonNav.showBrokerWorkspace).toBe(false);
    expect(anonNav.showAdminConsole).toBe(false);

    const brokerNav = getVisibleNavigationForRole('broker');
    expect(brokerNav.showBrokerWorkspace).toBe(true);
    expect(brokerNav.showListProperty).toBe(false);

    expect(isPublicRoute('/discover')).toBe(true);
    expect(isProtectedRoute('/broker/dashboard')).toBe(true);
    expect(isAdminRoute('/admin/feeds')).toBe(true);
    expect(isBrokerRoute('/broker/listings')).toBe(true);
  });
});
