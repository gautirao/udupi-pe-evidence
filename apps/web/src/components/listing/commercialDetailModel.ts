/**
 * Issue #2432 — the view model behind the Commercial section of listing detail.
 *
 * Pure: no JSX, no hooks, no formatting of currency beyond what `@/lib/formatters` already owns.
 * Keeping it pure is what makes the subtype matrix cheap to test exhaustively — the six arms are
 * plain function calls rather than six renders.
 *
 * ─── The seam ───────────────────────────────────────────────────────────────────────────────────
 * `subtype` is an INPUT, not something this module derives. #2458 owns the canonical
 * `propertyType + commercialSubtype -> buyer subtype` resolver and exports it from
 * `@/lib/propertyTypeConfig`; this module consumes its output. Deriving a subtype here would be a
 * second resolver, and two resolvers that disagree for one input is a defect with no single owner.
 *
 * `subtype === null` carries TWO distinct cases, which the caller separates using `propertyType`
 * (NOT NULL on every row):
 *   1. a legacy generic `commercial` row that never recorded a subtype — render its facts;
 *   2. a listing that is not commercial at all — render nothing.
 * {@link buildCommercialDetailModel} handles case 2 by returning `[]` for a non-commercial type.
 * Per the #2458 contract there is deliberately NO sixth enum value minted to tell these apart.
 *
 * ─── Honest absence ─────────────────────────────────────────────────────────────────────────────
 * Every fact is gated on a populated value, and a group with no surviving facts is omitted rather
 * than rendered empty. Nothing is defaulted, inferred or synthesized. In particular a legacy row
 * is never given a Shop/Office classification it does not carry (#1742).
 */

import { formatArea } from '@/lib/formatters';
import { COMMERCIAL_TYPES } from '@/lib/listing-constants';
import type { BuyerCommercialSubtype } from '@/lib/propertyTypeConfig';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import {
  commercialAreaUnitLabel,
  commercialAvailabilityLabel,
  commercialFurnishingLabel,
  commercialOwnershipLabel,
  floorChoiceLabel,
  floorModeLabel,
  hubTypeLabel,
  occupancyStatusLabel,
  suitableUseLabels,
  utilityLabels,
  warehouseFlooringLabel,
} from './commercialDetailLabels';

/**
 * The buyer-facing Commercial subtypes.
 *
 * Deliberately an ALIAS of #2458's `BuyerCommercialSubtype`, not a local union repeating its five
 * values. A copy would keep compiling after the contract gained or renamed a value, and this module
 * would then mishandle it silently; aliasing turns that into a compile error here instead.
 */
export type CommercialDetailSubtype = BuyerCommercialSubtype;

export interface CommercialFact {
  /** Stable key, also used as the rendered element's `data-testid` suffix. */
  key: string;
  label: string;
  value: string;
  /**
   * True when the value is broker-entered and has NOT been independently verified. The renderer
   * attributes these to the lister. Applies to approvals, ownership, zoning, yield, current income
   * and suitable uses — never to a measured or structural fact.
   */
  attributed?: boolean;
}

export interface CommercialFactGroup {
  key: string;
  title: string;
  facts: CommercialFact[];
}

/** Reads as "does this listing belong to the Commercial family at all". */
export function isCommercialListing(propertyType: string | null | undefined): boolean {
  return COMMERCIAL_TYPES.has((propertyType ?? '').trim().toLowerCase());
}

/**
 * The generic spec rows that a populated typed Commercial field SUPERSEDES on listing detail.
 *
 * `ListingSpecsGrid` is type-agnostic by design (#1797 AC6), so for a commercial listing it renders
 * a generic `washrooms` row at the same time this section renders the richer public/private pair.
 * Without suppression the buyer sees the same fact stated twice in two different shapes.
 *
 * Suppression is CONDITIONAL on the typed twin actually being populated. An unconditional rule —
 * "hide the generic row on every commercial listing" — would silently delete the fact from every
 * legacy row that only has the generic value, which is the #1742 failure mode. The distinction is
 * invisible to a test that only exercises a typed row, so the suite pairs each case with a legacy
 * control.
 */
export function supersededGenericSpecs(
  listing: Pick<
    PublicListingDetail,
    | 'propertyType'
    | 'washroomsPublic'
    | 'washroomsPrivate'
    | 'parkingPublicCount'
    | 'parkingPrivateCount'
    | 'commercialFurnishingStatus'
    | 'commercialAvailability'
    | 'commercialOwnership'
  >,
): ReadonlySet<'washrooms' | 'parking' | 'furnishing' | 'availability' | 'ownership'> {
  const superseded = new Set<
    'washrooms' | 'parking' | 'furnishing' | 'availability' | 'ownership'
  >();

  // Residential and agricultural listings keep every generic row exactly as before.
  if (!isCommercialListing(listing.propertyType)) return superseded;

  if (listing.washroomsPublic != null || listing.washroomsPrivate != null) {
    superseded.add('washrooms');
  }
  if (listing.parkingPublicCount != null || listing.parkingPrivateCount != null) {
    superseded.add('parking');
  }
  if (commercialFurnishingLabel(listing.commercialFurnishingStatus)) superseded.add('furnishing');
  if (commercialAvailabilityLabel(listing.commercialAvailability)) superseded.add('availability');
  if (commercialOwnershipLabel(listing.commercialOwnership)) superseded.add('ownership');

  return superseded;
}

/** Pushes a fact only when `value` survived label resolution / null-gating. */
function push(facts: CommercialFact[], key: string, label: string, value: string | null, attributed = false) {
  if (value == null || value === '') return;
  facts.push(attributed ? { key, label, value, attributed } : { key, label, value });
}

function group(key: string, title: string, facts: CommercialFact[]): CommercialFactGroup | null {
  return facts.length ? { key, title, facts } : null;
}

const num = (v: number | null | undefined): string | null => (v == null ? null : String(v));

const months = (v: number | null | undefined): string | null =>
  v == null ? null : `${v} month${v === 1 ? '' : 's'}`;

const pct = (v: number | null | undefined): string | null => (v == null ? null : `${v}%`);

/** Paise are the canonical money unit on this API; render whole rupees, never fabricate precision. */
const rupeesFromPaise = (v: number | null | undefined): string | null =>
  v == null ? null : `₹${Math.round(v / 100).toLocaleString('en-IN')}`;

/**
 * Builds the ordered fact groups for a Commercial listing.
 *
 * @param listing the authenticated buyer detail payload
 * @param subtype the resolved buyer subtype from the #2458 contract, or `null` for a legacy row
 * @returns ordered non-empty groups; `[]` when the listing is not commercial or carries no facts
 */
export function buildCommercialDetailModel(
  listing: PublicListingDetail,
  subtype: CommercialDetailSubtype | null,
): CommercialFactGroup[] {
  if (!isCommercialListing(listing.propertyType)) return [];

  // A legacy row has no subtype to gate on. Gating it to an empty set would hide facts a broker
  // actually entered, so every group is offered and null-gating alone decides what survives.
  const legacy = subtype === null;
  const applies = (...subtypes: CommercialDetailSubtype[]) =>
    legacy || (subtype !== null && subtypes.includes(subtype));

  const groups: (CommercialFactGroup | null)[] = [];

  // ── Space ───────────────────────────────────────────────────────────────────────────────────
  const space: CommercialFact[] = [];
  if (listing.carpetArea != null) {
    push(
      space,
      'area',
      'Area',
      commercialAreaUnitLabel(listing.commercialAreaUnit)
        ? `${listing.carpetArea} ${commercialAreaUnitLabel(listing.commercialAreaUnit)}`
        : formatArea(listing.carpetArea, listing.carpetAreaUnit),
    );
  }
  push(space, 'availability', 'Availability', commercialAvailabilityLabel(listing.commercialAvailability));
  push(space, 'furnishing', 'Furnishing', commercialFurnishingLabel(listing.commercialFurnishingStatus));
  push(space, 'occupancy', 'Occupancy', occupancyStatusLabel(listing.occupancyStatus));
  groups.push(group('space', 'Space', space));

  // ── Floor & access ──────────────────────────────────────────────────────────────────────────
  if (applies('SHOP', 'OFFICE', 'BUILDING')) {
    const floor: CommercialFact[] = [];
    push(floor, 'floor-choice', 'Floor', floorChoiceLabel(listing.floorChoice));
    push(floor, 'floor-mode', 'Floors offered', floorModeLabel(listing.floorMode));
    push(floor, 'hub-type', 'Location type', hubTypeLabel(listing.hubType, subtype));
    groups.push(group('floor', 'Floor & access', floor));
  }

  // ── Facilities ──────────────────────────────────────────────────────────────────────────────
  if (applies('SHOP', 'OFFICE', 'BUILDING', 'WAREHOUSE')) {
    const facilities: CommercialFact[] = [];
    push(facilities, 'parking-public', 'Public parking', num(listing.parkingPublicCount));
    push(facilities, 'parking-private', 'Private parking', num(listing.parkingPrivateCount));
    push(facilities, 'washrooms-public', 'Public washrooms', num(listing.washroomsPublic));
    push(facilities, 'washrooms-private', 'Private washrooms', num(listing.washroomsPrivate));
    push(
      facilities,
      'power-load',
      'Power load',
      listing.powerLoadKva == null ? null : `${listing.powerLoadKva} kVA`,
    );
    const utils = utilityLabels(listing.utilities);
    push(facilities, 'utilities', 'Utilities', utils.length ? utils.join(', ') : null);
    groups.push(group('facilities', 'Facilities', facilities));
  }

  // ── Office capacity ─────────────────────────────────────────────────────────────────────────
  if (applies('OFFICE')) {
    const office: CommercialFact[] = [];
    push(office, 'office-seats', 'Seats', num(listing.officeSeats));
    push(office, 'office-cabins', 'Cabins', num(listing.officeCabins));
    push(office, 'office-meeting-rooms', 'Meeting rooms', num(listing.officeMeetingRooms));
    groups.push(group('office', 'Workspace capacity', office));
  }

  // ── Warehouse ───────────────────────────────────────────────────────────────────────────────
  if (applies('WAREHOUSE')) {
    const wh: CommercialFact[] = [];
    push(
      wh,
      'clear-height',
      'Clear height',
      listing.warehouseClearHeightFt == null ? null : `${listing.warehouseClearHeightFt} ft`,
    );
    push(wh, 'loading-bays', 'Loading bays', num(listing.warehouseLoadingBays));
    push(
      wh,
      'truck-access',
      'Truck access',
      listing.warehouseTruckAccess == null ? null : listing.warehouseTruckAccess ? 'Yes' : 'No',
    );
    push(wh, 'flooring', 'Flooring', warehouseFlooringLabel(listing.warehouseFlooring));
    groups.push(group('warehouse', 'Warehouse', wh));
  }

  // ── Land & title ────────────────────────────────────────────────────────────────────────────
  // Zoning has no option vocabulary on the server, so it is broker free text and renders verbatim.
  if (applies('LAND')) {
    const land: CommercialFact[] = [];
    push(land, 'zoning', 'Zoning', listing.commercialZoning ?? null, true);
    push(land, 'ownership', 'Ownership', commercialOwnershipLabel(listing.commercialOwnership), true);
    push(land, 'approvals', 'Approvals', listing.commercialApprovals ?? null, true);
    groups.push(group('land', 'Land & title', land));
  }

  // ── Commercial terms ────────────────────────────────────────────────────────────────────────
  // Lease term and escalation are real persisted columns and are independent of listing_purpose,
  // which the DB constrains to sale|rent (#2458: `rent` is the sole query value, "Rent / Lease" is
  // presentation-only). They are facts about a rental agreement, never a purpose value, so they are
  // shown on a `rent` listing and withheld from a `sale` one.
  const isRent = listing.listingPurpose === 'rent';
  const terms: CommercialFact[] = [];
  push(terms, 'current-income', 'Current monthly income', rupeesFromPaise(listing.currentMonthlyIncomePaise), true);
  push(terms, 'expected-yield', 'Expected rental yield', pct(listing.expectedRentalYieldPct), true);
  if (isRent) {
    push(terms, 'lease-term', 'Lease term', months(listing.leaseTermMonths));
    push(terms, 'lease-escalation', 'Lease escalation', pct(listing.leaseEscalationPct));
  }
  groups.push(group('terms', 'Commercial terms', terms));

  // ── Suitable uses ───────────────────────────────────────────────────────────────────────────
  const uses = suitableUseLabels(listing.suitableUses, subtype);
  groups.push(
    group('uses', 'Suitable for', uses.length ? [{ key: 'suitable-uses', label: 'Suitable for', value: uses.join(', '), attributed: true }] : []),
  );

  return groups.filter((g): g is CommercialFactGroup => g !== null);
}
