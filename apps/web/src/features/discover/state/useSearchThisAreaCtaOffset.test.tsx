/**
 * Issue #2426 — useSearchThisAreaCtaOffset derives SearchThisAreaCta's `top`
 * offset from the REAL measured geometry of the chrome stacked above it
 * (DiscoverMapContextOverlay's breadcrumb, then AreaSetChips's chip strip
 * when present), so the CTA never overlaps either regardless of viewport
 * width or how tall the breadcrumb/chip row actually render.
 */
import { describe, it, expect, vi } from 'vitest';
import { useRef } from 'react';
import { render, act } from '@testing-library/react';
import { useSearchThisAreaCtaOffset } from './useSearchThisAreaCtaOffset';
import { DISCOVER_MAP_CONTEXT_OVERLAY_TOP_OFFSET_PX } from '@/components/discover/DiscoverMapContextOverlay';

// jsdom doesn't implement ResizeObserver. This stub captures every
// registered callback so a test can manually fire one after mocking
// getBoundingClientRect — mirroring what a real resize would trigger,
// since a mocked rect alone (with no real DOM size change) never fires a
// real ResizeObserver on its own.
const resizeObserverCallbacks: Array<() => void> = [];
class CapturingResizeObserverStub {
  #callback: () => void;
  constructor(callback: () => void) {
    this.#callback = callback;
    resizeObserverCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    const idx = resizeObserverCallbacks.indexOf(this.#callback);
    if (idx !== -1) resizeObserverCallbacks.splice(idx, 1);
  }
}
function fireAllResizeObservers() {
  resizeObserverCallbacks.slice().forEach((cb) => cb());
}

function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

let latestResult: ReturnType<typeof useSearchThisAreaCtaOffset> | null = null;

function Harness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const result = useSearchThisAreaCtaOffset(containerRef);
  latestResult = result;
  return (
    <div ref={containerRef} data-testid="map-container">
      <div ref={result.chipsRowRef} data-testid="chips-row" />
    </div>
  );
}

describe('useSearchThisAreaCtaOffset', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    resizeObserverCallbacks.length = 0;
    // @ts-expect-error — jsdom has no real ResizeObserver
    globalThis.ResizeObserver = CapturingResizeObserverStub;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    latestResult = null;
  });

  it('falls back to a safe default before any measurement lands', () => {
    render(<Harness />);
    expect(latestResult?.ctaTopOffsetPx).toBeGreaterThan(0);
  });

  it('clears the breadcrumb alone when AreaSetChips renders empty (zero height)', () => {
    const { getByTestId } = render(<Harness />);
    mockRect(getByTestId('map-container'), { top: 100 });
    mockRect(getByTestId('chips-row'), { top: 100, bottom: 100, height: 0 }); // empty draft

    act(() => {
      latestResult?.onBreadcrumbHeightChange(40);
    });

    // Breadcrumb bottom edge = its own top-4 offset + reported height.
    const expectedBreadcrumbBottom = DISCOVER_MAP_CONTEXT_OVERLAY_TOP_OFFSET_PX + 40;
    expect(latestResult?.ctaTopOffsetPx).toBeGreaterThanOrEqual(expectedBreadcrumbBottom);
  });

  it('clears AreaSetChips when its measured bottom edge is BELOW the breadcrumb (real precedence case)', () => {
    const { getByTestId } = render(<Harness />);
    mockRect(getByTestId('map-container'), { top: 100 });
    // AreaSetChips row sits further down the viewport (its own top-14/top-24
    // offset), well past a short single-line breadcrumb.
    mockRect(getByTestId('chips-row'), { top: 156, bottom: 188, height: 32 });
    act(() => {
      fireAllResizeObservers();
    });

    act(() => {
      latestResult?.onBreadcrumbHeightChange(20); // short single-line breadcrumb
    });

    // container-relative chips bottom = 188 - 100 = 88
    expect(latestResult?.ctaTopOffsetPx).toBeGreaterThanOrEqual(88);
  });

  it('clears an unusually TALL breadcrumb even when it exceeds AreaSetChips row (no under-reservation)', () => {
    const { getByTestId } = render(<Harness />);
    mockRect(getByTestId('map-container'), { top: 100 });
    mockRect(getByTestId('chips-row'), { top: 156, bottom: 188, height: 32 });
    act(() => {
      fireAllResizeObservers();
    });

    act(() => {
      // A wrapped two-line breadcrumb, tall enough that its own bottom edge
      // (16 + 90 = 106, container-relative) exceeds the chips row's 88.
      latestResult?.onBreadcrumbHeightChange(90);
    });

    const expectedBreadcrumbBottom = DISCOVER_MAP_CONTEXT_OVERLAY_TOP_OFFSET_PX + 90;
    expect(latestResult?.ctaTopOffsetPx).toBeGreaterThanOrEqual(expectedBreadcrumbBottom);
  });
});
