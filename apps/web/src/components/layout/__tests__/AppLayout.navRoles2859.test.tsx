/**
 * #2859 B1 — replacement coverage for e2e/nav-roles.spec.ts (N1-*, N2-*).
 *
 * Renders the header for user, dealer and admin at /discover (the spec's route: the COLLAPSED Discover header,
 * PublicDiscoverLayout + DiscoverProvider + QueryClientProvider + matchMedia 1366) AND at a non-Discover route
 * (plain <AppLayout> at /notifications), and asserts the EXACT ordered role item set (name + href) of the
 * "Role actions" zone, plus same-test positive controls for every absence.
 *
 * Disclosed seams (file-scoped, precedent AppLayout.propertyRequestsNav.test.tsx):
 *   - `@/components/ui/dropdown-menu` is an always-open pass-through (opening a real Radix DropdownMenu stalls the
 *     jsdom worker, plan F1; AppLayout.test.tsx is red at base for that reason and is NOT cited). Items are
 *     role="menuitem" links. Radix portal/open/Escape behaviour (N2-c) is therefore NOT covered here.
 *   - `@/contexts/AuthContext` is a controllable useAuth: the dealer persona is `isBroker: true`; the real
 *     role -> flag mapping is not exercised. Nav visibility is UX only, NOT authorization.
 *   - NotificationBell is a stub button.
 */
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '../AppLayout';
import { PublicDiscoverLayout } from '../PublicDiscoverLayout';
import { makeTestQueryClient } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';
import { getTrendsRoute } from '@/lib/navUtils';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children }: { children: ReactNode }) =>
    isValidElement(children) ? cloneElement(children as ReactElement<{ role?: string }>, { role: 'menuitem' }) : <>{children}</>,
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <button type="button">Notifications bell</button>,
}));

type Role = 'user' | 'dealer' | 'admin';
type MockAuth = { user: { email: string } | null; isLoading: boolean; isAdmin: boolean; isBroker: boolean; signOut: () => Promise<void> };
let mockAuth: MockAuth;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));

const authAs = (role: Role): MockAuth => ({
  user: { email: `${role}@example.test` },
  isLoading: false,
  isAdmin: role === 'admin',
  isBroker: role === 'dealer',
  signOut: async () => {},
});

const DISCOVER_TRENDS = getTrendsRoute('udupi');
const DEFAULT_TRENDS = getTrendsRoute(null);
const NON_DISCOVER = '/notifications';

const USER_ITEMS: Array<[string, string]> = [
  ['List property', '/broker/listings/new'],
  ['Saved', '/saved-areas'],
  ['Saved homes', '/saved-homes'],
  ['My bookings', '/my-bookings'],
  ['Notifications', '/notifications'],
];
const DEALER_PRIMARY: Array<[string, string]> = [
  ['Broker dashboard', '/broker/dashboard'],
  ['New listing', '/broker/listings/new'],
  ['Notifications', '/notifications'],
];
const DEALER_DETAILED: Array<[string, string]> = [
  ['My Listings', '/broker/listings'],
  ['Bookings', '/broker/bookings'],
  ['Listing Quality', '/broker/listing-quality'],
  ['Demand Gaps', '/broker/demand-gaps'],
  ['Preferences', '/broker/preferences'],
];
const ADMIN_ITEMS: Array<[string, string]> = [
  ['City launch', '/admin/city-launch'],
  ['Feed Runs', '/admin/feeds'],
  ['Facebook Groups', '/admin/groups'],
  ['Manual Posts', '/admin/posts'],
  ['Process Posts', '/admin/process'],
  ['Listings', '/admin/listings'],
  ['Pending Approval', '/admin/listings/pending'],
  ['Duplicates', '/admin/duplicates'],
  ['Chrome Extension', '/admin/extension'],
  ['Locality Normalizer', '/admin/localities'],
  ['Audit Log', '/admin/audit-log'],
  ['Trust Review', '/admin/trust-review'],
  ['Intelligence', '/admin/intelligence'],
];
const ADMIN_ONLY = ['Pending Approval', 'Feed Runs', 'Locality Normalizer'];

let mm: { restore: () => void } | null = null;

function renderDiscover(role: Role) {
  mockAuth = authAs(role);
  mm = mockMatchMediaWidth(1366);
  return render(
    <QueryClientProvider client={makeTestQueryClient()}>
      <MemoryRouter initialEntries={['/discover?city=udupi']}>
        <DiscoverProvider>
          <PublicDiscoverLayout>
            <div>discover map surface</div>
          </PublicDiscoverLayout>
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderNonDiscover(role: Role) {
  mockAuth = authAs(role);
  return render(
    <MemoryRouter initialEntries={[NON_DISCOVER]}>
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>,
  );
}

type RouteKind = 'discover' | 'non-discover';
const renderAt = (kind: RouteKind, role: Role) => (kind === 'discover' ? renderDiscover(role) : renderNonDiscover(role));

/** Every anchor in the "Role actions" zone, in DOM order, as [accessible text, href]. */
function zoneItems(): Array<[string, string]> {
  const zone = document.querySelector('[aria-label="Role actions"]');
  if (!zone) throw new Error('Role actions zone not rendered');
  return Array.from(zone.querySelectorAll('a')).map((a) => [a.textContent!.trim(), a.getAttribute('href')!]);
}

/** Same exact-name query for controls and negatives: rendered links OR dropdown menuitems with this exact name. */
const countNamed = (name: string) =>
  screen.queryAllByRole('link', { name }).length + screen.queryAllByRole('menuitem', { name }).length;

beforeEach(() => {
  vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', '');
});

afterEach(() => {
  mm?.restore();
  mm = null;
  vi.unstubAllEnvs();
});

describe('nav-roles @ /discover (collapsed Discover header) — #2859 B1', () => {
  it('N1-a/b/e user: the "Menu" overflow holds exactly List property, Saved, Saved homes, My bookings, Notifications, Trends (derived href)', () => {
    renderDiscover('user');
    expect(screen.getByTestId('role-actions-overflow-trigger')).toHaveTextContent('Menu');
    expect(zoneItems()).toEqual([...USER_ITEMS, ['Trends', DISCOVER_TRENDS]]);
    expect(screen.getByRole('menuitem', { name: 'Trends' })).toHaveAttribute('href', DISCOVER_TRENDS);
    expect(screen.getByRole('menuitem', { name: 'Saved' })).toHaveAttribute('href', '/saved-areas');
    expect(screen.getByRole('menuitem', { name: 'My bookings' })).toHaveAttribute('href', '/my-bookings');
    expect(screen.getByRole('menuitem', { name: 'List property' })).toHaveAttribute('href', '/broker/listings/new');
  });

  it('dealer: the "Workspace" overflow holds exactly the deduped broker set + Trends', () => {
    renderDiscover('dealer');
    expect(screen.getByTestId('role-actions-overflow-trigger')).toHaveTextContent('Workspace');
    expect(zoneItems()).toEqual([...DEALER_PRIMARY, ...DEALER_DETAILED, ['Trends', DISCOVER_TRENDS]]);
  });

  it('N2-a/N2-b admin: a button named exactly "Admin" and an overflow holding exactly the 13 admin items + Trends (Pending Approval, Locality Normalizer, Feed Runs with hrefs)', () => {
    renderDiscover('admin');
    expect(screen.getByRole('button', { name: 'Admin' })).toBe(screen.getByTestId('role-actions-overflow-trigger'));
    expect(screen.queryByRole('button', { name: 'Admin Console' })).toBeNull(); // control: the button above exists
    expect(zoneItems()).toEqual([...ADMIN_ITEMS, ['Trends', DISCOVER_TRENDS]]);
    expect(screen.getByRole('menuitem', { name: 'Pending Approval' })).toHaveAttribute('href', '/admin/listings/pending');
    expect(screen.getByRole('menuitem', { name: 'Locality Normalizer' })).toHaveAttribute('href', '/admin/localities');
    expect(screen.getByRole('menuitem', { name: 'Feed Runs' })).toHaveAttribute('href', '/admin/feeds');
  });
});

describe('nav-roles @ non-Discover route (/notifications) — #2859 B1', () => {
  it('N1-a/b/e user: role links are exactly List property, Saved, Saved homes, My bookings, Notifications; Trends is in the public nav with the derived href', () => {
    renderNonDiscover('user');
    expect(zoneItems()).toEqual(USER_ITEMS);
    expect(screen.getByRole('link', { name: 'Saved' })).toHaveAttribute('href', '/saved-areas');
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/my-bookings');
    const publicNav = screen.getByRole('navigation', { name: 'Public discovery' });
    const trends = Array.from(publicNav.querySelectorAll('a')).find((a) => a.textContent!.trim() === 'Trends');
    expect(trends).toBeDefined();
    expect(trends!.getAttribute('href')).toBe(DEFAULT_TRENDS);
  });

  it('dealer: links Broker dashboard, New listing, Notifications + the "Broker workspace" menu (Dashboard, My Listings, Bookings, ...)', () => {
    renderNonDiscover('dealer');
    expect(zoneItems()).toEqual([...DEALER_PRIMARY, ['Dashboard', '/broker/dashboard'], ...DEALER_DETAILED]);
    expect(screen.getByRole('button', { name: 'Broker workspace' })).toBeInTheDocument();
  });

  it('N2-b admin: "Admin Console" menu holds exactly the 13 admin items (not the collapsed "Admin" trigger)', () => {
    renderNonDiscover('admin');
    expect(screen.getByRole('button', { name: 'Admin Console' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull(); // control: 'Admin Console' button found above
    expect(zoneItems()).toEqual(ADMIN_ITEMS);
    expect(screen.getByRole('menuitem', { name: 'Pending Approval' })).toHaveAttribute('href', '/admin/listings/pending');
  });
});

describe.each(['discover', 'non-discover'] as const)('nav-roles same-test controls @ %s — #2859 B1', (kind) => {
  it('N1-g: admin render finds Pending Approval, Feed Runs, Locality Normalizer; the user render finds 0 of each by the SAME query', () => {
    const admin = renderAt(kind, 'admin');
    for (const name of ADMIN_ONLY) expect(countNamed(name)).toBe(1); // control
    admin.unmount();
    mm?.restore();
    mm = null;

    renderAt(kind, 'user');
    for (const name of ADMIN_ONLY) expect(countNamed(name)).toBe(0);
    expect(countNamed('My bookings')).toBe(1); // the user render is real
  });

  it('N1-f: dealer render finds exactly "Bookings"; the user render finds 0 "Bookings" AND 1 "My bookings" (same query)', () => {
    const dealer = renderAt(kind, 'dealer');
    expect(countNamed('Bookings')).toBe(1); // control
    expect(countNamed('My bookings')).toBe(0);
    dealer.unmount();
    mm?.restore();
    mm = null;

    renderAt(kind, 'user');
    expect(countNamed('Bookings')).toBe(0);
    expect(countNamed('My bookings')).toBe(1);
  });

  it('N2-d: dealer render finds "My Listings" and "New listing"; the admin render finds 0 of each by the SAME query', () => {
    const dealer = renderAt(kind, 'dealer');
    expect(countNamed('My Listings')).toBe(1); // control
    expect(countNamed('New listing')).toBe(1); // control
    dealer.unmount();
    mm?.restore();
    mm = null;

    renderAt(kind, 'admin');
    expect(countNamed('My Listings')).toBe(0);
    expect(countNamed('New listing')).toBe(0);
    expect(countNamed('Pending Approval')).toBe(1); // the admin render is real
  });

  it('N1-c/N1-d (STALE in the spec, current contract): dealer finds "My Listings" and "New listing"; the user finds 0 of each and finds "List property"', () => {
    const dealer = renderAt(kind, 'dealer');
    expect(countNamed('My Listings')).toBe(1); // control
    expect(countNamed('New listing')).toBe(1); // control
    dealer.unmount();
    mm?.restore();
    mm = null;

    renderAt(kind, 'user');
    expect(countNamed('My Listings')).toBe(0);
    expect(countNamed('New listing')).toBe(0);
    expect(screen.getAllByRole(kind === 'discover' ? 'menuitem' : 'link', { name: 'List property' })[0]).toHaveAttribute(
      'href',
      '/broker/listings/new',
    );
  });
});
