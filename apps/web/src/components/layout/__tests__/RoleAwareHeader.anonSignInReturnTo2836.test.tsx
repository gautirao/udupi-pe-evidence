/**
 * #2836 (batch B of #2750) — the anonymous header "Sign in" link carries the CURRENT location
 * (pathname + search) as an encoded returnTo, on both the desktop header (AppLayout.tsx:628)
 * and the mobile sheet (AppLayout.tsx:323).
 *
 * Replaces the AT2 `.first()` Sign-in-link row of the legacy e2e/journey/anon-teaser.spec.ts
 * (A1-8): at gallery image index 0 the lock is not rendered, so `.first()` resolved to the HEADER
 * link, whose exact href was never asserted. The gallery-gate link is already exact in
 * ListingDetail.test.tsx. Reuses the RoleAwareHeader.discoverHeaderExtras scaffold mocks.
 *
 * Asserted by exact value: the href attribute AND the openAuthModal({ returnTo }) argument the
 * same link's click hands to the auth modal. The /discover?city=udupi arm differs, so a hard-coded
 * returnTo cannot pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleAwareHeader } from '../AppLayout';

const openAuthModal = vi.hoisted(() => vi.fn());

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, isAdmin: false, isBroker: false, signOut: vi.fn() }),
}));

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuthModal }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const DETAIL_PATH = '/listing/abc-123?x=1&y=2';
const DETAIL_HREF = '/auth?returnTo=%2Flisting%2Fabc-123%3Fx%3D1%26y%3D2';
const DISCOVER_PATH = '/discover?city=udupi';
const DISCOVER_HREF = '/auth?returnTo=%2Fdiscover%3Fcity%3Dudupi';

function renderHeaderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RoleAwareHeader discoverHeaderExtras={<div data-testid="extras-probe">extras</div>} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  openAuthModal.mockReset();
});

describe('RoleAwareHeader — anonymous Sign in returnTo (#2836 A1-8)', () => {
  describe('desktop header link (AppLayout.tsx:628)', () => {
    it('on a listing URL with a query string: href is exactly /auth?returnTo=<encoded path+search>', () => {
      renderHeaderAt(DETAIL_PATH);

      const link = screen.getByRole('link', { name: /^sign in$/i });
      expect(link.getAttribute('href')).toBe(DETAIL_HREF);
      expect(link.getAttribute('href')).toBe(`/auth?returnTo=${encodeURIComponent(DETAIL_PATH)}`);
    });

    it('control: a different location yields a different, equally exact href (not a constant)', () => {
      renderHeaderAt(DISCOVER_PATH);

      const link = screen.getByRole('link', { name: /^sign in$/i });
      expect(link.getAttribute('href')).toBe(DISCOVER_HREF);
      expect(link.getAttribute('href')).not.toBe(DETAIL_HREF);
    });

    it('clicking it opens the auth modal with the exact current path+search', () => {
      renderHeaderAt(DETAIL_PATH);

      fireEvent.click(screen.getByRole('link', { name: /^sign in$/i }));

      expect(openAuthModal).toHaveBeenCalledTimes(1);
      expect(openAuthModal).toHaveBeenCalledWith({ returnTo: DETAIL_PATH });
    });
  });

  describe('mobile sheet link (AppLayout.tsx:323)', () => {
    function openMobileSheet() {
      // The sheet trigger is an icon-only button (no accessible name): it is the only
      // dialog-popup trigger in the header.
      const trigger = document.querySelector<HTMLButtonElement>('header button[aria-haspopup="dialog"]');
      expect(trigger).not.toBeNull();
      fireEvent.click(trigger as HTMLButtonElement);
      return screen.getByRole('dialog');
    }

    it('before the sheet is opened there is no mobile Sign in link (so the arms below genuinely open it)', () => {
      renderHeaderAt(DETAIL_PATH);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getAllByRole('link', { name: /^sign in$/i })).toHaveLength(1);
    });

    it('on a listing URL with a query string: the sheet link href is exactly /auth?returnTo=<encoded path+search>', () => {
      renderHeaderAt(DETAIL_PATH);
      const dialog = openMobileSheet();

      const link = within(dialog).getByRole('link', { name: /^sign in$/i });
      expect(link.getAttribute('href')).toBe(DETAIL_HREF);
    });

    it('control: a different location yields a different, equally exact sheet href', () => {
      renderHeaderAt(DISCOVER_PATH);
      const dialog = openMobileSheet();

      const link = within(dialog).getByRole('link', { name: /^sign in$/i });
      expect(link.getAttribute('href')).toBe(DISCOVER_HREF);
      expect(link.getAttribute('href')).not.toBe(DETAIL_HREF);
    });

    it('clicking the sheet link opens the auth modal with the exact current path+search', () => {
      renderHeaderAt(DETAIL_PATH);
      const dialog = openMobileSheet();

      fireEvent.click(within(dialog).getByRole('link', { name: /^sign in$/i }));

      expect(openAuthModal).toHaveBeenCalledTimes(1);
      expect(openAuthModal).toHaveBeenCalledWith({ returnTo: DETAIL_PATH });
    });
  });
});
