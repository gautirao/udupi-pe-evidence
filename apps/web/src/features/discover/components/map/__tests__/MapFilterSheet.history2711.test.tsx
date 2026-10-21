// #2858 batch 2 (Lane C of #2750), manifest L155 issue-2711-map-filter-intent-commit.
//
// History accounting of the mobile Map filter sheet (MapFilterSheet.tsx): ONE history entry is pushed per
// open, Cancel pops it (`history.back()`), and Apply neither pops nor pushes a second one (a `history.back()`
// after a commit would discard the replace-written URL; see handleApply's own comment). The existing
// MapFilterSheet.test.tsx is callback-level only and never observes `pushState` / `back`.
//
// Same jsdom conventions as MapFilterSheet.test.tsx: `fireEvent` (not userEvent) and the pointer-capture
// polyfills, because vaul attaches document-level pointer listeners jsdom cannot complete.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapFilterSheet } from '../MapFilterSheet';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { toDiscoverUrlFilters } from '@/features/discover/state/url/filters';
import { projectUrlFilters } from '@/features/discover/selectors/urlFiltersProjection';

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

type SheetProps = React.ComponentProps<typeof MapFilterSheet>;

function sheetProps(overrides: Partial<SheetProps> = {}): SheetProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    filters: {},
    onApply: vi.fn(),
    appliedResultCount: 42,
    isCommercialSubtypeSupported: true,
    ...overrides,
  };
}

describe('MapFilterSheet — history entry accounting (#2858 batch 2 / issue-2711 AC1, AC4)', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // pushState calls through (the real jsdom history is what the sheet mutates); back() is a no-op so no
    // asynchronous popstate fires into the sheet's own listener mid-assertion.
    pushStateSpy = vi.spyOn(window.history, 'pushState');
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });
  afterEach(() => {
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
  });

  // B2-N7
  it('opening pushes exactly one history entry and Apply with an intent switch neither pushes a second nor calls history.back()', () => {
    const onIntentChange = vi.fn();
    const onApply = vi.fn();
    render(<MapFilterSheet {...sheetProps({ intent: 'buy', onIntentChange, onApply })} />);

    // Positive arm: the open itself pushed exactly one entry carrying the sheet marker.
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith({ mapFilterSheet: true }, '');

    fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
    fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));

    // The intent switch committed through the single onIntentChange call (never also onApply)...
    expect(onIntentChange).toHaveBeenCalledTimes(1);
    expect(onIntentChange.mock.calls[0][0]).toBe('rent');
    expect(onApply).not.toHaveBeenCalled();
    // ...and Apply neither pushed a second entry nor popped the first.
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(backSpy).not.toHaveBeenCalled();
  });

  // B2-N8
  it('Cancel (Escape) consumes the pushed entry: history.back() exactly once, then a re-open pushes a fresh entry', () => {
    const onIntentChange = vi.fn();
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    const props = sheetProps({ onIntentChange, onApply, onOpenChange });
    const { rerender } = render(<MapFilterSheet {...props} />);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    // Stage an edit, then dismiss with Escape: nothing is committed, the pushed entry is popped once.
    fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
    fireEvent.keyDown(screen.getByTestId('map-filter-sheet'), { key: 'Escape' });

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApply).not.toHaveBeenCalled();
    expect(onIntentChange).not.toHaveBeenCalled();

    // Close then re-open: the re-open pushes a FRESH entry (the ref was re-armed, not left stale-consumed).
    rerender(<MapFilterSheet {...props} open={false} />);
    rerender(<MapFilterSheet {...props} open />);
    expect(pushStateSpy).toHaveBeenCalledTimes(2);
    // Still exactly one back() so far: re-opening never pops.
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── Composed rows (B2-N9 / B2-N10): the REAL router + REAL useDiscoverUrlState + the REAL sheet ───
// BrowserRouter shares window.history with the sheet's own pushState (a MemoryRouter would not see it). The harness wires
// the sheet exactly as the page does: onApply -> the debounced setFiltersLive (handleFiltersChange in useDiscoverPageState:
// `urlActions.setFiltersLive(toDiscoverUrlFilters(next))`), onIntentChange -> urlActions.setIntent, both bound to the
// urlActions of the render the sheet last saw (that stale-closure binding is the #2711 race).
const PRE_OPEN_URL = '/discover?city=udupi&journey=area-first&type=apartment';

function SheetHarness() {
  const [state, actions] = useDiscoverUrlState();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="harness-open" onClick={() => setOpen(true)}>
        open
      </button>
      <MapFilterSheet
        open={open}
        onOpenChange={setOpen}
        filters={projectUrlFilters(state.filters)}
        intent={state.intent}
        onApply={(next) => actions.setFiltersLive(toDiscoverUrlFilters(next))}
        onIntentChange={actions.setIntent}
        appliedResultCount={10}
      />
    </>
  );
}

function renderHarness() {
  window.history.replaceState({}, '', PRE_OPEN_URL);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SheetHarness />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('MapFilterSheet composed with the real router and useDiscoverUrlState (#2858 batch 2 / issue-2711 AC1, AC2)', () => {
  beforeEach(() => {
    // Every URL here carries journey=area-first, but keep any stray default-journey probe offline.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function openRentStageBedroomsApply() {
    fireEvent.click(screen.getByTestId('harness-open'));
    await screen.findByTestId('map-filter-sheet');
    fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
    fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
    // Fake timers only now: the debounced setFiltersLive schedules its timeout at Apply time.
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
  }

  // B2-N9
  it('AC1: Rent + a staged filter + Apply: after the 300 ms debounce window the URL carries intent=rent AND the filter, and window.history.length grew by exactly 1', async () => {
    renderHarness();
    const lengthBefore = window.history.length;

    await openRentStageBedroomsApply();

    const params = new URLSearchParams(window.location.search);
    expect(params.get('intent')).toBe('rent');
    expect(params.get('beds')).toBe('2');
    expect(params.get('type')).toBe('apartment');
    // Open pushed ONE entry; Apply neither pushed a second nor popped it.
    expect(window.history.length - lengthBefore).toBe(1);
  });

  // B2-N10
  it('AC2: after Apply, one browser Back lands exactly on the pre-open URL and the sheet is closed', async () => {
    renderHarness();
    const preOpenSearch = window.location.search;
    expect(preOpenSearch).toBe('?city=udupi&journey=area-first&type=apartment');

    await openRentStageBedroomsApply();
    expect(new URLSearchParams(window.location.search).get('intent')).toBe('rent');

    act(() => {
      window.history.back();
    });
    await waitFor(() => {
      expect(window.location.search).toBe(preOpenSearch);
      expect(screen.queryByTestId('map-filter-sheet')).not.toBeInTheDocument();
    });
  });
});
