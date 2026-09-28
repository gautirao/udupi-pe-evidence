import { useCallback } from 'react';
import { useDiscoverActions, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import type { ResultScope } from '@/features/discover/state/resultScope';

export interface UseAreaSetScopeCommandsArgs {
  /** The committed multi-area AREA_SET's areaKeys, or null (single-area/no AREA_SET). Owned by useResultScopeController. */
  multiAreaKeys: string[] | null;
}

/**
 * Issue #2658 (C2) — the AREA_SET draft/edit/remove-area commands extracted
 * from AreaSelectedPanel (Issue #2017; Issue #2596 owner-directed rework;
 * Issue #2419 PR-2 "Draw search area" is NOT included here — that lives on
 * `DiscoverShellContextValue.startDrawSearchArea`, consumed directly where
 * needed).
 *
 * `handleClearAreas` is deliberately NOT here — it commits `null` to the
 * same `resultScope` `useResultScopeController` already owns, and lives
 * there as `commands.clearAreas`.
 */
export function useAreaSetScopeCommands({ multiAreaKeys }: UseAreaSetScopeCommandsArgs) {
  const actions = useDiscoverActions();
  const shell = useDiscoverShell();

  // "Edit areas" opens the AREA_SET draft (Issue #2017; Issue #2596
  // owner-directed rework) — `openAreaSetDraft()` is the single cross-tree
  // open signal all surfaces read to swap to AreaSetDraftPanel in-panel.
  const editAreas = useCallback(() => {
    shell.openAreaSetDraft();
  }, [shell]);

  /**
   * Issue #2596 — remove ONE committed area from the right panel's chips.
   *
   * Commits the REMAINING keys, so the panel's chips, heading and count
   * update immediately. This is deliberately NOT the map overlay's
   * behaviour: those chips edit the uncommitted DRAFT via `commands.remove`
   * and take effect only on "Show listings". Both read the same AREA_SET
   * state, so this introduces no second selection state — it acts at the
   * committed layer rather than the draft layer.
   *
   * Removing the LAST area clears the scope instead of committing an empty
   * AREA_SET, which is not a state the rest of the app models — the same
   * call `clearAreas` (useResultScopeController) makes.
   */
  const removeCommittedArea = useCallback(
    (areaKey: string) => {
      const remaining = (multiAreaKeys ?? []).filter((key) => key !== areaKey);
      if (remaining.length === 0) {
        actions.commitResultScope(null);
        return;
      }
      const nextScope: ResultScope = { kind: 'AREA_SET', areaKeys: remaining };
      actions.commitResultScope(nextScope);
    },
    [multiAreaKeys, actions],
  );

  // "Add nearby areas" also opens the AREA_SET draft — same signal as
  // `editAreas`, kept as a separate named command because the two entry
  // points are distinct affordances in the UI (AreaSetTwoTileRow vs. the
  // committed-areas chip row) even though they resolve to the same action.
  const addNearbyAreas = useCallback(() => {
    shell.openAreaSetDraft();
  }, [shell]);

  return {
    commands: {
      editAreas,
      removeCommittedArea,
      addNearbyAreas,
    },
  };
}

export type AreaSetScopeCommands = ReturnType<typeof useAreaSetScopeCommands>;
