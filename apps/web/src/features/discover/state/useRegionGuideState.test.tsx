import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRegionGuideState } from './useRegionGuideState';

describe('useRegionGuideState', () => {
  it('initializes with source=deeplink, nonce=0, dismissed=false', () => {
    const { result } = renderHook(() => useRegionGuideState());
    expect(result.current.view.regionSelectSource).toBe('deeplink');
    expect(result.current.view.regionSelectNonce).toBe(0);
    expect(result.current.view.regionGuideDismissed).toBe(false);
  });

  it('armRegionSelect("map") atomically sets source, increments nonce, and clears dismissal', () => {
    const { result } = renderHook(() => useRegionGuideState());

    act(() => {
      result.current.commands.armRegionSelect('map');
    });

    expect(result.current.view.regionSelectSource).toBe('map');
    expect(result.current.view.regionSelectNonce).toBe(1);
    expect(result.current.view.regionGuideDismissed).toBe(false);
  });

  it('armRegionSelect("panel") sets source=panel, increments nonce, and clears dismissal', () => {
    const { result } = renderHook(() => useRegionGuideState());

    act(() => {
      result.current.commands.armRegionSelect('panel');
    });

    expect(result.current.view.regionSelectSource).toBe('panel');
    expect(result.current.view.regionSelectNonce).toBe(1);
    expect(result.current.view.regionGuideDismissed).toBe(false);
  });

  it('armRegionSelect clears a prior dismissal', () => {
    const { result } = renderHook(() => useRegionGuideState());

    act(() => {
      result.current.commands.dismissRegionGuide();
    });
    expect(result.current.view.regionGuideDismissed).toBe(true);

    act(() => {
      result.current.commands.armRegionSelect('map');
    });
    expect(result.current.view.regionGuideDismissed).toBe(false);
  });

  it('dismissRegionGuide sets dismissed=true without touching source/nonce', () => {
    const { result } = renderHook(() => useRegionGuideState());

    act(() => {
      result.current.commands.armRegionSelect('map');
    });
    const sourceAfterArm = result.current.view.regionSelectSource;
    const nonceAfterArm = result.current.view.regionSelectNonce;

    act(() => {
      result.current.commands.dismissRegionGuide();
    });

    expect(result.current.view.regionGuideDismissed).toBe(true);
    expect(result.current.view.regionSelectSource).toBe(sourceAfterArm);
    expect(result.current.view.regionSelectNonce).toBe(nonceAfterArm);
  });

  it('nonce is strictly monotonic across successive arms and never resets', () => {
    const { result } = renderHook(() => useRegionGuideState());

    expect(result.current.view.regionSelectNonce).toBe(0);

    act(() => {
      result.current.commands.armRegionSelect('map');
    });
    expect(result.current.view.regionSelectNonce).toBe(1);

    act(() => {
      result.current.commands.armRegionSelect('panel');
    });
    expect(result.current.view.regionSelectNonce).toBe(2);

    act(() => {
      result.current.commands.dismissRegionGuide();
    });
    expect(result.current.view.regionSelectNonce).toBe(2);

    act(() => {
      result.current.commands.armRegionSelect('map');
    });
    expect(result.current.view.regionSelectNonce).toBe(3);
  });

  // Guards against the S1-class regression: the `commands` object must be a
  // referentially stable OBJECT (not just individually stable functions), so
  // any consumer effect/callback keyed on `[commands]` does not churn on
  // every unrelated re-render or after a state-changing action.
  it('keeps the commands object itself referentially stable across re-renders and state changes', () => {
    const { result, rerender } = renderHook(() => useRegionGuideState());

    const firstCommands = result.current.commands;

    rerender();
    expect(result.current.commands).toBe(firstCommands);

    act(() => {
      result.current.commands.armRegionSelect('map');
    });
    expect(result.current.commands).toBe(firstCommands);

    act(() => {
      result.current.commands.dismissRegionGuide();
    });
    expect(result.current.commands).toBe(firstCommands);
  });
});
