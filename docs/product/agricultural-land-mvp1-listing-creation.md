# Agricultural Land Listing Creation — MVP1

**Status:** Draft
**Last updated:** 2026-06-06
**Owner:** Product / Engineering
**Milestone:** `M28 — Agricultural Land Listing Creation (MVP1)`
**Related:** `docs/product/agricultural-land-mvp2-discovery.md` (MVP2 — Discovery), `docs/MVP_SPEC.md`, `docs/adr/0001-postgis-adoption.md`, `docs/LISTING_STATE_TRANSITIONS.md`

> This is a product spec, not an implementation. It defines scope, journey, data, UX
> states, risks and open questions for MVP1. Implementation is tracked by the issues
> in milestone **M28**.

---

## 1. Product goal

Enable **brokers / owners / admin** users to create **agricultural land** listings by
entering agriculture-specific details and **drawing the plot boundary polygon** on a map.
The drawn boundary is persisted with the listing so that, in a later milestone (MVP2),
buyers can see the saved plot shape on the Discover map.

## 2. User story

> As a broker or owner,
> I want to create an agricultural land listing and draw the boundary of the land parcel,
> so that buyers can understand the shape, size, and location of the land before contacting me.

## 3. Scope boundary (read first)

- **Polygon drawing belongs to the listing-creation journey (this spec), NOT to buyer search.**
  Buyers never draw polygons. The MVP2 Discovery spec only *renders* the saved polygons.
- Agricultural Land is a **distinct listing type**, kept separate from the residential and
  school journeys. Existing residential/commercial listing flows must remain unaffected.
- **Production remains Postgres-first.** No OpenSearch dependency is introduced by MVP1.
  Geometry is stored in PostGIS (already adopted — ADR 0001).

## 4. Current architecture (post-inspection)

The feature builds on existing primitives; MVP1 is mostly reuse + additive fields.

| Concern | Existing asset | MVP1 impact |
|---|---|---|
| Listing creation wizard | `src/pages/broker/NewListing.tsx` → step 1 creates listing, then routes to `/broker/listings/{id}/edit?step=N` (`src/pages/broker/EditListing.tsx`). Step UI via `src/components/broker/StepIndicator.tsx`. | Add "Agricultural Land" type to the type selector; add a boundary-drawing step in the gated edit flow. |
| Listing field inputs | `src/components/broker/{AreaField,PriceField,AddressPicker,ImageUploader}.tsx` | Reuse `AreaField` (land area), `AddressPicker` (approx location); add agriculture-specific fields. |
| Polygon drawing primitive | `src/components/map/DrawControl.tsx` — `leaflet-draw`, **polygon-only**, emits `[lat, lng][]`, supports clear + external polygon sync. | **Reuse directly** for broker boundary drawing. No buyer-search wiring. |
| Map | `react-leaflet` + `leaflet.markercluster` (`src/components/map/PropertyMap.tsx`). | Reuse map container for the drawing step. |
| Listing entity | `backend/.../listing/core/Listing.java` → table `property_listings`. `property_type` is `varchar(30)` (enum → varchar via V61). Point location via generated `geog geography(Point,4326)` (V73). `land_area`/`area_sqm`/`area_cent` already normalized. | Add `AGRICULTURAL_LAND` to `PropertyType` enum (`backend/.../ai/PropertyType.java`); add agriculture columns + a `boundary geography(Polygon,4326)` column. |
| Listing create API | `backend/.../listing/api/ListingController.java` + `ListingCrudService`. | Accept agriculture fields + polygon geometry; validate server-side. |
| Spatial support | PostGIS extension live (ADR 0001, V73 GiST index). Latest migration **V83** → next free slot **V84+**. | New reversible expand migration adds nullable agriculture columns + polygon column + optional GiST index. |
| Listing lifecycle | `docs/LISTING_STATE_TRANSITIONS.md`, `ListingWorkflowService`, `ListingStatus`. | Agricultural listings follow the **same** status lifecycle (draft → submitted → approved). No new states. |

## 5. Core journey

1. User starts listing creation (`/broker/listings/new`).
2. User chooses listing type: **Agricultural Land**.
3. User enters agriculture-specific details (section 6).
4. User selects/searches the approximate location (reuse `AddressPicker`).
5. User opens the **boundary drawing** step.
6. User draws the plot-boundary polygon on the map (reuse `DrawControl`).
7. User can edit / clear polygon points before saving.
8. System validates the polygon (≥3 points, closed ring, no self-intersection, sane size).
9. System optionally calculates approximate area from the polygon (PostGIS `ST_Area`).
10. User previews the listing with the boundary overlay.
11. User submits the listing for review.
12. Backend stores listing details + polygon geometry (PostGIS).

## 6. Agriculture-specific fields

Fields to capture (final column names decided in the field-model issue):

| Field | Type | Notes |
|---|---|---|
| Total acres | number | Manually entered acreage; reconciled with polygon-derived area (section 9). |
| Price | money (paise) | Reuse existing `price_paise` / `PriceField`. |
| Price per acre | derived | Derived where both price + acreage known; labelled approximate. |
| Road access | enum/text | e.g. none / cart-track / tar road. |
| Water source | enum/text | e.g. borewell / open well / canal / river / none. |
| Soil type | enum/text | e.g. red / laterite / alluvial / unknown. |
| Current cultivation status | enum/text | e.g. fallow / paddy / areca / coconut / mixed. |
| Ownership type | enum/text | e.g. single owner / joint / patta. |
| Nearby village / locality | text | Reuse locality/area normalization. |
| Survey number | text (optional) | Free text only — **no** automatic validation in MVP1. |
| Boundary accuracy disclaimer | static copy | Always shown (section 7). |

## 7. Required UX copy

> **The boundary drawn on the map is approximate and should be legally verified before purchase.**

This disclaimer is shown on the drawing step, in the preview, and stored intent is that
MVP2 surfaces the same disclaimer in the buyer panel.

## 8. UX states

- **Type not yet agricultural** → agriculture fields + boundary step hidden.
- **Drawing — empty** → map with draw tool active, helper text, disclaimer; submit disabled until valid.
- **Drawing — in progress** (<3 points) → cannot complete polygon; inline hint.
- **Drawing — valid polygon** → polygon overlay shown; "Clear" available; approx area shown if computed.
- **Validation error** (self-intersecting / too small / too large) → inline error, polygon rejected, user re-draws.
- **Preview** → read-only boundary overlay + all fields + disclaimer.
- **Submit success** → listing created in draft/submitted state per existing lifecycle.
- **Mobile** → drawing usable on touch; controls reachable; map height adapts.
- **No-geometry path** → a broker may still create an agricultural listing with point location only (polygon optional in MVP1); MVP2 provides a marker fallback for such listings.

## 9. Approximate area calculation

- Compute polygon area server-side via PostGIS (`ST_Area(boundary)` on the geography),
  convert m² → acres/cents for display.
- Manually entered acreage and polygon-derived area are **both** retained and **clearly
  labelled** ("entered" vs "approx. from boundary"). MVP1 does not force them to match.

## 10. MVP1 non-goals

- No buyer / searcher polygon drawing.
- No advanced GIS editing (vertex snapping, multi-polygon, holes).
- No legal land-record verification.
- No automatic survey-number validation.
- No satellite / terrain base-layer requirement (only if trivially available).
- No OpenSearch dependency.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Polygon self-intersection / invalid geometry persisted | Server-side validation (`ST_IsValid`), reject + safe error; client `allowIntersection:false`. |
| Type proliferation breaks residential flows | `AGRICULTURAL_LAND` added additively; existing type branches untouched; regression tests. |
| Entered acreage vs drawn area mismatch confuses users | Label both, never silently overwrite. |
| Touch drawing usability on mobile | Explicit mobile usability acceptance criterion + manual check. |
| Migration risk on `property_listings` | Expand-only, nullable columns, reversible; follow ADR 0001 no-transaction pattern for any concurrent index. |

## 12. Open questions

1. Is the polygon **required** for an agricultural listing in MVP1, or optional with point fallback? (Spec assumes optional; MVP2 has fallback.)
2. Are agriculture field option lists (water source, soil type, etc.) free-text or controlled enums for MVP1?
3. Should `AGRICULTURAL_LAND` reuse existing `land_area`/`area_cent` columns or get acre-native storage?
4. Does the approximate-area calc run on submit, on save, or on render?
5. Coordinate precision: `DrawControl` currently rounds to 4 dp (~11 m) — acceptable for MVP1?

## 13. Issue map (milestone M28)

| # | Issue | Primary labels |
|---|---|---|
| 1 | define agricultural listing creation product spec | enhancement, product, agri |
| 2 | add agricultural listing type and field model | enhancement, backend, frontend, agri |
| 3 | design broker plot-boundary drawing flow | enhancement, frontend, agri |
| 4 | persist agricultural plot polygon geometry | enhancement, backend, agri |
| 5 | calculate and expose approximate polygon area | enhancement, backend, agri |
| 6 | tests for agricultural listing creation with polygon boundary | test, agri |
