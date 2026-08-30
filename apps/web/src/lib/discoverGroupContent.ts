/**
 * discoverGroupContent
 *
 * Typed, frontend-only metadata adapter for the area-first Discover journey.
 *
 * The backend `/api/discover/area-groups` DTO already supplies a group's `subtitle`
 * and `regionLabel`, and `/api/discover/areas` supplies each area's `name` and
 * `listingCount`. What it does NOT supply is buyer-facing *descriptive* copy for the
 * selected-group drill-down page (Issue #1595) — e.g. a group blurb or a one-line
 * locality hint. Rather than scatter that copy as string literals inside the panel
 * JSX (which would couple the component to one city/group), it lives here as a small
 * generalisable lookup so it can be reused across groups and extended per city.
 *
 * Resolution contract used by the panel:
 *   - group description / region label  → backend value first, this adapter as fallback
 *   - locality description              → this adapter only (no backend field exists)
 *
 * Everything is OPTIONAL: a missing entry returns `undefined` and the panel simply
 * omits that line — an unknown group or locality renders cleanly, never broken.
 *
 * No database or API change is implied. If a DB-backed model is later introduced, the
 * panel keeps the same "backend-first, adapter-fallback" precedence and this file
 * becomes a thin default.
 */

export interface AreaGroupContent {
  /** Buyer-facing blurb shown under the group title. */
  description?: string;
  /** Short region label (e.g. "Central Udupi") shown as a chip beside the title. */
  regionLabel?: string;
}

/**
 * Group-level fallback copy, keyed by the group's canonical slug id (AreaGroup.id).
 * Used only when the backend DTO omits `subtitle` / `regionLabel`.
 */
const AREA_GROUP_CONTENT: Record<string, AreaGroupContent> = {
  'university-belt': {
    description:
      "Student-heavy neighbourhoods anchored by Manipal's campuses — strong rental " +
      'demand, walk-to-class flats, and quieter family pockets a short drive out.',
    regionLabel: 'Central Udupi',
  },
};

/**
 * Locality-level descriptive hints, keyed by the normalised locality name (lowercased,
 * trimmed). Keyed by name rather than areaKey so the same copy is reusable regardless
 * of the canonical key format and across cities that share a locality name.
 */
const LOCALITY_DESCRIPTION: Record<string, string> = {
  manipal:
    'University core with student rentals and family flats within walking distance of campus.',
  udyavara:
    'Calmer southern pocket with newer apartments and a short commute up to Manipal.',
  katapadi:
    'Growing residential belt north of Manipal with newer plots and independent homes.',
};

function normaliseKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Fallback descriptive copy for a group, or `undefined` when none is configured. */
export function getAreaGroupContent(groupId: string | null | undefined): AreaGroupContent | undefined {
  return AREA_GROUP_CONTENT[normaliseKey(groupId)];
}

/** One-line buyer-facing hint for a locality, or `undefined` when none is configured. */
export function getLocalityDescription(name: string | null | undefined): string | undefined {
  return LOCALITY_DESCRIPTION[normaliseKey(name)];
}
