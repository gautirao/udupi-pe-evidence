import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResultScope } from '@/features/discover/state/resultScope';
import type { ControllerResult } from '@/features/discover/state/useDiscoverInteractionState';

/** Issue #2017 code-review Finding 1 — hard cap on concurrent AREA_SET areas. */
export const AREA_SET_MAX_AREAS = 3;

/** Outcome of an `add(areaKey)` call — lets callers surface distinct UX per case. */
export type AreaSetAddResult = 'added' | 'duplicate' | 'at-limit';

export interface AreaSetDraftView {
  /** Uncommitted, in-memory multi-area selection, in insertion (add) order. */
  draftAreaKeys: string[];
  /** True when the draft set differs from the committed AREA_SET scope. */
  isDirty: boolean;
  /** Hard cap on concurrent areas in a draft — see AREA_SET_MAX_AREAS. */
  maxAreas: number;
  /** True when draftAreaKeys.length >= maxAreas — single source of truth for "can't add more". */
  atLimit: boolean;
}

export interface AreaSetDraftCommands {
  add(areaKey: string): AreaSetAddResult;
  remove(areaKey: string): void;
  clear(): void;
  /**
   * Discards any uncommitted edits, restoring the draft to the currently
   * COMMITTED scope's keys. Team-lead review (PR #2424, post-#2017 desktop
   * rework) — every "cancel"-shaped close (the Cancel button, the "Back to
   * areas" breadcrumb, Escape, an outside click) must call this before
   * `shell.closeAreaSetDraft()`; none of them commit, so none of them should
   * leave edits sitting in this shared provider state for the next re-open
   * to inherit. Previously ONLY the seed effect re-derived from the
   * committed scope, and it only fires when the committed scope's key SET
   * changes — a Cancel with no commit in between never changed that
   * signature, so the stale in-progress edit (e.g. an added-but-never-
   * committed area) silently survived a close+reopen. One shared command
   * here — not duplicated seed logic in AreaSetDraftPanel.tsx (desktop) and
   * AreaSetChips.tsx (mobile) — keeps both presentations' cancel semantics
   * identical by construction.
   */
  resetToCommitted(): void;
}

function committedAreaKeys(scope: ResultScope): string[] {
  return scope?.kind === 'AREA_SET' ? [...new Set(scope.areaKeys)].slice(0, AREA_SET_MAX_AREAS) : [];
}

/**
 * Issue #2017 — uncommitted multi-area AREA_SET selection state. Purely
 * in-memory (React state only); NO URL write happens here. The URL is only
 * ever touched by the explicit "commit search" action (`commitAreaSet` in
 * `state/url/area.ts`), which reads the final `draftAreaKeys` at click time.
 *
 * Seeded from the currently COMMITTED ResultScope so that re-opening the
 * multi-area picker (or an external, single-area `selectArea()`) starts the
 * draft from what's actually on the map. The seed effect is gated on the
 * committed key SET (not the scope object identity, which is a fresh value
 * on every render) so it does not stomp on an in-progress edit on unrelated
 * re-renders — it only re-seeds when the committed AREA_SET keys genuinely
 * change (e.g. after a commit, or after navigating to a different scope).
 *
 * Code-review Finding 1 (PR #2424) — every mutation of draftAreaKeys (add,
 * remove, clear, and the seed effect) routes through the single `applyDraft`
 * setter below, which keeps `draftRef` in lockstep with React state. `add`
 * needs a SYNCHRONOUS read of the current draft to decide 'duplicate' vs
 * 'at-limit' vs 'added' and to return that decision to the caller in the
 * same tick — the prior `setDraftAreaKeys(prev => ...)` updater form can't
 * do that (the updater runs async relative to the call site), so it's
 * replaced with reads/writes through draftRef instead.
 */
export function useAreaSetDraft(
  committedScope: ResultScope,
): ControllerResult<AreaSetDraftView, AreaSetDraftCommands> {
  const seedKeys = committedAreaKeys(committedScope);
  const seedSignature = seedKeys.join('|');

  const [draftAreaKeys, setDraftAreaKeys] = useState<string[]>(seedKeys);
  const draftRef = useRef<string[]>(seedKeys);
  const lastSeedSignature = useRef(seedSignature);

  const applyDraft = useCallback((next: string[]) => {
    draftRef.current = next;
    setDraftAreaKeys(next);
  }, []);

  useEffect(() => {
    if (seedSignature === lastSeedSignature.current) return;
    lastSeedSignature.current = seedSignature;
    applyDraft(committedAreaKeys(committedScope));
    // Only the signature should gate re-seeding — see doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedSignature, applyDraft]);

  const add = useCallback(
    (areaKey: string): AreaSetAddResult => {
      const current = draftRef.current;
      if (current.includes(areaKey)) return 'duplicate';
      if (current.length >= AREA_SET_MAX_AREAS) return 'at-limit';
      applyDraft([...current, areaKey]);
      return 'added';
    },
    [applyDraft],
  );

  const remove = useCallback(
    (areaKey: string) => {
      applyDraft(draftRef.current.filter((key) => key !== areaKey));
    },
    [applyDraft],
  );

  const clear = useCallback(() => {
    applyDraft([]);
  }, [applyDraft]);

  const resetToCommitted = useCallback(() => {
    applyDraft(committedAreaKeys(committedScope));
  }, [applyDraft, committedScope]);

  // Order-SENSITIVE: commitAreaSet (useDiscoverUrlState.ts) sets
  // primaryAreaKey = draftAreaKeys[0], so a reordered draft with identical
  // membership is still a real change (it moves the active/primary area).
  // Must compare position-by-position against the seeded committed keys,
  // not just set membership — see PR #2424 review Finding.
  const isDirty = useMemo(() => {
    if (draftAreaKeys.length !== seedKeys.length) return true;
    return draftAreaKeys.some((key, i) => key !== seedKeys[i]);
  }, [draftAreaKeys, seedKeys]);

  const atLimit = draftAreaKeys.length >= AREA_SET_MAX_AREAS;

  const commands = useMemo(
    () => ({ add, remove, clear, resetToCommitted }),
    [add, remove, clear, resetToCommitted],
  );

  return {
    view: { draftAreaKeys, isDirty, maxAreas: AREA_SET_MAX_AREAS, atLimit },
    commands,
  };
}
