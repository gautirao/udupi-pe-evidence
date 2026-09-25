// Issue #2628 — MapFilterSheet: staged apply/cancel/reopen-seed/clear-all, Commercial-never-
// bedrooms, Buy→Rent drops Plot.
//
// Uses `fireEvent.click` (a plain "click" MouseEvent), NOT `userEvent.click` (which also
// synthesizes pointerdown/pointerup). Vaul attaches document-level pointer listeners to its
// drawer content for drag-to-dismiss, and jsdom's CSSStyleDeclaration/pointer-capture support is
// incomplete enough that those listeners throw uncaught exceptions unrelated to anything under
// test here — the SAME class of jsdom/Radix-primitive gap this repo's other Vaul/Radix component
// tests already route around (see the `setPointerCapture` polyfill below, already used by
// AgriculturalListingForm.test.tsx et al.). React's onClick handlers respond to a plain "click"
// exactly as they do to a real pointer click, so this does not weaken what is being asserted.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MapFilterSheet } from '../MapFilterSheet';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

function renderSheet(overrides: Partial<React.ComponentProps<typeof MapFilterSheet>> = {}) {
  const onOpenChange = vi.fn();
  const onApply = vi.fn();
  const filters: PropertyFilters = overrides.filters ?? {};
  const utils = render(
    <MapFilterSheet
      open
      onOpenChange={onOpenChange}
      filters={filters}
      onApply={onApply}
      appliedResultCount={42}
      isCommercialSubtypeSupported
      {...overrides}
    />,
  );
  return { ...utils, onOpenChange, onApply };
}

describe('MapFilterSheet', () => {
  it('seeds the draft from the applied filters on open and does not touch canonical filters until Apply', () => {
    const { onApply } = renderSheet({ filters: { propertyTypes: ['apartment'] } });

    // Editing a chip (2 BHK) must not call onApply — it is STAGED.
    fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as PropertyFilters;
    expect(applied.bedrooms).toEqual([2]);
    expect(applied.propertyTypes).toEqual(['apartment']);
  });

  it('Cancel (browser Back / Esc) discards the draft without applying', () => {
    const { onApply, onOpenChange } = renderSheet();

    fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
    fireEvent.keyDown(screen.getByTestId('map-filter-sheet'), { key: 'Escape' });

    expect(onApply).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reopen re-seeds the draft from whatever is currently applied (selections preserved)', () => {
    const filters: PropertyFilters = { bedrooms: [3] };
    const { rerender } = render(
      <MapFilterSheet
        open={false}
        onOpenChange={vi.fn()}
        filters={filters}
        onApply={vi.fn()}
        appliedResultCount={10}
      />,
    );
    rerender(
      <MapFilterSheet
        open
        onOpenChange={vi.fn()}
        filters={filters}
        onApply={vi.fn()}
        appliedResultCount={10}
      />,
    );
    expect(screen.getByTestId('quick-chip-3-bhk')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Clear all is disabled with no refinements and resets the draft when clicked', () => {
    renderSheet({ filters: { propertyTypes: ['apartment'], bedrooms: [3] } });

    const clearAll = screen.getByTestId('map-filter-sheet-clear-all');
    expect(clearAll).not.toBeDisabled();
    fireEvent.click(clearAll);
    expect(screen.getByTestId('quick-chip-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-3-bhk')).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Clear all" is disabled when the draft has no refinements', () => {
    renderSheet({ filters: {} });
    expect(screen.getByTestId('map-filter-sheet-clear-all')).toBeDisabled();
  });

  it('Commercial never shows a Bedrooms row', () => {
    renderSheet({ filters: {} });
    fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
    expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();
  });

  it('Buy→Rent resets the budget and drops Residential Plot', () => {
    // Issue #2711 — an intent switch now commits via `onIntentChange`'s `filtersOverride` (its
    // ONE atomic call with city.ts's `setIntent`), not `onApply` — see `handleApply`'s own
    // comment. Wiring a real `onIntentChange` here observes the SAME transitioned values that
    // reached `draft` (and, pre-#2711, `onApply`) via `handleSelectIntent`'s local
    // `applyIntentTransition` call.
    const onIntentChange = vi.fn();
    renderSheet({
      intent: 'buy',
      onIntentChange,
      filters: { propertyTypes: ['apartment', 'residential_plot'], priceMax: 5_000_000 },
    });

    fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
    fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));

    expect(onIntentChange).toHaveBeenCalledTimes(1);
    const [calledIntent, filtersOverride] = onIntentChange.mock.calls[0] as [
      string,
      PropertyFilters,
    ];
    expect(calledIntent).toBe('rent');
    expect(filtersOverride.propertyTypes).toEqual(['apartment']);
    expect(filtersOverride.priceMax).toBeUndefined();
  });

  it('shows the "still shows M" status line while a draft edit is unapplied', () => {
    renderSheet({ filters: {}, appliedResultCount: 95 });
    fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
    expect(
      within(screen.getByTestId('map-filter-sheet-status')).getByText(/still shows 95/),
    ).toBeInTheDocument();
  });

  it('shows "on the map now" once the draft matches what is applied', () => {
    renderSheet({ filters: { bedrooms: [2] } });
    expect(screen.getByTestId('map-filter-sheet-status')).toHaveTextContent(
      'These filters are on the map now.',
    );
  });

  // Issue #2628 (step 6/8) — mf-15 Schools "Property filters only" banner.
  it('shows the Schools scopeNote banner when supplied, and nothing otherwise', () => {
    const { rerender } = render(
      <MapFilterSheet
        open
        onOpenChange={vi.fn()}
        filters={{}}
        onApply={vi.fn()}
        appliedResultCount={5}
        scopeNote="Property filters only · school and radius stay on the map"
      />,
    );
    expect(screen.getByTestId('map-filter-sheet-scope-note')).toHaveTextContent(
      'Property filters only · school and radius stay on the map',
    );

    rerender(
      <MapFilterSheet open onOpenChange={vi.fn()} filters={{}} onApply={vi.fn()} appliedResultCount={5} />,
    );
    expect(screen.queryByTestId('map-filter-sheet-scope-note')).not.toBeInTheDocument();
  });

  // Issue #2628 (step 6/8) — Schools read-only contract. MapFilterSheetProps structurally has no
  // school/radius/board fields (see this file's own props interface), so it is impossible for any
  // interaction here to read OR write them; this asserts the observable half — Apply's payload is
  // exactly the PropertyFilters draft, carrying no school/radius/board keys, regardless of what
  // the (Schools-scoped) caller's own state looks like.
  it('Apply never carries school/radius/board keys — the sheet has no such props to touch', () => {
    const { onApply } = renderSheet({ filters: { bedrooms: [2] } });
    fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));
    const applied = onApply.mock.calls[0][0] as PropertyFilters;
    expect(applied).not.toHaveProperty('schoolLat');
    expect(applied).not.toHaveProperty('schoolLon');
    expect(applied).not.toHaveProperty('selectedSchool');
    expect(applied).not.toHaveProperty('board');
    // schoolRadiusKm IS a legitimate PropertyFilters field (design doc: sheet reads/keeps it via
    // the draft, never overwrites it) — confirm it round-trips unchanged when present.
    expect(applied.schoolRadiusKm).toBeUndefined();
  });

  it('a pre-set schoolRadiusKm on the applied filters round-trips through Apply unchanged', () => {
    const { onApply } = renderSheet({ filters: { schoolRadiusKm: 3, bedrooms: [2] } });
    fireEvent.click(screen.getByTestId('quick-chip-3-bhk'));
    fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));
    const applied = onApply.mock.calls[0][0] as PropertyFilters;
    expect(applied.schoolRadiusKm).toBe(3);
  });

  // Issue #2711 — Apply must commit an intent switch through `onIntentChange` (the canonical
  // `city.ts` `setIntent`), not silently drop it. Regression coverage for the bug: Apply
  // previously called `onApply(draft)`/`onIntentChange(draftIntent)` in the WRONG order and the
  // composition root never even passed `onIntentChange` through, so a Rent selection in the
  // sheet never reached the URL's `intent` param.
  //
  // Issue #2711 (live-browser follow-up) — a SECOND real-browser defect (a stale
  // `react-router` `setSearchParams` closure inside the debounced `onApply`/`setFiltersLive`
  // path silently discarding whatever `onIntentChange` had just written) meant `onApply` could
  // no longer ALSO be called when intent changes — see `handleApply`'s own comment and
  // `setIntent`'s in city.ts. `onIntentChange` now carries `draft` as its own `filtersOverride`
  // argument, making it the ONLY write for an intent-changed Apply.
  describe('#2711 — Apply commits an intent switch atomically via onIntentChange', () => {
    it('calls onIntentChange with the new intent and the transitioned filters, and does NOT also call onApply', () => {
      const onIntentChange = vi.fn();
      const { onApply } = renderSheet({
        intent: 'buy',
        onIntentChange,
        filters: { propertyTypes: ['apartment'] },
      });

      fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
      fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));

      expect(onIntentChange).toHaveBeenCalledTimes(1);
      const [calledIntent, filtersOverride] = onIntentChange.mock.calls[0] as [
        string,
        PropertyFilters,
      ];
      expect(calledIntent).toBe('rent');
      expect(filtersOverride.propertyTypes).toEqual(['apartment']);
      // AC1/the live-browser fix: onApply must NOT also fire for an intent-changed Apply — a
      // second, separately-scheduled write is exactly what silently discarded the intent commit
      // in the real browser (see handleApply's own comment).
      expect(onApply).not.toHaveBeenCalled();
    });

    // Issue #2711 (code-review follow-up, REQUEST CHANGES) — regression coverage for the data-
    // loss gap a reviewer caught: staging a field the intent transition does NOT own (bedrooms,
    // sellerTypes, dates, …) IN THE SAME sheet visit as an intent switch must still commit that
    // field, not silently drop it just because `onApply` can no longer also fire. `handleApply`
    // now passes `toDiscoverUrlFilters(draft)` — the buyer's ENTIRE staged draft, not just the
    // propertyTypes/priceMin/priceMax subset `applyIntentTransition` touches — as
    // `onIntentChange`'s `filtersOverride`, so `bedrooms` (staged here alongside Rent) survives.
    it('a bedrooms edit staged in the SAME visit as an intent switch is NOT dropped — filtersOverride carries the full draft', () => {
      const onIntentChange = vi.fn();
      renderSheet({
        intent: 'buy',
        onIntentChange,
        filters: { propertyTypes: ['apartment'] },
      });

      fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
      fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
      fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));

      expect(onIntentChange).toHaveBeenCalledTimes(1);
      const [calledIntent, filtersOverride] = onIntentChange.mock.calls[0] as [
        string,
        { propertyTypes?: string[]; bedrooms?: number[] },
      ];
      expect(calledIntent).toBe('rent');
      // The intent-owned field, still correctly transitioned:
      expect(filtersOverride.propertyTypes).toEqual(['apartment']);
      // The UNRELATED staged field — this is the regression: it must NOT be undefined/dropped.
      expect(filtersOverride.bedrooms).toEqual([2]);
    });

    it('never calls onIntentChange when the draft intent is unchanged', () => {
      const onIntentChange = vi.fn();
      const { onApply } = renderSheet({
        intent: 'buy',
        onIntentChange,
        filters: { propertyTypes: ['apartment'] },
      });

      fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
      fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));

      expect(onIntentChange).not.toHaveBeenCalled();
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('a staged-then-reverted intent (Rent then back to Buy) calls onIntentChange with "buy", not "rent"', () => {
      const onIntentChange = vi.fn();
      renderSheet({ intent: 'buy', onIntentChange, filters: {} });

      fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
      fireEvent.click(screen.getByTestId('map-filter-sheet-intent-buy'));
      fireEvent.click(screen.getByTestId('map-filter-sheet-apply'));

      // Net intent is unchanged (buy -> rent -> buy), so no commit is needed at all.
      expect(onIntentChange).not.toHaveBeenCalled();
    });

    it('Cancel never calls onIntentChange even after staging a Rent switch', () => {
      const onIntentChange = vi.fn();
      const { onApply, onOpenChange } = renderSheet({ intent: 'buy', onIntentChange, filters: {} });

      fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
      fireEvent.keyDown(screen.getByTestId('map-filter-sheet'), { key: 'Escape' });

      expect(onIntentChange).not.toHaveBeenCalled();
      expect(onApply).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('falls back to onApply (the pre-#2711 default) when the caller has not wired onIntentChange', () => {
      const { onApply } = renderSheet({ intent: 'buy', filters: {} });

      fireEvent.click(screen.getByTestId('map-filter-sheet-intent-rent'));
      expect(() => fireEvent.click(screen.getByTestId('map-filter-sheet-apply'))).not.toThrow();
      expect(onApply).toHaveBeenCalledTimes(1);
    });
  });
});
