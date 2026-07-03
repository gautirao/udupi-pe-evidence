import { describe, it, expect } from 'vitest';
import { canAccessRoute } from '../routeAccess';

describe('routeAccess — agricultural deep-link route access (Issue #1627)', () => {
  const AGRI_ROUTE = '/broker/listings/new/agricultural';

  it('allows admin, user, broker, and dealer roles to access the agricultural create-listing route', () => {
    expect(canAccessRoute(AGRI_ROUTE, 'admin')).toBe(true);
    expect(canAccessRoute(AGRI_ROUTE, 'user')).toBe(true);
    expect(canAccessRoute(AGRI_ROUTE, 'broker')).toBe(true);
    expect(canAccessRoute(AGRI_ROUTE, 'dealer')).toBe(true);
  });

  it('denies anonymous and missing roles for the agricultural create-listing route', () => {
    expect(canAccessRoute(AGRI_ROUTE, 'anonymous')).toBe(false);
    expect(canAccessRoute(AGRI_ROUTE, undefined)).toBe(false);
    expect(canAccessRoute(AGRI_ROUTE, null)).toBe(false);
  });

  it('regression: sibling routes /broker/listings/new and /broker/listings/new/commercial still resolve for admin and user', () => {
    expect(canAccessRoute('/broker/listings/new', 'admin')).toBe(true);
    expect(canAccessRoute('/broker/listings/new', 'user')).toBe(true);
    expect(canAccessRoute('/broker/listings/new/commercial', 'admin')).toBe(true);
    expect(canAccessRoute('/broker/listings/new/commercial', 'user')).toBe(true);
  });
});
