/**
 * Issue #1953 (build step 4) — unit tests for the scroll-position
 * preservation hook used across the mobile List<->Map round trip.
 *
 * Per the task's test methodology: asserted on CONTENT VISIBILITY (is a
 * specific, identifiable item still within the container's visible range),
 * not on a raw scrollTop integer — a scrollTop assertion alone is brittle
 * across layout shifts and isn't what these tests check. "In view" here is
 * computed the same way a real scroll container would clip content:
 * `container.scrollTop <= item.offsetTop < container.scrollTop + container.clientHeight`.
 */
import { describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { render } from '@testing-library/react';
import { useScrollPositionAcrossToggle } from './useScrollPositionAcrossToggle';

function isItemInView(container: HTMLElement, item: HTMLElement): boolean {
  return (
    item.offsetTop >= container.scrollTop &&
    item.offsetTop < container.scrollTop + container.clientHeight
  );
}

function Harness({ isAway }: { isAway: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollPositionAcrossToggle(containerRef, isAway);
  return (
    <div ref={containerRef} data-testid="list-container">
      {Array.from({ length: 20 }, (_, i) => (
        <div key={i} data-testid={`item-${i}`}>
          Item {i}
        </div>
      ))}
    </div>
  );
}

/** Wires up a fake scrollable box: fixed clientHeight, items spaced 50px apart. */
function setUpFakeScrollBox(container: HTMLElement) {
  const box = container.querySelector('[data-testid="list-container"]') as HTMLElement;
  Object.defineProperty(box, 'clientHeight', { value: 200, configurable: true });
  let scrollTopValue = 0;
  Object.defineProperty(box, 'scrollTop', {
    get: () => scrollTopValue,
    set: (v: number) => {
      scrollTopValue = v;
    },
    configurable: true,
  });
  Array.from(box.children).forEach((child, i) => {
    Object.defineProperty(child as HTMLElement, 'offsetTop', {
      value: i * 50,
      configurable: true,
    });
  });
  return box;
}

describe('useScrollPositionAcrossToggle', () => {
  it('keeps the same identifiable item in view across a full away/back round trip', () => {
    const { container, rerender } = render(<Harness isAway={false} />);
    const box = setUpFakeScrollBox(container);

    // Scroll so item-10 (offsetTop 500) is the visible item: scrollTop 500,
    // viewport 200 tall -> visible range [500, 700).
    box.scrollTop = 500;
    const trackedItem = container.querySelector('[data-testid="item-10"]') as HTMLElement;
    expect(isItemInView(box, trackedItem)).toBe(true);

    // Leave the scrollable view (mobile Map opens) — hook snapshots scrollTop.
    rerender(<Harness isAway={true} />);

    // Something scrolls the (now-hidden) container while the user is away —
    // e.g. background content reflowing under the Map overlay.
    box.scrollTop = 0;
    expect(isItemInView(box, trackedItem)).toBe(false);

    // Return to List — hook restores the snapshotted scrollTop.
    rerender(<Harness isAway={false} />);
    expect(isItemInView(box, trackedItem)).toBe(true);
  });

  it('does nothing on the very first render (no premature restore to scrollTop 0)', () => {
    const { container } = render(<Harness isAway={false} />);
    const box = setUpFakeScrollBox(container);
    box.scrollTop = 300;
    expect(box.scrollTop).toBe(300);
  });

  it('does not restore scrollTop while staying away across multiple re-renders', () => {
    const { container, rerender } = render(<Harness isAway={false} />);
    const box = setUpFakeScrollBox(container);
    box.scrollTop = 400;

    rerender(<Harness isAway={true} />);
    box.scrollTop = 0; // simulate content changing while away
    rerender(<Harness isAway={true} />); // still away — re-render, no toggle
    expect(box.scrollTop).toBe(0);
  });
});
