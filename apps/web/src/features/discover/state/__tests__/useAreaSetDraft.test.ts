/**
 * Issue #2017 — useAreaSetDraft: in-memory draft controller for the
 * multi-area AREA_SET chip picker. Only touches the URL/history when the
 * caller later invokes commitAreaSet — add/remove/clear here are pure local
 * React state transitions.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AREA_SET_MAX_AREAS, useAreaSetDraft } from '@/features/discover/state/useAreaSetDraft';
import type { ResultScope } from '@/features/discover/state/resultScope';

const NO_SCOPE: ResultScope = null;

function areaSetScope(areaKeys: string[]): ResultScope {
  return { kind: 'AREA_SET', areaKeys };
}

describe('useAreaSetDraft', () => {
  describe('seeding', () => {
    it('seeds draftAreaKeys from an AREA_SET committedScope', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b'])));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b']);
      expect(result.current.view.isDirty).toBe(false);
    });

    it('seeds an empty draft when committedScope is null', () => {
      const { result } = renderHook(() => useAreaSetDraft(NO_SCOPE));
      expect(result.current.view.draftAreaKeys).toEqual([]);
      expect(result.current.view.isDirty).toBe(false);
    });

    it('seeds an empty draft when committedScope is a non-AREA_SET kind (e.g. VIEWPORT)', () => {
      const viewportScope: ResultScope = {
        kind: 'VIEWPORT',
        bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 },
      };
      const { result } = renderHook(() => useAreaSetDraft(viewportScope));
      expect(result.current.view.draftAreaKeys).toEqual([]);
    });
  });

  describe('add', () => {
    it('appends a new area key, preserving insertion order', () => {
      const { result } = renderHook(() => useAreaSetDraft(NO_SCOPE));
      act(() => result.current.commands.add('a'));
      act(() => result.current.commands.add('b'));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b']);
    });

    it('is a no-op when the area key is already present (no duplicate)', () => {
      const { result } = renderHook(() => useAreaSetDraft(NO_SCOPE));
      act(() => result.current.commands.add('a'));
      act(() => result.current.commands.add('a'));
      expect(result.current.view.draftAreaKeys).toEqual(['a']);
    });

    it('marks the draft dirty relative to the seeded committed set', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a'])));
      expect(result.current.view.isDirty).toBe(false);
      act(() => result.current.commands.add('b'));
      expect(result.current.view.isDirty).toBe(true);
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b']);
    });
  });

  describe('remove', () => {
    it('removes the given area key, leaving the rest in order', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b', 'c'])));
      act(() => result.current.commands.remove('b'));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'c']);
    });

    it('is a no-op when the area key is not present', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b'])));
      act(() => result.current.commands.remove('z'));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b']);
    });

    it('marks the draft dirty when it diverges from the seeded committed set', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b'])));
      act(() => result.current.commands.remove('a'));
      expect(result.current.view.isDirty).toBe(true);
    });

    it('removing back down to exactly the committed set clears isDirty (same-length, same-membership check)', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a'])));
      act(() => result.current.commands.add('b'));
      expect(result.current.view.isDirty).toBe(true);
      act(() => result.current.commands.remove('b'));
      expect(result.current.view.draftAreaKeys).toEqual(['a']);
      expect(result.current.view.isDirty).toBe(false);
    });
  });

  describe('clear', () => {
    it('empties the draft regardless of prior add/remove state', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b'])));
      act(() => result.current.commands.add('c'));
      act(() => result.current.commands.clear());
      expect(result.current.view.draftAreaKeys).toEqual([]);
    });

    it('marks the draft dirty when clearing a non-empty committed set', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a'])));
      act(() => result.current.commands.clear());
      expect(result.current.view.isDirty).toBe(true);
    });

    it('leaves isDirty false when clearing an already-empty committed set', () => {
      const { result } = renderHook(() => useAreaSetDraft(NO_SCOPE));
      act(() => result.current.commands.clear());
      expect(result.current.view.draftAreaKeys).toEqual([]);
      expect(result.current.view.isDirty).toBe(false);
    });
  });

  describe('add — max cap (AREA_SET_MAX_AREAS)', () => {
    it('returns "at-limit" and does not grow the draft past AREA_SET_MAX_AREAS', () => {
      const { result } = renderHook(() => useAreaSetDraft(NO_SCOPE));
      act(() => result.current.commands.add('a'));
      act(() => result.current.commands.add('b'));
      act(() => result.current.commands.add('c'));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b', 'c']);

      let outcome: ReturnType<typeof result.current.commands.add> | undefined;
      act(() => {
        outcome = result.current.commands.add('d');
      });

      expect(outcome).toBe('at-limit');
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b', 'c']);
      expect(result.current.view.draftAreaKeys).toHaveLength(AREA_SET_MAX_AREAS);
    });

    it('returns "duplicate" (not "at-limit") when re-adding an already-present key at the cap', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b', 'c'])));

      let outcome: ReturnType<typeof result.current.commands.add> | undefined;
      act(() => {
        outcome = result.current.commands.add('a');
      });

      expect(outcome).toBe('duplicate');
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b', 'c']);
    });

    it('exposes maxAreas === AREA_SET_MAX_AREAS and toggles atLimit only once the draft reaches the cap', () => {
      const { result } = renderHook(() => useAreaSetDraft(NO_SCOPE));
      expect(result.current.view.maxAreas).toBe(AREA_SET_MAX_AREAS);
      expect(result.current.view.atLimit).toBe(false);

      act(() => result.current.commands.add('a'));
      expect(result.current.view.atLimit).toBe(false);
      act(() => result.current.commands.add('b'));
      expect(result.current.view.atLimit).toBe(false);
      act(() => result.current.commands.add('c'));
      expect(result.current.view.atLimit).toBe(true);
    });

    it('after hitting the cap, removing one area re-opens room for exactly one more add', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b', 'c'])));
      expect(result.current.view.atLimit).toBe(true);

      act(() => result.current.commands.remove('b'));
      expect(result.current.view.atLimit).toBe(false);

      let outcome: ReturnType<typeof result.current.commands.add> | undefined;
      act(() => {
        outcome = result.current.commands.add('d');
      });

      expect(outcome).toBe('added');
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'c', 'd']);
      expect(result.current.view.atLimit).toBe(true);
    });

    it('seeding dedupes AND clamps an oversized/duplicated committed AREA_SET scope to AREA_SET_MAX_AREAS unique keys, preserving first-occurrence order', () => {
      const oversizedScope = areaSetScope(['a', 'b', 'a', 'c', 'd', 'b']);
      const { result } = renderHook(() => useAreaSetDraft(oversizedScope));

      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b', 'c']);
      expect(result.current.view.draftAreaKeys).toHaveLength(AREA_SET_MAX_AREAS);
      expect(result.current.view.atLimit).toBe(true);
      // Seeded straight at the cap from an oversized committed scope — isDirty
      // reflects the CLAMPED committed set, so no edit has happened yet.
      expect(result.current.view.isDirty).toBe(false);
    });
  });

  describe('resetToCommitted (team-lead review, PR #2424) — Cancel must discard uncommitted edits', () => {
    it('committed [A] -> add B -> resetToCommitted -> draft is back to [A], isDirty false', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a'])));
      act(() => result.current.commands.add('b'));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b']);
      expect(result.current.view.isDirty).toBe(true);

      act(() => result.current.commands.resetToCommitted());

      expect(result.current.view.draftAreaKeys).toEqual(['a']);
      expect(result.current.view.isDirty).toBe(false);
    });

    it('discards a remove too — committed [A, B] -> remove B -> resetToCommitted -> draft is back to [A, B]', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b'])));
      act(() => result.current.commands.remove('b'));
      expect(result.current.view.draftAreaKeys).toEqual(['a']);

      act(() => result.current.commands.resetToCommitted());

      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b']);
      expect(result.current.view.isDirty).toBe(false);
    });

    it('resets to empty when nothing was ever committed (NO_SCOPE), regardless of what was drafted', () => {
      const { result } = renderHook(() => useAreaSetDraft(NO_SCOPE));
      act(() => result.current.commands.add('a'));
      act(() => result.current.commands.add('b'));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'b']);

      act(() => result.current.commands.resetToCommitted());

      expect(result.current.view.draftAreaKeys).toEqual([]);
      expect(result.current.view.isDirty).toBe(false);
    });

    it('a reopen after reset starts clean — resetToCommitted then add again reproduces the same, not a stacked, draft', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a'])));
      act(() => result.current.commands.add('b'));
      act(() => result.current.commands.resetToCommitted());
      act(() => result.current.commands.add('c'));

      expect(result.current.view.draftAreaKeys).toEqual(['a', 'c']);
    });
  });

  describe('isDirty — order-sensitive (matches commitAreaSet primaryAreaKey semantics)', () => {
    it('is true when draft and committed have the same length but different membership', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b'])));
      act(() => result.current.commands.remove('b'));
      act(() => result.current.commands.add('c'));
      expect(result.current.view.draftAreaKeys).toEqual(['a', 'c']);
      expect(result.current.view.isDirty).toBe(true);
    });

    it('is false when the draft exactly matches the seeded committed set with no edits', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b', 'c'])));
      expect(result.current.view.isDirty).toBe(false);
    });

    it('is true when the draft has the exact same members as committed but in a different order (reorder changes primaryAreaKey on commit)', () => {
      const { result } = renderHook(() => useAreaSetDraft(areaSetScope(['a', 'b'])));
      expect(result.current.view.isDirty).toBe(false);

      // Remove 'a' (the current primary), then re-add it — append semantics
      // put it last, so committing this draft would flip primaryAreaKey
      // from 'a' to 'b' even though membership is unchanged.
      act(() => result.current.commands.remove('a'));
      act(() => result.current.commands.add('a'));

      expect(result.current.view.draftAreaKeys).toEqual(['b', 'a']);
      expect(result.current.view.isDirty).toBe(true);
    });
  });
});
