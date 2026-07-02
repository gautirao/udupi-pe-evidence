import { Children, isValidElement, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Issue #1722 (correction #3) — Property Details 2-column layout parity with
// the mock (create-residential-listing.html §3 "Property details"). Shared
// responsive pair wrapper used for Bathrooms/Balconies, Floor number/Total
// floors, and Furnishing/Facing across ALL residential subtypes.
//
// Field VISIBILITY is still governed solely by isListingFieldVisible() in the
// caller (listingFieldConfig.ts is untouched) — this component only lays out
// whatever children the caller conditionally passes in. When a subtype only
// has one of the two paired fields visible (e.g. house/villa has bathrooms
// but not balconies), the single remaining field renders full-width rather
// than as a lopsided 2-column row.
// ---------------------------------------------------------------------------

interface FieldPairRowProps {
  children: ReactNode;
}

/** Responsive 2-column row that collapses to a single column on narrow widths. */
export function FieldPairRow({ children }: FieldPairRowProps) {
  const items = Children.toArray(children).filter(isValidElement);

  if (items.length === 0) return null;
  if (items.length === 1) return <>{items[0]}</>;

  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{items}</div>;
}
