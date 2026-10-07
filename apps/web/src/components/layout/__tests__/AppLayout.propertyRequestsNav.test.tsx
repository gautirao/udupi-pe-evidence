import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '../AppLayout';
import { PublicDiscoverLayout } from '../PublicDiscoverLayout';
import { makeTestQueryClient } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';

// Issue #2796 — flag-gated "Property requests" admin nav entry.
//
// Opening a real Radix DropdownMenu stalls the jsdom vitest worker (see AppLayout.test.tsx's
// /discover tests), so the dropdown primitives are replaced with always-open pass-throughs
// FILE-SCOPED here. The mobile Sheet stays real Radix and is opened via its trigger.

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

type MockAuth = {
  user: { email: string } | null;
  isLoading: boolean;
  isAdmin: boolean;
  isBroker: boolean;
  signOut: () => Promise<void>;
};

let mockAuth: MockAuth;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const HREF = '/admin/property-requests';
const ENTRY = /^property requests$/i;

const authAs = (role: 'admin' | 'user' | 'dealer' | 'anon'): MockAuth => ({
  user: role === 'anon' ? null : { email: `${role}@test.com` },
  isLoading: false,
  isAdmin: role === 'admin',
  isBroker: role === 'dealer',
  signOut: async () => {},
});

function renderAt(path = '/discover') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>,
  );
}

async function openMobileSheet(container: HTMLElement) {
  const trigger = container.querySelector('button[aria-haspopup="dialog"]');
  if (!trigger) throw new Error('mobile menu trigger not found');
  await userEvent.setup().click(trigger);
  return screen.getByRole('dialog');
}

beforeEach(() => {
  mockAuth = authAs('admin');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AppLayout — Property requests admin nav entry (#2796)', () => {
  it('flag on: desktop Admin Console dropdown lists the entry linking to /admin/property-requests', () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
    renderAt();

    expect(screen.getByRole('menuitem', { name: ENTRY })).toHaveAttribute('href', HREF);
  });

  it('flag on: mobile sheet lists the entry and closes the sheet on click', async () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
    const { container } = renderAt();
    const dialog = await openMobileSheet(container);

    const link = within(dialog).getByRole('link', { name: ENTRY });
    expect(link).toHaveAttribute('href', HREF);

    await userEvent.setup().click(link);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('flag on, on /admin/property-requests: entry is active on desktop and mobile, siblings are not', async () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
    const { container } = renderAt(HREF);

    expect(screen.getByRole('menuitem', { name: ENTRY }).className).toContain('text-primary');
    expect(screen.getByRole('menuitem', { name: /^feed runs$/i }).className).not.toContain('text-primary');

    const dialog = await openMobileSheet(container);
    expect(within(dialog).getByRole('link', { name: ENTRY })).toHaveAttribute('aria-current', 'page');
    expect(within(dialog).getByRole('link', { name: /^feed runs$/i })).not.toHaveAttribute('aria-current');
  });

  it.each([['unset', ''], ['"false"', 'false']])('flag %s: entry absent on desktop and mobile (other admin items still present)', async (_label, value) => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', value);
    const { container } = renderAt();

    expect(screen.getByRole('menuitem', { name: /^feed runs$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: ENTRY })).not.toBeInTheDocument();

    const dialog = await openMobileSheet(container);
    expect(within(dialog).getByRole('link', { name: /^feed runs$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: ENTRY })).not.toBeInTheDocument();
    expect(document.querySelector(`a[href="${HREF}"]`)).toBeNull();
  });

  it.each(['anon', 'user', 'dealer'] as const)('flag on, %s: entry absent', async (role) => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
    mockAuth = authAs(role);
    const { container } = renderAt();
    await openMobileSheet(container);

    expect(screen.queryByText(ENTRY)).not.toBeInTheDocument();
    expect(document.querySelector(`a[href="${HREF}"]`)).toBeNull();
  });
});

describe('AppLayout — Property requests entry in the collapsed Discover header (#2796)', () => {
  let matchMediaMock: { restore: () => void };
  beforeEach(() => {
    matchMediaMock = mockMatchMediaWidth(1366);
  });
  afterEach(() => {
    matchMediaMock.restore();
  });

  function renderCollapsed() {
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

  it('flag on: Admin overflow menu includes the entry linking to /admin/property-requests', () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
    renderCollapsed();

    expect(screen.getByTestId('role-actions-overflow-trigger')).toHaveTextContent('Admin');
    expect(screen.getByRole('menuitem', { name: ENTRY })).toHaveAttribute('href', HREF);
  });

  it('flag off: Admin overflow menu omits the entry', () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', '');
    renderCollapsed();

    expect(screen.getByRole('menuitem', { name: /^feed runs$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: ENTRY })).not.toBeInTheDocument();
  });
});
