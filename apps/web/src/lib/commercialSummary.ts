/**
 * Issue #2433 — the buyer-facing Commercial result-card summary.
 *
 * This module is deliberately PURE and deliberately DUMB about taxonomy.
 *
 * The resolved buyer subtype arrives as an explicit parameter. This module
 * never derives it from `(propertyType, commercialSubtype)`, because #2458 owns
 * exactly one translation of the storage taxonomy and a second one living here
 * is the failure that ruling exists to prevent. If you find yourself reaching
 * for `commercial_subtype` in this file, stop: the caller is wired wrong.
 *
 * Identity text is NOT produced here either — that is #2430's
 * `getPropertyTypeLabel`. This module produces only the compact fact row that
 * sits beneath it.
 */

import { formatArea } from '@/lib/formatters';
import { COMMERCIAL_TYPES } from '@/lib/listing-constants';

/**
 * The five buyer-facing Commercial peers from the approved design (#2429),
 * as resolved by #2458.
 *
 * `null` is a legitimate value and carries real information — see
 * {@link buildCommercialSummary}. There is deliberately NO sixth member for
 * "generic commercial": storage has no such value, and minting one here would
 * fabricate a distinction the data does not carry.
 */
export type CommercialBuyerSubtype = 'SHOP' | 'OFFICE' | 'BUILDING' | 'WAREHOUSE' | 'LAND';

/**
 * The allowlisted storage facts a Commercial card may summarise.
 *
 * Every field is optional and nullable because every underlying column is
 * nullable with no backfill (V104), or lives on a child table that may have no
 * row (V102). Absence is the norm, not the exception.
 */
export interface CommercialSummaryFacts {
  builtArea?: number | null;
  builtAreaUnit?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;

  /**
   * Floor, V104 flat shape (`property_listings.floor_choice` / `floor_mode`).
   * Free text; see {@link humaniseToken} for why it is not dictionary-mapped.
   */
  floorChoice?: string | null;
  floorMode?: string | null;

  /**
   * Floor, V102 typed-child shape
   * (`listing_commercial_space_details.floor_number` / `total_floors`).
   *
   * The SAME logical fact as floorChoice/floorMode above, in a different
   * storage location. A row authored through one path reads null on the other,
   * so both are carried and {@link resolveFloorFact} falls back between them.
   * Reading only one source renders a blank card for half the inventory.
   */
  floorNumber?: number | null;
  totalFloors?: number | null;

  hubType?: string | null;
  officeSeats?: number | null;
  occupancyStatus?: string | null;
  warehouseClearHeightFt?: number | null;
  warehouseLoadingBays?: number | null;
  roadFrontageFt?: number | null;
  commercialZoning?: string | null;
}

/** A card shows at most this many facts, at every breakpoint. */
export const MAX_SUMMARY_FACTS = 3;

/**
 * Render a stored text token as something a buyer can read, WITHOUT inventing
 * vocabulary.
 *
 * `hub_type`, `occupancy_status`, `commercial_zoning`, `floor_choice` and
 * `floor_mode` are all free `text` columns. Their real value domain is not
 * knowable from the schema, and no local fixture contains a single Commercial
 * row to sample (measured: 0 of 27). A fixed label dictionary would therefore
 * be a guess dressed up as a mapping — it would silently render the wrong words
 * for any value not in the guess.
 *
 * So: underscores and hyphens become spaces and the result is title-cased.
 * `HIGH_STREET` reads `High Street`; an unanticipated `mall_kiosk` reads
 * `Mall Kiosk` rather than being dropped or mislabelled. Nothing is asserted
 * about the value beyond what was stored.
 */
function humaniseToken(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** A finite positive number, or null. Rejects NaN, Infinity and negatives. */
function positiveNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * The dual-source floor fallback (V104 flat, else V102 typed child).
 *
 * V104 wins when present because it is the current write path; V102 is the
 * backfilled shape that legacy and early-typed rows carry. Exported for direct
 * testing — this fallback is the single most regression-prone line in the file.
 */
export function resolveFloorFact(facts: CommercialSummaryFacts): string | null {
  // V104 flat shape first.
  const choice = humaniseToken(facts.floorChoice);
  const mode = humaniseToken(facts.floorMode);
  if (choice) return `Floor: ${choice}`;
  if (mode) return `Floor: ${mode}`;

  // V102 typed-child shape.
  const floorNumber = facts.floorNumber;
  const totalFloors = positiveNumber(facts.totalFloors);
  if (floorNumber != null && Number.isFinite(floorNumber)) {
    const floorText = floorNumber === 0 ? 'Ground' : `${floorNumber}`;
    return totalFloors ? `Floor ${floorText} of ${totalFloors}` : `Floor ${floorText}`;
  }
  if (totalFloors) return `${totalFloors} floors`;

  return null;
}

function areaFact(facts: CommercialSummaryFacts, prefer: 'built' | 'land'): string | null {
  const built = positiveNumber(facts.builtArea);
  const land = positiveNumber(facts.landArea);

  if (prefer === 'built') {
    if (built) return formatArea(built, facts.builtAreaUnit) || null;
    if (land) return formatArea(land, facts.landAreaUnit) || null;
    return null;
  }

  if (land) return formatArea(land, facts.landAreaUnit) || null;
  if (built) return formatArea(built, facts.builtAreaUnit) || null;
  return null;
}

/**
 * Build the ordered fact row for a Commercial result card.
 *
 * @param subtype      the resolved buyer subtype from #2458, or `null`
 * @param propertyType the listing's `property_type` — NOT NULL in storage, and
 *                     the only thing that separates the two meanings of a
 *                     `null` subtype
 * @param facts        allowlisted storage facts; every one may be absent
 *
 * @returns up to {@link MAX_SUMMARY_FACTS} buyer-readable strings, in display
 *          order. An EMPTY array means the card must render no summary row at
 *          all — not an empty element, not a placeholder, not reserved height.
 *
 * ## The null-subtype branch
 *
 * A `null` subtype means one of two different things, and `propertyType` is how
 * they are told apart:
 *
 * - `propertyType` is NOT in the Commercial family → this is not a Commercial
 *   listing. Returns `[]`; Residential and Agricultural cards are untouched.
 * - `propertyType` IS in the Commercial family → a legacy `commercial` row
 *   whose Shop-vs-Office distinction was never recorded. V102's backfill left
 *   `commercial_subtype` NULL for every pre-existing row deliberately, because
 *   that distinction cannot be recovered from legacy data.
 *
 * That second case gets an AREA-ONLY summary. It is the load-bearing case: no
 * floor, no hub, no seats, and above all no inferred Shop or Office. A legacy
 * row reads null on every V104 column anyway, so area is genuinely all it can
 * honestly support.
 *
 * This local branch is a DERIVATION for grouping, not a taxonomy value. It is
 * never named as a subtype, never returned, and never serialised — see the
 * no-sixth-enum-value rule on {@link CommercialBuyerSubtype}.
 */
export function buildCommercialSummary(
  subtype: CommercialBuyerSubtype | null | undefined,
  propertyType: string | null | undefined,
  facts: CommercialSummaryFacts,
): string[] {
  const typeKey = (propertyType ?? '').trim().toLowerCase();
  const isCommercialFamily = COMMERCIAL_TYPES.has(typeKey);

  // Not a Commercial listing at all — the other meaning of a null subtype.
  if (!isCommercialFamily) return [];

  const candidates: Array<string | null> = [];

  switch (subtype ?? null) {
    case 'SHOP': {
      const hub = humaniseToken(facts.hubType);
      candidates.push(
        areaFact(facts, 'built'),
        resolveFloorFact(facts),
        hub ? `Hub: ${hub}` : null,
      );
      break;
    }

    case 'OFFICE': {
      const seats = positiveNumber(facts.officeSeats);
      candidates.push(
        areaFact(facts, 'built'),
        seats ? `${seats} seats` : null,
        resolveFloorFact(facts),
      );
      break;
    }

    case 'BUILDING': {
      const totalFloors = positiveNumber(facts.totalFloors);
      const occupancy = humaniseToken(facts.occupancyStatus);
      candidates.push(
        areaFact(facts, 'built'),
        totalFloors ? `${totalFloors} floors` : null,
        occupancy ? `Occupancy: ${occupancy}` : null,
      );
      break;
    }

    case 'WAREHOUSE': {
      const clearHeight = positiveNumber(facts.warehouseClearHeightFt);
      const bays = positiveNumber(facts.warehouseLoadingBays);
      candidates.push(
        areaFact(facts, 'built'),
        clearHeight ? `Clear height ${clearHeight} ft` : null,
        bays ? `${bays} loading ${bays === 1 ? 'bay' : 'bays'}` : null,
      );
      break;
    }

    case 'LAND': {
      const frontage = positiveNumber(facts.roadFrontageFt);
      const zoning = humaniseToken(facts.commercialZoning);
      candidates.push(
        areaFact(facts, 'land'),
        frontage ? `Frontage ${frontage} ft` : null,
        zoning ? `Zoning: ${zoning}` : null,
      );
      break;
    }

    default:
      // Legacy generic Commercial: area only, nothing inferred.
      candidates.push(areaFact(facts, 'built'));
      break;
  }

  return candidates
    .filter((fact): fact is string => typeof fact === 'string' && fact.length > 0)
    .slice(0, MAX_SUMMARY_FACTS);
}
