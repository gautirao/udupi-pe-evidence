import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Onboarding from '../../../pages/Onboarding';
import { AppLayout } from '../AppLayout';

// ─── Polyfills for jsdom ─────────────────────────────────

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Mocks ──────────────────────────────────────────────

// Stub out NotificationBell — we test nav rendering here, not notifications.
vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

const mockSignOut = vi.fn();

type MockAuth = {
  user: { email: string } | null;
  session: null;
  isLoading: boolean;
  isAdmin: boolean;
  isDealer: boolean;
  userRole: 'admin' | 'user' | 'dealer' | null;
  insightsAccessUntil: string | null;
  signOut: typeof mockSignOut;
  signUp: () => Promise<{ error: null }>;
  signIn: () => Promise<{ error: null }>;
  refreshRole: () => Promise<void>;
};

let mockAuth: MockAuth;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// ─── Helpers ────────────────────────────────────────────

function baseAuth(overrides: Partial<MockAuth> = {}): MockAuth {
  return {
    user: null,
    session: null,
    isLoading: false,
    isAdmin: false,
    isDealer: false,
    userRole: null,
    insightsAccessUntil: null,
    signOut: mockSignOut,
    signUp: async () => ({ error: null }),
    signIn: async () => ({ error: null }),
    refreshRole: async () => {},
    ...overrides,
  };
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>,
  );
}

// ─── Tests ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = baseAuth();
});

describe('AppLayout — nav links by role', () => {
  it('logged-out: shows only Home link, no role-specific links', () => {
    renderLayout();

    expect(screen.getAllByRole('link', { name: /home/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /insights/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my listings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /saved areas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /feed runs/i })).not.toBeInTheDocument();
  });

  it('user role: shows Home, Insights, My Saved Areas, Notifications — no admin/dealer links', () => {
    mockAuth = baseAuth({
      user: { email: 'user@test.com' },
      userRole: 'user',
    });
    renderLayout();

    expect(screen.getAllByRole('link', { name: /home/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /insights/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /my saved areas/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /notifications/i }).length).toBeGreaterThan(0);

    expect(screen.queryByRole('link', { name: /my listings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new listing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /feed runs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /facebook groups/i })).not.toBeInTheDocument();
  });

  it('dealer role: shows Home, My Listings, New Listing, Notifications — no user/admin links', () => {
    mockAuth = baseAuth({
      user: { email: 'dealer@test.com' },
      userRole: 'dealer',
      isDealer: true,
    });
    renderLayout();

    expect(screen.getAllByRole('link', { name: /home/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /my listings/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /new listing/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /notifications/i }).length).toBeGreaterThan(0);

    expect(screen.queryByRole('link', { name: /insights/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /saved areas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /feed runs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /facebook groups/i })).not.toBeInTheDocument();
  });

  it('admin role: shows Map, Insights and "Admin" dropdown trigger — no dealer/user links', async () => {
    mockAuth = baseAuth({
      user: { email: 'admin@test.com' },
      userRole: 'admin',
      isAdmin: true,
    });
    const user = userEvent.setup();
    renderLayout();

    // Primary (admin) nav
    expect(screen.getAllByRole('link', { name: /^map$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /insights/i }).length).toBeGreaterThan(0);

    // Admin dropdown trigger is rendered (button containing "Admin" text)
    const adminTrigger = screen.getByRole('button', { name: /admin/i });
    expect(adminTrigger).toBeInTheDocument();

    // Open the dropdown to expose admin nav links
    await user.click(adminTrigger);

    // Admin section items appear in the dropdown as menuitems (Radix DropdownMenuItem role)
    expect(screen.getAllByRole('menuitem', { name: /feed runs/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /facebook groups/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /manual posts/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /process posts/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /pending approval/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /duplicates/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /chrome extension/i }).length).toBeGreaterThan(0);

    // Must NOT show dealer or user-only links
    expect(screen.queryByRole('link', { name: /my listings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new listing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /saved areas/i })).not.toBeInTheDocument();
  });
});

describe('AppLayout — admin badge', () => {
  it('shows Admin badge for admin users', () => {
    mockAuth = baseAuth({
      user: { email: 'admin@test.com' },
      userRole: 'admin',
      isAdmin: true,
    });
    renderLayout();

    // Admin users have both the badge pill and the dropdown trigger labeled "Admin"
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
  });

  it('does not show Admin badge for regular users', () => {
    mockAuth = baseAuth({ user: { email: 'user@test.com' }, userRole: 'user' });
    renderLayout();

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('does not show Admin badge for dealers', () => {
    mockAuth = baseAuth({ user: { email: 'dealer@test.com' }, userRole: 'dealer', isDealer: true });
    renderLayout();

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });
});

describe('AppLayout — role label in dropdown', () => {
  it('shows "User" label for user role', async () => {
    mockAuth = baseAuth({ user: { email: 'user@test.com' }, userRole: 'user' });
    const user = userEvent.setup();
    renderLayout();

    // Open the avatar dropdown to expose the portal content
    await user.click(screen.getByRole('button', { name: /^US$/i }));
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('shows "Dealer" label for dealer role', async () => {
    mockAuth = baseAuth({ user: { email: 'dealer@test.com' }, userRole: 'dealer', isDealer: true });
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /^DE$/i }));
    expect(screen.getByText('Dealer')).toBeInTheDocument();
  });

  it('shows "Administrator" label for admin role', async () => {
    mockAuth = baseAuth({ user: { email: 'admin@test.com' }, userRole: 'admin', isAdmin: true });
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /^AD$/i }));
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });
});

describe('AppLayout — dealer nav link hrefs', () => {
  it('dealer role: My Listings link points to /dealer/listings', () => {
    mockAuth = baseAuth({
      user: { email: 'dealer@test.com' },
      userRole: 'dealer',
      isDealer: true,
    });
    renderLayout();

    const links = screen.getAllByRole('link', { name: /my listings/i });
    expect(links[0]).toHaveAttribute('href', '/dealer/listings');
  });
});

describe('AppLayout — onboarding redirect for dealers', () => {
  it('dealer at /onboarding is redirected to /', () => {
    mockAuth = baseAuth({
      user: { email: 'dealer@test.com' },
      userRole: 'dealer',
      isDealer: true,
    });
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<div>home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});
