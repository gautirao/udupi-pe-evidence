import { describe, expect, it, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useSearchThisAreaCtaOffset } from '../useSearchThisAreaCtaOffset';

/**
 * Issue #2419 (PR-2) — the map-overlay stacking chain.
 *
 * PR review of `a409692b` found that the scope chip, the "Search this area"
 * CTA and the draw-mode overlay were all handed ONE offset, so they landed on
 * the same row. `AreaSetChips` collapses to zero height exactly when the scope
 * chip is visible, so nothing else was reserving space for it.
 *
 * PR review of `1ac34643` then found the first fix only worked when the chip
 * already existed at setup. The chip mounts on the AREA_SET -> POLYGON
 * transition, AFTER the hook's layout effect has run, and an absolutely
 * positioned child does not resize the container — so nothing re-measured and
 * the CTA landed on the chip again on the ordinary path.
 *
 * These render REAL elements through the hook's own refs rather than assigning
 * `.current` by hand. The previous version of this file did assign it, before
 * the layout effect ran, which modelled chip-present-at-setup — the case that
 * already worked — and is exactly why it missed the mount-later bug.
 */

const CHIP_HEIGHT = 40;
const CONTAINER_HEIGHT = 800;

beforeAll(() => {
  // jsdom has no ResizeObserver. The hook guards for its absence, and these
  // tests exercise the mount-time measurement path, which does not need it.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // jsdom reports every element as 0x0, so each element declares its own
  // height via `data-h` rather than one global stub.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const h = Number((this as HTMLElement).dataset?.h ?? 0);
    return {
      height: h,
      top: 0,
      bottom: h,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(() => vi.restoreAllMocks());

/**
 * Mirrors the real composition: a map container, a chips row present from the
 * start but zero-height (AreaSetChips renders null whenever the scope chip is
 * up), and a scope chip that mounts only when the scope commits.
 */
function Harness() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showChip, setShowChip] = useState(false);
  const { ctaTopOffsetPx, scopeChipTopOffsetPx, drawOverlayTopOffsetPx, chipsRowRef, scopeChipRef } =
    useSearchThisAreaCtaOffset(containerRef);

  return (
    <div ref={containerRef} data-h={CONTAINER_HEIGHT}>
      <div ref={chipsRowRef} data-h={0} />
      {showChip && <div ref={scopeChipRef} data-h={CHIP_HEIGHT} data-testid="scope-chip" />}
      <button type="button" onClick={() => setShowChip(true)} data-testid="commit-polygon">
        commit
      </button>
      <button type="button" onClick={() => setShowChip(false)} data-testid="clear-polygon">
        clear
      </button>
      <output data-testid="offsets">
        {JSON.stringify({ scopeChipTopOffsetPx, ctaTopOffsetPx, drawOverlayTopOffsetPx })}
      </output>
    </div>
  );
}

function readOffsets() {
  return JSON.parse(screen.getByTestId('offsets').textContent ?? '{}') as {
    scopeChipTopOffsetPx: number;
    ctaTopOffsetPx: number;
    drawOverlayTopOffsetPx: number;
  };
}

describe('useSearchThisAreaCtaOffset — overlay stacking chain', () => {
  /**
   * THE regression from the `1ac34643` review: no chip at setup, chip mounts
   * afterwards, and NOTHING resizes the container — because an absolutely
   * positioned child never does.
   */
  it('measures a scope chip that mounts AFTER setup, with no container resize', async () => {
    render(<Harness />);

    const before = readOffsets();
    expect(before.ctaTopOffsetPx).toBe(before.scopeChipTopOffsetPx);

    await act(async () => {
      screen.getByTestId('commit-polygon').click();
    });

    const after = readOffsets();
    expect(after.ctaTopOffsetPx).toBeGreaterThanOrEqual(after.scopeChipTopOffsetPx + CHIP_HEIGHT);
    expect(after.ctaTopOffsetPx).toBeGreaterThan(before.ctaTopOffsetPx);
  });

  // The mirror case: clearing the scope must give the row back rather than
  // stranding the CTA below a chip that is no longer there.
  it('releases the reserved row when the chip unmounts', async () => {
    render(<Harness />);
    await act(async () => {
      screen.getByTestId('commit-polygon').click();
    });
    const withChip = readOffsets();

    await act(async () => {
      screen.getByTestId('clear-polygon').click();
    });

    const withoutChip = readOffsets();
    expect(withoutChip.ctaTopOffsetPx).toBeLessThan(withChip.ctaTopOffsetPx);
    expect(withoutChip.ctaTopOffsetPx).toBe(withoutChip.scopeChipTopOffsetPx);
  });

  it('gives the scope chip a rung ABOVE the CTA', async () => {
    render(<Harness />);
    await act(async () => {
      screen.getByTestId('commit-polygon').click();
    });

    const { scopeChipTopOffsetPx, ctaTopOffsetPx } = readOffsets();
    expect(scopeChipTopOffsetPx).toBeLessThan(ctaTopOffsetPx);
  });

  it('places the draw overlay below the CTA', async () => {
    render(<Harness />);
    await act(async () => {
      screen.getByTestId('commit-polygon').click();
    });

    const { ctaTopOffsetPx, drawOverlayTopOffsetPx } = readOffsets();
    expect(drawOverlayTopOffsetPx).toBeGreaterThan(ctaTopOffsetPx);
  });

  // All three can be up together: redrawing a COMMITTED polygon shows the
  // overlay while the chip still reads COMMITTED, and the viewport can be
  // dirty at the same time. Strictly increasing rungs is what makes that safe.
  it('keeps every rung strictly ordered so all three can co-render', async () => {
    render(<Harness />);
    await act(async () => {
      screen.getByTestId('commit-polygon').click();
    });

    const { scopeChipTopOffsetPx, ctaTopOffsetPx, drawOverlayTopOffsetPx } = readOffsets();
    const rungs = [scopeChipTopOffsetPx, ctaTopOffsetPx, drawOverlayTopOffsetPx];
    expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
    expect(new Set(rungs).size).toBe(3);
  });
});
