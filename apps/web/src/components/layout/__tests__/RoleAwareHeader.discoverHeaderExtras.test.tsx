/** RoleAwareHeader is the single shared header owner: `discoverHeaderExtras` lets PublicHeader replace Zone 2's nav, while every other consumer keeps the default nav unchanged. */
import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleAwareHeader } from '../AppLayout';

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

let mockAuth: {
  user: { email: string } | null;
  isLoading: boolean;
  isAdmin: boolean;
  isBroker: boolean;
  signOut: () => void;
} = {
  user: null,
  isLoading: false,
  isAdmin: false,
  isBroker: false,
  signOut: vi.fn(),
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderHeader(props: ComponentProps<typeof RoleAwareHeader> = {}) {
  return render(
    <MemoryRouter>
      <RoleAwareHeader {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = { user: null, isLoading: false, isAdmin: false, isBroker: false, signOut: vi.fn() };
});

describe('RoleAwareHeader — discoverHeaderExtras', () => {
  it('renders the default public-discovery nav links when discoverHeaderExtras is omitted (every non-Discover consumer, unchanged)', () => {
    renderHeader();
    expect(screen.getAllByRole('link', { name: /^discover$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /schools/i }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('discover-header-extras-probe')).not.toBeInTheDocument();
  });

  it('renders discoverHeaderExtras in place of the default nav links when provided', () => {
    renderHeader({
      discoverHeaderExtras: <div data-testid="discover-header-extras-probe">extras</div>,
    });
    expect(screen.getByTestId('discover-header-extras-probe')).toBeInTheDocument();
    // The old full-label nav links must not also be live — exactly one owner for journey/city navigation.
    expect(screen.queryByRole('link', { name: /^discover$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^schools$/i })).not.toBeInTheDocument();
  });

  it('suppressPublicDiscoveryNav still hides the default nav when discoverHeaderExtras is absent (unrelated preview behaviour preserved)', () => {
    renderHeader({ suppressPublicDiscoveryNav: true });
    expect(screen.queryByRole('link', { name: /^discover$/i })).not.toBeInTheDocument();
  });

  it('discoverHeaderExtras still shows role/workspace actions (Zone 3) alongside it — role-aware actions are not dropped', () => {
    renderHeader({
      discoverHeaderExtras: <div data-testid="discover-header-extras-probe">extras</div>,
    });
    // Logged-out default: the "List property" CTA folds into a compact
    // "Menu" overflow trigger in the collapsed header (see the suite below).
    expect(screen.getByTestId('role-actions-overflow-trigger')).toHaveTextContent('Menu');
    expect(screen.getByRole('link', { name: /^sign in$/i })).toBeInTheDocument();
  });
});

// Radix DropdownMenu is unreliable to open via `userEvent.click` in this test environment (see AppLayout.test.tsx's pre-existing admin-role test), so this checks the structural fix (trigger present, correct label/aria) directly; menu-contents correctness is covered by dedupeNavByHref.test.ts.
describe('RoleAwareHeader — RoleActionsOverflowMenu', () => {
  it('Admin: collapses the wide "Admin Console" dropdown + badge to one compact "Admin" trigger', () => {
    mockAuth = { user: { email: 'admin@test.com' }, isLoading: false, isAdmin: true, isBroker: false, signOut: vi.fn() };
    renderHeader({
      discoverHeaderExtras: <div data-testid="discover-header-extras-probe">extras</div>,
    });

    expect(screen.queryByRole('button', { name: /^admin console$/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Admin');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('Dealer/Broker: collapses the 3 separate links + "Broker workspace" dropdown to one compact "Workspace" trigger', () => {
    mockAuth = { user: { email: 'broker@test.com' }, isLoading: false, isAdmin: false, isBroker: true, signOut: vi.fn() };
    renderHeader({
      discoverHeaderExtras: <div data-testid="discover-header-extras-probe">extras</div>,
    });

    expect(screen.queryByRole('link', { name: /broker dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^broker workspace$/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Workspace');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('Buyer (signed in): collapses Saved/Saved homes/My bookings/Notifications into one compact "Menu" trigger', () => {
    mockAuth = { user: { email: 'buyer@test.com' }, isLoading: false, isAdmin: false, isBroker: false, signOut: vi.fn() };
    renderHeader({
      discoverHeaderExtras: <div data-testid="discover-header-extras-probe">extras</div>,
    });

    expect(screen.queryByRole('link', { name: /^saved$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my bookings/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Menu');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('Anonymous: collapses the "List property" CTA into one compact "Menu" trigger (Sign in stays a plain link)', () => {
    renderHeader({
      discoverHeaderExtras: <div data-testid="discover-header-extras-probe">extras</div>,
    });

    expect(screen.queryByRole('link', { name: /list property/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Menu');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('link', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('every non-Discover consumer (discoverHeaderExtras omitted) keeps Buyer/anon Zone 3 as plain links, unchanged', () => {
    mockAuth = { user: { email: 'buyer@test.com' }, isLoading: false, isAdmin: false, isBroker: false, signOut: vi.fn() };
    renderHeader();

    expect(screen.getByRole('link', { name: /^saved$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my bookings/i })).toBeInTheDocument();
    expect(screen.queryByTestId('role-actions-overflow-trigger')).not.toBeInTheDocument();
  });
});
