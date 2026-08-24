import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ─── Hoisted mock handles ────────────────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isAdmin: false, isBroker: false, isLoading: false }))
);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/components/auth/AuthForms', () => ({
  AuthForms: () => null,
}));

// ─── Imports after mocks ──────────────────────────────────────────────────
import Auth from '@/pages/Auth';

function renderAuthAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Auth page — issue #2238: elevated-role post-sign-in redirect race', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseAuth.mockReset();
  });

  it('does NOT redirect while the role fetch is still in flight (isLoading=true), even though user is already set', async () => {
    // Mirrors the real AuthContext window right after SIGNED_IN: `user` is set
    // synchronously, but isAdmin/isBroker are still their pre-fetch default
    // (false) and isLoading is true until fetchUserRole resolves.
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      isAdmin: false,
      isBroker: false,
      isLoading: true,
    });

    renderAuthAt('/auth');

    // Give any (incorrect) effect a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects a broker to /broker/dashboard once role has loaded — not /discover — even though the first render had isAdmin/isBroker=false', async () => {
    // First render: role fetch in flight (the exact pre-fix trigger point).
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      isAdmin: false,
      isBroker: false,
      isLoading: true,
    });

    const { rerender } = renderAuthAt('/auth');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockNavigate).not.toHaveBeenCalled();

    // Role fetch resolves: isBroker flips true, isLoading flips false.
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      isAdmin: false,
      isBroker: true,
      isLoading: false,
    });

    rerender(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/broker/dashboard', { replace: true });
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/discover', { replace: true });
    // Falsifiability: pre-fix, Auth.tsx's effect fired on the FIRST render
    // (isLoading unused) with isBroker still false, navigating to '/discover'
    // before the real role value ever arrived — this assertion would fail
    // against that code because '/discover' would be the (only) call.
  });

  it('redirects an admin to /admin/listings/pending once role has loaded, not /discover', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u2' },
      isAdmin: false,
      isBroker: false,
      isLoading: true,
    });

    const { rerender } = renderAuthAt('/auth');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockNavigate).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({
      user: { id: 'u2' },
      isAdmin: true,
      isBroker: false,
      isLoading: false,
    });

    rerender(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/listings/pending', { replace: true });
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/discover', { replace: true });
  });

  it('still redirects a plain user to /discover once loading resolves (non-elevated role unaffected)', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u3' },
      isAdmin: false,
      isBroker: false,
      isLoading: false,
    });

    renderAuthAt('/auth');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/discover', { replace: true });
    });
  });
});
