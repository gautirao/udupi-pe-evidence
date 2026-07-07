/**
 * ListingDetailSidebar — unit tests for #1617 / #1797
 *
 * #1797 redesign: the inline viewing-request flow itself (date/time picking, submit,
 * pending/success/error states, anon sign-in intent handoff) is covered in depth by
 * ViewingRequestPanel.test.tsx. ViewingRequestPanel is mocked out here so this file
 * stays focused on what ListingDetailSidebar itself owns: wiring the panel with the
 * right props, the verified-broker message, save toggle, contact-phone leak guard,
 * and area-CTA canonicalization.
 *
 * Contact / broker honesty
 *   T1  — ViewingRequestPanel is rendered with the listing id + current user
 *   T2  — "Contact broker" button is NOT rendered (out of scope, no endpoint — #1797)
 *   T4  — contact_phone present + authed → tel: link and Call Now shown
 *   T5  — contact_phone absent + authed → contact section absent
 *   T6  — anonymous user still renders the (mocked) ViewingRequestPanel — no sign-in wall
 *
 * Area CTA canonicalization
 *   T7  — valid areaKey (IN|KA|Udupi|Malpe) → canonical /trends/udupi/areas/malpe
 *   T8  — valid areaKey with multi-word locality → slug is hyphenated
 *   T9  — areaKey null → no Locality Insights CTA
 *   T10 — areaKey too short (IN|KA) → no Locality Insights CTA
 *   T11 — areaKey with empty last segment (IN|KA|Udupi|) → no Locality Insights CTA
 *   T12 — areaKey with unmapped district (IN|KA|Hubli|Dharwad) → no Locality Insights CTA
 *   T18 — Bengaluru district key-alias → /trends/bangalore/areas/indiranagar
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Hoisted mocks ───────────────────────────────────────────────────────────
const mockUseListingMarketContext = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useListingMarketContext', () => ({
  useListingMarketContext: mockUseListingMarketContext,
}));

// AreaMarketWidget renders nothing useful for these tests; stub it out.
vi.mock('@/components/listing/AreaMarketWidget', () => ({
  AreaMarketWidget: () => null,
}));

// ViewingRequestPanel has its own dedicated test suite (ViewingRequestPanel.test.tsx);
// stub it here so Sidebar tests aren't coupled to its internal state machine.
vi.mock('@/components/listing/ViewingRequestPanel', () => ({
  ViewingRequestPanel: ({ listingId, user }: { listingId: string; user: { id: string } | null }) =>
    React.createElement(
      'div',
      { 'data-testid': 'viewing-request-panel-stub' },
      `listing=${listingId} user=${user ? user.id : 'anon'}`,
    ),
}));

// ── Import after mocks ───────────────────────────────────────────────────────
import { ListingDetailSidebar } from './ListingDetailSidebar';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import type { User } from '@supabase/supabase-js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeListing(overrides: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return {
    id: 'listing-123',
    propertyType: 'apartment',
    title: 'Test Apartment',
    locality: 'Malpe',
    status: 'LIVE',
    images: [],
    areaKey: 'IN|KA|Udupi|Malpe',
    contact_phone: null,
    contact_info: null,
    latitude: null,
    longitude: null,
    listingPurpose: 'sale',
    sellerType: 'broker',
    price: 5_000_000,
    ...overrides,
  } as unknown as PublicListingDetail;
}

const MOCK_USER = { id: 'user-1', email: 'user@example.com' } as unknown as User;

function renderSidebar(
  listing: PublicListingDetail,
  user: User | null,
  onShare = vi.fn(),
  onToggleSaved = vi.fn(),
) {
  return render(
    <MemoryRouter>
      <ListingDetailSidebar
        listing={listing}
        user={user}
        onShare={onShare}
        saved={false}
        onToggleSaved={onToggleSaved}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseListingMarketContext.mockReturnValue({ data: [], isLoading: false, error: null });
});

// ── Contact / broker honesty ─────────────────────────────────────────────────

describe('Contact / broker honesty (#1797)', () => {
  it('T1 — renders ViewingRequestPanel wired with the listing id + signed-in user', () => {
    renderSidebar(makeListing(), MOCK_USER);
    expect(screen.getByTestId('viewing-request-panel-stub')).toHaveTextContent(
      'listing=listing-123 user=user-1',
    );
  });

  it('T2 — "Contact broker" button is not rendered (no endpoint — out of scope)', () => {
    renderSidebar(makeListing(), MOCK_USER);
    expect(screen.queryByTestId('contact-broker-btn')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contact broker/i })).not.toBeInTheDocument();
  });

  it('T4 — contact_phone + authed → tel: link and Call Now button shown', () => {
    renderSidebar(makeListing({ contact_phone: '+91-9876543210' }), MOCK_USER);
    expect(screen.getByTestId('contact-phone-section')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /call now/i })).toHaveAttribute(
      'href',
      'tel:+91-9876543210',
    );
    // The number itself should appear as a clickable link too
    expect(screen.getByText('+91-9876543210')).toBeInTheDocument();
  });

  it('T5 — contact_phone absent + authed → contact section not rendered', () => {
    renderSidebar(makeListing({ contact_phone: null }), MOCK_USER);
    expect(screen.queryByTestId('contact-phone-section')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /call now/i })).not.toBeInTheDocument();
  });

  it('T6 — anonymous user still gets the (same) ViewingRequestPanel — no sign-in wall', () => {
    renderSidebar(makeListing(), null);
    expect(screen.getByTestId('viewing-request-panel-stub')).toHaveTextContent(
      'listing=listing-123 user=anon',
    );
    expect(screen.queryByTestId('sign-in-gate')).not.toBeInTheDocument();
  });

  it('verified-broker message renders for a broker-listed property', () => {
    renderSidebar(makeListing({ sellerType: 'broker' }), MOCK_USER);
    expect(screen.getByText(/listed by a verified broker/i)).toBeInTheDocument();
  });
});

// ── Area CTA canonicalization ─────────────────────────────────────────────────

describe('Area CTA canonicalization', () => {
  it('T7 — valid areaKey (IN|KA|Udupi|Malpe) → canonical /trends/udupi/areas/malpe', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|Udupi|Malpe' }), MOCK_USER);
    const link = screen.getByTestId('locality-insights-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/trends/udupi/areas/malpe');
  });

  it('T8 — multi-word locality → slug is hyphenated (IN|KA|Udupi|Udupi Town)', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|Udupi|Udupi Town' }), MOCK_USER);
    const link = screen.getByTestId('locality-insights-link');
    expect(link).toHaveAttribute('href', '/trends/udupi/areas/udupi-town');
  });

  it('T9 — areaKey null → no Locality Insights CTA rendered', () => {
    renderSidebar(makeListing({ areaKey: null }), MOCK_USER);
    expect(screen.queryByTestId('locality-insights-link')).not.toBeInTheDocument();
    expect(screen.queryByText(/locality insights/i)).not.toBeInTheDocument();
  });

  it('T10 — areaKey too short (IN|KA) → no Locality Insights CTA', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA' }), MOCK_USER);
    expect(screen.queryByTestId('locality-insights-link')).not.toBeInTheDocument();
  });

  it('T11 — areaKey with empty last segment (IN|KA|Udupi|) → no Locality Insights CTA', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|Udupi|' }), MOCK_USER);
    expect(screen.queryByTestId('locality-insights-link')).not.toBeInTheDocument();
  });

  it('T12 — unmapped district (IN|KA|Hubli|Dharwad) → no Locality Insights CTA', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|Hubli|Dharwad' }), MOCK_USER);
    expect(screen.queryByTestId('locality-insights-link')).not.toBeInTheDocument();
  });

  it('T13 — Mangalore district → canonical /trends/mangalore/... route', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|Mangalore|Balmatta' }), MOCK_USER);
    const link = screen.getByTestId('locality-insights-link');
    expect(link).toHaveAttribute('href', '/trends/mangalore/areas/balmatta');
  });

  it('T15 — Kundapur (TitleCase) → canonical /trends/kundapur/areas/town', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|Kundapur|Town' }), MOCK_USER);
    const link = screen.getByTestId('locality-insights-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/trends/kundapur/areas/town');
  });

  it('T16 — Kundapur lowercase district (IN|KA|kundapur|Town) → canonical /trends/kundapur/areas/town', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|kundapur|Town' }), MOCK_USER);
    const link = screen.getByTestId('locality-insights-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/trends/kundapur/areas/town');
  });

  it('T17 — Kundapur uppercase district (IN|KA|KUNDAPUR|Town) → canonical /trends/kundapur/areas/town', () => {
    renderSidebar(makeListing({ areaKey: 'IN|KA|KUNDAPUR|Town' }), MOCK_USER);
    const link = screen.getByTestId('locality-insights-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/trends/kundapur/areas/town');
  });

  it('T18 — Bengaluru district key-alias → canonical /trends/bangalore/areas/indiranagar', () => {
    // Bengaluru is the ONLY existing district whose map value ('bangalore') differs
    // from its lowercased key ('bengaluru'). This regression test guards that
    // the aliasing path in DISTRICT_TO_CITY_SLUG_FOLDED resolves correctly.
    renderSidebar(makeListing({ areaKey: 'IN|KA|Bengaluru|Indiranagar' }), MOCK_USER);
    const link = screen.getByTestId('locality-insights-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/trends/bangalore/areas/indiranagar');
  });
});

// ── Phone-number leak guard ───────────────────────────────────────────────────

describe('Phone-number leak guard', () => {
  it(
    'T14 — anonymous user + contact_phone present → contact-phone-section NOT rendered (no leak)',
    () => {
      // Arrange: listing has a real phone number; user is NOT authenticated.
      // The guard is `user && listing.contact_phone` in the sidebar —
      // this test ensures the guard holds and the number never leaks to anon users.
      renderSidebar(makeListing({ contact_phone: '+91-8001234567' }), null /* anon */);

      // The contact section itself must be absent
      expect(screen.queryByTestId('contact-phone-section')).not.toBeInTheDocument();

      // The phone number text must not appear anywhere in the rendered output
      expect(screen.queryByText('+91-8001234567')).not.toBeInTheDocument();

      // The tel: link must not appear (belt-and-suspenders)
      expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    },
  );
});
