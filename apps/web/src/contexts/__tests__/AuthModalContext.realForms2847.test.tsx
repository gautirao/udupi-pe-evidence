// #2847 — integration leg: REAL AuthModalProvider + REAL AuthForms.
// Proves what the OAuth call is handed (exact redirectTo strings) and that a real sign-in / sign-up
// submit never navigates to a value getSafeReturnTo rejects. The unit matrix stubs AuthForms, so this
// needs its own file (vi.mock is file-scoped).
//
// LIMITATION (accepted): supabase.auth.signInWithOAuth is mocked, so the real Supabase/Google round trip
// never fires; these tests prove the URL the component HANDS TO the OAuth call, without relying on
// AuthCallback re-sanitising it.
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInWithOAuth: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => h.navigate };
});
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signInWithOAuth: (...args: unknown[]) => h.signInWithOAuth(...args) } },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: (...args: unknown[]) => h.signIn(...args),
    signUp: (...args: unknown[]) => h.signUp(...args),
  }),
}));

import { AuthModalProvider, useAuthModal, type AuthModalOptions } from '@/contexts/AuthModalContext';

function Opener({ opts }: { opts: AuthModalOptions }) {
  const { openAuthModal } = useAuthModal();
  useEffect(() => {
    openAuthModal(opts);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function mount(opts: AuthModalOptions, entry = '/start') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthModalProvider>
        <Opener opts={opts} />
      </AuthModalProvider>
    </MemoryRouter>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function clickGoogle() {
  const button = await screen.findByRole('button', { name: /sign in with google/i });
  fireEvent.click(button);
  await waitFor(() => expect(h.signInWithOAuth).toHaveBeenCalledTimes(1));
  return h.signInWithOAuth.mock.calls[0][0] as { options: { redirectTo: string } };
}

const cb = (returnTo?: string) =>
  `${window.location.origin}/auth/callback${returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`;

beforeEach(() => {
  h.navigate.mockReset();
  h.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
  h.signIn.mockReset().mockResolvedValue({ error: null });
  h.signUp.mockReset().mockResolvedValue({ error: null });
});

describe('#2847 real AuthForms: OAuth redirectTo', () => {
  it('OAUTH | hostile returnTo and hostile redirect never reach redirectTo; falls back to the current path', async () => {
    mount({ returnTo: '//evil.com', redirect: 'https://evil.com' });
    const call = await clickGoogle();
    expect(call.options.redirectTo).toBe(cb('/start'));
    expect(JSON.stringify(h.signInWithOAuth.mock.calls)).not.toContain('evil');
  });

  it('OAUTH | hostile current path and no options: redirectTo has no returnTo query at all', async () => {
    mount({}, '//evil.com');
    const call = await clickGoogle();
    expect(call.options.redirectTo).toBe(cb());
    expect(JSON.stringify(h.signInWithOAuth.mock.calls)).not.toContain('evil');
  });

  it('OAUTH | CONTROL safe returnTo is carried, url-encoded', async () => {
    mount({ returnTo: '/listing/123?x=1' });
    const call = await clickGoogle();
    expect(call.options.redirectTo).toBe(cb('/listing/123?x=1'));
  });
});

describe('#2847 real AuthForms: sign-in / sign-up submit', () => {
  it('FORM | sign-in with hostile returnTo does not navigate', async () => {
    const user = userEvent.setup();
    mount({ returnTo: '//evil.com' });
    await user.type(await screen.findByPlaceholderText(/you@example.com/i), 'buyer@test.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(h.signIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull());
    await settle();
    expect(h.navigate.mock.calls).toEqual([]);
  });

  it('FORM | sign-in CONTROL safe returnTo navigates exactly once', async () => {
    const user = userEvent.setup();
    mount({ returnTo: '/listing/123?x=1' });
    await user.type(await screen.findByPlaceholderText(/you@example.com/i), 'buyer@test.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(h.signIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.navigate.mock.calls).toEqual([['/listing/123?x=1']]));
    await settle();
    expect(h.navigate.mock.calls).toEqual([['/listing/123?x=1']]);
  });

  it('FORM | sign-up with hostile returnTo does not navigate (onSuccess is shared)', async () => {
    const user = userEvent.setup();
    mount({ returnTo: 'javascript:alert(1)', initialTab: 'signup' });
    await user.type(await screen.findByPlaceholderText(/john doe/i), 'Jane Doe');
    const emails = screen.getAllByPlaceholderText(/you@example.com/i);
    await user.type(emails[emails.length - 1], 'jane@test.com');
    const pwds = screen.getAllByPlaceholderText(/••••••••/);
    await user.type(pwds[pwds.length - 1], 'password123');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));
    await waitFor(() => expect(h.signUp).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^create account$/i })).toBeNull());
    await settle();
    expect(h.navigate.mock.calls).toEqual([]);
  });
});
