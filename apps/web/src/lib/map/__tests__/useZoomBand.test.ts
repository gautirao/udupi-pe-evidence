/**
 * Issue #1882 (Track A PR3, Slice S6, AC2/AC7) — useZoomBand churn guard.
 *
 * Proves the STATEFUL hook wraps the pure `resolveZoomBand` correctly across
 * re-renders: a raw zoom oscillation across the 12<->13 boundary must only
 * change the COMMITTED band at genuine edges (N transitions), never once per
 * oscillation step (N*k) — the dead band (zoom === 12) must hold whatever
 * band was already committed.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useZoomBand } from '@/hooks/useZoomBand';

describe('useZoomBand', () => {
  it('a 12<->13<->11<->13 oscillation commits the band only at genuine enter/exit edges, not per step', () => {
    const zoomSequence = [13, 12, 13, 12, 11, 12, 13];
    const { result, rerender } = renderHook(({ zoom }: { zoom: number }) => useZoomBand(zoom), {
      initialProps: { zoom: zoomSequence[0] },
    });

    const committedBands: Array<'overview' | 'markers'> = [result.current];
    for (const zoom of zoomSequence.slice(1)) {
      rerender({ zoom });
      committedBands.push(result.current);
    }

    // zoomSequence: [13,       12,       13,       12,       11,        12,        13]
    // committed:    ['markers','markers','markers','markers','overview','overview','markers']
    expect(committedBands).toEqual([
      'markers',
      'markers',
      'markers',
      'markers',
      'overview',
      'overview',
      'markers',
    ]);

    // Exactly 3 genuine transitions (enter at the first 13, exit at 11, re-enter
    // at the final 13) across 7 zoom steps — proves the dead band (12) held the
    // committed value twice and did NOT re-trigger a transition each time.
    // The initial ref commit starts at 'overview' (see the second test below),
    // so that is included as the baseline before the first render's zoom=13.
    const withInitialBaseline: Array<'overview' | 'markers'> = ['overview', ...committedBands];
    let transitions = 0;
    for (let i = 1; i < withInitialBaseline.length; i++) {
      if (withInitialBaseline[i] !== withInitialBaseline[i - 1]) transitions++;
    }
    expect(transitions).toBe(3);
  });

  it('starts committed to overview (matches the pre-existing areas-render-whenever-present default)', () => {
    const { result } = renderHook(() => useZoomBand(11));
    expect(result.current).toBe('overview');
  });

  it('a stable zoom at exactly 12 across renders never flips (holds initial overview commit)', () => {
    const { result, rerender } = renderHook(({ zoom }: { zoom: number }) => useZoomBand(zoom), {
      initialProps: { zoom: 12 },
    });
    expect(result.current).toBe('overview');
    rerender({ zoom: 12 });
    expect(result.current).toBe('overview');
    rerender({ zoom: 12 });
    expect(result.current).toBe('overview');
  });
});
