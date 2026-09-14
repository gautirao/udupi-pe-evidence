import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';
import { snapBbox } from '@/lib/bboxUtils';
import type { DiscoverCommercialFactsDto } from '@/hooks/useDiscoverListings';
import type { CommercialSubtype } from '@/lib/listing-constants';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';

/**
 * Client freshness for public city listings, mirroring the endpoint's
 * `Cache-Control: max-age=60, public`.
 *
 * Named and exported (Issue #1956 PR 1, FE-3) purely so the AC1.17 inequality
 * "count cache freshness <= listing cache freshness" can be asserted against the
 * REAL value rather than a duplicated literal. The value is unchanged from the
 * inline `60_000` it replaces. See `useDiscoverNavigationCounts.ts`.
 */
export const DISCOVER_CITY_LISTINGS_STALE_TIME_MS = 60_000;

export interface DiscoverCityListingItem {
  id: string;
  pricePaise?: number;
  /**
   * Coarse price band string (e.g. "₹50L–1Cr") returned by the backend for ANONYMOUS
   * callers. Mutually exclusive with pricePaise — the backend sends exactly one of the
   * two (or neither when the DB price is null). Authenticated callers receive pricePaise
   * instead. See #1616 auth-branched price contract.
   */
  priceBand?: string | null;
  /**
   * Issue #2051 — exact monthly rent in RUPEES (NOT paise — do not divide/multiply
   * by 100), returned by the backend for AUTHENTICATED callers when listingPurpose
   * is 'rent' or 'lease' and the stored monthly_rent is > 0. Mutually exclusive with
   * monthlyRentBand — the backend sends exactly one of the two (or neither when the
   * DB rent is null/absent, or the listing is a sale). Anonymous callers receive
   * monthlyRentBand instead. See #1616 auth-branched price contract for the sale
   * analogue (pricePaise/priceBand), which this mirrors.
   */
  monthlyRentRupees?: number;
  /**
   * Issue #2051 — coarse monthly-rent band string (e.g. "₹20–35K") returned by the
   * backend for ANONYMOUS callers when listingPurpose is 'rent' or 'lease'. Mutually
   * exclusive with monthlyRentRupees. Authenticated callers receive monthlyRentRupees
   * instead. Absent/null for sale listings and for rent/lease listings with no valid
   * stored rent.
   */
  monthlyRentBand?: string | null;
  propertyType?: string;
  locality?: string;
  primaryImageUrl?: string | null;
  listingPurpose?: string;
  bedrooms?: number | null;
  title?: string | null;
  bathrooms?: number | null;
  builtArea?: number | null;
  builtAreaUnit?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;
  totalFloors?: number | null;
  parkingCount?: number | null;
  furnishingStatus?: string | null;
  createdAt?: string | null;
  /**
   * Issue #1794 Phase 1 — timestamp the listing was last confirmed/reconfirmed as LIVE.
   * Null for listings never confirmed. Never faked or defaulted from createdAt/lastUpdatedAt —
   * a null value must render as honest absence (fall back to createdAt display).
   */
  confirmedAt?: string | null;
  /**
   * Issue #1567 — public-safe trust badge word ("verified"/"trusted"/"listed"), or
   * null/absent when the listing has no badge (D tier, legacy rows, or unknown grade).
   * Never the raw internal letter grade — the backend never sends A/B/C/D on this field.
   */
  trustBadge?: 'verified' | 'trusted' | 'listed' | null;
  lat?: number | null;
  lon?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /**
   * Issue #2431 — `SHOP` or `OFFICE` when declared; absent otherwise. See the field of
   * the same name on `DiscoverListingItem` for what absence means and why it must never
   * be guessed at.
   *
   * ⚠️ **The three feeds do NOT carry the same fields.** This shape is filled from three
   * different backends:
   *
   *   - `/api/discover/listings` → `DiscoverListingResponse` (remapped by
   *     `discoverListingToCityListing`) — carries the subtype AND the facts. Feeds
   *     `authViewportListings` (#2015) and `polygonListings` (#2461).
   *   - `/api/discover/cities/{city}/listings` → `AreaListingCard` — **carries the
   *     SUBTYPE** as of `e3aab5f` (`AreaListingCard.java:93`). What it does not carry is
   *     the allowlisted FACT columns, which are #2516's scope. Feeds `areaListings`, the
   *     default AREA journey. (#2509 covers the query direction.)
   *   - `/school-radius-listings` → `PublicSchoolRadiusListingCard` — carries neither.
   *     Feeds `schoolListings`.
   *
   * So the school feed is the ONLY one where absence means "this endpoint cannot carry it"
   * rather than "the data does not have it". Consumers must not render the legacy-generic
   * branch on the strength of absence alone.
   *
   * `PropertyCard.tsx` states this same contract at its suppression site. The two must not
   * drift apart: a reader who finds them disagreeing will re-derive the suppression rule
   * from whichever one they happened to open.
   */
  commercialSubtype?: string | null;
  /**
   * Issue #2433 — allowlisted Commercial facts for the card summary. Same three-feed
   * caveat as `commercialSubtype` above: only the authenticated feed populates it.
   */
  commercialFacts?: DiscoverCommercialFactsDto | null;
}

interface DiscoverCityAreaResult {
  areaKey: string;
  areaName: string;
  listings: DiscoverCityListingItem[];
}

interface DiscoverCityListingsResponse {
  city: string;
  limitPerArea: number;
  areas: DiscoverCityAreaResult[];
}

export interface DiscoverCityListingsParams {
  city: string;
  areaKeys: string[];
  limitPerArea?: number;
  /** Price lower bound in paise (backend unit). */
  minPrice?: number;
  /** Price upper bound in paise (backend unit). */
  maxPrice?: number;
  /**
   * BHK counts; 4 means "4 or more". Every selected value is sent, as a REPEATED
   * `?bedrooms=2&bedrooms=3` param — see {@link DiscoverCityListingsParams.propertyType}
   * for why the name stayed singular.
   */
  bedrooms?: number[];
  /**
   * Property type strings (case-insensitive on backend). Every selected value is sent,
   * as a REPEATED `?propertyType=commercial&propertyType=warehouse` param.
   *
   * Issue #2533 — this was a single `string` until the backend half (cdf36c8a) widened
   * the endpoint to `List<String>`. The param NAME is deliberately still the singular
   * `propertyType`, not `propertyTypes`: the backend binds the one-element and repeated
   * forms to the same name, so widening here did not change the wire shape of any
   * request that was already being sent.
   *
   * Callers must pass the buyer's FULL selection. Collapsing it (`?.[0]`, or
   * `length === 1 ? [0] : undefined`) is the defect #2533 exists to remove: the
   * all-or-nothing form yielded `undefined` on a multi-select, which does not narrow
   * the query — it DROPS the filter, reverting the query key to the unfiltered shape
   * already cached at page load and showing the buyer unrelated property types.
   */
  propertyType?: string[];
  /**
   * Issue #2531 — Commercial buyer subtype narrowing, sent as a REPEATED
   * `?commercialSubtypes=SHOP&commercialSubtypes=OFFICE` param.
   *
   * Unlike `propertyType`/`bedrooms` above, the param NAME here is the PLURAL
   * `commercialSubtypes`: this param is new on this endpoint (#2509), so there is no
   * pre-existing frontend request shape or saved URL to stay wire-compatible with, and
   * the plural matches the sibling authenticated endpoints. See
   * `CityAreaListingsController.java:128-134`, which states this asymmetry deliberately.
   *
   * Values are the canonical upper-case taxonomy (`SHOP`/`OFFICE`/`BUILDING`/`WAREHOUSE`/
   * `LAND`). An unknown value is a 400 from the server, not a silent ignore — so rather than
   * leaving that requirement to this sentence, the param is typed to the union itself
   * (#2531 review, FINDING 3). An unrecognised value is now a COMPILE error at the call site
   * instead of a runtime 400, and the narrowing flows through `buildCityListingsQueryParams`'
   * `Pick<>` for free. `PropertyFilters.commercialSubtypes` is already this type, so every
   * caller assigns unchanged.
   *
   * ONE AXIS: a Commercial selection rides this key alone and sets no `propertyType` —
   * the server derives the family via `DiscoverFilterNormalizer.impliedPropertyTypes`.
   * So this must be forwarded independently of `propertyType`, never gated on it.
   */
  commercialSubtypes?: CommercialSubtype[];
  /** Free-text keyword search forwarded to the backend FTS endpoint. */
  q?: string;
  /** Issue #1494 — buy/rent intent mapped to listingPurpose for the backend. */
  listingPurpose?: string;
  /**
   * Issue #2023 — when true, restricts results to possession_status = 'READY',
   * consistent with the same filter already applied by markers/navigation-counts/
   * authenticated Browse-all via DiscoverListingPredicateBuilder.
   */
  readyToMove?: boolean;
  /**
   * Issue #2015 — viewport rectangle `[south, west, north, east]` for the anonymous
   * "Search this area" bbox-only mode. Snapped to a 0.02° grid via `snapBbox()` before
   * being sent (mirrors the convention in `useDiscoverListings.ts`). Non-finite values
   * are treated as absent. When `areaKeys` is empty, a non-null `bbox` is REQUIRED — the
   * backend rejects a request with both absent (400 `areaKeys_required`). When both are
   * present, bbox narrows each area's results (existing behavior, unchanged). Preview
   * mode does not forward bbox — its sandbox `/listings` endpoint only understands
   * `areaKeys` (see the `source.mode === 'preview'` branch below).
   */
  bbox?: [number, number, number, number] | null;
  /**
   * Issue #1616 — auth-branched price contract. When true, the api helper attaches
   * the JWT so the backend returns exact pricePaise (no priceBand). When false/absent,
   * no JWT is sent and the backend returns a coarse priceBand string.
   *
   * This flag is also included in the TanStack Query cache key so that login/logout
   * produces a separate cache bucket — preventing a stale anon (band) response from
   * being served to a freshly-authenticated user and vice versa.
   */
  isAuthenticated?: boolean;
}

/**
 * Fetch listings for one or more area keys within a city.
 * areaKeys are sorted before building the query key to ensure stable cache hits.
 * Each areaKey is individually encodeURIComponent-encoded (values contain '|').
 * Optional filter params (minPrice, maxPrice, bedrooms, propertyType) are forwarded
 * to the backend and included in the query key so the cache invalidates on filter change.
 */
export function useDiscoverCityListings({
  city,
  areaKeys,
  limitPerArea = 5,
  minPrice,
  maxPrice,
  bedrooms,
  propertyType,
  commercialSubtypes,
  q,
  listingPurpose,
  readyToMove,
  bbox,
  isAuthenticated = false,
}: DiscoverCityListingsParams) {
  // Issue #1911 PR3 — see useDiscoverRegionSummary.ts for the default-context
  // ({mode:'live'}) byte-identical-live-behaviour rationale.
  const source = useDiscoverSource();
  const sortedKeys = [...areaKeys].sort();
  // Issue #2015 — same snap/omission convention as useDiscoverListings.ts: non-finite
  // values are treated as absent, and the snapped (not raw) tuple is what participates
  // in the cache key so nearby camera jitter doesn't fragment the cache.
  const snappedBbox =
    bbox != null && bbox.every(Number.isFinite) ? snapBbox(bbox) : null;

  return useQuery<DiscoverCityListingsResponse>({
    queryKey: discoverKey(
      source,
      'discover-city-listings',
      city,
      ...sortedKeys,
      limitPerArea,
      minPrice ?? null,
      maxPrice ?? null,
      // Issue #2533 — multi-value filters participate in the key as a SORTED join, not
      // the raw array. Sorting means two selections of the same set in a different click
      // order share one cache entry (the backend's IN-list is order-insensitive, so they
      // are genuinely the same result set); joining keeps the key a primitive, so a
      // caller that rebuilds the array each render (e.g. the agri branch's literal
      // `[AGRICULTURAL_LAND_PROPERTY_TYPE]`) cannot fragment the cache by identity.
      // The WIRE order below is left as the caller supplied it.
      bedrooms?.length ? [...bedrooms].sort((a, b) => a - b).join(',') : null,
      propertyType?.length ? [...propertyType].sort().join(',') : null,
      // Issue #2531 — same sorted-join treatment as the two axes above, for the same
      // reasons: the backend's IN-list is order-insensitive (so two click orders of the
      // same set are genuinely one result and should share a cache entry), and a
      // primitive key segment stops a caller that rebuilds the array each render from
      // fragmenting the cache by identity. Omitting this segment would be the worse bug:
      // the subtype would reach the wire but NOT the key, so switching Shop→Office would
      // hit the cached Shop response and render the wrong rows without a refetch.
      commercialSubtypes?.length ? [...commercialSubtypes].sort().join(',') : null,
      q?.trim() || null,
      listingPurpose ?? null,
      readyToMove ?? null,
      snappedBbox ? snappedBbox.join(',') : null,
      // Issue #1616: include auth state so login/logout produces a separate cache bucket.
      // Anon callers receive priceBand; authed callers receive pricePaise — they must not
      // share a cache entry or a stale band response would be served post-login.
      isAuthenticated,
    ),
    queryFn: () => {
      // Preview's /listings endpoint (E5) only understands ?areaKeys= — city,
      // price/bedroom/propertyType filters etc. have no meaning against a
      // revision's sandbox graph, so they are intentionally NOT forwarded in
      // preview mode.
      if (source.mode === 'preview') {
        const previewParams = new URLSearchParams();
        sortedKeys.forEach((k) => previewParams.append('areaKeys', k));
        const path = discoverPath(source, '', { kind: 'listings' });
        return api.get<DiscoverCityListingsResponse>(`${path}?${previewParams.toString()}`, {
          skipAuth: false,
        }).then(response => ({
          ...response,
          areas: response.areas.map(area => ({
            ...area,
            listings: area.listings.map(listing => ({
              ...listing,
              id: listing.id ?? `preview:${source.revisionId}:${area.areaKey}`,
            })),
          })),
        }));
      }

      const params = new URLSearchParams();
      sortedKeys.forEach((k) => params.append('areaKeys', k));
      params.set('limitPerArea', String(limitPerArea));
      if (minPrice != null) params.append('minPrice', String(minPrice));
      if (maxPrice != null) params.append('maxPrice', String(maxPrice));
      // Issue #2533 — repeated params, one per selected value. An empty array appends
      // nothing, so "nothing selected" stays indistinguishable from "param absent"
      // (the backend treats a missing param as "no narrowing", never as "match none").
      //
      // Part of #2527 / Issue #2531 review FINDING 1b — the bedroom applicability guard, which
      // this endpoint was missing entirely. #2459 AC2 censused three submission boundaries and
      // this was not among them, so `bedroomApplicability`'s own stated invariant ("anything that
      // can put a bedroom constraint in front of the server calls shouldSubmitBedrooms first") was
      // FALSE for the anon path: a plot-only or commercial-only selection still emitted `bedrooms`,
      // and those shapes carry `bedrooms` NULL, so the query could only ever return nothing.
      //
      // GATED HERE, AT THE HOOK — deliberately ONE place rather than at
      // `buildCityListingsQueryParams` plus the four direct call sites. All six production call
      // sites funnel through this function, and this is the last point before the URL is built, so
      // a single gate cannot drift and any FUTURE call site inherits it. Gating five sites would
      // rebuild the "N sites, not N-1" shape that #2531 itself is a fix for, and #2527 asks for
      // "the same applicability predicate, not a second implementation".
      //
      // The predicate reads the selection this very request is about (`propertyType` +
      // `commercialSubtypes`), so it cannot disagree with what the request actually asks for.
      // `bedrooms` is NOT cleared from state or from the cache key — suppression is about
      // SUBMISSION, so switching back to a dwelling re-emits the buyer's value untouched.
      if (shouldSubmitBedrooms({ propertyTypes: propertyType, commercialSubtypes })) {
        bedrooms?.forEach((b) => params.append('bedrooms', String(b)));
      }
      propertyType?.forEach((t) => params.append('propertyType', t));
      // Issue #2531 — repeated param, PLURAL name (see the field's doc above). Same
      // empty-array-appends-nothing rule as the two axes above: "nothing selected" must
      // stay indistinguishable from "param absent", never become "match none".
      commercialSubtypes?.forEach((s) => params.append('commercialSubtypes', s));
      if (q?.trim()) params.append('q', q.trim());
      if (listingPurpose) params.append('listingPurpose', listingPurpose);
      if (readyToMove) params.append('readyToMove', 'true');
      // Issue #2015 — bbox-only "Search this area" viewport narrowing (or, when combined
      // with areaKeys, in-area viewport narrowing — existing behavior, unchanged).
      if (snappedBbox) params.append('bbox', snappedBbox.join(','));
      // Issue #1616: do NOT force skipAuth. When the user has a valid session the api
      // helper attaches the JWT (Bearer token) automatically, causing the backend to
      // return exact pricePaise. Anonymous callers have no session so no token is
      // attached and the backend returns a coarse priceBand string instead.
      return api.get<DiscoverCityListingsResponse>(
        `/api/discover/cities/${encodeURIComponent(city)}/listings?${params.toString()}`,
      );
    },
    // Issue #2189 — areaKeys resolving before `city` does previously let this fire
    // with an empty city segment (`/api/discover/cities//listings`, 401). Boolean(city)
    // mirrors the existing city-readiness idiom used by useAreasNavigationJourney.ts
    // and area.ts rather than introducing a second city-validity owner.
    // Issue #2015 — bbox-only mode: enabled when either areaKeys or a bbox is present
    // (the backend requires at least one; areaKeys.length === 0 alone no longer disables
    // the query when a bbox has been supplied instead).
    enabled: (areaKeys.length > 0 || snappedBbox != null) && Boolean(city),
    staleTime: DISCOVER_CITY_LISTINGS_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}
