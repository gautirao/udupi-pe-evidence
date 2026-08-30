import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthModalProvider } from '@/contexts/AuthModalContext';
import { AppLayout } from '@/components/layout/AppLayout';
import Auth from '@/pages/Auth';
import AuthCallback from '@/pages/AuthCallback';
import { getRoleAwareDefaultLanding } from '@/lib/authUtils';
import { supabase } from '@/integrations/supabase/client';
import { SavedAreas } from '@/components/insights/SavedAreas';

vi.mock('@/hooks/useSavedAreas', () => ({
  useSavedAreas: () => ({ data: [], isLoading: false, error: null }),
  useDeleteSavedArea: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveArea: () => ({ mutate: vi.fn(), isPending: false }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <button type="button">Notifications bell</button>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

const mockSignOut = vi.fn();
let mockAuth: any;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="location-display">{loc.pathname}{loc.search}</div>;
}

describe('AuthModal & Governed Landing Requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      user: null,
      session: null,
      isLoading: false,
      isAdmin: false,
      isBroker: false,
      userRole: null,
      signOut: mockSignOut,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    };
  });

  it('1 & 2. Header Sign in on /discover opens auth modal without route loss, and closing keeps public route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/discover?city=udupi']}>
        <AuthModalProvider>
          <AppLayout>
            <div>Discover Content</div>
          </AppLayout>
          <LocationDisplay />
        </AuthModalProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('location-display')).toHaveTextContent('/discover?city=udupi');

    const signInBtn = screen.getAllByRole('link', { name: /sign in/i })[0];
    await user.click(signInBtn);

    // Modal should be open
    expect(screen.getByRole('tab', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByTestId('location-display')).toHaveTextContent('/discover?city=udupi');

    // Close modal via ESC key
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: /sign in/i })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('location-display')).toHaveTextContent('/discover?city=udupi');
  });

  it('3. Anonymous contextual Save Area action preserves /saved-areas intent', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <AuthModalProvider>
          <AppLayout>
            <SavedAreas selectedArea="udupi" />
          </AppLayout>
          <LocationDisplay />
          <Routes>
            <Route path="/saved-areas" element={<div data-testid="saved-areas-page">Saved Areas Page</div>} />
            <Route path="*" element={null} />
          </Routes>
        </AuthModalProvider>
      </MemoryRouter>
    );

    const saveAreaBtn = screen.getByTestId('save-area-button');
    await user.click(saveAreaBtn);

    expect(screen.getByRole('tab', { name: /sign in/i })).toBeInTheDocument();

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const pwdInput = screen.getByPlaceholderText(/••••••••/i);
    await user.type(emailInput, 'buyer@test.com');
    await user.type(pwdInput, 'password123');

    mockAuth.user = { id: 'u1', email: 'buyer@test.com' };

    const submitBtn = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('saved-areas-page')).toBeInTheDocument();
    });
  });

  it('4. Anonymous List property preserves /broker/listings/new intent', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <AuthModalProvider>
          <AppLayout>
            <div>Content</div>
          </AppLayout>
          <LocationDisplay />
          <Routes>
            <Route path="/broker/listings/new" element={<div data-testid="new-listing-page">New Listing Page</div>} />
            <Route path="*" element={null} />
          </Routes>
        </AuthModalProvider>
      </MemoryRouter>
    );

    const listBtn = screen.getAllByRole('link', { name: /list (your )?property/i })[0];
    await user.click(listBtn);

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const pwdInput = screen.getByPlaceholderText(/••••••••/i);
    await user.type(emailInput, 'owner@test.com');
    await user.type(pwdInput, 'password123');

    const submitBtn = screen.getByRole('button', { name: /^sign in$/i });
    mockAuth.user = { id: 'u2', email: 'owner@test.com' };
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('new-listing-page')).toBeInTheDocument();
    });
  });

  it('5. Successful login from public route keeps/returns to that route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/trends?city=udupi']}>
        <AuthModalProvider>
          <AppLayout>
            <div>Trends Content</div>
          </AppLayout>
          <LocationDisplay />
        </AuthModalProvider>
      </MemoryRouter>
    );

    await user.click(screen.getAllByRole('link', { name: /sign in/i })[0]);

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const pwdInput = screen.getByPlaceholderText(/••••••••/i);
    await user.type(emailInput, 'buyer@test.com');
    await user.type(pwdInput, 'password123');

    mockAuth.user = { id: 'u3' };
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: /sign in/i })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('location-display')).toHaveTextContent('/trends?city=udupi');
  });

  it('6. Logout from public /discover keeps user on /discover as anonymous', async () => {
    mockAuth.user = { email: 'user@test.com' };
    mockAuth.userRole = 'user';
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/discover?city=udupi']}>
        <AuthModalProvider>
          <AppLayout>
            <div>Discover Content</div>
          </AppLayout>
          <LocationDisplay />
        </AuthModalProvider>
      </MemoryRouter>
    );

    const avatar = screen.getByRole('button', { name: 'US' });
    await user.click(avatar);

    const signOutBtn = screen.getByRole('menuitem', { name: /sign out/i });
    await user.click(signOutBtn);

    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByTestId('location-display')).toHaveTextContent('/discover?city=udupi');
  });

  it('7. Logout from broker/admin protected route lands on /discover', async () => {
    mockAuth.user = { email: 'broker@test.com' };
    mockAuth.isBroker = true;
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/broker/dashboard']}>
        <AuthModalProvider>
          <AppLayout>
            <div>Broker Content</div>
          </AppLayout>
          <LocationDisplay />
        </AuthModalProvider>
      </MemoryRouter>
    );

    const avatar = screen.getByRole('button', { name: 'BR' });
    await user.click(avatar);

    const signOutBtn = screen.getByRole('menuitem', { name: /sign out/i });
    await user.click(signOutBtn);

    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByTestId('location-display')).toHaveTextContent('/discover');
  });

  it('8. /auth standalone page still renders and works as fallback', async () => {
    mockAuth.user = { id: 'u4' };
    render(
      <MemoryRouter initialEntries={['/auth?returnTo=/saved-areas']}>
        <LocationDisplay />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/saved-areas" element={<div data-testid="saved-areas">Saved Areas</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('saved-areas')).toBeInTheDocument();
    });
  });

  it('9. /auth/callback route resolves returnTo accurately', () => {
    expect(getRoleAwareDefaultLanding({} as any, false, false)).toBe('/discover');
    expect(getRoleAwareDefaultLanding({} as any, true, false)).toBe('/admin/listings/pending');
    expect(getRoleAwareDefaultLanding({} as any, false, true)).toBe('/broker/dashboard');
  });

  it('10. AuthCallback defers navigation while loading is true, and routes by role once resolved', async () => {
    mockAuth = {
      ...mockAuth,
      user: null,
      session: null,
      isLoading: true,
      isAdmin: false,
      isBroker: false,
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin/listings/pending" element={<div data-testid="admin-landing">Admin Landing</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Completing sign in...')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-landing')).not.toBeInTheDocument();

    mockAuth.isLoading = false;
    mockAuth.user = { id: 'admin1', email: 'admin@test.com' };
    mockAuth.session = { user: mockAuth.user };
    mockAuth.isAdmin = true;
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockAuth.session } });

    rerender(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin/listings/pending" element={<div data-testid="admin-landing">Admin Landing</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-landing')).toBeInTheDocument();
    });
  });
});
