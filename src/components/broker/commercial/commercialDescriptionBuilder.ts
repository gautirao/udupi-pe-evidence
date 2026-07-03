/**
 * commercialDescriptionBuilder.ts — issue #1684 [M38-13B] code-review follow-up
 * (D1: deterministic commercial description draft-builder).
 *
 * Deterministic, FE-only draft-description generator for the commercial
 * create-listing flow — the commercial sibling of
 * `src/lib/listingDescriptionBuilder.ts` (residential, #1718). Lives under
 * `src/components/broker/commercial/` (not `src/lib/`) because
 * `listingDescriptionBuilder.ts` is TS-locked to the 4 residential property
 * types and is out of this issue's allowed_file_globs — this is a NEW,
 * independent file, not an edit to that one.
 *
 * HARD CONSTRAINTS (product-truth / honesty rules, GH #1622, mirrored from the
 * residential builder):
 * - Composes ONLY facts the broker has actually entered into the form.
 * - Fully deterministic — NO network/API/Claude call. This is a local
 *   template, never "AI-generated". Callers MUST label the UI honestly
 *   ("Draft description" / "Draft from entered details").
 * - NEVER fabricates or asserts a guaranteed ROI, rental yield, footfall, or
 *   any performance claim — expectedRentalYieldPct / currentMonthlyIncomePaise
 *   are intentionally NOT read here, even when entered, because stating them
 *   as prose reads as a promise rather than a plain fact.
 * - NEVER invents or asserts approvals, zoning, or legal/title status. Zoning
 *   and ownership are echoed only in a neutral "as entered" phrasing (never
 *   "approved" / "verified" / "clear title"), and commercialApprovals is
 *   deliberately NOT echoed into prose — approval claims stay out of
 *   generated marketing copy even when the broker typed something in that
 *   field, to avoid ever reading as a platform-asserted legal fact.
 * - Every word remains user-editable after generation.
 */

import {
  COMMERCIAL_FLOOR_CHOICE_OPTIONS,
  COMMERCIAL_FURNISHING_STATUS_OPTIONS,
  COMMERCIAL_AVAILABILITY_OPTIONS,
} from '@/lib/listing-constants';
import { formatPrice } from '@/lib/formatters';
import type { CommercialSubtype } from '@/lib/listingFieldConfig';

export type CommercialDescriptionTone = 'default' | 'warm' | 'short' | 'factual';

export interface CommercialDescriptionFacts {
  commercialSubtype: CommercialSubtype | undefined;
  listingPurpose: 'sale' | 'rent' | 'lease';
  locality: string;
  primaryAreaSqft: number | null;
  areaUnit: string;
  floorChoice: string;
  hubType: string;
  floorMode: string;
  officeSeats: string;
  officeCabins: string;
  officeMeetingRooms: string;
  warehouseClearHeightFt: string;
  warehouseFlooring: string;
  commercialZoning: string;
  commercialFurnishingStatus: string;
  suitableUses: readonly string[];
  commercialAvailability: string;
  priceRupees: number | null;
  monthlyRent: number | null;
  leaseTermMonths: string;
}

function labelFor(options: readonly { value: string; label: string }[], value: string): string | undefined {
  return options.find((o) => o.value === value)?.label;
}

function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const SUBTYPE_NAME: Record<CommercialSubtype, string> = {
  SHOP: 'shop / showroom',
  OFFICE: 'office space',
  BUILDING: 'commercial building',
  WAREHOUSE: 'warehouse',
  LAND: 'commercial plot',
};

/**
 * Pure builder — composes only facts already entered in
 * CommercialListingForm. Mirrors buildLocalDescription's structure
 * (lead sentence -> facts sentence -> highlights -> availability -> price).
 */
export function buildCommercialDescription(facts: CommercialDescriptionFacts, tone: CommercialDescriptionTone): string {
  const isRentOrLease = facts.listingPurpose === 'rent' || facts.listingPurpose === 'lease';
  const isLand = facts.commercialSubtype === 'LAND';
  const typeName = facts.commercialSubtype ? SUBTYPE_NAME[facts.commercialSubtype] : 'commercial property';
  const locationPhrase = facts.locality.trim() ? `in ${facts.locality.trim()}` : '';

  const sentences: string[] = [];

  let lead = `${typeName} ${locationPhrase}`.trim().replace(/\s+/g, ' ') + '.';
  if (tone === 'warm') {
    lead = `A well-placed ${typeName} ${locationPhrase}`.trim().replace(/\s+/g, ' ') + ', ready for its next business.';
  }
  sentences.push(cap(lead));

  const facts1: string[] = [];
  if (facts.primaryAreaSqft && facts.primaryAreaSqft > 0) {
    facts1.push(`${facts.primaryAreaSqft} ${facts.areaUnit || 'sqft'}`);
  }
  if (facts.commercialSubtype === 'SHOP' || facts.commercialSubtype === 'OFFICE') {
    const floorLabel = labelFor(COMMERCIAL_FLOOR_CHOICE_OPTIONS, facts.floorChoice);
    if (floorLabel) facts1.push(floorLabel.toLowerCase());
    if (facts.hubType) facts1.push(facts.hubType.toLowerCase().replace(/_/g, ' '));
  }
  if (facts.commercialSubtype === 'OFFICE') {
    if (facts.officeSeats) facts1.push(`seating for ${facts.officeSeats}`);
    if (facts.officeCabins) facts1.push(`${facts.officeCabins} cabin${facts.officeCabins === '1' ? '' : 's'}`);
    if (facts.officeMeetingRooms) facts1.push(`${facts.officeMeetingRooms} meeting room${facts.officeMeetingRooms === '1' ? '' : 's'}`);
  }
  if (facts.commercialSubtype === 'BUILDING' && facts.floorMode) {
    facts1.push(facts.floorMode.toLowerCase().replace(/_/g, ' '));
  }
  if (facts.commercialSubtype === 'WAREHOUSE') {
    if (facts.warehouseClearHeightFt) facts1.push(`${facts.warehouseClearHeightFt} ft clear height`);
    const flooringLabel = facts.warehouseFlooring ? facts.warehouseFlooring.toLowerCase().replace(/_/g, ' ') : '';
    if (flooringLabel) facts1.push(`${flooringLabel} flooring`);
  }
  if (isLand && facts.commercialZoning.trim()) {
    // Echoes exactly what the broker typed — never phrased as "approved" or
    // "verified"; not a platform assertion of legal/zoning status.
    facts1.push(`zoning as entered: ${facts.commercialZoning.trim()}`);
  }
  if (!isLand) {
    const furnishingLabel = labelFor(COMMERCIAL_FURNISHING_STATUS_OPTIONS, facts.commercialFurnishingStatus);
    if (furnishingLabel) facts1.push(furnishingLabel.toLowerCase());
  }
  if (facts1.length > 0) sentences.push(cap(facts1.join(', ')) + '.');

  if (tone !== 'short' && tone !== 'factual' && facts.suitableUses.length > 0) {
    const uses = facts.suitableUses.slice(0, 3).map((u) => u.toLowerCase().replace(/_/g, ' '));
    sentences.push(cap(`Suitable for ${uses.join(', ')}`) + '.');
  }

  if (facts.commercialAvailability) {
    const availLabel = labelFor(COMMERCIAL_AVAILABILITY_OPTIONS, facts.commercialAvailability);
    if (availLabel) sentences.push(`Available ${availLabel.toLowerCase() === 'immediate' ? 'immediately' : availLabel.toLowerCase()}.`);
  }

  const amount = isRentOrLease ? facts.monthlyRent : facts.priceRupees;
  if (amount != null && amount > 0) {
    const priceStr = formatPrice(amount);
    if (isRentOrLease) {
      const termNote = facts.leaseTermMonths.trim() ? ` for a ${facts.leaseTermMonths}-month term` : '';
      sentences.push(`Offered at ${priceStr} per month${termNote}.`);
    } else {
      sentences.push(`Priced at ${priceStr}.`);
    }
  }

  if (tone === 'warm') sentences.push('Get in touch to arrange a site visit.');

  if (tone === 'short') return sentences.slice(0, 2).join(' ');
  return sentences.join(' ');
}
