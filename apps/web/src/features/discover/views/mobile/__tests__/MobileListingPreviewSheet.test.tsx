/**
 * Issue #1956 PR-5 (Slice 5, AC5.10) — MobileListingPreviewSheet.
 *
 * Presentational-only component: renders a `SelectedListingPreview`, fires
 * `onDismiss`/`onViewDetails`, and makes no assumption about Map/List mode.
 * Real assertions only — no `isVisible().catch(() => false)` guards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileListingPreviewSheet } from '../MobileListingPreviewSheet';
import type {
  SelectedListingPreview,
  SelectedListingPreviewAnon,
  SelectedListingPreviewAuthed,
} from '@/features/discover/navigation/selectedListingPreview';

// ─── ResizeObserver stub (Issue #2129 cycle 3) ───────────────────────────
// jsdom doesn't implement ResizeObserver (same gap the codebase's other
// stub-based test files, e.g. AppLayout.test.tsx, already work around).
// This stub captures the single observed callback so tests can fire it
// manually — the sheet's own effect only ever observes one node — instead
// of simulating a real layout engine.
let observedCallback: (() => void) | null = null;
class ResizeObserverStub {
  constructor(callback: () => void) {
    observedCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observedCallback = null;
  }
}

const ANON_PREVIEW: SelectedListingPreviewAnon = {
  kind: 'anon',
  id: 'listing-1',
  title: 'Sunrise Apartments, 3BHK',
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
  title: 'Malpe Beach Villa',
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

  it('renders the listing title — Issue #2150, matches MarkerPopoverCard/PropertyCard identity parity', () => {
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('mobile-listing-preview-title')).toHaveTextContent('Sunrise Apartments, 3BHK');
  });

  it('renders no title node when the preview carries none (never a fabricated placeholder)', () => {
    render(
      <MobileListingPreviewSheet
        preview={{ ...ANON_PREVIEW, title: null }}
        onDismiss={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('mobile-listing-preview-title')).not.toBeInTheDocument();
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

  // Issue #2126 — reskin to the approved "listing-peek" mock. The tests
  // above already cover the pre-existing data contract (price arms, trust
  // badge allow-list, Escape/dialog semantics, invariant 8). These new
  // tests cover structural elements the reskin introduced: the drag handle,
  // the bottom action row's two buttons (a distinct affordance from the
  // pre-existing top-right icon-close button already covered above), the
  // restoration note, and graceful degradation of the summary row when
  // every optional field is absent alongside a long areaLabel.

  it('renders a drag-handle pill as the sheet\'s first child, above the summary row (mock: 38x4px centered pill)', () => {
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    const sheet = screen.getByTestId('mobile-listing-preview-sheet');
    // The drag handle is the sheet's own first child — a decorative,
    // aria-hidden <div> pill, structurally distinct from (and rendered
    // before) the thumbnail well and its Building2 fallback icon.
    const handle = sheet.firstElementChild;
    expect(handle).not.toBeNull();
    expect(handle?.tagName).toBe('DIV');
    expect(handle).toHaveAttribute('aria-hidden', 'true');
    expect(handle?.tagName).not.toBe('SVG');
  });

  it('bottom action row renders BOTH "View details" (primary) and "Close" (secondary) as separate, correctly-ordered, 44px-tall touch targets', () => {
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);

    const viewDetails = screen.getByTestId('mobile-listing-preview-view-details');
    // The bottom "Close" button is a DISTINCT element from the top-right
    // icon-close button (data-testid="mobile-listing-preview-close",
    // aria-label="Close property preview") already covered above — locate
    // it by its own exact accessible name.
    const closeAction = screen.getByRole('button', { name: 'Close', exact: true });

    expect(closeAction).not.toBe(screen.getByTestId('mobile-listing-preview-close'));

    // Both meet the ~44px (h-11) minimum mobile touch-target size.
    expect(viewDetails.className).toContain('h-11');
    expect(closeAction.className).toContain('h-11');

    // "View details" is primary — Button's default variant is `bg-primary`
    // with no border. The "Close" action uses Button's `outline` variant,
    // which renders as `border border-input bg-background` (see
    // src/components/ui/button.tsx) — a bordered, secondary treatment.
    expect(viewDetails.className).toContain('bg-primary');
    expect(closeAction.className).not.toContain('bg-primary');
    expect(closeAction.className).toContain('border');
    expect(closeAction.className).toContain('bg-background');

    // DOM order: View details precedes Close in the action row, matching the
    // approved mock's left-primary/right-secondary layout.
    expect(
      viewDetails.compareDocumentPosition(closeAction) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('the bottom "Close" action also calls onDismiss exactly once (same dismissal contract as the icon-close button)', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={onDismiss} onViewDetails={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders the "Back from the details returns to this map view" restoration note', () => {
    render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/back from the details returns to this map view/i)).toBeInTheDocument();
  });

  it('degrades gracefully when image, propertyType, bedrooms, and trustBadge are all absent, alongside a long areaLabel', () => {
    const LONG_AREA_LABEL =
      'Thanisandra Hennur Belt, North Bengaluru Extended Growth Corridor Sub-Locality';
    const degraded: SelectedListingPreviewAnon = {
      ...ANON_PREVIEW,
      title: null,
      primaryImageUrl: null,
      propertyType: null,
      bedrooms: null,
      trustBadge: null,
      areaLabel: LONG_AREA_LABEL,
      priceBand: '₹80L-1Cr',
    };
    const { container } = render(
      <MobileListingPreviewSheet preview={degraded} onDismiss={vi.fn()} onViewDetails={vi.fn()} />,
    );

    // No <img> is rendered — the thumbnail well falls back to the Building2
    // placeholder icon instead of an empty/broken <img src="">.
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();

    // propertyType falls back to the generic "Property" label — never blank,
    // never "null"/"undefined" leaking into the DOM.
    expect(screen.getByText('Property')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-listing-preview-bedrooms')).not.toBeInTheDocument();

    // No trust badge renders when trustBadge is null.
    expect(screen.queryByTestId('mobile-listing-preview-trust-badge')).not.toBeInTheDocument();

    // No title node renders when title is null — never a fabricated placeholder.
    expect(screen.queryByTestId('mobile-listing-preview-title')).not.toBeInTheDocument();

    // The long areaLabel still renders in full (truncation is CSS-only via
    // the `truncate` class — the DOM text content itself is never clipped)
    // on the SAME truncate-class element the short-label tests already rely
    // on via this testid.
    const areaLabelEl = screen.getByTestId('mobile-listing-preview-area-label');
    expect(areaLabelEl).toHaveTextContent(LONG_AREA_LABEL);
    expect(areaLabelEl.className).toContain('truncate');
  });
});

// ─── Issue #2129 — onHeightChange measurement ────────────────────────────
// A prior cycle drove the caller's viewport-clip reservation off a FIXED
// 150px guess; this sheet is intrinsic-height (no max-h/scroll — module
// doc), so its real rendered height varies with content and measured
// ~194px in browser evidence, leaving part of the map's own reserved
// viewport still physically covered. These tests prove the sheet's own
// side of the fix: it reports its real, laid-out border-box height —
// synchronously on every distinct `preview.id` (cycle 5, BLOCKING fix —
// closes the gap where a delta-only ResizeObserver never fires because a
// new preview's height happens to equal the previous one's, leaving the
// caller pinned on a stale/fallback value across the mounted-sheet swap)
// AND via ResizeObserver for later in-place reflows of the SAME preview —
// and is a no-op when the caller doesn't ask for it.
describe('MobileListingPreviewSheet — onHeightChange (Issue #2129 measurement mechanism)', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    observedCallback = null;
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  function mockRectHeight(height: number) {
    return vi
      .fn()
      .mockReturnValue({ height, width: 390, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0, toJSON() {} });
  }

  it('reports the root element\'s real border-box height (getBoundingClientRect, not contentRect), tagged with preview.id, SYNCHRONOUSLY on mount — before any ResizeObserver callback', () => {
    const onHeightChange = vi.fn();
    Element.prototype.getBoundingClientRect = mockRectHeight(194);

    render(
      <MobileListingPreviewSheet
        preview={ANON_PREVIEW}
        onDismiss={vi.fn()}
        onViewDetails={vi.fn()}
        onHeightChange={onHeightChange}
      />,
    );

    // useLayoutEffect has already flushed by the time render() returns —
    // no observedCallback() call needed, and none has happened yet.
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    expect(onHeightChange).toHaveBeenCalledWith(ANON_PREVIEW.id, 194);
  });

  it('reports an UPDATED height, still tagged with the SAME preview.id, on a later ResizeObserver callback (content-driven reflow, e.g. a late-loading image)', () => {
    const onHeightChange = vi.fn();
    Element.prototype.getBoundingClientRect = mockRectHeight(150);

    render(
      <MobileListingPreviewSheet
        preview={ANON_PREVIEW}
        onDismiss={vi.fn()}
        onViewDetails={vi.fn()}
        onHeightChange={onHeightChange}
      />,
    );
    expect(onHeightChange).toHaveBeenLastCalledWith(ANON_PREVIEW.id, 150);

    Element.prototype.getBoundingClientRect = mockRectHeight(210);
    expect(observedCallback).not.toBeNull();
    observedCallback?.();

    expect(onHeightChange).toHaveBeenLastCalledWith(ANON_PREVIEW.id, 210);
    expect(onHeightChange).toHaveBeenCalledTimes(2);
  });

  // ─── Issue #2129 cycle 5 BLOCKING finding — the exact regression ───────
  // The sheet stays MOUNTED (same DOM node, same ResizeObserver instance)
  // across a direct marker-to-marker swap. If a delta-only ResizeObserver
  // were the ONLY reporting mechanism, a new preview rendering at the
  // EXACT SAME height as the previous one would never fire a resize event
  // at all — this test proves that does NOT happen: a fresh, correctly-
  // tagged report fires for preview B even though its mocked height is
  // identical to preview A's, with NO manual observedCallback() call.
  it('reports AGAIN, tagged with the NEW preview.id, when the previewed listing changes WHILE the sheet stays mounted — even when the new height is IDENTICAL to the old one (no manual ResizeObserver nudge)', () => {
    const onHeightChange = vi.fn();
    Element.prototype.getBoundingClientRect = mockRectHeight(194);

    const { rerender } = render(
      <MobileListingPreviewSheet
        preview={ANON_PREVIEW}
        onDismiss={vi.fn()}
        onViewDetails={vi.fn()}
        onHeightChange={onHeightChange}
      />,
    );
    expect(onHeightChange).toHaveBeenLastCalledWith(ANON_PREVIEW.id, 194);
    onHeightChange.mockClear();

    // Same mocked rect height (194) — a real DOM layout box for a
    // different listing that happens to render at the same height. Direct
    // marker-to-marker swap: same component instance, same onHeightChange
    // identity, only `preview` changes — no intermediate unmount/close.
    rerender(
      <MobileListingPreviewSheet
        preview={AUTHED_PREVIEW}
        onDismiss={vi.fn()}
        onViewDetails={vi.fn()}
        onHeightChange={onHeightChange}
      />,
    );

    expect(onHeightChange).toHaveBeenCalledWith(AUTHED_PREVIEW.id, 194);
  });

  it('does not observe or throw when onHeightChange is omitted (every existing caller/fixture)', () => {
    expect(() =>
      render(<MobileListingPreviewSheet preview={ANON_PREVIEW} onDismiss={vi.fn()} onViewDetails={vi.fn()} />),
    ).not.toThrow();
    expect(observedCallback).toBeNull();
  });
});
