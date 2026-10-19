// #2847 — AuthModalContext success path must never navigate to, nor hand AuthForms, a value that
// getSafeReturnTo rejects.
//
// Two sinks are observed directly:
//   S1  navigate(...)           -> h.navigate.mock.calls   (toEqual, EXACT, including the call count)
//   S2  <AuthForms returnTo />  -> the prop recorded by the AuthForms stub (toBe)
// The router location is deliberately NOT an oracle for hostile rows: MemoryRouter keeps '//evil.com'
// as an in-app path, so a raw navigate would look benign there.
//
// Ruled design (see the approved plan): D1 a rejected target means NO navigate call (stay on the page);
// D2 precedence is `redirect || returnTo`, then sanitise, with NO fall-through to the other key.
// Test names are stable on purpose: mutation attribution matches them by full name.
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  formReturnTo: [] as Array<string | null | undefined>,
  pathnames: [] as string[],
  api: null as null | { open: (o?: { returnTo?: string; redirect?: string }) => void; close: () => void },
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
vi.mock('@/components/auth/AuthForms', () => ({
  AuthForms: ({ returnTo, onSuccess }: { returnTo?: string | null; onSuccess?: () => void }) => {
    h.formReturnTo.push(returnTo);
    return (
      <button type="button" data-testid="auth-success" onClick={() => onSuccess?.()}>
        ok
      </button>
    );
  },
}));

import { AuthModalProvider, useAuthModal, type AuthModalOptions } from '@/contexts/AuthModalContext';
import * as authUtils from '@/lib/authUtils';

function Opener({ opts }: { opts?: AuthModalOptions }) {
  const { openAuthModal, closeAuthModal } = useAuthModal();
  h.api = { open: openAuthModal, close: closeAuthModal };
  useEffect(() => {
    if (opts) openAuthModal(opts);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function LocationProbe() {
  const loc = useLocation();
  h.pathnames.push(loc.pathname);
  return null;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

function mount(opts: AuthModalOptions | undefined, entry = '/start') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthModalProvider>
        <Opener opts={opts} />
        <LocationProbe />
      </AuthModalProvider>
    </MemoryRouter>,
  );
}

const lastProp = () => h.formReturnTo[h.formReturnTo.length - 1];

async function succeed() {
  const btn = await screen.findByTestId('auth-success');
  await act(async () => {
    fireEvent.click(btn);
  });
  await settle();
}

type Key = 'redirect' | 'returnTo' | 'both';
const KEYS: readonly Key[] = ['redirect', 'returnTo', 'both'];
function optsFor(key: Key, value: string): AuthModalOptions {
  return key === 'both' ? { redirect: value, returnTo: value } : { [key]: value };
}

// [label, value] — every one of these is rejected by getSafeReturnTo (measured: repro/probe-sanitiser.log;
// the LF and leading-space rows follow from authUtils.ts:41-50 and are asserted by the S1/S2 tests themselves).
const HOSTILE: ReadonlyArray<readonly [string, string]> = [
  ['bare host', 'evil.com'],
  ['protocol-relative', '//evil.com'],
  ['backslash', '/\\evil.com'],
  ['backslash+slash', '/\\/evil.com'],
  ['javascript scheme', 'javascript:alert(1)'],
  ['mixed-case javascript scheme', 'JaVaScRiPt:alert(1)'],
  ['slash javascript scheme', '/javascript:alert(1)'],
  ['absolute https', 'https://evil.com'],
  ['uppercase slash scheme', '/HTTP://evil.com'],
  ['literal TAB split', '/\t/evil.com'],
  ['literal LF split scheme', '/ht\ntp://evil.com'],
  ['pct-encoded no slash', '%2F%2Fevil.com'],
  ['pct-encoded lowercase', '%2f%2fevil.com'],
  ['leading space', ' /x'],
];

beforeEach(() => {
  h.navigate.mockReset();
  h.formReturnTo.length = 0;
  h.pathnames.length = 0;
  h.api = null;
});

describe('#2847 AuthModalContext hostile matrix', () => {
  for (const key of KEYS) {
    for (const [name, value] of HOSTILE) {
      const label = `${name} ${JSON.stringify(value)}`;

      it(`S1 | ${key} | ${label}`, async () => {
        mount(optsFor(key, value));
        await succeed();
        expect(h.navigate.mock.calls).toEqual([]);
      });

      it(`S2 | ${key} | ${label}`, async () => {
        mount(optsFor(key, value));
        await screen.findByTestId('auth-success');
        expect(lastProp()).toBe('/start');
      });
    }
  }
});

describe('#2847 AuthModalContext controls (a dead seam must not pass the negatives)', () => {
  for (const key of KEYS) {
    it(`CONTROL | ${key}`, async () => {
      mount(optsFor(key, '/listing/123?x=1'));
      await screen.findByTestId('auth-success');
      expect(lastProp()).toBe('/listing/123?x=1');
      await succeed();
      expect(h.navigate.mock.calls).toEqual([['/listing/123?x=1']]);
    });
  }

  for (const literal of ['/saved-areas', '/broker/listings/new']) {
    it(`LITERAL | ${literal}`, async () => {
      mount({ redirect: literal, returnTo: literal });
      await screen.findByTestId('auth-success');
      expect(lastProp()).toBe(literal);
      await succeed();
      expect(h.navigate.mock.calls).toEqual([[literal]]);
    });
  }

  // Accepted by getSafeReturnTo today (same-origin path; residual hardening is tracked as a follow-up, F1).
  // Pinned so the behaviour is explicit; NOT claimed as rejected.
  for (const key of KEYS) {
    for (const value of ['/%2F%2Fevil.com', '/%5Cevil.com']) {
      it(`PIN-ACCEPTED | ${key} | ${value}`, async () => {
        mount(optsFor(key, value));
        await screen.findByTestId('auth-success');
        expect(lastProp()).toBe(value);
        await succeed();
        expect(h.navigate.mock.calls).toEqual([[value]]);
      });
    }
  }
});

describe('#2847 AuthModalContext precedence and edges', () => {
  // D2: select `redirect || returnTo`, THEN sanitise. A rejected redirect does not fall through to returnTo.
  it('D2 | S1 | hostile redirect, safe returnTo: no navigate', async () => {
    mount({ redirect: '//evil.com', returnTo: '/saved-areas' });
    await succeed();
    expect(h.navigate.mock.calls).toEqual([]);
  });

  it('D2 | S2 | hostile redirect, safe returnTo: prop is the current path', async () => {
    mount({ redirect: '//evil.com', returnTo: '/saved-areas' });
    await screen.findByTestId('auth-success');
    expect(lastProp()).toBe('/start');
  });

  it('D2 | safe redirect wins over hostile returnTo (S1 + S2)', async () => {
    mount({ redirect: '/saved-areas', returnTo: '//evil.com' });
    await screen.findByTestId('auth-success');
    expect(lastProp()).toBe('/saved-areas');
    await succeed();
    expect(h.navigate.mock.calls).toEqual([['/saved-areas']]);
  });

  it('D2 | empty redirect falls to returnTo (S1 + S2)', async () => {
    mount({ redirect: '', returnTo: '/saved-areas' });
    await screen.findByTestId('auth-success');
    expect(lastProp()).toBe('/saved-areas');
    await succeed();
    expect(h.navigate.mock.calls).toEqual([['/saved-areas']]);
  });

  it('EDGE | no options: no navigate, prop is the current path', async () => {
    mount({});
    await screen.findByTestId('auth-success');
    expect(lastProp()).toBe('/start');
    await succeed();
    expect(h.navigate.mock.calls).toEqual([]);
  });

  it('EDGE | same-path guard kept: returnTo equal to the current path does not navigate', async () => {
    mount({ returnTo: '/start' });
    await screen.findByTestId('auth-success');
    expect(lastProp()).toBe('/start');
    await succeed();
    expect(h.navigate.mock.calls).toEqual([]);
  });

  // The CURRENT path can itself be hostile (PropertyCard no-arg open + the location-derived callers).
  // PRECONDITION first: the in-test useLocation probe must show the router really holds the hostile pathname,
  // otherwise the row would be vacuous.
  for (const hostilePath of ['//evil.com', '/\\evil.com']) {
    it(`CURPATH | hostile current path ${JSON.stringify(hostilePath)}, no options`, async () => {
      mount({}, hostilePath);
      await screen.findByTestId('auth-success');
      expect(h.pathnames[h.pathnames.length - 1]).toBe(hostilePath);
      expect(lastProp()).toBe(null);
      await succeed();
      expect(h.navigate.mock.calls).toEqual([]);
    });
  }

  it('STALE | options from a closed modal do not leak into a reopened one (S2 + S1)', async () => {
    mount({ returnTo: '//evil.com' });
    await screen.findByTestId('auth-success');
    expect(lastProp()).toBe('/start');
    await act(async () => {
      h.api?.close();
    });
    expect(screen.queryByTestId('auth-success')).toBeNull();
    h.formReturnTo.length = 0;
    await act(async () => {
      h.api?.open();
    });
    await screen.findByTestId('auth-success');
    expect(lastProp()).toBe('/start');
    await succeed();
    expect(h.navigate.mock.calls).toEqual([]);
  });
});

describe('#2847 AuthModalContext reuse of the shared sanitiser (AC7)', () => {
  it('REUSE | getSafeReturnTo spy', async () => {
    const spy = vi.spyOn(authUtils, 'getSafeReturnTo');
    try {
      mount({ returnTo: '//evil.com' });
      await succeed();
      expect(spy).toHaveBeenCalledWith('//evil.com');
      expect(spy).toHaveReturnedWith(null);
      expect(h.navigate.mock.calls).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
