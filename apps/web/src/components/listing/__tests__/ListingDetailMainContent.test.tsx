import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListingDetailMainContent } from '../ListingDetailMainContent';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import { formatRelativeDate } from '@/lib/formatters';

// ─── Issue #1794 Phase 1 AC5 — direct unit coverage for the confirmedAt branch ──
// ListingDetailMainContent pulls in several query-backed children (SimilarListings,
// NearbyPois, PoiMiniMap, NearbySchoolsCard) that transitively import the Supabase
// client / lib/api at module scope, which throws ("supabaseUrl is required") with no
// real credentials in this worktree. This test is scoped to the "Why trust this
// listing?" confirmedAt/lastUpdated freshness chip, so those children are stubbed
// out locally (mirroring the isolate-the-unit approach used elsewhere in the suite,
// e.g. PropertyCard.test.tsx mocking useSavedListings/useAuthModal) rather than
// wiring up a QueryClientProvider + supabase/api mocks for unrelated subtrees.
vi.mock('@/components/listing/SimilarListings', () => ({
  SimilarListings: () => null,
}));
vi.mock('@/components/poi/NearbyPois', () => ({
  NearbyPois: () => null,
}));
vi.mock('@/components/poi/PoiMiniMap', () => ({
  PoiMiniMap: () => null,
}));
vi.mock('@/components/listing/NearbySchoolsCard', () => ({
  NearbySchoolsCard: () => null,
}));

const makeListing = (overrides: Partial<PublicListingDetail> = {}): PublicListingDetail => ({
  id: 'l1',
  propertyType: 'apartment',
  images: [],
  title: 'Green View Apartment',
  locality: 'Manipal',
  listingPurpose: 'sale',
  price: 5000000,
  sellerType: 'broker',
  reraNumber: 'RERA123',
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

const renderMainContent = (listing: PublicListingDetail) =>
  render(
    <ListingDetailMainContent
      listing={listing}
      label="Apartment"
      badgeClass="bg-secondary"
      priceHistory={[]}
      trustBadges={undefined}
    />,
  );

describe('ListingDetailMainContent — confirmedAt freshness signal (Issue #1794 Phase 1 AC5)', () => {
  it('confirmedAt present → renders "Confirmed {date}" and prefers it over the plain "Last updated" label', () => {
    const confirmedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    renderMainContent(makeListing({ confirmedAt }));

    expect(screen.getByText(`Confirmed ${formatRelativeDate(confirmedAt)}`)).toBeInTheDocument();
    expect(screen.queryByText(/^Last updated/)).not.toBeInTheDocument();
  });

  it('confirmedAt null → falls back to the existing "Last updated" display, no "Confirmed" text (honest absence)', () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    renderMainContent(makeListing({ confirmedAt: null, createdAt, lastUpdatedAt: null }));

    expect(screen.getByText(`Last updated ${formatRelativeDate(createdAt)}`)).toBeInTheDocument();
    expect(screen.queryByText(/^Confirmed/)).not.toBeInTheDocument();
  });

  it('confirmedAt undefined (field omitted by backend) → same honest fallback, no "Confirmed" text', () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    renderMainContent(makeListing({ confirmedAt: undefined, createdAt, lastUpdatedAt: undefined }));

    expect(screen.getByText(`Last updated ${formatRelativeDate(createdAt)}`)).toBeInTheDocument();
    expect(screen.queryByText(/^Confirmed/)).not.toBeInTheDocument();
  });
});

// ─── Issue #2235 — real title vs. synthesized fallback heading ────────────────
describe('ListingDetailMainContent — title fallback (Issue #2235)', () => {
  it('real title present (e.g. anon teaser now exposes it) → renders verbatim, not the synthesized heading', () => {
    renderMainContent(makeListing({ title: '[E2E] 1 Lakh Manipal Apartment', locality: 'Manipal' }));

    expect(screen.getByText('[E2E] 1 Lakh Manipal Apartment')).toBeInTheDocument();
    expect(screen.queryByText('Apartment in Manipal')).not.toBeInTheDocument();
  });

  it('title blank → falls back to the synthesized "{propertyType} in {locality}" heading', () => {
    renderMainContent(makeListing({ title: '', locality: 'Manipal' }));

    expect(screen.getByText('Apartment in Manipal')).toBeInTheDocument();
  });

  it('title absent (undefined) → falls back to the synthesized heading, locality "Unknown Location" when also absent', () => {
    renderMainContent(makeListing({ title: undefined, locality: undefined }));

    expect(screen.getByText('Apartment in Unknown Location')).toBeInTheDocument();
  });
});

// ─── Issue #1941 — anon residential price-band fallback ───────────────────────
describe('ListingDetailMainContent — priceBand fallback (Issue #1941)', () => {
  it('authed exact price present → renders the exact formatted price, ignores priceBand', () => {
    renderMainContent(makeListing({ price: 5000000, priceBand: '₹40L–60L' }));

    expect(screen.getByText('₹50 L')).toBeInTheDocument();
    expect(screen.queryByText('₹40L–60L')).not.toBeInTheDocument();
  });

  it('anon: price absent + priceBand present → renders the band string', () => {
    renderMainContent(makeListing({ price: null, priceBand: '₹1–2Cr' }));

    expect(screen.getByText('₹1–2Cr')).toBeInTheDocument();
  });

  it('neither price nor priceBand → honest absence, no fabricated value rendered', () => {
    renderMainContent(makeListing({ price: null, priceBand: null }));

    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });
});
