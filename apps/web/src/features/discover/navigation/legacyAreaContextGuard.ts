/**
 * Issue #1956 PR 6 (final cutover) — [rulings.oq_a_v2] CONVERSION-SEAM TRIGGER.
 *
 * SUPERSEDED HISTORY, retained for audit (see the PR-6 rework handoff's
 * `[supersession_2026_07_31T13_50_46Z]`): this predicate originally gated a
 * "RETAIN the legacy area surface instead of mounting canonical" exception
 * (Option A). That RETAIN behaviour is gone — canonical mounts unconditionally
 * for `journey === 'area-first'` at all three gate sites again (the plain A1
 * MINIMAL default), because a hidden legacy-routing exception is exactly what
 * the superseding ruling forbids ("PR-6 cannot both delete the legacy Areas
 * journey and route affected switches back to it").
 *
 * `hasLegacyAreaContext` now has exactly ONE caller: the JourneySwitcher
 * conversion seam in `DiscoverRightPanelContainer.tsx`. It answers a narrower
 * question than before — not "should canonical mount", but "does this click
 * need an `areaKey`/`groupId` → `node` conversion before entering the
 * canonical journey at all" — so a shopper's already-resolved AREA (or, for a
 * bare `groupId`, their group context — see `[orchestrator_judgement_
 * groupid_only]`) is preserved across the switch instead of being silently
 * dropped at the city root. See that container's `handleSelectJourney` for
 * the full conversion sequence (resolve via
 * `useDiscoverAreaNavigationPathResolver`, then `enterAreasJourney` in ONE
 * write) and its explicit failure path (unresolved key → retain the current
 * legacy state, no navigation at all).
 *
 * OWNERSHIP / REMOVAL: Issue #2059 (producer convergence) may eventually make
 * this predicate moot once no in-app path can present a legacy `groupId`/
 * `areaKey` alongside a canonical-journey switch at all. Until then this is
 * the click-time trigger, never a rendering gate.
 */
export interface LegacyAreaContextInput {
  /** `DiscoverUrlState.groupId` — area-group slug for the (legacy) area-first journey. */
  groupId: string | null | undefined;
  /** `DiscoverUrlState.areaKey` — selected area's pipe-key for the (legacy) area-first journey. */
  areaKey: string | null | undefined;
}

/**
 * True when a legacy area-context URL param is already present.
 *
 * Deliberately a plain truthiness check, not a `.trim()`/validity check:
 * `''` (absent-equivalent — `?groupId=` round-trips to `''`) is treated as
 * NO legacy context, while a whitespace-only or invalid slug (e.g.
 * `groupId=%20`, `groupId=nonexistent-slug`) IS treated as legacy context —
 * the legacy surface itself already renders the correct outcome for those
 * values (normal browse for whitespace, a non-alarming invalid-group notice
 * for an unknown slug; see `MapDiscovery.issue1178.test.tsx`). Validating
 * the value here would duplicate that logic and risk disagreeing with it.
 */
export function hasLegacyAreaContext({ groupId, areaKey }: LegacyAreaContextInput): boolean {
  return Boolean(groupId) || Boolean(areaKey);
}
