/**
 * AgriSpecRows — Issue #1406
 *
 * Shared presentational component for agricultural listing field rows.
 * Used by:
 *   - ListingDetailMainContent (full detail page)
 *
 * Design rules:
 *   - Every row is null-guarded: null/undefined/empty-string values are omitted
 *     silently (no blank rows).
 *   - Price-per-acre: only when BOTH price > 0 AND computedAreaAcres > 0.
 *   - Boundary disclaimer: only when boundary is a non-null, non-empty string.
 */

import React from 'react';
import { formatPrice } from '@/lib/formatters';
import {
  WATER_SOURCE_LABELS,
  LAND_CATEGORY_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
} from '@/lib/agriFieldLabels';

export interface AgriSpecRowsProps {
  surveyNumber?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;
  computedAreaAcres?: number | null;
  price?: number | null;
  waterSource?: string | null;
  soilType?: string | null;
  roadAccess?: string | null;
  cultivationStatus?: string | null;
  ownershipType?: string | null;
  boundary?: string | null;
  /** Issue #1458 — land category enum value from backend. Null → omit row. */
  landCategory?: string | null;
  /** Issue #1458 — farmhouse availability. Null → omit row (unknown). */
  farmhouseAvailable?: boolean | null;
  /** Issue #1458 — fencing status. Null → omit row (unknown). */
  fencingDone?: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldRow: renders nothing when value is null/undefined/empty string
// ─────────────────────────────────────────────────────────────────────────────
function FieldRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between items-start gap-2 py-2 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgriSpecRows
// ─────────────────────────────────────────────────────────────────────────────
export function AgriSpecRows({
  surveyNumber,
  landArea,
  landAreaUnit,
  computedAreaAcres,
  price,
  waterSource,
  soilType,
  roadAccess,
  cultivationStatus,
  ownershipType,
  boundary,
  landCategory,
  farmhouseAvailable,
  fencingDone,
}: AgriSpecRowsProps) {
  // Land area: e.g. "2.5 acres"
  const landAreaValue =
    landArea != null && landAreaUnit
      ? `${landArea} ${landAreaUnit}`
      : landArea != null
        ? String(landArea)
        : null;

  // Approx area from computed boundary: e.g. "≈ 1.23 acres"
  const computedAreaValue =
    computedAreaAcres != null ? `≈ ${computedAreaAcres.toFixed(2)} acres` : null;

  // Formatted price — treat 0 same as null (no meaningful price to display)
  const priceValue = price != null && price > 0 ? formatPrice(price) : null;

  // Price-per-acre: only when both price and computedAreaAcres are positive
  const showPricePerAcre =
    typeof price === 'number' &&
    price > 0 &&
    typeof computedAreaAcres === 'number' &&
    computedAreaAcres > 0;

  // Safe: showPricePerAcre guard above proves both are positive numbers
  const pricePerAcreValue = showPricePerAcre
    ? `${formatPrice(Math.round((price as number) / (computedAreaAcres as number)))}/acre`
    : null;

  // Boundary disclaimer: non-null AND non-empty string
  const showBoundaryDisclaimer =
    typeof boundary === 'string' && boundary.length > 0;

  // Issue #1458 — derived display values for new structured fields.
  // landCategory: map enum to human label; null → omit row (FieldRow handles null).
  const landCategoryValue =
    landCategory != null ? (LAND_CATEGORY_LABELS[landCategory] ?? landCategory) : null;

  // waterSource: map NOT_AVAILABLE → "Not available"; other values use label map or as-is.
  // null → omit row (FieldRow handles null).
  const waterSourceValue =
    waterSource != null ? (WATER_SOURCE_LABELS[waterSource] ?? waterSource) : null;

  // farmhouseAvailable / fencingDone: true→"Yes", false→"No", null→omit row.
  const farmhouseValue =
    farmhouseAvailable === true ? 'Yes' : farmhouseAvailable === false ? 'No' : null;
  const fencingValue =
    fencingDone === true ? 'Yes' : fencingDone === false ? 'No' : null;

  return (
    <div>
      <FieldRow label="Survey number" value={surveyNumber} testId="agri-survey-number" />
      <FieldRow label="Land area" value={landAreaValue} testId="agri-land-area" />
      <FieldRow label="Approx. area" value={computedAreaValue} testId="agri-computed-area" />
      <FieldRow label="Price" value={priceValue} testId="agri-price" />
      <FieldRow label="Price per acre" value={pricePerAcreValue} testId="agri-price-per-acre" />
      <FieldRow label="Land category" value={landCategoryValue} testId="agri-land-category" />
      <FieldRow label="Water source" value={waterSourceValue} testId="agri-water-source" />
      <FieldRow label="Farmhouse available" value={farmhouseValue} testId="agri-farmhouse-available" />
      <FieldRow label="Fencing done" value={fencingValue} testId="agri-fencing-done" />
      <FieldRow label="Soil type" value={soilType != null ? (SOIL_TYPE_LABELS[soilType] ?? soilType) : null} testId="agri-soil-type" />
      <FieldRow label="Road access" value={roadAccess != null ? (ROAD_ACCESS_LABELS[roadAccess] ?? roadAccess) : null} testId="agri-road-access" />
      <FieldRow label="Cultivation status" value={cultivationStatus != null ? (CULTIVATION_STATUS_LABELS[cultivationStatus] ?? cultivationStatus) : null} testId="agri-cultivation-status" />
      <FieldRow label="Ownership type" value={ownershipType != null ? (OWNERSHIP_TYPE_LABELS[ownershipType] ?? ownershipType) : null} testId="agri-ownership-type" />

      {showBoundaryDisclaimer && (
        <p
          data-testid="agri-boundary-disclaimer"
          className="mt-4 text-xs text-muted-foreground border border-border rounded-md p-3 bg-muted/40"
        >
          The boundary drawn on the map is approximate and should be legally
          verified before purchase.
        </p>
      )}
    </div>
  );
}
