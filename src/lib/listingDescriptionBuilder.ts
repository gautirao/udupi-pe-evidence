/**
 * listingDescriptionBuilder.ts — issue #1718 (residential single-page create parity).
 *
 * Deterministic, FE-only draft-description generator. Ported from the ReTrends
 * "Create Residential Listing" design mock's `buildDesc(tone)` method, adapted
 * to the app's real residential form field names/values (issue #1626/#1717).
 *
 * HARD CONSTRAINTS (product-truth / honesty rules, GH #1622):
 * - Composes ONLY facts the broker has actually entered into the form.
 * - NEVER fabricates proximity, legal/approval, school, ROI, verification,
 *   appreciation, or title-status claims — those words must never appear here.
 * - NO network/API/Claude call — this is a local template, not "AI-generated".
 *   Callers MUST label the UI honestly ("Generate draft description" /
 *   "Draft from entered details"), never "AI-generated".
 *
 * Structured as a swappable "local template provider" (the `DescriptionProvider`
 * interface) so issue #1629 can later swap in a real backend-generated
 * description endpoint without touching call sites — only the provider
 * implementation changes.
 */

import {
  FACING_OPTIONS,
  FURNISHING_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  AVAILABILITY_OPTIONS,
} from '@/lib/listing-constants';
import { formatPrice } from '@/lib/formatters';

export type DescriptionTone = 'default' | 'warm' | 'short' | 'factual';

export type DescriptionPropertyType = 'apartment' | 'house' | 'villa' | 'residential_plot';

export interface DescriptionFacts {
  propertyType: DescriptionPropertyType;
  listingPurpose: 'sale' | 'rent';
  locality: string;
  projectName: string;
  bedrooms: string;
  bathrooms: string;
  /** Primary area for the current type (carpetArea for apartment, builtArea for house/villa, landArea for plot). */
  primaryAreaSqft: number | null;
  furnishingStatus: string;
  facing: string;
  floorNumber: string;
  totalFloors: string;
  hasLift: boolean | null;
  hasPowerBackup: boolean | null;
  isGated: boolean | null;
  hasGarden: boolean | null;
  amenities: readonly string[];
  possessionStatus: string;
  availabilityTimeline: string;
  priceRupees: number | null;
  monthlyRent: number | null;
  securityDepositMonths: string;
  priceNegotiable: boolean | null;
  roadWidthFt: string;
  plotDimensions: string;
}

/** Swappable provider interface — #1629 can implement this against a real endpoint. */
export interface DescriptionProvider {
  generate(facts: DescriptionFacts, tone: DescriptionTone): string;
}

function labelFor(options: readonly { value: string; label: string }[], value: string): string | undefined {
  return options.find((o) => o.value === value)?.label;
}

function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const TYPE_NAME: Record<DescriptionPropertyType, string> = {
  apartment: 'apartment',
  house: 'independent house',
  villa: 'villa',
  residential_plot: 'residential plot',
};

/**
 * Pure builder — mirrors the design mock's `buildDesc(tone)` but reads only
 * real, currently-entered form facts (no invented amenities/claims).
 */
export function buildLocalDescription(facts: DescriptionFacts, tone: DescriptionTone): string {
  const isRent = facts.listingPurpose === 'rent';
  const isPlot = facts.propertyType === 'residential_plot';
  const typeName = TYPE_NAME[facts.propertyType];
  const locationPhrase = facts.projectName.trim()
    ? `at ${facts.projectName.trim()}`
    : facts.locality.trim()
      ? `in ${facts.locality.trim()}`
      : '';
  const configPrefix = !isPlot && facts.bedrooms ? `${facts.bedrooms} BHK ` : '';

  const sentences: string[] = [];

  let lead = `${configPrefix}${typeName} ${locationPhrase}`.trim().replace(/\s+/g, ' ') + '.';
  if (tone === 'warm') {
    lead = `A comfortable ${(`${configPrefix}${typeName} ${locationPhrase}`).trim().replace(/\s+/g, ' ')}, ready to welcome its next ${isRent ? 'tenant' : 'owner'}.`;
  }
  sentences.push(cap(lead));

  const facts1: string[] = [];
  if (facts.primaryAreaSqft && facts.primaryAreaSqft > 0) {
    const areaLabel = isPlot ? 'sq.ft plot' : facts.propertyType === 'apartment' ? 'sq.ft carpet area' : 'sq.ft built-up area';
    facts1.push(`${facts.primaryAreaSqft} ${areaLabel}`);
  }
  if (!isPlot) {
    if (facts.bathrooms) facts1.push(`${facts.bathrooms} bathroom${facts.bathrooms === '1' ? '' : 's'}`);
    const furnishingLabel = labelFor(FURNISHING_OPTIONS, facts.furnishingStatus);
    if (furnishingLabel) facts1.push(furnishingLabel.toLowerCase());
    if (facts.propertyType === 'apartment' && facts.floorNumber) {
      facts1.push(facts.totalFloors ? `on floor ${facts.floorNumber} of ${facts.totalFloors}` : `on the ${facts.floorNumber} floor`);
    }
  } else {
    const facingLabel = labelFor(FACING_OPTIONS, facts.facing);
    if (facingLabel) facts1.push(`${facingLabel}-facing`);
    if (facts.roadWidthFt) facts1.push(`on a ${facts.roadWidthFt} ft road`);
  }
  if (facts1.length > 0) sentences.push(cap(facts1.join(', ')) + '.');

  if (!isPlot) {
    if (tone !== 'short' && tone !== 'factual') {
      const highlights: string[] = [];
      if (facts.hasLift) highlights.push('a lift');
      if (facts.hasPowerBackup) highlights.push('power backup');
      if (facts.isGated) highlights.push('a gated community');
      if (facts.hasGarden) highlights.push('a garden');
      facts.amenities.slice(0, 2).forEach((a) => highlights.push(a.toLowerCase().replace(/_/g, ' ')));
      if (highlights.length > 0) sentences.push(cap(`Highlights include ${highlights.slice(0, 4).join(', ')}`) + '.');
    } else if (tone === 'factual') {
      const included: string[] = [];
      if (facts.hasLift) included.push('lift');
      if (facts.hasPowerBackup) included.push('power backup');
      if (included.length > 0) sentences.push(cap(`Includes ${included.join(', ')}`) + '.');
    }
  }

  if (!isRent && !isPlot && facts.possessionStatus) {
    const statusLabel = labelFor(PROPERTY_STATUS_OPTIONS, facts.possessionStatus);
    if (statusLabel) {
      sentences.push(statusLabel === 'Under construction' ? 'Currently under construction.' : 'Ready to move in.');
    }
  }
  if (isRent && facts.availabilityTimeline) {
    const availLabel = labelFor(AVAILABILITY_OPTIONS, facts.availabilityTimeline);
    if (availLabel) sentences.push(`Available ${availLabel.toLowerCase() === 'immediate' ? 'immediately' : availLabel.toLowerCase()}.`);
  }

  const amount = isRent ? facts.monthlyRent : facts.priceRupees;
  if (amount != null && amount > 0) {
    const priceStr = formatPrice(amount);
    if (isRent) {
      const depositNote = facts.securityDepositMonths.trim()
        ? ` with a ${facts.securityDepositMonths}-month deposit`
        : '';
      sentences.push(`Offered at ${priceStr} per month${depositNote}.`);
    } else {
      sentences.push(`Priced at ${priceStr}${facts.priceNegotiable ? ' (negotiable)' : ''}.`);
    }
  }

  if (tone === 'warm') sentences.push('Schedule a visit to see it for yourself.');

  if (tone === 'short') return sentences.slice(0, 2).join(' ');
  return sentences.join(' ');
}

export const localDescriptionProvider: DescriptionProvider = {
  generate: buildLocalDescription,
};
