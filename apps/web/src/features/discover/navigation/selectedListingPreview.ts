/**
 * Issue #1956 PR-4 — reusable anonymous-safe selected-listing preview data
 * contract (AC4.10, team-lead-plan-pr4.toml [scope.preview_contract]).
 *
 * A discriminated union built with two disjoint object shapes (not a single
 * shape with an optional authenticated-only field) so the authenticated-only
 * `pricePaise` field is STRUCTURALLY ABSENT from the anonymous arm — a tsc
 * error to read `.pricePaise` off a `{ kind: 'anon' }` value, not merely an
 * `undefined` at runtime. This is the point of AC4.10's "anonymous-safe
 * fields only": the guarantee is compile-time, not test-time.
 *
 * Derived from `DiscoverCityListingItem` (src/hooks/useDiscoverCityListings.ts).
 * Confirmed there: anonymous callers receive `priceBand?: string | null`,
 * authenticated callers receive `pricePaise?: number` — the two are
 * MUTUALLY EXCLUSIVE (the backend sends exactly one, per that file's
 * docstring), and `isAuthenticated` is part of the TanStack Query cache key
 * precisely so a stale anon response is never served to a freshly
 * authenticated user.
 *
 * Fields, and ONLY these fields (team-lead-plan-pr4.toml
 * [scope.preview_contract].fields): image, public-safe price (priceBand for
 * the anon arm), property type, bedrooms, canonical area label, listing
 * identity, and a `View details` action (the action itself is a caller
 * concern — navigation — not data this module owns).
 *
 * `trustBadge` is REUSED verbatim from `DiscoverCityListingItem` — it is
 * already the public-safe word form ('verified' | 'trusted' | 'listed' |
 * null), never the raw internal letter grade. This module does not "fix" the
 * separately-known-unmapped upstream `trustTier` — out of scope for PR-4.
 *
 * Pure module: no React, no hooks, no import-time side effects.
 *
 * FIX CYCLE 2 (opus review, Finding 5) — this module has NO production
 * importer as of this PR and is INTENTIONALLY dead code today. Decision (b):
 * keep it, unwired, as a forward contract for PR-5.
 *
 * The reviewer confirmed AC4.10's restoration requirement is ALREADY
 * satisfied by the existing #1939 peek machinery via this PR's widened
 * `isMarkerPopoverEligible`/URL-write gate: opening a listing at a canonical
 * AREA leaf writes `listing=` to the URL, dismiss removes it without
 * touching `node`/`lat`/`lon`/`zoom`, and the listing query's identity
 * survives round-trip because it does not key on `listing=`. So
 * `MarkerPopoverCard` correctly stays out of this PR's scope, and this
 * module is not wired into it. Do not assume this file is live — a future
 * PR (PR-5, or whichever slice actually renders a dedicated preview
 * card/sheet from `SelectedListingPreview`) is what wires it up.
 */
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

interface SelectedListingPreviewBase {
  /** Listing identity. */
  id: string;
  /**
   * Issue #2150 (owner review B) — the listing's own title, when the source
   * carries one. Both desktop surfaces this preview is meant to match
   * (`MarkerPopoverCard.tsx`'s `listing.title` line, the Area-first
   * `PropertyCard.tsx`'s `listing.title` heading) already show it; the
   * mobile sheet previously had no field to render one from. Null (never a
   * fabricated placeholder) when the source listing has none.
   */
  title: string | null;
  primaryImageUrl: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  /** Canonical AREA label — the resolved node's/AreaPoint's displayLabel, NOT `listing.locality`. */
  areaLabel: string;
  /** Reused verbatim — see module doc. Never the raw internal letter grade. */
  trustBadge: DiscoverCityListingItem['trustBadge'];
}

/** Anonymous arm — `pricePaise` is STRUCTURALLY ABSENT, not merely unset. */
export type SelectedListingPreviewAnon = SelectedListingPreviewBase & {
  kind: 'anon';
  priceBand: string | null;
};

/** Authenticated arm — `priceBand` is STRUCTURALLY ABSENT, not merely unset. */
export type SelectedListingPreviewAuthed = SelectedListingPreviewBase & {
  kind: 'authed';
  pricePaise: number | null;
};

export type SelectedListingPreview = SelectedListingPreviewAnon | SelectedListingPreviewAuthed;

export interface ToSelectedListingPreviewOptions {
  isAuthenticated: boolean;
  /** The canonical AREA's display label (AreaPoint.areaLabel / node.displayLabel). */
  areaLabel: string;
}

/**
 * Projects a `DiscoverCityListingItem` (which may itself carry BOTH
 * `priceBand` and `pricePaise` fields structurally, even though the backend
 * only ever populates one per the auth-branched contract) down to exactly
 * one arm of the union, keyed on the CALLER's authoritative `isAuthenticated`
 * flag — never on which price field happens to be present on `listing`. This
 * is deliberate: it means a listing object that (incorrectly, or via a stale
 * cache) carries `pricePaise` is still projected to the safe `anon` shape
 * with `pricePaise` DISCARDED whenever `isAuthenticated` is false, rather
 * than leaking it through.
 */
export function toSelectedListingPreview(
  listing: DiscoverCityListingItem,
  { isAuthenticated, areaLabel }: ToSelectedListingPreviewOptions,
): SelectedListingPreview {
  const base: SelectedListingPreviewBase = {
    id: listing.id,
    title: listing.title ?? null,
    primaryImageUrl: listing.primaryImageUrl ?? null,
    propertyType: listing.propertyType ?? null,
    bedrooms: listing.bedrooms ?? null,
    areaLabel,
    trustBadge: listing.trustBadge ?? null,
  };
  if (isAuthenticated) {
    return { ...base, kind: 'authed', pricePaise: listing.pricePaise ?? null };
  }
  return { ...base, kind: 'anon', priceBand: listing.priceBand ?? null };
}

export interface ToSelectedListingPreviewFromMarkerListingOptions {
  isAuthenticated: boolean;
  /**
   * Fallback area label used when the marker listing carries no `locality`.
   * School-first is cross-area (no single canonical AREA node the way
   * area-first is), so there is no `AreaPoint.areaLabel`/node.displayLabel to
   * reuse here — callers pass the journey's already-threaded city label.
   */
  cityLabel: string;
}

/**
 * Issue #2149 — school-first counterpart to `toSelectedListingPreview` above.
 *
 * Projects a `PropertyListingWithImages` (the shape `selectedMarkerListing`
 * carries — `src/components/map/PropertyMap.tsx` / `src/hooks/
 * usePropertyListings.ts`, NOT `DiscoverCityListingItem`) down to the same
 * `SelectedListingPreview` union `toSelectedListingPreview` produces, so both
 * journeys feed the one mobile preview sheet through an identical contract.
 *
 * A second function rather than a `toSelectedListingPreview` overload: the
 * two source shapes disagree on several fields (snake_case
 * `property_type`/`price_unit` vs camelCase `propertyType`/`pricePaise`, and
 * — critically — `price` here is already RUPEES, matching
 * `MarkerPopoverCard.tsx`'s `formatPrice(listing.price, listing.price_unit)`
 * call with no division, whereas `SelectedListingPreviewAuthed.pricePaise` is
 * PAISE). Do not skip the `* 100` conversion below or the mobile sheet (which
 * divides by 100 via `formatPrice(preview.pricePaise / 100, 'INR')`) will
 * render a price 100x too small. `toSelectedListingPreview`'s own contract
 * (area-first, `DiscoverCityListingItem`, already-paise `pricePaise`) is
 * untouched by this addition.
 *
 * Pure module: no React, no hooks, no import-time side effects.
 */
export function toSelectedListingPreviewFromMarkerListing(
  listing: PropertyListingWithImages,
  { isAuthenticated, cityLabel }: ToSelectedListingPreviewFromMarkerListingOptions,
): SelectedListingPreview {
  const base: SelectedListingPreviewBase = {
    id: listing.id,
    title: listing.title ?? null,
    primaryImageUrl: listing.images?.[0]?.url ?? null,
    propertyType: listing.property_type ?? null,
    bedrooms: listing.bedrooms ?? null,
    areaLabel: listing.locality ?? cityLabel,
    trustBadge: listing.trustBadge ?? null,
  };
  if (isAuthenticated) {
    return {
      ...base,
      kind: 'authed',
      pricePaise: listing.price != null ? Math.round(listing.price * 100) : null,
    };
  }
  return { ...base, kind: 'anon', priceBand: listing.priceBand ?? null };
}
