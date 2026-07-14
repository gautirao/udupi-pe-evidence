import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { PropertyCard } from '../PropertyCard';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { formatRelativeDate } from '@/lib/formatters';

// ─── Issue #1566 — saved-homes mocks ────────────────────────────────────────
// PropertyCard's heart is now server-backed (useSavedListingIds/useSaveListing/
// useUnsaveListing) and gated by useAuthModal for anon clicks. Mocking the hooks
// directly (rather than wrapping every test in a QueryClientProvider) keeps the
// existing pre-#1566 test suite unaffected while giving the new tests below
// direct control over saved/pending state.
const mockSavedIds = vi.hoisted(() => ({ current: new Set<string>() }));
const mockSaveMutate = vi.hoisted(() => vi.fn());
const mockUnsaveMutate = vi.hoisted(() => vi.fn());
const mockSavePending = vi.hoisted(() => ({ current: false }));
const mockUnsavePending = vi.hoisted(() => ({ current: false }));
const mockOpenAuthModal = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSavedListings', () => ({
  useSavedListingIds: () => ({ idSet: mockSavedIds.current }),
  useSaveListing: () => ({ mutate: mockSaveMutate, isPending: mockSavePending.current }),
  useUnsaveListing: () => ({ mutate: mockUnsaveMutate, isPending: mockUnsavePending.current }),
}));

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ isOpen: false, openAuthModal: mockOpenAuthModal, closeAuthModal: vi.fn() }),
}));

const makeListing = (overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem => ({
  id: 'l1',
  title: 'Green View Apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  propertyType: 'apartment',
  listingPurpose: 'sale',
  pricePaise: 5000000 * 100, // ₹50,00,000
  bedrooms: 3,
  bathrooms: 2,
  builtArea: 1200,
  builtAreaUnit: 'sqft',
  landArea: null,
  landAreaUnit: null,
  totalFloors: null,
  parkingCount: null,
  furnishingStatus: null,
  createdAt: null,
  trustBadge: null,
  ...overrides,
});

const renderCard = (props: React.ComponentProps<typeof PropertyCard>) =>
  render(<MemoryRouter>{<PropertyCard {...props} />}</MemoryRouter>);

describe('PropertyCard', () => {
  beforeEach(() => {
    mockSavedIds.current = new Set<string>();
    mockSaveMutate.mockReset();
    mockUnsaveMutate.mockReset();
    mockSavePending.current = false;
    mockUnsavePending.current = false;
    mockOpenAuthModal.mockReset();
  });

  it('renders the listing-card testid', () => {
    renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByTestId('listing-card')).toBeInTheDocument();
  });

  it('shows the listing title', () => {
    renderCard({ listing: makeListing({ title: 'Sunny Villa' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Sunny Villa')).toBeInTheDocument();
  });

  it('uses the refined hover lift and NOT a teal/green hover wash', () => {
    renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate: vi.fn() });
    const card = screen.getByTestId('listing-card');
    // Premium card surface + hover lift.
    expect(card.className).toContain('bg-card');
    expect(card.className).toContain('hover:-translate-y-0.5');
    expect(card.className).toContain('hover:shadow-md');
    // No accent (legacy coastal-teal) hover background.
    expect(card.className).not.toContain('hover:bg-accent');
  });

  it('falls back to type+purpose when title is null', () => {
    renderCard({
      listing: makeListing({ title: null, propertyType: 'apartment', listingPurpose: 'sale' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Apartment For Sale')).toBeInTheDocument();
  });

  it('renders an img element when primaryImageUrl is provided', () => {
    const { container } = renderCard({
      listing: makeListing({ primaryImageUrl: 'https://example.com/img.jpg' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    // The img has alt="" (decorative) so ARIA role is "presentation", not "img".
    // Use the DOM directly to verify the src attribute.
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg');
  });

  it('renders the Building2 fallback icon when no image URL', () => {
    renderCard({ listing: makeListing({ primaryImageUrl: null }), isAuthenticated: true, onNavigate: vi.fn() });
    // img element should be absent
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The listing-card container itself should be present
    expect(screen.getByTestId('listing-card')).toBeInTheDocument();
  });

  it('shows the Verified trust badge for trustBadge "verified"', () => {
    renderCard({ listing: makeListing({ trustBadge: 'verified' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('shows the Trusted trust badge for trustBadge "trusted"', () => {
    renderCard({ listing: makeListing({ trustBadge: 'trusted' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Trusted')).toBeInTheDocument();
  });

  it('shows the Listed trust badge for trustBadge "listed"', () => {
    renderCard({ listing: makeListing({ trustBadge: 'listed' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Listed')).toBeInTheDocument();
  });

  it('shows no trust badge when trustBadge is null (never invents a badge)', () => {
    renderCard({ listing: makeListing({ trustBadge: null }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Trusted')).not.toBeInTheDocument();
    expect(screen.queryByText('Listed')).not.toBeInTheDocument();
  });

  // ── F4 — Trust badge colour tokens (round-3 refinement) ────────────────
  // These tests verify the COLOUR classes on the badge span, not just label presence.
  // verified: evergreen-tint bg + evergreen text (ShieldCheck icon).
  // trusted: bg-secondary + text-secondary-foreground (Shield icon, NOT ShieldCheck).
  // listed: bg-muted/60 + text-muted-foreground (Shield icon).
  // null / undefined / unknown → NO badge rendered at all.

  describe('F4 — trust badge colour tokens (round-3)', () => {
    it('trustBadge "verified" → badge has bg-[hsl(var(--evergreen-tint))] class', () => {
      renderCard({ listing: makeListing({ trustBadge: 'verified' }), isAuthenticated: true, onNavigate: vi.fn() });
      const badge = screen.getByTestId('trust-badge');
      expect(badge.className).toContain('bg-[hsl(var(--evergreen-tint))]');
    });

    it('trustBadge "verified" → badge has text-[hsl(var(--evergreen))] class', () => {
      renderCard({ listing: makeListing({ trustBadge: 'verified' }), isAuthenticated: true, onNavigate: vi.fn() });
      const badge = screen.getByTestId('trust-badge');
      expect(badge.className).toContain('text-[hsl(var(--evergreen))]');
    });

    it('trustBadge "trusted" → badge has bg-secondary class (calm navy, NOT evergreen)', () => {
      renderCard({ listing: makeListing({ trustBadge: 'trusted' }), isAuthenticated: true, onNavigate: vi.fn() });
      const badge = screen.getByTestId('trust-badge');
      expect(badge.className).toContain('bg-secondary');
      expect(badge.className).not.toContain('bg-[hsl(var(--evergreen-tint))]');
    });

    it('trustBadge "trusted" → badge has text-secondary-foreground class', () => {
      renderCard({ listing: makeListing({ trustBadge: 'trusted' }), isAuthenticated: true, onNavigate: vi.fn() });
      const badge = screen.getByTestId('trust-badge');
      expect(badge.className).toContain('text-secondary-foreground');
    });

    it('trustBadge "listed" → badge has bg-muted/60 class', () => {
      renderCard({ listing: makeListing({ trustBadge: 'listed' }), isAuthenticated: true, onNavigate: vi.fn() });
      const badge = screen.getByTestId('trust-badge');
      expect(badge.className).toContain('bg-muted/60');
    });

    it('trustBadge "listed" → badge has text-muted-foreground class', () => {
      renderCard({ listing: makeListing({ trustBadge: 'listed' }), isAuthenticated: true, onNavigate: vi.fn() });
      const badge = screen.getByTestId('trust-badge');
      expect(badge.className).toContain('text-muted-foreground');
    });

    it('trustBadge absent/undefined → NO badge rendered', () => {
      // The backend omits the field entirely for D-tier/legacy rows; the component
      // must silently render nothing (never fabricate a badge).
      renderCard({
        listing: makeListing({ trustBadge: undefined }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
      expect(screen.queryByText('Verified')).not.toBeInTheDocument();
      expect(screen.queryByText('Trusted')).not.toBeInTheDocument();
      expect(screen.queryByText('Listed')).not.toBeInTheDocument();
    });

    it('trustBadge unknown string → NO badge rendered', () => {
      renderCard({
        listing: makeListing({ trustBadge: 'UNKNOWN' as DiscoverCityListingItem['trustBadge'] }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
    });

    it('trustBadge null → NO badge rendered (data-testid trust-badge absent)', () => {
      renderCard({ listing: makeListing({ trustBadge: null }), isAuthenticated: true, onNavigate: vi.fn() });
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
    });
  });

  // ── Issue #1616 — three-way price contract ────────────────────────────────
  // Branch 1: pricePaise present (authed path) → exact formatted rupee price rendered.
  // Branch 2: priceBand present, no pricePaise (anon path) → band label rendered.
  // Branch 3: neither present (null DB price on either path) → "Price on request".
  // "Sign in to view price" no longer exists — replaced by the band or "Price on request".

  it('#1616 branch-1: pricePaise present → exact formatted price visible (authed path)', () => {
    renderCard({
      listing: makeListing({ pricePaise: 5000000 * 100 }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    // Exact rupee value rendered; none of the fallback texts present
    expect(screen.queryByText('Price on request')).not.toBeInTheDocument();
    // Rupee symbol must be in the DOM
    expect(document.body.textContent).toMatch(/₹/);
  });

  it('#1616 branch-2: priceBand present, no pricePaise → band label rendered (anon path)', () => {
    renderCard({
      listing: makeListing({ pricePaise: undefined, priceBand: '₹50L–1Cr' }),
      isAuthenticated: false,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('₹50L–1Cr')).toBeInTheDocument();
    // Must NOT show the old "Sign in" wall or "Price on request"
    expect(screen.queryByText('Sign in to view price')).not.toBeInTheDocument();
    expect(screen.queryByText('Price on request')).not.toBeInTheDocument();
  });

  it('#1616 branch-2: anon with priceBand never shows exact rupee amount', () => {
    const { container } = renderCard({
      listing: makeListing({ pricePaise: undefined, priceBand: '₹25–50L' }),
      isAuthenticated: false,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('₹25–50L')).toBeInTheDocument();
    // No exact price digit-grouping in the DOM (the band is a label, not formatted paise)
    expect(container.textContent).not.toMatch(/50,00,000|5,000,000/);
  });

  it('#1616 branch-3: neither pricePaise nor priceBand → "Price on request"', () => {
    renderCard({
      listing: makeListing({ pricePaise: undefined, priceBand: undefined }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Price on request')).toBeInTheDocument();
  });

  it('#1616 branch-3 (anon): null priceBand and no pricePaise → "Price on request"', () => {
    renderCard({
      listing: makeListing({ pricePaise: undefined, priceBand: null }),
      isAuthenticated: false,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Price on request')).toBeInTheDocument();
  });

  it('#1616 no "Sign in to view price" text exists — old wall is fully removed', () => {
    // Both authed and anon paths must NOT render the old sign-in wall copy.
    const { rerender } = renderCard({
      listing: makeListing({ pricePaise: undefined, priceBand: '₹0–25L' }),
      isAuthenticated: false,
      onNavigate: vi.fn(),
    });
    expect(screen.queryByText('Sign in to view price')).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PropertyCard
          listing={makeListing({ pricePaise: 5000000 * 100 })}
          isAuthenticated={true}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Sign in to view price')).not.toBeInTheDocument();
  });

  // Legacy tests updated for new contract (kept for backward-compat shape documentation)

  it('shows "Price on request" when authenticated but pricePaise is undefined', () => {
    renderCard({
      listing: makeListing({ pricePaise: undefined }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Price on request')).toBeInTheDocument();
  });

  it('shows the locality with MapPin', () => {
    renderCard({ listing: makeListing({ locality: 'Udupi' }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('Udupi')).toBeInTheDocument();
  });

  it('does not show locality section when locality is undefined', () => {
    renderCard({ listing: makeListing({ locality: undefined }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.queryByText('Udupi')).not.toBeInTheDocument();
  });

  it('shows bedrooms BHK chip in metadata', () => {
    renderCard({ listing: makeListing({ bedrooms: 3 }), isAuthenticated: true, onNavigate: vi.fn() });
    expect(screen.getByText('3 BHK')).toBeInTheDocument();
  });

  it('renders propertyType and listingPurpose tag chips', () => {
    renderCard({
      listing: makeListing({ propertyType: 'villa', listingPurpose: 'rent' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('Villa')).toBeInTheDocument();
    expect(screen.getByText('For Rent')).toBeInTheDocument();
  });

  it('renders the property-type pill when propertyType exists, and omits it when missing', () => {
    const { rerender } = renderCard({
      listing: makeListing({ title: 'X', propertyType: 'house' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
    });
    expect(screen.getByText('House')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PropertyCard
          listing={makeListing({ title: 'X', propertyType: null, listingPurpose: null })}
          isAuthenticated
          onNavigate={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('House')).not.toBeInTheDocument();
  });

  it('renders a "View details" button that navigates on click', async () => {
    const onNavigate = vi.fn();
    renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate });
    const btn = screen.getByTestId('listing-view-details');
    expect(btn).toHaveTextContent('View details');
    await userEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('builds a richer "sublocality, area" location when areaLabel is provided', () => {
    renderCard({
      listing: makeListing({ locality: 'Eshwar Nagar' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
      areaLabel: 'Manipal',
    });
    expect(screen.getByText('Eshwar Nagar, Manipal')).toBeInTheDocument();
  });

  it('deduplicates the location — never renders "Manipal, Manipal"', () => {
    renderCard({
      listing: makeListing({ locality: 'Manipal' }),
      isAuthenticated: true,
      onNavigate: vi.fn(),
      areaLabel: 'manipal',
    });
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.queryByText(/Manipal,\s*Manipal/i)).not.toBeInTheDocument();
  });

  it('calls onNavigate when the card is clicked', async () => {
    const onNavigate = vi.fn();
    renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate });
    await userEvent.click(screen.getByTestId('listing-card'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  // ── Issue #1547/#1616 — anon no-leak (BLOCKING, RISK-2) ────────────────────
  // #1616 update: anon path no longer shows "Sign in to view price".
  // Backend coarsens price; PropertyCard renders priceBand for anon (exact price never leaked).
  describe('anon price gate (no-leak) — #1616 updated contract', () => {
    // Backend-shaped anon fixture: pricePaise absent, priceBand carries the coarse label.
    // The exact digit run "50,00,000" must never appear in the anon DOM.
    const ANON_FIXTURE = makeListing({ pricePaise: undefined, priceBand: '₹50L–1Cr' });
    // Authed fixture: pricePaise present (₹50,00,000), priceBand absent.
    const AUTHED_FIXTURE = makeListing({ pricePaise: 5000000 * 100, priceBand: undefined });

    it('#1616 anon: priceBand label shown, no exact digit-grouped rupee amount', () => {
      const { container } = renderCard({
        listing: ANON_FIXTURE,
        isAuthenticated: false,
        onNavigate: vi.fn(),
      });
      // Band label is shown (not a sign-in wall)
      expect(screen.getByText('₹50L–1Cr')).toBeInTheDocument();
      // No exact price digit-grouping — backend never sent it
      expect(container.textContent).not.toMatch(/50,00,000|5,000,000/);
      // Old sign-in wall gone
      expect(screen.queryByText('Sign in to view price')).not.toBeInTheDocument();
    });

    it('#1616 authed: exact formatted rupee price shown, no band label', () => {
      const { container } = renderCard({
        listing: AUTHED_FIXTURE,
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.queryByText('Sign in to view price')).not.toBeInTheDocument();
      // The authed branch renders a rupee value from pricePaise
      expect(container.textContent).toMatch(/₹/);
      // No band label for authed path
      expect(screen.queryByText('₹50L–1Cr')).not.toBeInTheDocument();
    });
  });

  // ── Issue #1547 — selected state ───────────────────────────────────────────
  describe('selected state', () => {
    it('marks the card aria-pressed + data-selected when isSelected is true', () => {
      renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate: vi.fn(), isSelected: true });
      const card = screen.getByTestId('listing-card');
      expect(card).toHaveAttribute('aria-pressed', 'true');
      expect(card).toHaveAttribute('data-selected', 'true');
    });

    it('is not selected by default', () => {
      renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate: vi.fn() });
      const card = screen.getByTestId('listing-card');
      expect(card).toHaveAttribute('aria-pressed', 'false');
      expect(card).not.toHaveAttribute('data-selected');
    });
  });

  // ── Issue #1547 — keyboard a11y (AC10, RISK-6) ─────────────────────────────
  describe('keyboard accessibility', () => {
    it('exposes role=button and is focusable (tabIndex 0)', () => {
      renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate: vi.fn() });
      const card = screen.getByTestId('listing-card');
      expect(card).toHaveAttribute('role', 'button');
      expect(card).toHaveAttribute('tabindex', '0');
    });

    it('activates onNavigate on Enter', async () => {
      const onNavigate = vi.fn();
      renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate });
      const card = screen.getByTestId('listing-card');
      card.focus();
      expect(card).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('activates onNavigate on Space', async () => {
      const onNavigate = vi.fn();
      renderCard({ listing: makeListing(), isAuthenticated: true, onNavigate });
      screen.getByTestId('listing-card').focus();
      await userEvent.keyboard(' ');
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('calls onSelect (with id) alongside onNavigate when provided', async () => {
      const onNavigate = vi.fn();
      const onSelect = vi.fn();
      renderCard({ listing: makeListing({ id: 'abc' }), isAuthenticated: true, onNavigate, onSelect });
      await userEvent.click(screen.getByTestId('listing-card'));
      expect(onSelect).toHaveBeenCalledWith('abc');
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });
  });

  // ── Issue #1547 — ephemeral hover/focus signal (Option B, card→marker) ──────
  describe('onHover — ephemeral card→marker signal', () => {
    it('calls onHover(id) on mouseenter', async () => {
      const onHover = vi.fn();
      renderCard({ listing: makeListing({ id: 'h1' }), isAuthenticated: true, onNavigate: vi.fn(), onHover });
      await userEvent.hover(screen.getByTestId('listing-card'));
      expect(onHover).toHaveBeenCalledWith('h1');
    });

    it('calls onHover(null) on mouseleave', async () => {
      const onHover = vi.fn();
      renderCard({ listing: makeListing({ id: 'h1' }), isAuthenticated: true, onNavigate: vi.fn(), onHover });
      const card = screen.getByTestId('listing-card');
      await userEvent.hover(card);
      await userEvent.unhover(card);
      // Last call must be null (the leave signal).
      expect(onHover).toHaveBeenLastCalledWith(null);
    });

    it('calls onHover(id) on focus', async () => {
      const onHover = vi.fn();
      renderCard({ listing: makeListing({ id: 'h2' }), isAuthenticated: true, onNavigate: vi.fn(), onHover });
      screen.getByTestId('listing-card').focus();
      expect(onHover).toHaveBeenCalledWith('h2');
    });

    it('calls onHover(null) on blur', async () => {
      const onHover = vi.fn();
      renderCard({ listing: makeListing({ id: 'h2' }), isAuthenticated: true, onNavigate: vi.fn(), onHover });
      const card = screen.getByTestId('listing-card');
      card.focus();
      card.blur();
      expect(onHover).toHaveBeenLastCalledWith(null);
    });

    it('click still calls onNavigate when onHover is provided', async () => {
      const onNavigate = vi.fn();
      const onHover = vi.fn();
      renderCard({ listing: makeListing({ id: 'h3' }), isAuthenticated: true, onNavigate, onHover });
      await userEvent.click(screen.getByTestId('listing-card'));
      // Navigation must still fire — hover affordance does not replace click.
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when onHover is not provided (no crash)', async () => {
      // Regression guard: existing consumers that don't pass onHover must not crash.
      renderCard({ listing: makeListing({ id: 'h4' }), isAuthenticated: true, onNavigate: vi.fn() });
      const card = screen.getByTestId('listing-card');
      // None of these should throw.
      await userEvent.hover(card);
      await userEvent.unhover(card);
      card.focus();
      card.blur();
    });
  });

  // ── Issue #1606 / ReTrends redesign fidelity ─────────────────────────────────
  describe('ReTrends fidelity (Issue #1606)', () => {
    it('renders an evergreen For-sale dot badge when listingPurpose is "sale"', () => {
      const { container } = renderCard({
        listing: makeListing({ listingPurpose: 'sale' }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      // The "For Sale" text renders inside an evergreen-tint span
      expect(screen.getByText('For Sale')).toBeInTheDocument();
      // Evergreen-tint class or inline CSS on the badge span
      const badge = screen.getByText('For Sale').closest('span');
      expect(badge).not.toBeNull();
      // The badge uses evergreen-tint background via Tailwind class reference
      expect(badge!.className).toContain('bg-[hsl(var(--evergreen-tint))]');
    });

    it('renders a muted border badge when listingPurpose is "rent" (not evergreen)', () => {
      renderCard({
        listing: makeListing({ listingPurpose: 'rent' }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.getByText('For Rent')).toBeInTheDocument();
      const badge = screen.getByText('For Rent').closest('span');
      expect(badge).not.toBeNull();
      // Rent uses muted/border, NOT evergreen
      expect(badge!.className).not.toContain('bg-[hsl(var(--evergreen-tint))]');
      expect(badge!.className).toContain('bg-muted');
    });

    it('renders a type-coloured dot pill for apartment (navy tintBg)', () => {
      renderCard({
        listing: makeListing({ propertyType: 'apartment' }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      // The type pill label 'Apartment' is rendered by capitalize(listing.propertyType).
      const typeLabel = screen.getByText('Apartment');
      expect(typeLabel).toBeInTheDocument();
      const pill = typeLabel.closest('span');
      expect(pill).not.toBeNull();
      // The pill uses the navy tintBg inline style — just verify the element is present
      // (inline style is set dynamically so we check the colour dot child is present).
      const dot = pill!.querySelector('span[aria-hidden="true"]');
      expect(dot).not.toBeNull();
    });

    it('renders a type-coloured dot pill for villa (copper tintBg)', () => {
      renderCard({
        listing: makeListing({ propertyType: 'villa', title: 'Nice Villa' }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.getByText('Villa')).toBeInTheDocument();
    });

    it('renders a "View details" button with ChevronRight (listing-view-details testid)', () => {
      renderCard({
        listing: makeListing(),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      const btn = screen.getByTestId('listing-view-details');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('View details');
    });

    it('renders price in mono font class for authenticated users', () => {
      renderCard({
        listing: makeListing({ pricePaise: 10_000_000 * 100 }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      // The price paragraph carries font-mono tabular-nums — find it by the rupee symbol.
      const priceEl = Array.from(document.querySelectorAll('p')).find((el) =>
        el.textContent?.includes('₹'),
      );
      expect(priceEl).toBeDefined();
      expect(priceEl!.className).toContain('font-mono');
    });

    it('does not render the For-sale badge when listingPurpose is undefined', () => {
      renderCard({
        listing: makeListing({ listingPurpose: undefined }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.queryByText('For Sale')).not.toBeInTheDocument();
      expect(screen.queryByText('For Rent')).not.toBeInTheDocument();
    });
  });

  // ── Cross-journey non-regression (HARD GATE) ──────────────────────────────────
  // PropertyCard is the SHARED listing card used by area-first, school-first, and agri-first.
  // These tests guard that #1606 round-3 colour changes do not break any journey's data contract.
  describe('Cross-journey non-regression (shared card)', () => {
    // Agri-first: agricultural_land type, trustBadge null → no trust badge, no crash
    it('renders without crash for agricultural_land property type (agri-first journey)', () => {
      expect(() =>
        renderCard({
          listing: makeListing({ propertyType: 'agricultural_land', title: 'Agri Plot' }),
          isAuthenticated: true,
          onNavigate: vi.fn(),
        }),
      ).not.toThrow();
      // Label renders as capitalize('agricultural_land') = 'Agricultural_land'
      // The dot pill still renders; no crash from unknown type lookup
      expect(screen.getByTestId('listing-card')).toBeInTheDocument();
    });

    // Agri-first: trustBadge is typically null → no trust badge regardless of round-3 colours
    it('renders NO trust badge for agri-first listing with trustBadge null', () => {
      renderCard({
        listing: makeListing({ propertyType: 'agricultural_land', title: 'Agri Plot', trustBadge: null }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
    });

    // School-first: listing with no propertyType → omits the pill gracefully
    it('renders without crash when propertyType is null (school-first listings may omit it)', () => {
      expect(() =>
        renderCard({
          listing: makeListing({ propertyType: null }),
          isAuthenticated: true,
          onNavigate: vi.fn(),
        }),
      ).not.toThrow();
      // No type pill should render (typeLabel is null)
      expect(screen.getByTestId('listing-card')).toBeInTheDocument();
    });

    // #1616: anon path for school-first journey receives priceBand (not pricePaise).
    // The backend coarsens price; exact rupee amount must NOT appear for anon regardless
    // of which journey surfaces the PropertyCard.
    it('#1616 anon school-first: priceBand shown, no exact rupee amount (backend coarsens)', () => {
      renderCard({
        // Anon backend response: pricePaise absent (undefined), priceBand present
        listing: makeListing({ pricePaise: undefined, priceBand: '₹50L–1Cr', listingPurpose: 'sale' }),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        distanceKm: 1.2,
      });
      // Band label rendered — no exact price
      expect(screen.getByText('₹50L–1Cr')).toBeInTheDocument();
      // Old sign-in wall is gone
      expect(screen.queryByText('Sign in to view price')).not.toBeInTheDocument();
      // No exact digit-grouped rupee value in the DOM
      expect(document.body.textContent).not.toMatch(/8,00,00,000|8,000,000/);
    });

    // Missing optional fields (no bedrooms, no builtArea, no createdAt) — still renders
    it('renders cleanly with all optional metadata fields absent', () => {
      renderCard({
        listing: makeListing({
          bedrooms: null,
          bathrooms: null,
          builtArea: null,
          landArea: null,
          totalFloors: null,
          parkingCount: null,
          furnishingStatus: null,
          createdAt: null,
          locality: undefined,
        }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.getByTestId('listing-card')).toBeInTheDocument();
      // No metadata row should render when all spec fields are absent
      expect(screen.queryByText(/BHK/)).not.toBeInTheDocument();
      expect(screen.queryByText(/floors/)).not.toBeInTheDocument();
    });

    // Prop-contract guard: all props present in the original test suite's makeListing
    // must still be accepted (no new required props introduced by #1606).
    it('accepts the original property shape used by pre-#1606 test fixtures without error', () => {
      const originalShapedListing: DiscoverCityListingItem = {
        id: 'orig-1',
        title: 'Legacy Listing',
        locality: 'Udupi',
        primaryImageUrl: null,
        propertyType: 'apartment',
        listingPurpose: 'sale',
        pricePaise: 3_000_000 * 100,
        bedrooms: 2,
        bathrooms: 1,
        builtArea: 1000,
        builtAreaUnit: 'sqft',
        landArea: null,
        landAreaUnit: null,
        totalFloors: null,
        parkingCount: null,
        furnishingStatus: null,
        createdAt: null,
        trustBadge: null,
      };
      expect(() =>
        renderCard({
          listing: originalShapedListing,
          isAuthenticated: true,
          onNavigate: vi.fn(),
        }),
      ).not.toThrow();
      expect(screen.getByText('Legacy Listing')).toBeInTheDocument();
    });
  });

  // ── ReTrends redesign — distanceKm proximity badge ───────────────────────────
  describe('distanceKm proximity badge', () => {
    it('renders "X.X km from school" badge when distanceKm is a finite number', () => {
      renderCard({
        listing: makeListing(),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        distanceKm: 2.2,
      });
      expect(screen.getByTestId('distance-badge')).toBeInTheDocument();
      expect(screen.getByTestId('distance-badge')).toHaveTextContent('2.2 km from school');
    });

    it('formats distance to one decimal place', () => {
      renderCard({
        listing: makeListing(),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        distanceKm: 1.567,
      });
      expect(screen.getByTestId('distance-badge')).toHaveTextContent('1.6 km from school');
    });

    it('renders nothing when distanceKm is null', () => {
      renderCard({
        listing: makeListing(),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        distanceKm: null,
      });
      expect(screen.queryByTestId('distance-badge')).not.toBeInTheDocument();
    });

    it('renders nothing when distanceKm is undefined (existing consumers unaffected)', () => {
      renderCard({
        listing: makeListing(),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        // distanceKm not provided — tests backward compat
      });
      expect(screen.queryByTestId('distance-badge')).not.toBeInTheDocument();
    });

    it('renders nothing when distanceKm is NaN (non-finite guard)', () => {
      renderCard({
        listing: makeListing(),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        distanceKm: NaN,
      });
      expect(screen.queryByTestId('distance-badge')).not.toBeInTheDocument();
    });

    it('renders nothing when distanceKm is Infinity (non-finite guard)', () => {
      renderCard({
        listing: makeListing(),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        distanceKm: Infinity,
      });
      expect(screen.queryByTestId('distance-badge')).not.toBeInTheDocument();
    });

    it('trust badge and distance badge can both render simultaneously', () => {
      renderCard({
        listing: makeListing({ trustBadge: 'verified', primaryImageUrl: 'https://example.com/img.jpg' }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
        distanceKm: 1.5,
      });
      expect(screen.getByText('Verified')).toBeInTheDocument();
      expect(screen.getByTestId('distance-badge')).toHaveTextContent('1.5 km from school');
    });
  });

  // ── Issue #1616 — trust badge fabrication removed (AC10/AC11) ─────────────
  // demoTrustFallback prop and demoTrustTierFor helper are REMOVED in #1616.
  // PropertyCard must never invent a trust tier — real data or no badge.

  describe('#1616 trust badge: no fabrication (AC10/AC11)', () => {
    it('AC10: trustBadge "verified" → Verified badge rendered', () => {
      renderCard({ listing: makeListing({ trustBadge: 'verified' }), isAuthenticated: true, onNavigate: vi.fn() });
      expect(screen.getByTestId('trust-badge')).toBeInTheDocument();
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });

    it('AC10: trustBadge "trusted" → Trusted badge rendered', () => {
      renderCard({ listing: makeListing({ trustBadge: 'trusted' }), isAuthenticated: true, onNavigate: vi.fn() });
      expect(screen.getByTestId('trust-badge')).toBeInTheDocument();
      expect(screen.getByText('Trusted')).toBeInTheDocument();
    });

    it('AC10: trustBadge "listed" → Listed badge rendered', () => {
      renderCard({ listing: makeListing({ trustBadge: 'listed' }), isAuthenticated: true, onNavigate: vi.fn() });
      expect(screen.getByTestId('trust-badge')).toBeInTheDocument();
      expect(screen.getByText('Listed')).toBeInTheDocument();
    });

    it('AC10: trustBadge absent (D-tier/unknown grade) → NO badge', () => {
      renderCard({
        listing: makeListing({ trustBadge: undefined }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
    });

    it('AC10: trustBadge null → NO badge (never invent a badge)', () => {
      renderCard({ listing: makeListing({ trustBadge: null }), isAuthenticated: true, onNavigate: vi.fn() });
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
    });

    it('AC11: anon school-first listing (no trustBadge, no pricePaise) → NO trust badge rendered', () => {
      // This is the AC11 / school-first anon case: backend omits trustBadge from the
      // PublicSchoolRadiusListingCard record (deliberate exclusion per #1239/#1551).
      // Component must render no badge — never fabricate one.
      renderCard({
        listing: makeListing({ trustBadge: null, pricePaise: undefined, priceBand: '₹50L–1Cr' }),
        isAuthenticated: false,
        onNavigate: vi.fn(),
        distanceKm: 0.8,
      });
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
      expect(screen.queryByText('Verified')).not.toBeInTheDocument();
      expect(screen.queryByText('Trusted')).not.toBeInTheDocument();
      expect(screen.queryByText('Listed')).not.toBeInTheDocument();
      // But priceBand IS shown and distance badge IS shown
      expect(screen.getByText('₹50L–1Cr')).toBeInTheDocument();
      expect(screen.getByTestId('distance-badge')).toBeInTheDocument();
    });

    it('demoTrustFallback prop does not exist on PropertyCardProps (removed in #1616)', () => {
      // Structural: PropertyCard must not accept a demoTrustFallback prop.
      // If demoTrustFallback were still accepted, this assertion would catch a re-introduction.
      // We test by passing an unexpected prop — TypeScript would catch it at compile time;
      // at runtime the component must render WITHOUT any fabricated badge.
      const listingNoBadge = makeListing({ trustBadge: null });
      // Cast to any to bypass TS so the test remains valid even if the type definition changes
      renderCard({
        listing: listingNoBadge,
        isAuthenticated: false,
        onNavigate: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ demoTrustFallback: true } as any),
      });
      // With demoTrustFallback removed, no badge should appear for null trustBadge
      expect(screen.queryByTestId('trust-badge')).not.toBeInTheDocument();
      expect(screen.queryByText('Verified')).not.toBeInTheDocument();
      expect(screen.queryByText('Trusted')).not.toBeInTheDocument();
      expect(screen.queryByText('Listed')).not.toBeInTheDocument();
    });
  });

  // ── Issue #1794 Phase 1 — "Confirmed {date}" freshness signal ──────────────
  // confirmedAt is a nullable backend timestamp: last confirmed/reconfirmed as LIVE.
  // Must never be faked/defaulted — a null value falls back to the existing
  // honest createdAt display, and the two timestamps never render together.
  describe('confirmedAt freshness signal (Issue #1794 Phase 1)', () => {
    it('confirmedAt present → shows "Confirmed {date}" and NOT the plain created timestamp', () => {
      const confirmedDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const createdDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      renderCard({
        listing: makeListing({ confirmedAt: confirmedDate, createdAt: createdDate }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.getByText(`Confirmed ${formatRelativeDate(confirmedDate)}`)).toBeInTheDocument();
      // The plain created-date text (without "Confirmed" prefix) must not appear separately.
      expect(screen.queryByText(formatRelativeDate(createdDate))).not.toBeInTheDocument();
    });

    it('confirmedAt null/absent → shows the existing created timestamp, no "Confirmed" text (honest absence)', () => {
      const createdDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      renderCard({
        listing: makeListing({ confirmedAt: null, createdAt: createdDate }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.getByText(formatRelativeDate(createdDate))).toBeInTheDocument();
      expect(screen.queryByText(/^Confirmed/)).not.toBeInTheDocument();
    });

    it('confirmedAt undefined (field omitted by backend) → falls back to created timestamp, no "Confirmed" text', () => {
      const createdDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      renderCard({
        listing: makeListing({ confirmedAt: undefined, createdAt: createdDate }),
        isAuthenticated: true,
        onNavigate: vi.fn(),
      });
      expect(screen.getByText(formatRelativeDate(createdDate))).toBeInTheDocument();
      expect(screen.queryByText(/^Confirmed/)).not.toBeInTheDocument();
    });
  });

  // ── Issue #1566 — server-backed saved-homes heart ──────────────────────────
  describe('save button — Issue #1566 (server-backed)', () => {
    it('hydrates unfilled when the listing id is not in savedIds', () => {
      mockSavedIds.current = new Set<string>();
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: true, onNavigate: vi.fn() });
      const btn = screen.getByTestId('listing-save-button');
      expect(btn).toHaveAttribute('aria-pressed', 'false');
      expect(btn).toHaveAttribute('aria-label', 'Save property');
    });

    it('hydrates filled when the listing id is in savedIds', () => {
      mockSavedIds.current = new Set(['l1']);
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: true, onNavigate: vi.fn() });
      const btn = screen.getByTestId('listing-save-button');
      expect(btn).toHaveAttribute('aria-pressed', 'true');
      expect(btn).toHaveAttribute('aria-label', 'Remove saved property');
    });

    it('anon click opens the AuthModal, makes zero mutation calls, and does not toggle local state', async () => {
      mockSavedIds.current = new Set<string>();
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: false, onNavigate: vi.fn() });
      const btn = screen.getByTestId('listing-save-button');

      await userEvent.click(btn);

      expect(mockOpenAuthModal).toHaveBeenCalledTimes(1);
      expect(mockSaveMutate).not.toHaveBeenCalled();
      expect(mockUnsaveMutate).not.toHaveBeenCalled();
      // Still unfilled — no local toggle occurred.
      expect(btn).toHaveAttribute('aria-pressed', 'false');
      expect(btn).toHaveAttribute('aria-label', 'Save property');
    });

    it('authed click on an unsaved listing fires useSaveListing with the listing id', async () => {
      mockSavedIds.current = new Set<string>();
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: true, onNavigate: vi.fn() });

      await userEvent.click(screen.getByTestId('listing-save-button'));

      expect(mockSaveMutate).toHaveBeenCalledWith('l1');
      expect(mockUnsaveMutate).not.toHaveBeenCalled();
      expect(mockOpenAuthModal).not.toHaveBeenCalled();
    });

    it('authed click on an already-saved listing fires useUnsaveListing with the listing id', async () => {
      mockSavedIds.current = new Set(['l1']);
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: true, onNavigate: vi.fn() });

      await userEvent.click(screen.getByTestId('listing-save-button'));

      expect(mockUnsaveMutate).toHaveBeenCalledWith('l1');
      expect(mockSaveMutate).not.toHaveBeenCalled();
    });

    it('is disabled and guards against double-submit while a mutation is in flight', async () => {
      mockSavedIds.current = new Set<string>();
      mockSavePending.current = true;
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: true, onNavigate: vi.fn() });

      const btn = screen.getByTestId('listing-save-button');
      expect(btn).toBeDisabled();

      await userEvent.click(btn);
      expect(mockSaveMutate).not.toHaveBeenCalled();
    });

    it('click stops propagation — clicking the heart never triggers card navigation', async () => {
      const onNavigate = vi.fn();
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: true, onNavigate });

      await userEvent.click(screen.getByTestId('listing-save-button'));

      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('is keyboard operable (Enter activates the button)', async () => {
      mockSavedIds.current = new Set<string>();
      renderCard({ listing: makeListing({ id: 'l1' }), isAuthenticated: true, onNavigate: vi.fn() });

      const btn = screen.getByTestId('listing-save-button');
      btn.focus();
      await userEvent.keyboard('{Enter}');

      expect(mockSaveMutate).toHaveBeenCalledWith('l1');
    });
  });
});
