// ── School-first status-pill "Showing X schools" derivation ────────────────────
//
// Pure helpers — exported so they can be unit-tested without mounting the page
// (mirrors deriveDiscoverBadge above). Each returns the school count the bottom
// status pill should show for one school-first pre-radius state, reusing the same
// discoverAreas/focusedGroup/selectedArea data already driving the school-first
// panels/hero — no new fetch, no fabrication.
//
// All three are gated on `areasLoading`, exactly like the existing
// schoolListingsCount null-while-loading pattern above, so the pill never flashes
// "Showing 0 schools" mid-load — it simply hides (returns null) until settled.

interface SchoolFirstAreaLike {
  areaKey: string;
  schoolCount?: number | null;
}

interface SchoolFirstSelectedAreaLike {
  schoolCount?: number | null;
}

interface SchoolFirstGroupLike {
  area_keys: string[];
}

export interface SchoolFirstLandingCountInput {
  journey: string | null | undefined;
  groupId: string | null | undefined;
  selectedArea: SchoolFirstSelectedAreaLike | null | undefined;
  areasLoading: boolean;
  discoverAreas: ReadonlyArray<SchoolFirstAreaLike>;
}

/** School-first landing (no zone/area/school selected yet) — schools across the city scope currently on the map. */
export function deriveSchoolFirstLandingSchoolCount({
  journey,
  groupId,
  selectedArea,
  areasLoading,
  discoverAreas,
}: SchoolFirstLandingCountInput): number | null {
  if (areasLoading) return null;
  if (journey !== 'school-first' || !!groupId || selectedArea != null) return null;
  return discoverAreas.reduce((sum, a) => sum + (a.schoolCount ?? 0), 0);
}

export interface SchoolFirstZoneCountInput {
  journey: string | null | undefined;
  groupId: string | null | undefined;
  selectedArea: SchoolFirstSelectedAreaLike | null | undefined;
  focusedGroup: SchoolFirstGroupLike | null | undefined;
  areasLoading: boolean;
  discoverAreas: ReadonlyArray<SchoolFirstAreaLike>;
}

/** School-first zone selected (no area selected yet) — schools summed across the zone's member areas. */
export function deriveSchoolFirstZoneSchoolCount({
  journey,
  groupId,
  selectedArea,
  focusedGroup,
  areasLoading,
  discoverAreas,
}: SchoolFirstZoneCountInput): number | null {
  if (areasLoading) return null;
  if (journey !== 'school-first' || !groupId || selectedArea != null || !focusedGroup) return null;
  const memberKeySet = new Set(focusedGroup.area_keys);
  return discoverAreas
    .filter((a) => memberKeySet.has(a.areaKey))
    .reduce((sum, a) => sum + (a.schoolCount ?? 0), 0);
}

export interface SchoolFirstAreaCountInput {
  journey: string | null | undefined;
  selectedArea: SchoolFirstSelectedAreaLike | null | undefined;
  areasLoading: boolean;
}

/** School-first area selected (no school picked yet) — schools in the selected area. */
export function deriveSchoolFirstAreaSchoolCount({
  journey,
  selectedArea,
  areasLoading,
}: SchoolFirstAreaCountInput): number | null {
  if (areasLoading) return null;
  if (journey !== 'school-first' || selectedArea == null) return null;
  return selectedArea.schoolCount ?? null;
}

// ── School-marker-layer visibility gate (Issue #1157 rev-5 DEFECT A) ───────────
//
// Pure helper — exported so it can be unit-tested without mounting the page.
// school-first only mounts the marker layer once an area is resolved (areaKey set)
// — at landing/zone-selected there is never any school-marker data to show (the
// schools-by-area query is disabled until areaKey resolves), so requiring areaKey
// here is a no-op for real marker rendering while also suppressing
// SchoolMarkerLayer's "No schools found in this area" empty-state toast at those
// two states (visual-parity polish, cycle 3). area-first keeps its existing
// school-picking / area-school-combined behaviour unchanged.
export interface ShowSchoolMarkersInput {
  journey: string | null | undefined;
  areaKey: string | null | undefined;
  schoolPicking: boolean | null | undefined;
  schoolId: string | null | undefined;
}

export function deriveShowSchoolMarkers({
  journey,
  areaKey,
  schoolPicking,
  schoolId,
}: ShowSchoolMarkersInput): boolean {
  return (
    (journey === 'school-first' && !!areaKey) ||
    !!schoolPicking ||
    (journey === 'area-first' && !!areaKey && !!schoolId)
  );
}

/**
 * Status-pill noun for the school-first, school-selected (school-radius-active)
 * state — "Showing X homes"/"Showing X rentals". Pure so the branch is
 * unit-testable without mounting the page.
 */
export function deriveSchoolRadiusPillNoun(intent: string | null | undefined): 'homes' | 'rentals' {
  return intent === 'rent' ? 'rentals' : 'homes';
}
