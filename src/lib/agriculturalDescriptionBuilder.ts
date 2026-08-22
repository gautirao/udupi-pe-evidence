/**
 * agriculturalDescriptionBuilder.ts — issue #1627 (agricultural single-page
 * create flow). Deterministic, FE-only draft-description generator — the
 * agricultural sibling of `src/components/broker/commercial/commercialDescriptionBuilder.ts`
 * (#1684) and `src/lib/listingDescriptionBuilder.ts` (residential, #1718).
 *
 * HARD CONSTRAINTS (product-truth / honesty rules, GH #1622, mirrored from the
 * residential/commercial builders):
 * - Composes ONLY facts the broker has actually entered into the form.
 * - Fully deterministic — NO network/API/Claude call. This is a local
 *   template, never "AI-generated". Callers MUST label the UI honestly
 *   ("Draft description" / "Draft from entered details").
 * - NEVER fabricates or asserts crop yield %, legal/title/zoning/conversion
 *   approval, or platform verification of survey number / RTC / ownership —
 *   land-record values are echoed only as "as entered", never "verified" or
 *   "approved".
 * - `features` and `rtc` are FE-only facts (issue #1627: the backend
 *   `CreateListingRequest`/`UpdateListingRequest` contract has no write path
 *   for these — confirmed against ListingController.validateAgriFields and
 *   useBrokerListings.ts). Folding them into this free-text description is
 *   honest because the `description` field itself IS persisted — nothing
 *   here implies structured persistence of features/RTC.
 * - `crops` is DIFFERENT as of issue #2044: it IS now persisted as a
 *   structured field (canonical machine-value vocabulary). This builder still
 *   folds it into the prose (a buyer reading only the description should see
 *   it too), rendered via CROP_LABELS — never a raw machine value, and never
 *   phrased as a platform-verified fact (crops are self-declared).
 * - Every word remains user-editable after generation.
 */

import {
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  LAND_CATEGORY_LABELS,
  CROP_LABELS,
} from '@/lib/agriFieldLabels';
import { FACING_OPTIONS } from '@/lib/listing-constants';
import { formatPrice } from '@/lib/formatters';

export type AgriculturalDescriptionTone = 'default' | 'warm' | 'short' | 'factual';

export interface AgriculturalDescriptionFacts {
  locality: string;
  landArea: number | null;
  landAreaUnit: string;
  facing: string;
  waterSource: string;
  soilType: string;
  roadAccess: string;
  cultivationStatus: string;
  landCategory: string;
  farmhouseAvailable: string; // '' | 'true' | 'false'
  fencingDone: string; // '' | 'true' | 'false'
  /** Canonical machine-value crop codes — persisted as of #2044; see class doc. */
  crops: readonly string[];
  /** FE-only fact (no backend write path) — see class doc. */
  features: readonly string[];
  priceRupees: number | null;
}

function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function labelFrom(map: Record<string, string>, code: string): string | undefined {
  return code ? map[code] : undefined;
}

/**
 * Pure builder — composes only facts already entered in
 * AgriculturalListingForm. Mirrors buildCommercialDescription's structure
 * (lead sentence -> facts sentence -> land-record note -> price).
 */
export function buildAgriculturalDescription(
  facts: AgriculturalDescriptionFacts,
  tone: AgriculturalDescriptionTone,
): string {
  const categoryLabel = labelFrom(LAND_CATEGORY_LABELS, facts.landCategory);
  const typeName = categoryLabel ? categoryLabel.toLowerCase() : 'agricultural land';
  const locationPhrase = facts.locality.trim() ? `in ${facts.locality.trim()}` : '';

  const sentences: string[] = [];

  let lead = `${typeName} ${locationPhrase}`.trim().replace(/\s+/g, ' ') + '.';
  if (tone === 'warm') {
    lead = `A well-placed parcel of ${typeName} ${locationPhrase}`.trim().replace(/\s+/g, ' ') + ', ready for its next owner.';
  }
  sentences.push(cap(lead));

  const facts1: string[] = [];
  if (facts.landArea && facts.landArea > 0) {
    facts1.push(`${facts.landArea} ${facts.landAreaUnit || 'acre'}`);
  }
  const facingLabel = FACING_OPTIONS.find((o) => o.value === facts.facing)?.label;
  if (facingLabel) facts1.push(`${facingLabel.toLowerCase()}-facing`);
  const waterLabel = labelFrom(WATER_SOURCE_LABELS, facts.waterSource);
  if (waterLabel) facts1.push(`water source: ${waterLabel.toLowerCase()}`);
  const soilLabel = labelFrom(SOIL_TYPE_LABELS, facts.soilType);
  if (soilLabel) facts1.push(`${soilLabel.toLowerCase()} soil`);
  const roadLabel = labelFrom(ROAD_ACCESS_LABELS, facts.roadAccess);
  if (roadLabel) facts1.push(roadLabel.toLowerCase());
  const cultivationLabel = labelFrom(CULTIVATION_STATUS_LABELS, facts.cultivationStatus);
  if (cultivationLabel) facts1.push(cultivationLabel.toLowerCase());
  if (facts.farmhouseAvailable === 'true') facts1.push('farmhouse on the land');
  if (facts.fencingDone === 'true') facts1.push('fenced');
  if (facts1.length > 0) sentences.push(cap(facts1.join(', ')) + '.');

  // Crops — issue #2044: crops are now a closed, backend-validated vocabulary
  // (12 canonical codes max), not arbitrary broker free-text. AC13 decision:
  // the pre-#2044 `.slice(0, 4)` truncation existed to bound unpredictable
  // free-text prose length; that risk no longer applies to a fixed, bounded
  // enum, so ALL selected crops are listed (never silently dropped from a
  // buyer-facing description). `features` below is untouched: it remains
  // free-form FE-only text with no backend cap, so its truncation still guards
  // against unbounded prose and is deliberately left as-is.
  if (tone !== 'short' && tone !== 'factual' && facts.crops.length > 0) {
    const crops = facts.crops.map((c) => (CROP_LABELS[c] ?? c).toLowerCase());
    sentences.push(cap(`Grown/suitable for ${crops.join(', ')}, as noted by the seller`) + '.');
  }
  if (tone !== 'short' && facts.features.length > 0) {
    const features = facts.features.slice(0, 4).map((f) => f.toLowerCase());
    sentences.push(cap(`On-land features: ${features.join(', ')}`) + '.');
  }

  if (facts.priceRupees != null && facts.priceRupees > 0) {
    sentences.push(`Priced at ${formatPrice(facts.priceRupees)}.`);
  }

  if (tone === 'warm') sentences.push('Get in touch to arrange a site visit.');

  if (tone === 'short') return sentences.slice(0, 2).join(' ');
  return sentences.join(' ');
}
