/**
 * listingStrength.ts — issue #1718 (residential single-page create parity).
 *
 * Client-side completeness/gate calculator for the inline residential create
 * flow. MUST mirror the REAL backend submit gate — ListingTransitionPolicy.java
 * validateFields() (backend/.../listing/workflow/ListingTransitionPolicy.java) —
 * so the "Submit for review" button is never enabled when the backend would
 * still reject with a 422, and never shows a false "missing" item the backend
 * doesn't actually require.
 *
 * Gate mirror (confirmed against ListingTransitionPolicy.java + the #1718
 * PLAN_REVIEW 002 backend-engineer fix that adds villa/residential_plot to
 * SUBMITTABLE_PROPERTY_TYPES):
 *   - submittable property type: apartment | house | villa | residential_plot
 *   - price > 0 (sale) OR monthlyRent > 0 AND securityDepositMonths present (rent)
 *   - >= 3 images
 *   - addressConfirmed === true
 *   - locality non-blank
 *   - apartment: bedrooms + builtArea + builtAreaUnit required
 *   - house / villa: no extra required fields
 *   - residential_plot: landArea + landAreaUnit required (mirrors "land")
 *
 * PURE FUNCTION — no backend call, no fabricated trust/verification signal.
 * This is a client-side completeness HEURISTIC, not a backend-computed score
 * (see BusinessLogicBoundary — the backend is the sole source of truth for
 * whether submit actually succeeds; this only avoids an obviously-doomed call).
 */

export type ResidentialPropertyType = 'apartment' | 'house' | 'villa' | 'residential_plot';
export type ListingPurpose = 'sale' | 'rent';

/** Property types the backend currently accepts at DRAFT -> PENDING_REVIEW submit. */
const SUBMITTABLE_RESIDENTIAL_TYPES: ReadonlySet<ResidentialPropertyType> = new Set([
  'apartment',
  'house',
  'villa',
  'residential_plot',
]);

export interface ListingStrengthInput {
  propertyType: ResidentialPropertyType;
  listingPurpose: ListingPurpose;
  priceRupees: number | null;
  monthlyRent: number | null;
  securityDepositMonths: string;
  locality: string;
  imageCount: number;
  addressConfirmed: boolean;
  bedrooms: string;
  builtArea: number | null;
  builtAreaUnit: string;
  landArea: number | null;
  landAreaUnit: string;
}

export interface ListingStrengthGate {
  key: string;
  label: string;
  met: boolean;
}

export interface ListingStrengthResult {
  /** True only when every real submit gate is satisfied — mirrors backend acceptance. */
  isSubmittable: boolean;
  /** 0-100 equal-weighted completeness across all applicable gates. */
  percent: number;
  /** Ordered list of gates for display (checklist-style). */
  gates: readonly ListingStrengthGate[];
  /** Human-readable missing-items list (only unmet gates), for the "before you submit" panel. */
  missingItems: readonly string[];
}

function priceGateMet(input: ListingStrengthInput): boolean {
  if (input.listingPurpose === 'rent') {
    const depositOk = input.securityDepositMonths.trim() !== '' && !Number.isNaN(Number(input.securityDepositMonths));
    return input.monthlyRent != null && input.monthlyRent > 0 && depositOk;
  }
  return input.priceRupees != null && input.priceRupees > 0;
}

function typeSpecificGateMet(input: ListingStrengthInput): boolean {
  if (input.propertyType === 'apartment') {
    return input.bedrooms !== '' && input.builtArea != null && input.builtArea > 0 && input.builtAreaUnit !== '';
  }
  if (input.propertyType === 'residential_plot') {
    return input.landArea != null && input.landArea > 0 && input.landAreaUnit !== '';
  }
  // house / villa — no extra required fields beyond the shared gates.
  return true;
}

export function computeListingStrength(input: ListingStrengthInput): ListingStrengthResult {
  const isSubmittableType = SUBMITTABLE_RESIDENTIAL_TYPES.has(input.propertyType);
  const priceOk = priceGateMet(input);
  const imagesOk = input.imageCount >= 3;
  const addressOk = input.addressConfirmed;
  const localityOk = input.locality.trim() !== '';
  const typeSpecificOk = typeSpecificGateMet(input);

  const priceLabel = input.listingPurpose === 'rent'
    ? 'Add the monthly rent and security deposit'
    : 'Add the total price';

  const typeSpecificLabel = input.propertyType === 'apartment'
    ? 'Add bedrooms (BHK) and built-up area'
    : input.propertyType === 'residential_plot'
      ? 'Add the plot area'
      : '';

  const gates: ListingStrengthGate[] = [
    { key: 'type', label: 'Property type is submittable', met: isSubmittableType },
    { key: 'price', label: priceLabel, met: priceOk },
    { key: 'locality', label: 'Add the locality', met: localityOk },
    { key: 'images', label: `Add at least 3 photos (${Math.min(input.imageCount, 3)}/3)`, met: imagesOk },
    { key: 'address', label: 'Pin and confirm the location on the map', met: addressOk },
  ];
  if (typeSpecificLabel) {
    gates.push({ key: 'typeSpecific', label: typeSpecificLabel, met: typeSpecificOk });
  }

  const metCount = gates.filter((g) => g.met).length;
  const percent = Math.round((metCount / gates.length) * 100);
  const isSubmittable = gates.every((g) => g.met);
  const missingItems = gates.filter((g) => !g.met).map((g) => g.label);

  return { isSubmittable, percent, gates, missingItems };
}
