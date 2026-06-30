# Architecture Decision Record: Typed Listing Detail Data Capture

**ADR ID:** M38-03 (issue #1624)
**Status:** Proposed (architecture/recommendation only — DOCS-ONLY, zero production code, schema, DTO, form, or AI changes)
**Author:** Architect (Mode-3 execution, opus)
**Date:** 2026-06-30
**Decision owner:** Product/Eng lead (HYBRID persistence model is USER-BINDING per PLAN_REVIEW revision-1)
**Related:** `docs/architecture/listing-description-ai-deployment.md` (AI deployment ADR — the AI-boundary section here aligns with and references it, never duplicates it); `docs/research/listing-field-benchmark-m38.md` (#1681 prior research input — reusable, not authoritative)

---

## Status / Context / Decision / Consequences (outer frame)

**Status:** Proposed. This ADR records the *target* model. It creates no tables, entities, DTOs, forms, AI code, or migrations. Implementation is sequenced as follow-up issues (M38-FU1…FU7, §16).

**Context:** Milestone M38 introduces rich, property-type-specific listing capture (residential apartment/house/villa/plot; commercial shop-showroom/office/building/warehouse/land; agricultural land) per three approved Claude Design source files (#1622 residential, #1683 commercial, #1623 agricultural). The current backend stores every listing in **one wide all-optional table** (`property_listings`), with a matching all-optional DTO and frontend mirror type. Pushing M38's richer per-type fields into that flat shape would multiply null-column sprawl and provides no per-type integrity. We need a persistence/API/validation/frontend model that captures materially different property types correctly without recreating null sprawl, plus a public-detail composition policy and an AI description boundary.

**Decision (summary):** Adopt a **HYBRID typed-table persistence model** — a shared `listing_core` plus per-family/per-shape detail tables, a discriminator only where subtypes genuinely share a shape, and child join tables for multi-valued sets. Expose it through **one resource path with family-typed discriminated-union DTOs** (not one giant all-optional DTO). Enforce correctness with **discriminator-driven Bean Validation groups in Spring** plus DB NOT NULL/CHECK for integrity. Drive the frontend from a **per-property-type field config** mapped 1:1 to the hybrid tables. Compose the public detail page from **only-applicable, populated fields** with derived (never stored) price/yield and **no fake verification badges**. Keep AI strictly to **editable draft text from confirmed facts**.

**Consequences:** Correct per-type capture and integrity; clean OpenSearch projection; an additive, reversible expand/contract migration path. Costs: more tables and a discriminated DTO/validation layer to build (sequenced as FUs), and a dual-read/dual-write window during migration. Rejected: the 3-family-table model (recreates null sprawl) and the full ~14 per-subtype-table model (over-fragmented for this stage). See §3–§4 and the Tradeoff Records at the end.

---

## 1. Current architecture summary (cited)

The system is **effectively at "Option C — one large nullable table" today.** All listing data lives in a single wide JPA entity and a single all-optional request/response shape.

### 1.1 Persistence — one wide all-optional entity

`backend/src/main/java/com/example/realestate/listing/core/Listing.java` maps the `property_listings` table (`@Entity @Table(name = "property_listings")`, Listing.java:25–27) and holds shared + commercial + rent + agricultural fields together as nullable columns:

- **Type/shared:** `propertyType` (a free string defaulting to `"other"`, Listing.java:36–37); price (`pricePaise`, Listing.java:59–60; deprecated `price`, :52–53); `landArea`/`builtArea`/`carpetArea` + units; normalized/derived area columns (`areaSqm`/`areaSqft`/`areaCent`/`pricePerCentPaise`, Listing.java:81–104); `bedrooms`/`bathrooms` (Listing.java:106–110).
- **Commercial & rent (Listing.java:174–219):** `listingPurpose` (default `"sale"`), `carpetArea`/`carpetAreaUnit`, `floorNumber`, `totalFloors`, `furnishingStatus`, `washrooms`, `parkingCount`, `roadFrontageFt`, `commercialUsage`, `numberOfUnits`, `monthlyRent`, `securityDepositMonths`, `lockInMonths`.
- **Agricultural (Listing.java:223–248):** `waterSource`, `soilType`, `roadAccess`, `cultivationStatus`, `ownershipType`, `surveyNumber`, `landCategory`, `farmhouseAvailable`, `fencingDone`.
- **Computed/system (written only by pipelines, not brokers):** `trustTier` (Listing.java:257–258), `qualityScore`/`qualityBreakdown`/`qualityComputedAt` (Listing.java:268–287), `rankingScore` (Listing.java:294–295).

Every M38 property-type-specific field (carpet vs built-up vs plot area, BHK, floors, suitable-uses, washroom/parking private/public split, agri shape/access/records, crops, etc.) is irrelevant to most rows, so adding it here means more always-null columns.

### 1.2 Create / edit / submit flow — one all-optional DTO

`backend/src/main/java/com/example/realestate/listing/api/ListingController.java`:

- **Create:** `POST /api/listings` → `CreateRequest` record → `listingCrudService.createDraft(...)` (ListingController.java:72–103). The `CreateRequest` record (ListingController.java:377–414) is a flat all-optional shape mixing shared + commercial/rent + agri fields.
- **Edit:** `PUT /api/listings/{id}` → `UpdateRequest` record → `updateListing(...)` (ListingController.java:157–200), accepting the nullable agri polygon `boundary` (ListingController.java:187). The `UpdateRequest` record (ListingController.java:416–465) is likewise flat all-optional (adds RERA/possession + boundary).
- **Submit:** `POST /api/listings/{id}/submit` (ListingController.java:231–245) gates on address-confirmed + image count.
- **Agri validation today** is a controller-side set-membership check on five free-text agri fields against `AgriFieldOptions` (`validateAgriFields`/`rejectIfUnknown`, ListingController.java:347–366) — the only per-type backend validation that exists, and it covers only those five agri strings.

The frontend mirrors this flat shape: `src/hooks/useBrokerListings.ts:5–43` declares `CreateListingRequest` with `propertyType` plus ~30 optional fields ("Mirrors backend CreateRequest DTO").

### 1.3 Public detail — JWT-aware, controller-composed

`backend/src/main/java/com/example/realestate/listing/api/PublicListingController.java`: `GET /api/public/listings/{id}` is JWT-aware (PublicListingController.java:73–91). Authenticated callers get the full `ListingResponse` (40+ fields, `ListingResponse.java:10–103`); anonymous callers get the minimal `ListingTeaserResponse` (`ListingTeaserResponse.java:44–71`, agri-only extras populated for agri and omitted via `@JsonInclude(NON_NULL)` otherwise). Non-LIVE listings 404. **`computedAreaAcres` is DERIVED on the read path** from the PostGIS `boundary` via `ST_Area(...)/4046.8564224`, rounded 2dp, and is explicitly distinct from broker-declared `landArea` (ListingResponse.java:89–97). The frontend detail type `PublicListingDetail extends Partial<ListingResponse>` (`src/pages/ListingDetail.tsx:36–76`) — i.e. every field optional client-side too.

### 1.4 Enums — partly only in frontend literals

`src/lib/listing-constants.ts:1–32` defines 8 `PROPERTY_TYPES` (`land`, `agricultural_land`, `apartment`, `house`, `commercial`, `commercial_building`, `warehouse`, `commercial_land`), groups four as `COMMERCIAL_TYPES`, and lists `FURNISHING_OPTIONS`. `listingPurpose` is `sale|rent` today; the approved commercial design adds a third `lease`. Agri field enums (`waterSource`, `landCategory`, etc.) exist as TS literal arrays in `NewListing.tsx` with **no matching backend enum class** (string-drift risk).

### 1.5 Indexing — outbox-async (already non-blocking)

Search indexing is **outbox-based and asynchronous** (#1344, local-first; not synchronous on the write path). On create/update the service writes a minimal outbox event via `searchOutboxWriter.writeEvent(...)`: `LISTING_CREATED` at `ListingCrudService.java:219–224` and `LISTING_UPDATED` at `ListingCrudService.java:493–498` (payload = `listingId`, `eventType`, `operation`, `status`, `updatedAt` — no sensitive fields). An async poller drains the outbox. The concrete index document is `backend/src/main/java/com/example/realestate/search/indexer/ListingIndexDocument.java` — an **explicit 17-field allowlist** (ListingIndexDocument.java:23–52) built field-by-field in `fromListing(Listing)` (ListingIndexDocument.java:62–85), deliberately excluding private fields. (Note: the OpenSearch *query* adapters live in `com.example.realestate.discover.opensearch`; the *index document/mapper* lives in `com.example.realestate.search.indexer` — located directly for this ADR.)

---

## 2. Problems found

1. **Null sprawl + no per-type integrity.** One wide entity/DTO mixes residential, commercial, rent, and agricultural fields (Listing.java:174–248; CreateRequest ListingController.java:377–414). Irrelevant fields are always-null for most rows; nothing guarantees a plot has no BHK, a shop has no BHK, a warehouse has no office seats, or that rental terms appear only when `purpose ∈ {rent, lease}`.
2. **Validation is implicit/by-convention.** The only per-type backend rule is the five-string agri membership check (ListingController.java:347–366). There is no property-type-aware required/forbidden-field enforcement.
3. **Enum drift.** Agri (and some commercial) enums live only as frontend TS literals with no backend enum/validation class (listing-constants.ts plus `NewListing.tsx` literals) — values can drift between client and server.
4. **No documented public-detail field-presence contract.** Teaser-vs-full and per-type nullability is controller-side only (PublicListingController.java:73–91; ListingTeaserResponse.java:44–71), undocumented as a contract.
5. **Declared vs computed area conflation risk.** `computedAreaAcres` is derived on read (ListingResponse.java:89–97) but the model has no first-class separation between broker-declared land area and boundary-derived area as canonical-vs-secondary.
6. **M38 richness is not representable** (subtypes, private/public splits, suitable-uses, amenities, land records, location features, crops) without further null-column sprawl in the flat shape.

---

## 3. Options considered (persistence)

The issue framed three persistence shapes. We evaluate the per-type-table family against them.

| Option | What it is | Fits when | Cost / risk | Verdict |
|--------|-----------|-----------|-------------|---------|
| **B — single JSONB blob** | Detail fields in one `jsonb` column | Truly schemaless, throwaway data | Loses DB constraints, typed indexing, and a clean search projection; contradicts the durable-canonical-path preference and the outbox indexer's field-by-field mapping | ❌ Rejected |
| **C — one wide nullable table (current)** | Today's `property_listings` | MVP with one property type | Null sprawl, no per-type integrity, enum drift (see §2) | ❌ Rejected (status quo we are leaving) |
| **3-family tables** | `listing_residential_details` / `listing_commercial_details` / `listing_agricultural_details` | Subtypes within a family share one shape | Collapses materially different subtypes (plot vs unit; warehouse vs office/shop; commercial-land vs building) into one table → recreates many nullable subtype-only columns = **the same null-sprawl problem** | ❌ Rejected (see §4) |
| **Full ~14 per-subtype tables** | One table per property type | Every subtype's shape/lifecycle diverges | Over-fragmented for current stage; needless migration + join overhead where subtypes genuinely share a shape (apt/house/villa; shop/office) | ❌ Rejected for now (see §4) |
| **HYBRID typed tables** | `listing_core` + per-family/shape detail tables + discriminator where shapes overlap + child join tables | Some subtypes share a shape, others diverge materially | More tables than 3-family; fewer than full per-subtype; needs discriminated DTO + validation | ✅ **Recommended (USER-BINDING)** |

The DesignSync source inventory (§8) confirms exactly the sharing/divergence boundaries the hybrid model splits on (`isResidence`/`isHV` vs distinct plot; shared shop/office washroom-parking-split/hub vs distinct building/warehouse/land cores). Options B/C are dominated by the table-based options on correctness and integrity.

---

## 4. Recommended persistence model — HYBRID typed-table (RECOMMENDED, user-binding)

All three table-granularity options are presented below per the decision requirement; the HYBRID model is the recommended, user-binding canonical path.

### 4.1 (a) 3-family-table model — REJECTED

`listing_residential_details` / `listing_commercial_details` / `listing_agricultural_details`. **Rejected** because it collapses materially different subtypes into one table per family: a residential **plot** has no BHK/bath/furnishing/parking but the residential unit does; a **warehouse** (clearHeight/loadingBays/flooring) shares almost nothing with an **office** (seats/cabins/meeting); **commercial land** has no utilities accordion at all. Forcing these into one table per family reintroduces large blocks of nullable subtype-only columns — i.e. it recreates the very null-sprawl problem being solved (§2.1).

### 4.2 (b) Full ~14 per-subtype-table model — REJECTED for now

One table per property type (apartment, house, villa, plot, shop, office, building, warehouse, commercial-land, agri-land, …). **Rejected for the current stage** as over-fragmented: apartment/house/villa genuinely share the residential-unit shape, and shop/showroom/office genuinely share the commercial-space shape (per source). Splitting those into separate tables adds migration, join, and mapper overhead with no integrity benefit. Revisit only if a shared subtype later diverges materially.

### 4.3 (c) HYBRID typed-table model — RECOMMENDED

**Splitting principle:** *Create a separate table when the subtype has a materially different **shape** or **lifecycle**. Use a **discriminator** only where subtypes genuinely share most fields. Use **child join tables** for multi-valued sets.* The DesignSync source confirms these boundaries (§8, §10 cross-file notes).

**Canonical table set (verbatim):**

1. **`listing_core`** — shared columns: `id`, `listingFamily` ∈ {`RESIDENTIAL`, `COMMERCIAL`, `AGRICULTURAL`}, `propertyType` discriminator, `listingPurpose`, `locality`, `title`, price/negotiable, `status`, media/location FKs, audit.
2. **`listing_residential_unit_details`** — apartment/house/villa shared built-property shape, **residential-unit subtype discriminator** + validation (apartment: floor/totalfloors/balcony; house/villa: floors/age/plotarea; shared: bhk/bath/furnishing/facing/parking/features).
3. **`listing_residential_plot_details`** — residential plots (distinct shape: plotdim/roadwidth/facing + plot-feature toggles; no unit fields).
4. **`listing_commercial_space_details`** — shop/showroom + office shared space shape, **`commercialSubtype` discriminator** + validation (shared: area/floorChoice/washroom-parking-split/hub/visibility; office-only: seats/cabins/meeting/conference/furnishing/staircases/facilities — nullable, group-gated).
5. **`listing_commercial_building_details`** — floorMode/occupancy/powerLoad/approving (distinct from space).
6. **`listing_warehouse_details`** — clearHeight/loadingBays/truckAccess/flooring/officeRoom/powerLoad (distinct).
7. **`listing_commercial_land_details`** — zoning/ownership/approving/siteRef (distinct; no utilities).
8. **`listing_agricultural_land_details`** — agri is its own family (shape/access/boundary/water/cultivation scalar fields).
9. **`listing_rental_terms`** — **SHARED**, populated when `listingPurpose ∈ {rent, lease}` (residential rent + commercial rent/lease: rent/deposit/maintInc/availability/lockin + family-specific cols).
10. **`listing_ownership_details`** — **SHARED**, where ownership/document fields apply (residential sale + plot + commercial sale + agri records).
11. **Child / join tables for multi-valued sets:** `listing_amenities` (residential society/community + commercial utilities + residence/plot feature toggles), `listing_suitable_uses` (commercial `suit`), `listing_location_features` (residential special-location/views + agri features), `listing_nearby_pois` (all families), `listing_media` (photos + video); plus (optionally) agri **crops** as a child set (`agri_crops` or an `listing_amenities`-style code table).

**Trade-offs.** Vs 3-family: more tables, but each table is shape-coherent (few or no always-null columns) and integrity-enforceable. Vs full per-subtype: fewer tables and no needless splits where shapes overlap; one discriminator each on the two genuinely-shared shapes (residential-unit, commercial-space). Cost: a discriminated DTO + per-type validation layer and the expand/contract migration (§14).

### 4.4 Validation enforcement (the integrity contract)

- **Discriminated DTOs** — Jackson `@JsonTypeInfo` on `listingFamily`; `propertyType` discriminator inside the family DTO (§5).
- **Property-type-aware backend validation** — Bean Validation groups keyed by `propertyType` in the Spring service layer (§6).
- **DB NOT NULL** where a column is common to that detail table (e.g. the primary area column per shape).
- **DB CHECK** where practical — enum domains, non-negative numerics, purpose-gated rental terms.
- **Public-detail mappers** per table that expose **only the fields applicable** to that property type (§11).
- No business rules in Supabase RLS/Postgres functions (Spring owns business logic).

---

## 5. Recommended API / DTO model

**One resource path with family-typed discriminated-union bodies.** Keep `POST /api/listings` and `GET /api/listings/{id}` (and the public detail path), but replace the flat all-optional `CreateRequest`/`UpdateRequest` (ListingController.java:377–465) with a discriminated union:

- A shared **core envelope** (locality, title, price/negotiable, media/location, `listingPurpose`) plus a typed **`details`** object.
- `@JsonTypeInfo` on `listingFamily` selects `ResidentialListingRequest` / `CommercialListingRequest` / `AgriculturalListingRequest`; the `propertyType` discriminator inside the family DTO selects the concrete shape (e.g. residential-unit vs plot; shop/office vs building/warehouse/land).
- Response DTOs mirror the request union; the public path composes per §11.

This **avoids the giant all-optional DTO** (the current failure mode) **and endpoint sprawl** (a separate endpoint per type). Rejected: a single all-optional DTO (no type safety; the status quo) and fully separate per-type endpoints (route sprawl, duplicated cross-cutting concerns). **Backward-compatible if** today's flat API is treated as a superset shape during the dual-write window (§14): legacy clients continue to send the flat body, which maps onto the union by `propertyType`.

---

## 6. Recommended validation model

**Discriminator-driven Bean Validation groups, family → propertyType, enforced in Spring.**

- The family selects the DTO subtype (Jackson); **Bean Validation groups keyed by `propertyType`** (`Apartment.class`, `House.class`, `Villa.class`, `Plot.class`, `Shop.class`, `Office.class`, `Warehouse.class`, `Building.class`, `CommercialLand.class`, `AgriLand.class`) express per-type required/forbidden fields **declaratively** (e.g. plot has no BHK; shop has no BHK; warehouse has no office seats).
- A thin per-family `@Validated` service path handles **cross-field/derived rules**: rental terms only when `purpose ∈ {rent, lease}`; gross-yield computable only when price + current rent are both present; broker-declared area is never overwritten by computed area.
- All business validation lives in **Spring**. DB constraints are limited to integrity (NOT NULL on common columns; CHECK for enum/non-negative/purpose-gating). **No validation in RLS or Postgres functions.**
- Fix the enum-drift (§2.3) by introducing backend enum/validation classes for the agri (and commercial) fields currently only in frontend literals — sequenced as **M38-FU7**.

---

## 7. Recommended frontend form model

**Per-property-type field config (typed schemas) consumed by one shared form renderer, mapped 1:1 to the hybrid detail tables.** A declarative field-config map keyed `family → propertyType` matches the design tree:

```
Residential { Apartment, House, Villa, Plot }
Commercial  { Shop-Showroom, Office, Building, Warehouse, Land }
Agricultural{ Land }
```

The config mirrors the design source's type-adaptive field arrays (`isResidence`/`isHV`, `ctype` branches, `hasUtilities` gate, `isRL`/`isSale` gating) and is the **single source of truth** for both render and client-side validation. Shared sections (location, price, photos, video, map, description, rental terms when `purpose ∈ {rent, lease}`) are common components; type-specific sections come from config. **Reject one giant conditional JSX form.** Config grouping aligns 1:1 with the hybrid tables: residential-unit config → `listing_residential_unit_details`; plot config → `listing_residential_plot_details`; shop/office config → `listing_commercial_space_details`; building/warehouse/land each own config → their detail tables; amenities/suit/features/POIs/media → the child tables.

---

## 8. Design inventory — residential / commercial / agri split (authoritative, from source)

Read from the full React/Babel **source** of the three approved Claude Design files via DesignSync (project `f3796631-064b-4956-94ba-14baa7af9bcf`; `ui_kits/buyer/create-{residential,commercial,agricultural}-listing.html`, #1622/#1683/#1623), each in full. Because the files are single-file React apps, every type's fields and every accordion's enums are in the JS source — **inventory complete, no GAPs** (no invented fields). `required` below = membership in the per-form soft publish-gate (`miss[]`) array; there is no hard form validation. Enums are quoted verbatim.

**Soft publish-gate (`miss[]`):** residential = ≥1 photo, location pinned, description ≥20 chars, price(sale)/monthly rent(rent), primary area for the type. commercial = same + ≥1 business use (`suit`). agricultural = ≥1 photo, pinned, description ≥20, total price, land area, village/locality. Everything else is optional (many fields UI-labelled "(optional)").

### 8.1 Residential

**Apartment** (`ptype=apartment`; purpose `sale|rent`, no lease). Required(soft): carpet area + price/rent + photo + pin + desc.
- carpet area + `areaUnit` `['Sq.ft','Sq.m','Sq.yd','Cents','Acre']`; `bhk` `['1','2','3','4','5+']`; `bath` `['1','2','3','4+']`; `balcony` `['0','1','2','3+']`; `floor` (numeric); `totalfloors` (numeric); `furnishing` `['Unfurnished','Semi-furnished','Furnished']`; `facing` `['East','West','North','South','NE','NW','SE','SW']`.
- Sale: price, negotiable, `propStatus` `['Ready to move','Under construction']` (+possession text if under-construction), `ownership` `['Freehold','Cooperative society','Leasehold','Power of attorney']`, RERA id (shown-as-entered, unverified).
- Rent: rent, deposit, negotiableRent, `maintInc` `['Included','Excluded']`, `availability` `['Immediate','Within 15 days','Within 30 days','After 30 days']`, minterm, lockin, `tenants` `['No preference','Family','Students','Professionals','Company lease']`, petsAllowed.
- More-details accordion (opt): builtup, superbuiltup, park2w/park4w `['0','1','2','3+']`, features `[lift, power, gated]`, amenities `['Clubhouse','Gym','Swimming pool','Play area','24x7 security','Park','Intercom','Rainwater harvesting']`, maint, builder.

**House / Villa** (`ptype=house|villa`, share `isHV`). Primary area = `builtup` "Built-up area" (required soft). Same bhk/bath/furnishing/facing as apartment.
- Differences vs apartment: `floors` chips `['Ground','G+1','G+2','G+3','G+4+']` instead of floor/totalfloors; **no balcony**; adds `age` `['New / under 1 yr','1-5 years','5-10 years','10+ years']`.
- More-details (opt): plotarea, park2w/park4w, `water` `['Municipal','Borewell','Both']`, features `[garden, terrace, compound, servant, gated]`, amenities `['Clubhouse','Park','24x7 security','Play area','Gym','Power backup']`, views (special-location enum).

**Plot** (`ptype=plot`) — **materially distinct shape.** Primary area = `plotarea` (required soft). No bhk/bath/furnishing/parking/society-amenities.
- Fields: `plotdim` "Plot dimensions" (opt), `roadwidth`, `facing` (8-dir enum). Plot-feature toggles: `corner`, `boundary`(wall), `gatedLayout`, `waterConn`, `elecConn`, `drainage`. `views` multi "Special location" (broker-declared, unverified).
- Ownership & document section (all opt, broker-entered/unverified): `ownership` (same enum), `conversion` `['Not converted','DC converted','Residential zone','Not sure']`, `ownAuthority` (BDA/DTCP), `khata`, `taxref`, `surveyref`, RERA.

### 8.2 Commercial (purpose `sale|rent|lease`)

**Shop / showroom** (`ctype=shop`). Required(soft): carpet area + price + ≥1 `suit` + photo + pin + desc.
- Core: carpet area + `areaUnit` `['Sq.ft','Sq.m','Sq.yd','Acre']` (no Cents); optional builtup; frontage; totalfloors(opt); `floorChoice` `['Ground floor','First floor','Upper floor','Multiple floors']`.
- `suit` (≥1) `['Retail','Showroom','Grocery','Pharmacy','Clinic','Salon','Restaurant / cafe','Food outlet','Footwear','Electronics','Jewellery','Other']`.
- Access: roadfrontage, roadwidth, visibility toggles `[mainroad, corner, signage, lift]`, `hub` `['Mall','High street','Retail complex','Standalone building']`; washroom split (`hasWash` → washPrivate/washPublic `['0','1','2','3','4+']`); parking split (`hasPark` → parkPrivate/parkPublic). Utilities/amenities accordion (shared — see Utilities).

**Office** (`ctype=office`). Shares with shop: carpet area, washroom/parking split, `hub` `['Business park','IT park','Commercial complex','Standalone building']`, utilities accordion.
- Office-specific core: `seats`, `cabins`, `meeting`, `conference`, `furnishing` `['Unfurnished','Semi-furnished','Furnished','Plug-and-play']`. Access: `floorChoice` (same 4), totalfloors + `staircases`; facilities toggles `[lift, reception, pantry, ac, internet, power]`. `suit` `['Office','Co-working','Coaching / training','Studio','Clinic','IT / tech','Back office','Other']`.

**Commercial building** (`ctype=building`) — **distinct shape.** Primary area = `totalbuiltup` "Total built-up area"; optional plotarea.
- `floorMode` "Available floors" `['GF only','GF + 1','Multiple floors','Whole building','Custom']` (+floorCustom text if Custom); totalfloors(opt); `occupancy` `['Vacant','Partly occupied','Fully occupied']`. Access: roadwidth, roadfrontage, powerLoad(opt), lift, power; washroom/parking split; `approving` "Fire safety / approvals" (opt, unverified). Utilities accordion shared. `suit` `['Retail','Office','Showroom','Mixed-use','Hospitality','Institutional','Clinic / healthcare','Other']`.

**Warehouse / godown** (`ctype=warehouse`) — **distinct shape.** Primary area = `wbuiltup` "Built-up area"; optional landarea.
- Warehouse-specific: `clearHeight`, `loadingBays`, `truckAccess`(toggle). Access/infra: roadwidth, powerLoad; on-site toggles `[officeRoom, power, cctv, security]`; `toilets`(numeric); `flooring` `['Concrete / RCC','Trimix','Epoxy coated','Kota / tiled','Other']`. **No hub.** Utilities accordion shared. `suit` `['Storage','Logistics','Distribution','Light industrial','Cold storage','E-commerce fulfilment','Other']`.

**Commercial land / plot** (`ctype=land`) — **distinct;** `hasUtilities=false` (no utilities/amenities accordion), no residential fields. Primary area = `landarea`.
- Land-specific: roadwidth, roadfrontage, `facing`(8-dir). Toggles: `corner`, `boundary`(wall). `zoning` "Zoning / permitted commercial use"; `ownership` `['Freehold','Leasehold','Power of attorney','Other']`; `approving`(opt); `siteRef`(opt). `suit` `['Retail','Office','Showroom','Warehouse','Mixed-use commercial','Hospitality','Other']`.

**Utilities & amenities accordion** (shared by shop/office/building/warehouse; **absent for land**). Toggle enum: `power` "Power backup", `dg` "DG availability", `water` "Water storage", `internet` "Internet connectivity", `cctv` "CCTV surveillance", `security` "Security personnel", `cafeteria` "Cafeteria / food court", `reception` "Reception area", `fire` "Fire extinguishers", `ac` "Central air conditioning". Plus `powerLoad`(opt) text, `dgCharges` toggle "DG / UPS charges included".

**Commercial terms.** Rent/Lease (`isRL`): rent|lease amount (required), deposit, negotiableRent, leaseTenure, lockin, `maintInc` `['Included','Excluded']`, availFrom (same 4 as residential), notice(opt), fitout(opt). Sale: price (required), negotiable, ownership, occupancy (if not building) | taxInc (if building); **investment block (SALE-only, opt):** currentRent, leaseDuration, **grossYield DERIVED** (= currentRent*12/price*100, labelled "Derived", not guaranteed), taxInc; docref (opt, not land, unverified).

### 8.3 Agricultural land (single type; sale-only, no purpose toggle)

Required(soft): total price + land area + village/locality + photo + pin + desc. **Enums (verbatim):**
- `FACING = ['East','West','North','South','North-East','North-West','South-East','South-West','Not sure']`
- `POSSESSION = ['Immediate','Within 30 days','Later','Not sure']`
- `ROADACCESS = ['Direct road','Mud road','Internal path','No road access','Not sure']`
- `FENCING = ['Fully fenced','Partly fenced','Not fenced','Not sure']`
- `TERRAIN = ['Flat','Gently sloped','Sloped','Mixed','Not sure']`
- `WATER = ['Borewell','Open well','Pond','Stream','Canal','None','Other','Not sure']`
- `YN = ['Yes','No','Not sure']`
- `CROPS = ['Paddy','Coconut','Areca / supari','Cashew','Banana','Sugarcane','Vegetables','Mango','Rubber','Pepper','Mixed plantation','Fallow / open']`
- `FEATURES = ['Coastal','Riverside','Backwater-facing','Roadside','Near village road','Near highway','Near temple / landmark']`
- `areaUnit = ['Acre','Cent','Gunta','Sq.ft']`

Sections:
- **Sec2:** area+areaUnit, price, negotiable, derived per-acre/cent/sqft, possession, facing.
- **Sec3 shape/access:** length, width, roadWidth (numeric, opt), roadAccess, fencing, terrain, `openSides` `['1','2','3','4']`(opt), corner(toggle), vehicle "Vehicle access to plot"(toggle).
- **Sec4 water/cultivation accordion (opt):** water(enum), irrigation(YN), electricity(YN), `soil` `['Red soil','Black / cotton soil','Laterite','Sandy','Loamy','Clay','Alluvial','Mixed','Not sure']`, cultivation(text), crops(multi), farmhouse(toggle), trees(toggle).
- **Sec5 location features:** features(multi, broker-declared/unverified).
- **Sec6 land-record accordion (opt, BROKER-ENTERED, never verification booleans — source banner: "We never display 'title verified' or 'records verified'"):** `ownership` `['Single owner','Joint / family','Inherited','Power of attorney','Other']`, survey, rtc, `landCategory` `['Agricultural','Dry land','Wet land','Garden land','Plantation','Not sure']`, `conversion` `['Not converted','Conversion applied','Approved for conversion','Not sure']`, boundaryDesc(text).
- **Sec7 media/map:** photos (≤6, cover), map pin + boundary draw → DERIVED acreage (not stored input, not publish-gating), video(opt), nearby POIs (derived + broker-added, flagged).

**Cross-file (all three):** 6-tile photo grid with cover; map-pin + derived "Nearby places" with per-POI hide + manual broker-added (flagged, unverified); AI description from entered fields only (never invents); listing-strength meter + soft publish-gate; review/preview mirroring the public detail page; honest trust panel using only real signals (photos/cover/pin/description/broker-confirmed/verified-broker) — **no ownership/document verification badges anywhere.** Area-unit value spaces differ per family (residential has Cents + no Gunta; commercial no Cents; agri has Cent + Gunta). Facing identical across residential/commercial (8-dir); agri adds "Not sure". Per-family POI category enums differ. **Residual GAPs: NONE.**

---

## 9. Commercial modelling decisions (every question a–g answered)

- **(a) Shared vs separate tables.** Shop/showroom + office **SHARE** `listing_commercial_space_details` with a `commercialSubtype` discriminator (source confirms shared area/floorChoice/washroom-parking-split/hub; office-only seats/cabins/meeting/conference/furnishing/staircases/facilities are nullable cols gated by validation groups). Building, warehouse, and commercial-land are **SEPARATE tables** (materially different shapes per source).
- **(b) Multi-floor handling.** Use the design's categorical fields: shop/office `floorChoice` `['Ground floor','First floor','Upper floor','Multiple floors']`; building `floorMode` `['GF only','GF + 1','Multiple floors','Whole building','Custom']` (+floorCustom). Store as enum column(s) + nullable `totalfloors`. No per-floor join table now; add `listing_commercial_floors` only if per-floor price/area is later required.
- **(c) Washrooms & parking.** **PRIVATE/PUBLIC split** (source: washPrivate/washPublic, parkPrivate/parkPublic chip counts `'0'..'4+'`), modelled as nullable int pairs with a **derived total at read** (not a stored total).
- **(d) Commercial usage.** `suitableUses` = multi-valued controlled list (**child table `listing_suitable_uses`**) + free-text **Other** — source has a per-subtype `suit` enum with an explicit "Other". Not free-text-only, not a single enum. The enum domain is subtype-scoped (validated by group).
- **(e) Amenities.** **Child join table `listing_amenities`** with a code domain — the utilities/amenities toggle set (power/dg/water/internet/cctv/security/cafeteria/reception/fire/ac) is open-ended and an OpenSearch facet candidate; not individual boolean columns. Absent for commercial-land (`hasUtilities=false`).
- **(f) Current rent / lease on the sale path.** Investment fields on the sale path: `currentRent` + `leaseDuration` (+ `taxInc`) stored as nullable on `listing_commercial_space_details`/`listing_commercial_building_details` (broker-entered, SALE-only per source). Rent/lease **operating terms** (rent|lease amount, deposit, leaseTenure, lockin, maintInc, availFrom, notice, fitout) live in the **SHARED `listing_rental_terms`** table when `purpose ∈ {rent, lease}`.
- **(g) ROI / gross yield.** `grossYield` is **DERIVED at read** (source: currentRent*12/price*100), **never broker-entered, never stored**, labelled "Derived", **never "guaranteed".**

---

## 10. Agricultural modelling decisions (every question a–k answered)

- **(a) Shape/access/boundary split?** Keep shape/access/boundary **together** on `listing_agricultural_land_details` (single design family, one cohesive section set). Do **not** pre-split into a separate access table; revisit only if access grows independently.
- **(b) Declared vs computed area.** Store **BOTH separately:** declared land area + `areaUnit` (broker truth, publish gate) **and** nullable `computedAreaAcres` (boundary-draw derived; source shows a "Derived" badge — not stored input, not publish-gating). **Declared is canonical; computed never overwrites it** (consistent with ListingResponse.java:89–97).
- **(c) Dimensions.** Structured optionals: nullable numeric `length` + `width` (+ separate `roadWidth`). Source uses numeric ft inputs, not free-text.
- **(d) Facing / open sides / corner.** YES — `facing` enum (incl. "Not sure"), `openSides` `['1','2','3','4']` nullable, `corner` bool. All present in source.
- **(e) Fencing.** Enum `boundaryFencingStatus` = source `FENCING` `['Fully fenced','Partly fenced','Not fenced','Not sure']` — **not a boolean** (replaces today's boolean `fencingDone`, Listing.java:247–248).
- **(f) Road access.** Controlled enum `roadAccessType` = source `ROADACCESS` `['Direct road','Mud road','Internal path','No road access','Not sure']` + separate nullable `roadWidth`.
- **(g) Vehicle access.** Separate boolean `vehicle` "Vehicle access to plot" (distinct toggle in source), independent of parking (agri has no parking).
- **(h) Water / cultivation block.** Scalar enums on `listing_agricultural_land_details`: `water` (WATER enum), `irrigation` (YN), `electricity` (YN), `soil` (soil enum), `cultivation` (text), `farmhouse`/`trees` (bools); **crops is multi-valued → child set** (`agri_crops` or an `listing_amenities`-style code table). All optional (Section-4 accordion).
- **(i) Records.** Optional broker-entered record fields (Section-6): `ownership` enum, `survey`, `rtc`, `landCategory` enum, `conversion` enum, `boundaryDesc` — store on **`listing_ownership_details` (shared)** or the agri detail table; framed as optional records, **not verification flags**. (Exact placement is an implementation detail the FU will finalise; the ADR's position is "shared ownership table preferred for the ownership/document items.")
- **(j) Location flags.** Multi-valued via **child table `listing_location_features`** with code domain = source `FEATURES` `['Coastal','Riverside','Backwater-facing','Roadside','Near village road','Near highway','Near temple / landmark']`; stored/displayed broker-declared, not verified.
- **(k) No fake verification — CRITICAL.** Model record/legal items as nullable enums/text with explicit "Not sure"/`NOT_PROVIDED` states, **never** boolean `clearTitle`/`reraApproved` defaulting `false`. Source banner: *"We never display 'title verified' or 'records verified'."* Null renders "not provided"; populated renders "broker-declared, not verified". Any future real verification status is a **separate backend-owned field** distinct from broker records.

---

## 11. Public listing detail composition strategy

The public detail page (`GET /api/public/listings/{id}`, PublicListingController.java:73–91; frontend `ListingDetail.tsx:36–76`) composes from the typed tables via per-table public-detail mappers:

1. **Only-applicable fields.** Render only fields populated for that property type (use the public-detail mappers per hybrid table). **Hide missing optionals** — no "N/A", no fabricated defaults.
2. **Derive-at-read, never store as broker input:** price per unit (per sqft / per acre / per cent — note per-family area-unit value spaces from §8), and **gross yield ONLY when price + current rent are both present**, always labelled indicative/derived, **never "guaranteed".**
3. **Declared vs computed area separated.** Store broker-declared `landArea` and boundary-derived `computedAreaAcres` separately; declared is **canonical and primary**; computed renders as a labelled secondary "map-estimated" and never overwrites declared (matches ListingResponse.java:89–97).
4. **Real trust state only.** Trust panel reflects real backend state only (photos/cover/pin/description/broker-confirmed/verified-broker). Render **no ownership/document/record verification badges** (source shows none; §10k).
5. **Broker-declared framing.** Location/proximity features and broker-added POIs render as broker-declared, **not platform-verified**.
6. **No portal noise.** Keep the page simple/focused — no portal-style ads, excess widgets, calculators, news, or fake badges.
7. **AI text is display-only.** The AI-generated description is display-only narrative; structured facts always render **from the typed columns**, never parsed back out of AI text.

---

## 12. AI description-generation boundary

This section **aligns with and references `docs/architecture/listing-description-ai-deployment.md`** — it does not duplicate that ADR's architecture (provider abstraction, self-hosted-first, timeout/fallback cascade, config keys).

- **IN:** confirmed structured fields only, as a grounded `ConfirmedFactsPayload` (PII-scrubbed per that doc §6–§7).
- **OUT / never written by AI:** structured columns, legal/record fields, and verification/trust state. AI output lands **only in the editable title/description free-text** as a draft requiring explicit human save (that doc §3, §1 "Editable Draft Treatment").
- **Never invent (per family) — extend the existing doc's blocked-claims list (§6):**
  - **Commercial:** footfall, rental/gross **yield**, guaranteed ROI/returns, fire-safety/municipal **approvals**, occupancy guarantees.
  - **Agricultural:** clear title, conversion status, water availability/source guarantees, crop yield, land appreciation.
  - (The design-source disclaimers encode exactly these exclusions per family.)
- **Works with AI disabled.** The system must function with the `NoopProvider` / AI globally disabled; persistence and publish are independent of provider availability (that doc §1, §5).
- **Recommendation:** add the per-family blocked-claim sets above as new entries in `listing-description-ai-deployment.md` §6 (sequenced as **M38-FU5**), rather than re-specifying the AI architecture here.

---

## 13. OpenSearch / indexing implications

- The hybrid typed tables make the search projection an **explicit, clean mapping.** On outbox drain, the indexer assembles a flattened document from `listing_core` + the relevant detail table (residential-unit / plot / commercial-space / building / warehouse / commercial-land / agri-land) + child sets (suitable-uses, amenities, location-features, crops) as **keyword arrays for faceting.**
- **Derived values** (price-per-unit) may be indexed for range/sort but **flagged derived** — never treated as broker input.
- Indexing stays **outbox-async and non-blocking** — the current `SearchOutboxWriter` path is preserved (ListingCrudService.java:219–224, :493–498), and the index document remains an **explicit allowlist** (ListingIndexDocument.java:23–52, `fromListing` :62–85) extended deliberately, never reflectively.
- Mapping changes are **additive + reindex via the existing poller**. **Listing writes must never fail if indexing lags** (the outbox decouples write from projection).

---

## 14. Backwards compatibility plan (expand/contract)

Non-breaking, reversible, in three stages:

1. **EXPAND (additive).** Flyway adds the `listing_core` column(s) (`listingFamily`) + the hybrid detail tables + child set tables; backfill existing `property_listings` rows by mapping current columns into the right detail table per `propertyType`. All new columns/tables nullable; **no drops.**
2. **DUAL-READ / DUAL-WRITE window.** The new typed path writes the detail/child tables; reads prefer typed, falling back to legacy `property_listings` columns until backfill is verified. The DTO discriminator defaults legacy rows to a family by `propertyType`. The flat API body remains accepted (superset shape) so existing clients keep working.
3. **CONTRACT (separate later issue).** After verified backfill + a green reindex, drop the legacy nullable columns from `property_listings`. **Never a single destructive migration;** each step is independently reversible until contract.

**Rollback:** because EXPAND is additive and dual-write keeps legacy columns authoritative until verified, any stage before CONTRACT rolls back by disabling the typed read/write path. CONTRACT is the only irreversible step and runs only after backfill + reindex verification.

**API compatibility:** non-breaking during the dual-write window (flat body accepted as a superset). The eventual removal of flat-only fields after CONTRACT is a **breaking** client change and must be gated on frontend migration to the discriminated union.

---

## 15. Implementation sequencing

1. **M38-FU1** — Flyway **expand** migration (`listing_core` + residential-unit/plot, commercial-space/building/warehouse/land, agri-land detail tables, shared `listing_rental_terms` + `listing_ownership_details`, child set tables) + backfill.
2. **M38-FU2** — discriminated-union DTO + Bean Validation groups (Spring) per the hybrid family/subtype split.
3. **M38-FU3** — frontend per-type field-config renderer mapped 1:1 to the hybrid tables.
4. **M38-FU4** — OpenSearch mapping + projection update through the outbox indexer for the new tables/child sets.
5. **M38-FU5** — append per-family blocked-claim sets to `listing-description-ai-deployment.md`; wire `ConfirmedFactsPayload` to typed fields.
6. **M38-FU6 (contract)** — drop legacy `property_listings` columns after backfill verification + green reindex.

FU1 precedes FU2/FU4 (schema first). FU2 and FU3 can proceed in parallel against the agreed DTO contract. FU6 is last and gated on verification.

---

## 16. Follow-up issue recommendations

- **M38-FU1** — Flyway expand migration + backfill (hybrid detail + shared + child set tables).
- **M38-FU2** — discriminated-union DTO + property-type-aware validation groups.
- **M38-FU3** — frontend per-type field-config renderer (1:1 with hybrid tables).
- **M38-FU4** — OpenSearch mapping/projection update via the outbox indexer.
- **M38-FU5** — AI blocked-claims per-family extension + `ConfirmedFactsPayload` wiring.
- **M38-FU6 (contract)** — drop legacy `property_listings` columns after verified backfill.
- **M38-FU7** — add **backend enum/validation classes** for the agri (and commercial) fields currently only in frontend literals (string-drift fix; §2.3, §6). Today only the five agri strings are validated server-side (ListingController.java:347–366); the rest of the agri/commercial enums have no backend authority.

---

## Tradeoff Records

> **Persistence.** **Chosen:** HYBRID typed-table model (USER-BINDING). **Rejected:** 3-family tables — recreates nullable subtype-only sprawl by collapsing plot vs unit, warehouse vs office, commercial-land vs building. **Deferred:** full ~14 per-subtype tables — until a currently-shared subtype (apt/house/villa or shop/office) diverges materially. **Main risk:** more tables + a discriminated DTO/validation layer to build and migrate (mitigated by expand/contract, §14).

> **API/DTO.** **Chosen:** one resource path with family-typed discriminated-union bodies. **Rejected:** one giant all-optional DTO — no type safety; it is the status quo failure. **Deferred:** fully separate per-type endpoints — until route-level isolation is actually needed. **Main risk:** Jackson polymorphic (de)serialization complexity (mitigated by an explicit `listingFamily` + `propertyType` discriminator).

> **Validation.** **Chosen:** discriminator-driven Bean Validation groups in Spring + DB NOT NULL/CHECK for integrity. **Rejected:** validation in RLS/Postgres functions — violates "Spring owns business logic". **Deferred:** exhaustive DB CHECK domains — added where practical first. **Main risk:** group wiring per propertyType is verbose (mitigated by config-driven groups, §6).

> **Public detail / trust.** **Chosen:** only-applicable populated fields, derived (never stored) price/yield, declared-canonical area, real-trust-state-only. **Rejected:** verification badges and portal noise — the design source shows none and forbids "title/records verified". **Main risk:** none material; this is the conservative, honest option.

> **AI boundary.** **Chosen:** confirmed-facts-in / editable-text-out, aligned to the existing AI ADR, with per-family blocked claims appended there. **Rejected:** duplicating the AI architecture here. **Main risk:** the two docs drift — mitigated by referencing, not copying, and by M38-FU5.

---

## Code citations (real, file:line)

- `backend/src/main/java/com/example/realestate/listing/core/Listing.java` — entity/table :25–27; `propertyType` :36–37; commercial/rent :174–219; agricultural :223–248; trust/quality :257–287.
- `backend/src/main/java/com/example/realestate/listing/api/ListingController.java` — create :72–103; update (boundary :187) :157–200; submit :231–245; `validateAgriFields`/`rejectIfUnknown` :347–366; **`CreateRequest` record :377–414**; **`UpdateRequest` record :416–465**.
- `backend/src/main/java/com/example/realestate/listing/api/ListingResponse.java` — full response :10–103; **`computedAreaAcres` DERIVED :89–97**.
- `backend/src/main/java/com/example/realestate/listing/api/ListingTeaserResponse.java` — anon teaser, agri-only extras :44–71.
- `backend/src/main/java/com/example/realestate/listing/api/PublicListingController.java` — JWT-aware detail :73–91.
- `backend/src/main/java/com/example/realestate/listing/crud/ListingCrudService.java` — `LISTING_CREATED` outbox :219–224; `LISTING_UPDATED` outbox :493–498.
- `backend/src/main/java/com/example/realestate/search/indexer/ListingIndexDocument.java` — **17-field explicit allowlist :23–52; `fromListing(Listing)` :62–85** (the OpenSearch index document/mapper located directly for this ADR).
- `src/lib/listing-constants.ts` — `PROPERTY_TYPES` / `COMMERCIAL_TYPES` / `FURNISHING_OPTIONS` :1–32.
- `src/hooks/useBrokerListings.ts` — flat all-optional `CreateListingRequest` mirror :5–43.
- `src/pages/ListingDetail.tsx` — `PublicListingDetail extends Partial<ListingResponse>` :36–76.
- Design source (authoritative inventory): DesignSync `ui_kits/buyer/create-{residential,commercial,agricultural}-listing.html` (project `f3796631-064b-4956-94ba-14baa7af9bcf`; #1622/#1683/#1623).
