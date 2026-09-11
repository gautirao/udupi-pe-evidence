import { describe, expect, it, beforeAll, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
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
 * Issue #2478 removed the floating scope chip entirely (its summary now lives
 * in `AreaSelectedPanel` instead), collapsing this from a three-rung stack
 * (chip, CTA, draw overlay) to two (CTA, draw overlay). The `a409692b` /
 * `1ac34643` chip-mount-timing and chip-ordering regressions this file used
 * to cover went with the chip — there is no scope-chip ref or offset left to
 * measure. The two properties below are NOT chip-specific — they hold for
 * any offset stack, chip or no chip — so they are restored here against the
 * current two-rung shape.
 */

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

/** Mirrors the real composition: a map container and a chips row. */
function Harness() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { ctaTopOffsetPx, drawOverlayTopOffsetPx, chipsRowRef } = useSearchThisAreaCtaOffset(containerRef);

  return (
    <div ref={containerRef} data-h={CONTAINER_HEIGHT}>
      <div ref={chipsRowRef} data-h={0} />
      <output data-testid="offsets">{JSON.stringify({ ctaTopOffsetPx, drawOverlayTopOffsetPx })}</output>
    </div>
  );
}

function readOffsets() {
  return JSON.parse(screen.getByTestId('offsets').textContent ?? '{}') as {
    ctaTopOffsetPx: number;
    drawOverlayTopOffsetPx: number;
  };
}

describe('useSearchThisAreaCtaOffset — overlay stacking chain', () => {
  it('places the draw overlay below the CTA', () => {
    render(<Harness />);

    const { ctaTopOffsetPx, drawOverlayTopOffsetPx } = readOffsets();
    expect(drawOverlayTopOffsetPx).toBeGreaterThan(ctaTopOffsetPx);
  });

  // The chip that used to make this a three-rung stack was removed by
  // #2478; the property under test — that the offset stack is strictly
  // ordered so every rung can co-render without overlapping — still holds
  // for the two rungs that remain.
  it('keeps the offset rungs strictly ordered so the CTA and draw overlay can co-render', () => {
    render(<Harness />);

    const { ctaTopOffsetPx, drawOverlayTopOffsetPx } = readOffsets();
    const rungs = [ctaTopOffsetPx, drawOverlayTopOffsetPx];
    expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
    expect(new Set(rungs).size).toBe(2);
  });
});
