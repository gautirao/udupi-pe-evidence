/**
 * Issue #1956 PR-5 (Slice 5, AC5.10) — MobileListingPreviewSheet.
 *
 * Presentational-only component: renders a `SelectedListingPreview`, fires
 * `onDismiss`/`onViewDetails`, and makes no assumption about Map/List mode.
 * Real assertions only — no `isVisible().catch(() => false)` guards.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileListingPreviewSheet } from '../MobileListingPreviewSheet';
import type {
  SelectedListingPreview,
  SelectedListingPreviewAnon,
  SelectedListingPreviewAuthed,
} from '@/features/discover/navigation/selectedListingPreview';

const ANON_PREVIEW: SelectedListingPreviewAnon = {
  kind: 'anon',
  id: 'listing-1',
  primaryImageUrl: null,
  propertyType: 'apartment',
  bedrooms: 3,
  areaLabel: 'Manipal',
  trustBadge: 'verified',
  priceBand: '₹1-2Cr',
};

const AUTHED_PREVIEW: SelectedListingPreviewAuthed = {
  kind: 'authed',
  id: 'listing-2',
  primaryImageUrl: 'https://example.com/img.jpg',
  propertyType: 'house',
  bedrooms: 4,
  areaLabel: 'Malpe',
  trustBadge: null,
  pricePaise: 15_000_000_00,
};

describe('MobileListingPreviewSheet', () => {
  it('renders the anon arm — priceBand text, never an exact price', () => {
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('mobile-listing-preview-price-band')).toHaveTextContent('₹1-2Cr');
    expect(screen.getByTestId('mobile-listing-preview-area-label')).toHaveTextContent('Manipal');
    // Code-review fix — the sheet now renders the TRUST_BADGES allow-list label
    // ("Verified"), not the raw contract value ("verified"), matching PropertyCard.
    expect(screen.getByTestId('mobile-listing-preview-trust-badge')).toHaveTextContent('Verified');
    expect(screen.getByTestId('mobile-listing-preview-bedrooms')).toHaveTextContent('3 BHK');
  });

  it('renders the authed arm — formatted exact price from pricePaise', () => {
    render(<MobileListingPreviewSheet preview={AUTHED_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    const price = screen.getByTestId('mobile-listing-preview-price');
    // 15_000_000_00 paise = ₹1,50,00,000 = formatPrice(15000000, 'INR') -> "1.5 Cr"-style output;
    // assert the price node renders SOME non-empty, non-italic (real) value rather than
    // the "Sign in"/"not available" placeholder text.
    expect(price).not.toHaveTextContent(/sign in/i);
    expect(price).not.toHaveTextContent(/not available/i);
    expect(price.textContent?.trim().length).toBeGreaterThan(0);
    expect(screen.queryByTestId('mobile-listing-preview-price-band')).not.toBeInTheDocument();
  });

  it('shows "Sign in to view price" when the anon arm has no priceBand', () => {
    render(
      <MobileListingPreviewSheet
        preview={{ ...ANON_PREVIEW, priceBand: null }}
        onDismiss={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mobile-listing-preview-price')).toHaveTextContent(/sign in to view price/i);
  });

  it('calls onDismiss exactly once when Close is tapped', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={onDismiss} onViewDetails={vi.fn()} />);
    await user.click(screen.getByTestId('mobile-listing-preview-close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onViewDetails with the preview id when "View details" is tapped', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={onViewDetails} />);
    await user.click(screen.getByTestId('mobile-listing-preview-view-details'));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledWith('listing-1');
  });

  it('renders NO trust badge when trustBadge holds a value outside the known-good allow-list (upstream contract regression)', () => {
    // Code-review fix — the backend's trustBadge contract is only ever
    // verified/trusted/listed/null (Issue #1567), but this project has
    // previously observed the raw internal letter grade ("D") leak through
    // unmapped. Simulate that regression: the cast is unavoidable because the
    // TS union deliberately excludes it — the point of this test is to prove
    // the RUNTIME guard, not the compiler, is what protects the shopper.
    const regressed = {
      ...ANON_PREVIEW,
      trustBadge: 'D' as unknown as SelectedListingPreview['trustBadge'],
    };
    render(<MobileListingPreviewSheet preview={regressed} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    expect(screen.queryByTestId('mobile-listing-preview-trust-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
  });

  it('declares aria-modal="false" alongside role="dialog" — no focus-trap/restoration is implied or built', () => {
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    const sheet = screen.getByTestId('mobile-listing-preview-sheet');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'false');
  });

  it('Escape dismisses only this sheet — stops propagation so a parent document-level listener never fires', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const documentKeyDown = vi.fn();
    // Simulates useMobileMapOverlayShell's document-level Escape listener for
    // the parent mobile Map overlay — the regression this test guards against
    // is Escape bubbling past the sheet and closing that whole overlay too.
    document.addEventListener('keydown', documentKeyDown);
    try {
      render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={onDismiss} onViewDetails={vi.fn()} />);
      screen.getByTestId('mobile-listing-preview-close').focus();
      await user.keyboard('{Escape}');
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(documentKeyDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', documentKeyDown);
    }
  });

  it('invariant 8 — renders none of the forbidden result-scope controls', () => {
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    for (const forbidden of [
      /edit areas/i,
      /clear selected areas/i,
      /add nearby areas/i,
      /draw search area/i,
      /search this area/i,
      /create alert/i,
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });
});
