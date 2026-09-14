-- scripts/db/fixtures/commercial-listings-seed.sql
--
-- Commercial fixture inventory — companion to navigation-hierarchy-fixture-listings-seed.sql.
-- LOCAL/TEST-ONLY fixture Postgres only. Never run against production or shared Supabase.
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
-- The canonical fixture contained ZERO Commercial listings (measured: apartment 12,
-- house 11, agricultural_land 2 = 25 LIVE rows; all four V102 commercial detail
-- tables empty). Schema was fully migrated — the absence was DATA, not schema.
--
-- Consequence, measured against a live backend: `propertyType=commercial` returned 0
-- for data reasons. So every Commercial assertion in the suite — "Commercial filters
-- return zero Residential ids", and every sibling of that shape — passed against a
-- correct implementation, passed against a broken one, and passed if the Commercial
-- code path were deleted outright. They were unfalsifiable. This seed exists to make
-- them capable of failing.
--
-- ── PLACEMENT: IN|KA|Bengaluru|Sanjeevini Nagar (and why that one) ───────────
-- Measured against a fresh restore (20 navigation_nodes, 4 root Directions):
--   d:southeast  3 AREA children   <- issue-2086 AC12 pins child_count === 3
--   d:southwest  4 AREA children   <- issue-2086 pins child_count === 4 + toHaveCount(4)
--   d:northeast  1 CLUSTER child
--   d:central    2 CLUSTER children
--
-- issue-2086's AC12 is "no server child is ever hidden (rendered count === server
-- count)" — it pins the CHILD COUNT OF THE PARENT, read live from /navigation/resolve.
-- So adding a NODE anywhere under an existing Direction breaks it even though nothing
-- names the new node. This seed therefore adds NO navigation_nodes row at all: it adds
-- LISTINGS ONLY, to an AREA leaf that already exists. No parent's child count moves.
--
-- Sanjeevini Nagar was chosen after rejecting every other zero-listing AREA leaf on
-- evidence (each is referenced by at least one e2e spec):
--   Avalahalli    - issue-2086 documents it as deliberately zero-listing; pr3 asserts its card
--   Koramangala   - issue-2204 documents "Koramangala (2 schools, 0 listings)";
--                   issue-2017's toHaveCount(2) uses the Koramangala area-set
--   BTM Layout    - discover-schools-canonical-2124 asserts its card '0 schools'
--   Jayanagar     - issue-2204 / issue-2205 reference it in group membership + school sums
--   Sanjeevini Nagar - ZERO e2e references; its parent CLUSTER
--                   (c:central:in-ka-bengaluru-jayanagar-in-ka-bengaluru-sanjeevini-nagar)
--                   also has ZERO e2e references.  <- chosen
--
-- WHAT THIS PLACEMENT DOES CHANGE — named explicitly, because reasoning only
-- about server child counts would miss it: journeyVisibility.ts:55
-- (`isMemberEligible` -> `eligibleCountFor(...) > 0`) HIDES zero-listing AREAs
-- from the areas journey's browse clusters and from their `+N`. Sanjeevini Nagar
-- had zero listings, so it was hidden; giving it listings makes it newly
-- ELIGIBLE, and it gains a visible card/marker under d:central that was not
-- there before. That is a real rendering change, not a no-op.
--
-- It is assessed as safe: the d:central specs that could see it are
-- schools-journey (#2124 family), and `eligibleCountFor` returns
-- eligibleSchoolCount for that journey — this file adds ZERO schools, so the
-- areas-journey count it does move is not the one those specs read. The
-- remaining d:central specs navigate (click Direction -> Cluster -> AREA) and
-- assert no counts. Stated as a mechanism rather than left implicit: a correct
-- conclusion reached without naming the mechanism is one edit away from wrong.
--
-- THIRD TIER, also named rather than left implicit: beyond navigation_nodes and
-- the journeyVisibility eligibility effect, every row here also counts toward the
-- LEGACY area-group rollup. V106__seed_bangalore_macro_region_mapping.sql:621 puts
-- Sanjeevini Nagar in the `south-emerging` group (region_label 'South Bangalore'),
-- so all eleven rows land there — measured: South Bangalore went from 0 listings to
-- 11, taking the count of macro regions carrying listings from 4 to 5, against the
-- landing map's <= 10 marker bound. No spec referencing `south-emerging` was found,
-- but that is recorded as UNKNOWN rather than ABSENT: the jCodemunch index does not
-- cover e2e/**, so a clean search there is not citable evidence.
--
-- It is also outside RR Nagar, outside the d:northeast leaves, and outside the
-- school-radius / viewport / area-set scopes pinned by the three exact toHaveCount(2)
-- card specs. Every surviving seed invariant is a LOWER bound (IF v < N THEN RAISE)
-- scoped by `title LIKE '[E2E]%'` or `'[AGRI]%'` or property_type — this file's rows use
-- a distinct `[COMM]` title prefix and commercial property_types, so they cannot
-- satisfy, and cannot perturb, any of them. Those lower bounds are the guardrail
-- proving this seed stayed clear.
--
-- ── THE COMMERCIAL FAMILY IS A FOUR-VALUE UNION ─────────────────────────────
-- `commercial_subtype` does NOT discriminate the family on its own. In storage the
-- family spans FOUR property_type values (PropertyType.java), and the subtype only
-- discriminates SHOP vs OFFICE within the generic `commercial` one:
--   commercial           -> SHOP | OFFICE | NULL(legacy)   -> listing_commercial_space_details
--   commercial_building  -> BUILDING                       -> listing_commercial_building_details
--   warehouse            -> WAREHOUSE                       -> listing_warehouse_details
--   commercial_land      -> LAND                            -> listing_commercial_land_details
-- A single-axis filter on either column alone silently drops rows. Consumers must use
-- the union.
--
-- NOTE the schema asymmetry: only listing_commercial_space_details carries a V102
-- `commercial_subtype` column. For BUILDING / WAREHOUSE / LAND the subtype exists ONLY
-- in the V104 flat property_listings.commercial_subtype column.
--
-- ── floor_choice / typed enums: VALIDATED AT THE WRITE PATH ────────────────
-- ListingController.java:1074 does rejectIfUnknown("floorChoice", floorChoice,
-- CommercialFieldOptions.VALID_FLOOR_CHOICES) — so the application REJECTS any
-- other value. V104 deliberately adds NO CHECK constraint, so a direct INSERT
-- like this one succeeds and the restore stays green while planting a state no
-- supported code path can produce. An earlier revision of this file did exactly
-- that ('GROUND'/'UPPER'), and the damage was not a missing label: it landed on
-- the V104 half of the dual-source pair, where an unrenderable value makes a
-- CORRECT reader render nothing — indistinguishable from the V102-only case, so
-- the arm could not discriminate. That is the unfalsifiability class this whole
-- file exists to remove, reintroduced in the row built to prevent it.
--
-- Hence the gate below checks floor_choice against the VOCABULARY, not merely
-- for non-NULL. Every enumerated value in this file is validated the same way.
-- (Note: CommercialFieldOptions' own Javadoc at :18 is STALE — it claims only
-- VALID_COMMERCIAL_OWNERSHIP is wired, while floorChoice is wired at :1074.)
--
-- ── APPLICABILITY: in-vocabulary is NOT enough ─────────────────────────────
-- The mirror image of the vocabulary bug above, and just as silent: a value that
-- IS in vocabulary but sits on a row whose SUBTYPE or PURPOSE does not carry that
-- field. listingFieldConfig.ts#isListingFieldVisible is the authority:
--   floorChoice / hubType ........................ SHOP or OFFICE
--   floorMode / powerLoadKva ..................... BUILDING only
--   occupancyStatus .............................. SHOP or BUILDING
--   officeSeats / Cabins / MeetingRooms .......... OFFICE only
--   warehouse* (4) ............................... WAREHOUSE only
--   commercialZoning / Ownership / Approvals ..... LAND only
--   washrooms* / parking* / furnishing / utilities  every subtype EXCEPT LAND
--   suitableUses / availability / areaUnit ....... every resolved subtype
--   expectedRentalYieldPct / currentMonthlyIncomePaise  purpose = sale
--   leaseTermMonths / leaseEscalationPct ......... purpose = rent (or lease)
--
-- Why it matters HERE specifically: against a fixture that carries an
-- inapplicable field, a reader that FORGOT to gate by subtype looks correct. A
-- renderer showing powerLoadKva on every Commercial row would pass, because the
-- warehouse row would be carrying one. That is this file's own argument turned
-- against the rows beneath it — the same unfalsifiability, inverted.
--
-- An earlier revision carried five such values (ownership on SHOP/OFFICE/BUILDING,
-- powerLoadKva on WAREHOUSE, currentMonthlyIncomePaise on a RENT row). All were
-- removed, and the gate below now asserts applicability field-by-field so the
-- class cannot return.
--
-- ── WARNING: numeric columns and rs.getObject(..., Double.class) ────────────
-- warehouse_clear_height_ft (V104) and road_frontage_ft (V32/V102) are Postgres
-- `numeric`. pgjdbc has NO numeric -> Double conversion: rs.getObject(col,
-- Double.class) throws PSQLException on the FIRST row and aborts the WHOLE query,
-- 500-ing the endpoint. Read BigDecimal instead. The throw keys off column TYPE,
-- not value, so a fixture with zero commercial rows or all-NULL columns gives no
-- protection whatsoever — "there is no data to break on" is false reasoning here.
-- This already cost this fleet a regression. Read these as BigDecimal.
--
-- ── LEASE IS NOT PERSISTABLE ────────────────────────────────────────────────
-- chk_listing_purpose allows only 'sale' | 'rent'. Every row here is one of those.
-- There are no LEASE rows in this fixture because there can be none.
--
-- ── SAFETY / SCOPE ──────────────────────────────────────────────────────────
--   - TEST/LOCAL USE ONLY. ADDITIVE ONLY. No TRUNCATE/DELETE/UPDATE of any row this
--     script did not itself insert. Every INSERT is guarded by ON CONFLICT DO NOTHING
--     against fixed deterministic UUIDs, so a second run is a true no-op.
--   - Reuses the SAME synthetic [E2E] broker seeded by discover-smoke-seed.sql
--     (a1b2c3d4-e5f6-7890-abcd-ef1234567890). No new identity is created here.
--   - latitude/longitude derive from Sanjeevini Nagar's REAL public.areas centre
--     (12.9162546, 77.5891812), with small deterministic offsets so rows are
--     individually hit-testable rather than exactly coincident.

BEGIN;

DO $$
DECLARE
  v_broker_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_broker_id) THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected synthetic [E2E] broker % from '
      'discover-smoke-seed.sql to already exist — aborting rather than creating a new identity',
      v_broker_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.areas WHERE area_key = 'IN|KA|Bengaluru|Sanjeevini Nagar') THEN
    RAISE EXCEPTION 'commercial-listings-seed: target area IN|KA|Bengaluru|Sanjeevini Nagar not '
      'found in public.areas — the placement this seed depends on no longer exists';
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Listings. 11 rows, all LIVE, all in Sanjeevini Nagar: 9 Commercial (rows 1-9)
-- plus 2 Residential cross-family companions (rows 10-11).
--
-- Rows 1-5 cover all five buyer-facing subtypes across the four property_type
-- values. Row 6 is the legacy pre-V102 shape. Rows 7-8 are the dual-source pair.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.property_listings
  (id, property_type, commercial_subtype, listing_family, title, locality, price,
   latitude, longitude, status, listing_purpose, created_by, price_paise, area_key,
   is_valid, address_confirmed, floor_choice, created_at, updated_at)
VALUES
  -- 1. SHOP — generic commercial, subtype SHOP
  ('c0110001-0000-0000-0000-000000000001',
   'commercial', 'SHOP', 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Shop Unit', 'Sanjeevini Nagar', 0,
   12.9162546, 77.5891812, 'LIVE', 'sale',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 95000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, 'GROUND_FLOOR', NOW(), NOW()),

  -- 2. OFFICE — generic commercial, subtype OFFICE, rent (proves purpose coverage)
  ('c0110001-0000-0000-0000-000000000002',
   'commercial', 'OFFICE', 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Office Floor', 'Sanjeevini Nagar', 0,
   12.9163046, 77.5892312, 'LIVE', 'rent',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 12000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, 'UPPER_FLOOR', NOW(), NOW()),

  -- 3. BUILDING — its own property_type; subtype lives ONLY in the V104 flat column
  ('c0110001-0000-0000-0000-000000000003',
   'commercial_building', 'BUILDING', 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Commercial Building', 'Sanjeevini Nagar', 0,
   12.9163546, 77.5892812, 'LIVE', 'sale',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 450000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW()),

  -- 4. WAREHOUSE / Godown
  ('c0110001-0000-0000-0000-000000000004',
   'warehouse', 'WAREHOUSE', 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Warehouse Godown', 'Sanjeevini Nagar', 0,
   12.9164046, 77.5893312, 'LIVE', 'rent',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 25000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW()),

  -- 5. COMMERCIAL LAND
  ('c0110001-0000-0000-0000-000000000005',
   'commercial_land', 'LAND', 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Commercial Land Parcel', 'Sanjeevini Nagar', 0,
   12.9161546, 77.5890812, 'LIVE', 'sale',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 300000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW()),

  -- 6. LEGACY pre-V102 shape: property_type='commercial' with NO subtype on EITHER
  --    axis. V102 backfilled these into space_details with commercial_subtype NULL;
  --    V104 added the flat column with NO backfill, so it is NULL here too. A
  --    subtype-only switch silently drops this row — that is the defect class it
  --    exists to catch. It must render a truthful generic Commercial summary, never
  --    an inferred Shop/Office and never a blank.
  ('c0110001-0000-0000-0000-000000000006',
   'commercial', NULL, 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Legacy Commercial Unit', 'Sanjeevini Nagar', 0,
   12.9161046, 77.5890312, 'LIVE', 'sale',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 88000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW()),

  -- 7. DUAL-SOURCE A — V102 side only.
  --    listing_commercial_space_details.floor_number IS SET (below); the V104 flat
  --    property_listings.floor_choice is NULL. A reader that only consults V104
  --    reports "no floor" for this row.
  ('c0110001-0000-0000-0000-000000000007',
   'commercial', 'SHOP', 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Dual-Source V102 Floor', 'Sanjeevini Nagar', 0,
   12.9160546, 77.5889812, 'LIVE', 'sale',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 76000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW()),

  -- 8. DUAL-SOURCE B — V104 side only (the exact inverse of row 7).
  --    flat floor_choice IS SET; the V102 detail row's floor_number is NULL. A reader
  --    that only consults V102 reports "no floor" for this row.
  --    Rows 7 and 8 are deliberately NOT authored identically: if they were, a
  --    dual-source fallback test would pass without ever discriminating the two
  --    sources, which is the trap this pair exists to prevent.
  ('c0110001-0000-0000-0000-000000000008',
   'commercial', 'OFFICE', 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar Dual-Source V104 Floor', 'Sanjeevini Nagar', 0,
   12.9160046, 77.5889312, 'LIVE', 'rent',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 15000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, 'FIRST_FLOOR', NOW(), NOW()),

  -- 9. BETWEEN-MIGRATIONS shape: V102 detail subtype IS SET (below) while the
  --    V104 flat commercial_subtype is NULL. This is what ANY row written after
  --    V102 but before V104 actually looks like in production, and it is a THIRD
  --    distinct shape from row 6 (NULL on both axes) and rows 1-5 (set on both).
  --    Rows 7/8 discriminate on the FLOOR axis; this row discriminates on the
  --    SUBTYPE axis, which nothing else in this file covered. A reader that
  --    consults only the V104 flat column reports "no subtype" for this row and
  --    silently drops it from a subtype filter.
  ('c0110001-0000-0000-0000-000000000009',
   'commercial', NULL, 'COMMERCIAL',
   '[COMM] Sanjeevini Nagar V102-Subtype-Only Unit', 'Sanjeevini Nagar', 0,
   12.9159546, 77.5888812, 'LIVE', 'sale',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 67000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW()),

  -- 10/11. CROSS-FAMILY companions. Sanjeevini Nagar was chosen precisely because
  --    it held nothing, which is what made its blast radius nil — but it also made
  --    a cross-family test unwritable: "Commercial filters return zero Residential
  --    ids" is trivially true when the area holds no Residential either. BOTH sides
  --    empty on one axis means the intersection is vacuously zero and the row proves
  --    nothing.
  --
  --    Residential rows are added HERE rather than adding Commercial rows to an
  --    existing Residential area, deliberately: every Residential area already
  --    carries pinned counts (issue-2083 asserts an exact per-area purpose split
  --    for Vijayanagar — "1 sale + 0 rent"), so seeding Commercial into one would
  --    move a pinned number. Sanjeevini Nagar's blast radius is already measured
  --    and nil, so the mixed-family population stays entirely inside it.
  ('c0110001-0000-0000-0000-000000000010',
   'apartment', NULL, 'RESIDENTIAL',
   '[COMM] Sanjeevini Nagar Cross-Family Apartment', 'Sanjeevini Nagar', 0,
   12.9159046, 77.5888312, 'LIVE', 'sale',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 62000000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW()),

  ('c0110001-0000-0000-0000-000000000011',
   'house', NULL, 'RESIDENTIAL',
   '[COMM] Sanjeevini Nagar Cross-Family House', 'Sanjeevini Nagar', 0,
   12.9158546, 77.5887812, 'LIVE', 'rent',
   'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 4500000,
   'IN|KA|Bengaluru|Sanjeevini Nagar', true, true, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- BEDROOMS-PER-SHAPE DISCRIMINATING TRIO (Issue #2570, unblocks #2566)
--
-- #2566 makes the bedroom predicate apply PER SHAPE instead of as a global
-- conjunct. Before it, `AND pl.bedrooms IN (3)` was ANDed across the whole query,
-- so a bedroom-INCAPABLE row (bedrooms NULL) evaluated to NULL — not TRUE — and
-- was silently eliminated. The fix emits
--     AND ((pl.bedrooms IN (3)) OR pl.property_type IN ('residential_plot'))
-- admitting incapable shapes without judging them by a predicate that cannot
-- describe them.
--
--   R1  2570…0001  apartment,        bedrooms = 3  -> RETAINED in both arms
--   R2  2570…0002  apartment,        bedrooms = 2  -> EXCLUDED in both arms
--   R3  2570…0003  residential_plot, bedrooms NULL -> ABSENT pre-fix, RETAINED post-fix
--
-- Discriminating request:
--   /api/discover/cities/bangalore/listings
--     ?areaKeys=IN|KA|Bengaluru|Sanjeevini Nagar
--     &propertyType=apartment&propertyType=residential_plot&bedrooms=3
--
-- WHY R1 AND R2 SHARE A property_type — load-bearing, and easy to get wrong. If R2
-- were a different bedroom-capable shape (a house, say), the request above would
-- exclude it via `property_type IN (…)` rather than via the bedroom predicate, so
-- the arm would prove nothing about bedroom narrowing — it would pass against a fix
-- that dropped the bedroom predicate entirely. A control that excludes for the wrong
-- reason is not a control. R1 and R2 differ in EXACTLY ONE property: the bedroom
-- count. Asserted below, because the two rows are one careless edit from diverging.
--
-- WHY R2 EXISTS. Without a wrong-count dwelling that must stay excluded, the journey
-- proves only retention, and would pass against a fix that merely stopped filtering.
--
-- WHY R3 IS residential_plot AND NOT agricultural_land.
-- CityAreaListingsService.AREA_FIRST_EXCLUDED_PROPERTY_TYPE is agricultural_land,
-- excluded UNCONDITIONALLY by both query paths, so an agricultural R3 would be absent
-- in BOTH arms and the retention it exists to show could never be observed. That
-- exclusion is INVISIBLE from the endpoint: `propertyType` is NOT validated, so an
-- excluded type and an outright typo both return 200 with ZERO rows (unlike
-- `commercialSubtypes`, which 400s). And note the verification trap: on an area with
-- no agricultural inventory the empty 200 proves nothing, because empty-because-
-- filtered and empty-because-absent are indistinguishable. residential_plot is in
-- PropertyType (V103's chk_listing_property_type) and therefore in
-- DiscoverFilterNormalizer.ALLOWED_PROPERTY_TYPES, so it normalises, is satisfiable,
-- and emits a plain `AND pl.property_type IN (?)`: genuinely SERVED.
--
-- WHY THIS AREA. Manipal cannot host these arms: Udupi has ZERO navigation_nodes
-- (measured — bangalore 20, nothing else), so the area-first journey has no node to
-- resolve and renders the journey chooser rather than an area panel. Every
-- d:southeast leaf is count-pinned by a LIVE-fixture spec — RR Nagar by issue-2129
-- (`property-marker` toHaveCount(2)) and issue-2089 (`listing-card` toHaveCount(2)),
-- Vijayanagar by issue-2083's exact per-area purpose split, and Nagarbhavi is the
-- deliberate zero-rent control. R3 must be SERVED to demonstrate retention, and
-- anything served in those scopes moves a pinned count. Sanjeevini Nagar has an AREA
-- navigation node (depth 2 under d:central) and no cardinality pins — the same
-- reasoning, and the same area, this file already chose for its Commercial inventory.
--
-- WHY created_at IS A FIXED PAST LITERAL, NOT NOW(). capture-2433-visual.spec.ts crops
-- its evidence screenshot to the union of the FIRST THREE cards' bounding boxes. Rows
-- stamped NOW() would become those three cards, so #2433's frames would silently show
-- THESE rows instead of the Commercial summary rows they exist to prove — and nothing
-- would fail, because that spec asserts only `cardCount > 0` and merely RECORDS the
-- summary count. A silently corrupted evidence frame is worse than a broken test.
--
-- WHICH SERVICE — stated precisely, because an earlier revision of this comment named
-- the wrong one. That spec drives the VIEWPORT journey (`rscope=vp&rvp=…`, :89), served
-- by DiscoverListingsService (/api/discover/listings), which pages with LIMIT/OFFSET and
-- has NO per-area cap. CityAreaListingsService's DEFAULT_LIMIT of 5 is NOT in play on
-- the capture path, so no cap argument protects these rows there. The seeded coordinates
-- also sit inside that spec's bbox, so the rows are genuinely served to it.
--
-- What protects the crop is ORDERING ALONE: both services order `ORDER BY
-- pl.created_at DESC` (DiscoverListingsService:179; CityAreaListingsService via its
-- ROW_NUMBER()), and these fixed 2020 literals sort strictly behind all 11 existing
-- Sanjeevini rows, which are stamped NOW(). That holds on EITHER endpoint at ANY page
-- size, which is what makes it a guarantee rather than a coincidence of page size.
--
-- Separately true of the AREA endpoint, where a cap does apply — recorded because it is
-- a trap, not because it protects anything: at limitPerArea=20 that endpoint returns 14
-- rows with these three last, and at the default 5 it returns only [COMM] rows. Anyone
-- probing /api/discover/cities/{city}/listings by curl must pass limitPerArea=20 or see
-- none of these rows and read it as "the seed did not land".
--
-- Title prefix is [BEDS], deliberately NOT [COMM]: several assertions in this file
-- scope on `title LIKE '[COMM]%'`, and these rows are not Commercial inventory and
-- must not enter those counts.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.property_listings
  (id, property_type, listing_family, title, locality, price, latitude, longitude,
   status, listing_purpose, created_by, price_paise, area_key, bedrooms,
   is_valid, address_confirmed, is_duplicate, archived_at, created_at, updated_at)
VALUES
  -- R1 — bedroom-capable, carrying the count the buyer asks for.
  ('25700001-0000-0000-0000-000000000001',
   'apartment', 'RESIDENTIAL',
   '[BEDS] Sanjeevini Nagar 3BHK Apartment', 'Sanjeevini Nagar', 0,
   12.9165546, 77.5894812,
   'LIVE', 'sale', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   72000000, 'IN|KA|Bengaluru|Sanjeevini Nagar', 3,
   true, true, false, NULL, TIMESTAMPTZ '2020-01-01 00:00:00+00', NOW()),

  -- R2 — SAME property_type as R1, WRONG count. The falsifiability arm.
  ('25700001-0000-0000-0000-000000000002',
   'apartment', 'RESIDENTIAL',
   '[BEDS] Sanjeevini Nagar 2BHK Apartment', 'Sanjeevini Nagar', 0,
   12.9166046, 77.5895312,
   'LIVE', 'sale', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   58000000, 'IN|KA|Bengaluru|Sanjeevini Nagar', 2,
   true, true, false, NULL, TIMESTAMPTZ '2020-01-01 00:00:01+00', NOW()),

  -- R3 — bedroom-INCAPABLE and served. `bedrooms` stays NULL: that is the property
  -- under test, not an omission.
  ('25700001-0000-0000-0000-000000000003',
   'residential_plot', 'RESIDENTIAL',
   '[BEDS] Sanjeevini Nagar Residential Plot', 'Sanjeevini Nagar', 0,
   12.9166546, 77.5895812,
   'LIVE', 'sale', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   41000000, 'IN|KA|Bengaluru|Sanjeevini Nagar', NULL,
   true, true, false, NULL, TIMESTAMPTZ '2020-01-01 00:00:02+00', NOW())
ON CONFLICT (id) DO UPDATE
  SET property_type     = EXCLUDED.property_type,
      listing_family    = EXCLUDED.listing_family,
      status            = 'LIVE',
      listing_purpose   = EXCLUDED.listing_purpose,
      area_key          = EXCLUDED.area_key,
      latitude          = EXCLUDED.latitude,
      longitude         = EXCLUDED.longitude,
      price_paise       = EXCLUDED.price_paise,
      bedrooms          = EXCLUDED.bedrooms,
      is_duplicate      = false,
      archived_at       = NULL,
      address_confirmed = true,
      created_at        = EXCLUDED.created_at,
      updated_at        = NOW();

-- ───────────────────────────────────────────────────────────────────────────
-- V102 typed detail rows.
-- Only listing_commercial_space_details carries a V102 commercial_subtype column.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.listing_commercial_space_details
  (listing_id, commercial_subtype, floor_number, total_floors, furnishing_status,
   washrooms, parking_count, road_frontage_ft, commercial_usage, created_at)
VALUES
  ('c0110001-0000-0000-0000-000000000001', 'SHOP',   0, 3, 'UNFURNISHED', 1, 2, 24.0, 'RETAIL', NOW()),
  ('c0110001-0000-0000-0000-000000000002', 'OFFICE', 2, 6, 'FURNISHED',   2, 4, 40.0, 'OFFICE', NOW()),
  -- legacy: subtype NULL on the V102 axis too (matches the V102 backfill exactly)
  ('c0110001-0000-0000-0000-000000000006', NULL,     1, 2, NULL,       NULL, NULL, NULL, NULL, NOW()),
  -- dual-source A: V102 floor_number SET (row's flat floor_choice is NULL)
  ('c0110001-0000-0000-0000-000000000007', 'SHOP',   3, 5, 'UNFURNISHED', 1, 1, 20.0, 'RETAIL', NOW()),
  -- dual-source B: V102 floor_number NULL (row's flat floor_choice is SET)
  ('c0110001-0000-0000-0000-000000000008', 'OFFICE', NULL, 4, 'SEMI_FURNISHED', 2, 2, 30.0, 'OFFICE', NOW()),
  -- between-migrations: V102 subtype SET while the row's V104 flat column is NULL
  ('c0110001-0000-0000-0000-000000000009', 'SHOP',   1, 3, 'UNFURNISHED', 1, 1, 18.0, 'RETAIL', NOW())
ON CONFLICT (listing_id) DO NOTHING;

INSERT INTO public.listing_commercial_building_details
  (listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage, created_at)
VALUES
  ('c0110001-0000-0000-0000-000000000003', 12, 5, 60.0, 'MIXED', NOW())
ON CONFLICT (listing_id) DO NOTHING;

INSERT INTO public.listing_warehouse_details
  (listing_id, total_floors, road_frontage_ft, commercial_usage, created_at)
VALUES
  ('c0110001-0000-0000-0000-000000000004', 1, 80.0, 'STORAGE', NOW())
ON CONFLICT (listing_id) DO NOTHING;

INSERT INTO public.listing_commercial_land_details
  (listing_id, road_frontage_ft, created_at)
VALUES
  ('c0110001-0000-0000-0000-000000000005', 120.0, NOW())
ON CONFLICT (listing_id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- TYPED V104 FACT COLUMNS
--
-- Without these, buildCommercialDetailModel returns [] for every row and
-- CommercialSpecsSection renders null — so every "hidden when absent" assertion
-- about the specs section would pass while proving nothing. That is the same
-- empty-dataset trap this whole seed exists to remove, one layer in: the rows
-- would exist, but the SECTION that reads them would still have no data.
--
-- The four V102 child tables above carry only the GENERIC LEGACY columns — the
-- fields that already rendered before the typed work. These flat V104 columns are
-- the typed vocabulary, and they had no backfill.
--
-- EVERY enumerated value below is verified against CommercialFieldOptions.java
-- (backend authority) and apps/web/src/lib/listing-constants.ts (frontend), which
-- agree. An out-of-vocabulary value is NOT a loud failure: labelFor(...) returns
-- undefined and the tile/row helpers silently skip it, so the field renders as
-- nothing. commercial_zoning and commercial_approvals are deliberately free text
-- (no VALID_* set exists for either).
--
-- Written as UPDATEs against the fixed ids inserted above rather than widening the
-- INSERT to ~45 columns: per-subtype field sets stay readable and reviewable, and
-- assigning constants is idempotent by construction.
--
-- Row 6 (legacy) is deliberately left with EVERY typed column NULL — that IS the
-- legacy shape, and populating it would destroy the case it exists to represent.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. SHOP (sale)
UPDATE public.property_listings SET
  hub_type                     = 'HIGH_STREET',
  occupancy_status             = 'VACANT',
  washrooms_public             = 2,
  washrooms_private            = 1,
  parking_public_count         = 6,
  parking_private_count        = 2,
  -- NO commercial_ownership: LAND-only (listingFieldConfig.ts:473-475).
  commercial_furnishing_status = 'UNFURNISHED',
  commercial_availability      = 'IMMEDIATE',
  commercial_area_unit         = 'SQ_FT'
WHERE id = 'c0110001-0000-0000-0000-000000000001';

-- 2. OFFICE (rent) — lease_term_months / lease_escalation_pct exercise the
--    rent-vs-sale purpose split; they must never appear on a sale row.
UPDATE public.property_listings SET
  hub_type                     = 'IT_PARK',
  office_seats                 = 40,
  office_cabins                = 3,
  office_meeting_rooms         = 2,
  commercial_furnishing_status = 'PLUG_AND_PLAY',
  -- NO commercial_ownership: LAND-only (:473-475).
  commercial_availability      = 'WITHIN_30_DAYS',
  commercial_area_unit         = 'SQ_FT',
  -- NO current_monthly_income_paise: SALE-only (:493-495) and this row is rent.
  lease_term_months            = 36,
  lease_escalation_pct         = 5.0
WHERE id = 'c0110001-0000-0000-0000-000000000002';

-- 3. BUILDING (sale)
UPDATE public.property_listings SET
  floor_mode                   = 'WHOLE_BUILDING',
  occupancy_status             = 'PARTLY_OCCUPIED',
  power_load_kva               = 25,
  expected_rental_yield_pct    = 6.5,
  current_monthly_income_paise = 180000000,
  -- NO commercial_ownership: LAND-only (:473-475).
  commercial_availability      = 'IMMEDIATE',
  commercial_area_unit         = 'SQ_FT'
WHERE id = 'c0110001-0000-0000-0000-000000000003';

-- 4. WAREHOUSE (rent)
--    NOTE warehouse_clear_height_ft is `numeric`. See this file's header warning:
--    reading a numeric column with rs.getObject(col, Double.class) throws on the
--    FIRST row and aborts the entire query.
UPDATE public.property_listings SET
  warehouse_clear_height_ft = 24,
  warehouse_loading_bays    = 3,
  warehouse_truck_access    = true,
  warehouse_flooring        = 'EPOXY_COATED',
  -- NO power_load_kva: BUILDING-only (:456-457).
  commercial_availability   = 'WITHIN_15_DAYS',
  commercial_area_unit      = 'SQ_FT',
  lease_term_months         = 60,
  lease_escalation_pct      = 7.5
WHERE id = 'c0110001-0000-0000-0000-000000000004';

-- 5. LAND (sale) — commercial_zoning / commercial_approvals are free text by design
UPDATE public.property_listings SET
  commercial_zoning       = 'Mixed commercial',
  commercial_ownership    = 'FREEHOLD',
  commercial_approvals    = 'CC and OC obtained',
  commercial_availability = 'IMMEDIATE',
  commercial_area_unit    = 'ACRE'
WHERE id = 'c0110001-0000-0000-0000-000000000005';

-- 7. DUAL-SOURCE A — floor_choice stays NULL (the V102 side owns the floor fact
--    for this row). Only non-floor typed facts are set, so the discrimination
--    against row 8 stays clean.
UPDATE public.property_listings SET
  hub_type             = 'MALL',
  commercial_area_unit = 'SQ_FT'
WHERE id = 'c0110001-0000-0000-0000-000000000007';

-- 8. DUAL-SOURCE B — floor_choice IS set (V104 side owns the floor fact here).
UPDATE public.property_listings SET
  hub_type             = 'BUSINESS_PARK',
  office_seats         = 12,
  commercial_area_unit = 'SQ_FT'
WHERE id = 'c0110001-0000-0000-0000-000000000008';

-- ───────────────────────────────────────────────────────────────────────────
-- Multi-selects. suitableUses uses the V104 listing_suitable_uses table; the
-- "amenities / utilities" multi-select deliberately REUSES the V102
-- listing_amenities table (V104's own header records that reuse decision).
-- Per-subtype vocabularies differ — each code below is drawn from that subtype's
-- own VALID_*_SUITABLE_USES set. Land has no amenities by design.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.listing_suitable_uses (listing_id, code)
VALUES
  ('c0110001-0000-0000-0000-000000000001', 'RETAIL'),
  ('c0110001-0000-0000-0000-000000000001', 'SHOWROOM'),
  ('c0110001-0000-0000-0000-000000000002', 'OFFICE'),
  ('c0110001-0000-0000-0000-000000000002', 'CO_WORKING'),
  ('c0110001-0000-0000-0000-000000000003', 'MIXED_USE'),
  ('c0110001-0000-0000-0000-000000000004', 'STORAGE'),
  ('c0110001-0000-0000-0000-000000000004', 'LOGISTICS'),
  ('c0110001-0000-0000-0000-000000000005', 'RETAIL'),
  ('c0110001-0000-0000-0000-000000000005', 'WAREHOUSE')
ON CONFLICT (listing_id, code) DO NOTHING;

INSERT INTO public.listing_amenities (listing_id, code)
VALUES
  ('c0110001-0000-0000-0000-000000000001', 'POWER'),
  ('c0110001-0000-0000-0000-000000000001', 'CCTV'),
  ('c0110001-0000-0000-0000-000000000002', 'POWER'),
  ('c0110001-0000-0000-0000-000000000002', 'INTERNET'),
  ('c0110001-0000-0000-0000-000000000002', 'AC'),
  ('c0110001-0000-0000-0000-000000000003', 'SECURITY'),
  ('c0110001-0000-0000-0000-000000000003', 'FIRE'),
  ('c0110001-0000-0000-0000-000000000004', 'POWER'),
  ('c0110001-0000-0000-0000-000000000004', 'DG'),
  ('c0110001-0000-0000-0000-000000000004', 'SECURITY')
ON CONFLICT (listing_id, code) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- ACCEPTANCE TEST — three arms.
--
-- A seed verified only by "the restore ran without errors" reproduces the exact
-- unfalsifiability trap it exists to remove, and is WORSE than no seed, because
-- everyone would then believe Commercial coverage exists. These assertions RAISE,
-- so the restore itself fails if the Commercial arm is empty.
--
--   ARM 1 (no filter)   — the listing surface is alive at all.
--   ARM 2 (Residential) — filtering demonstrably NARROWS (residential > 0 AND
--                         strictly < total). Without this, arm 3 could pass on a
--                         build where filtering is a no-op returning everything.
--   ARM 3 (Commercial)  — the Commercial arm is NON-EMPTY. This is the whole point:
--                         it is the assertion that was previously unfalsifiable.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total        INTEGER;
  v_residential  INTEGER;
  v_commercial   INTEGER;
  v_subtypes     INTEGER;
  v_legacy_null  INTEGER;
  v_dual_v102    INTEGER;
  v_dual_v104    INTEGER;
  v_bad_floor    INTEGER;
  v_typed_rows   INTEGER;
  v_warehouse    INTEGER;
  v_office       INTEGER;
  v_land         INTEGER;
  v_building     INTEGER;
  v_rent_lease   INTEGER;
  v_sale_lease   INTEGER;
  v_uses         INTEGER;
  v_amenities    INTEGER;
  v_legacy_typed INTEGER;
  v_v102_only    INTEGER;
  v_mixed_areas  INTEGER;
  v_inapplic     INTEGER;
  v_inapplic_txt TEXT;
  v_sale_fin     INTEGER;
  -- #2570 — the bedrooms-per-shape discriminating trio
  v_beds_r1      INTEGER;
  v_beds_r2      INTEGER;
  v_type_r1      TEXT;
  v_type_r2      TEXT;
  v_type_r3      TEXT;
  v_r3_rows      INTEGER;
BEGIN
  -- ARM 1 — no filter: the surface is alive.
  SELECT COUNT(*) INTO v_total
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'commercial-listings-seed ARM 1 (no filter): expected > 0 LIVE listings, got % '
      '— the listing surface is empty, so arms 2 and 3 would be meaningless', v_total;
  END IF;

  -- ARM 2 — Residential: filtering narrows.
  SELECT COUNT(*) INTO v_residential
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND property_type IN ('apartment', 'house', 'villa', 'residential_plot');
  IF v_residential <= 0 THEN
    RAISE EXCEPTION 'commercial-listings-seed ARM 2 (Residential): expected > 0 LIVE residential '
      'listings, got % — cannot demonstrate that filtering narrows', v_residential;
  END IF;
  IF v_residential >= v_total THEN
    RAISE EXCEPTION 'commercial-listings-seed ARM 2 (Residential): residential (%) is not strictly '
      'fewer than the unfiltered total (%) — filtering did not narrow, so a non-empty Commercial '
      'arm would not prove the filter works', v_residential, v_total;
  END IF;

  -- ARM 3 — Commercial: NON-EMPTY. The four-value union, not a single axis.
  SELECT COUNT(*) INTO v_commercial
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND property_type IN ('commercial', 'commercial_building', 'warehouse', 'commercial_land');
  IF v_commercial < 9 THEN
    RAISE EXCEPTION 'commercial-listings-seed ARM 3 (Commercial): expected >= 9 LIVE commercial-family '
      'listings, got % — the Commercial arm is empty or short, which is precisely the condition that '
      'makes every Commercial assertion in the suite unfalsifiable', v_commercial;
  END IF;

  -- Subtype coverage: all five buyer-facing subtypes must be present.
  SELECT COUNT(DISTINCT commercial_subtype) INTO v_subtypes
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND commercial_subtype IS NOT NULL
      AND property_type IN ('commercial', 'commercial_building', 'warehouse', 'commercial_land');
  IF v_subtypes < 5 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected all 5 commercial subtypes '
      '(SHOP/OFFICE/BUILDING/WAREHOUSE/LAND), found % distinct', v_subtypes;
  END IF;

  -- Legacy NULL-subtype row must exist on BOTH axes.
  SELECT COUNT(*) INTO v_legacy_null
    FROM public.property_listings pl
    JOIN public.listing_commercial_space_details d ON d.listing_id = pl.id
    WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
      AND pl.property_type = 'commercial'
      AND pl.commercial_subtype IS NULL AND d.commercial_subtype IS NULL;
  IF v_legacy_null < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 legacy commercial row with NULL subtype '
      'on BOTH the V104 flat column and the V102 detail table, got %', v_legacy_null;
  END IF;

  -- Dual-source pair must be genuinely DISCRIMINATING, not two identical rows.
  SELECT COUNT(*) INTO v_dual_v102
    FROM public.property_listings pl
    JOIN public.listing_commercial_space_details d ON d.listing_id = pl.id
    WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
      AND d.floor_number IS NOT NULL AND pl.floor_choice IS NULL;
  IF v_dual_v102 < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 dual-source row with V102 floor_number '
      'SET and V104 floor_choice NULL, got % — the V102 fallback cannot be exercised', v_dual_v102;
  END IF;

  SELECT COUNT(*) INTO v_dual_v104
    FROM public.property_listings pl
    JOIN public.listing_commercial_space_details d ON d.listing_id = pl.id
    WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
      AND d.floor_number IS NULL
      AND pl.floor_choice IN ('GROUND_FLOOR','FIRST_FLOOR','UPPER_FLOOR','MULTIPLE_FLOORS');
  IF v_dual_v104 < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 dual-source row with V102 floor_number '
      'NULL and V104 floor_choice set to an IN-VOCABULARY value, got %. Non-NULL is not enough: an '
      'out-of-vocabulary floor_choice renders as nothing, so a correct reader is indistinguishable '
      'from a V102-only reader and the arm cannot discriminate', v_dual_v104;
  END IF;

  -- BETWEEN-MIGRATIONS shape: V102 detail subtype SET while the V104 flat column
  -- is NULL. This is what any row written between V102 and V104 looks like in
  -- production. Distinct from the legacy row (NULL on both) and rows 1-5 (set on
  -- both); without it, the SUBTYPE axis of the dual-source contract is uncovered
  -- and a V104-only reader silently drops such rows from a subtype filter.
  SELECT COUNT(*) INTO v_v102_only
    FROM public.property_listings pl
    JOIN public.listing_commercial_space_details d ON d.listing_id = pl.id
    WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
      AND pl.commercial_subtype IS NULL AND d.commercial_subtype IS NOT NULL;
  IF v_v102_only < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 row with the V102 detail subtype SET '
      'and the V104 flat commercial_subtype NULL (the between-migrations shape), got %', v_v102_only;
  END IF;

  -- CROSS-FAMILY: at least one area must hold BOTH a Commercial and a Residential
  -- LIVE row. Without this, "Commercial filters return zero Residential ids" is
  -- vacuously true wherever it is measured — both sides empty on one axis makes
  -- the intersection trivially zero. Same failure mode as ARM 3, one level up:
  -- a later edit that separates the families would silently re-empty it.
  SELECT COUNT(*) INTO v_mixed_areas
    FROM (
      SELECT area_key
        FROM public.property_listings
       WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
       GROUP BY area_key
      HAVING COUNT(*) FILTER (
               WHERE property_type IN ('commercial','commercial_building','warehouse','commercial_land')
             ) > 0
         AND COUNT(*) FILTER (
               WHERE property_type IN ('apartment','house','villa','residential_plot')
             ) > 0
    ) mixed;
  IF v_mixed_areas < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: no area holds BOTH a Commercial and a Residential LIVE '
      'listing. A cross-family intersection test would be vacuously true wherever it is measured, '
      'because both sides are empty on one axis';
  END IF;

  -- ── APPLICABILITY ─────────────────────────────────────────────────────────
  -- The mirror of v_bad_floor. That one asserts a value is in VOCABULARY; this one
  -- asserts the field is even APPLICABLE to the row carrying it. Both failure modes
  -- are silent, and this one is the more dangerous of the two: an inapplicable value
  -- makes a reader that FORGOT to gate by subtype look correct.
  --
  -- Effective subtype mirrors deriveCommercialSubtype: BUILDING/WAREHOUSE/LAND are
  -- derived from property_type; only 'commercial' carries an explicit SHOP/OFFICE.
  -- Authority: listingFieldConfig.ts#isListingFieldVisible.
  --
  -- THREE-VALUED LOGIC — read before adding an arm. When `subtype` IS NULL (the
  -- legacy row, and the V102-subtype-only row whose FLAT column is null),
  -- `subtype NOT IN (...)` and `subtype = 'LAND'` evaluate to NULL, not TRUE, so
  -- those arms silently DO NOT MATCH and the row goes unchecked. `IS DISTINCT
  -- FROM` is NULL-safe and does fire. An earlier revision mixed the two and left
  -- ~12 fields unguarded on exactly the rows most likely to be enriched later.
  -- Write new arms with IS DISTINCT FROM, or handle NULL explicitly.
  --
  -- The NULL-subtype case is then closed wholesale rather than field-by-field:
  -- EVERY rule in the table above requires either a specific subtype or
  -- `commercialSubtype !== undefined`, so a row with NO resolved subtype must
  -- carry NO commercial typed field at all. That wholesale arm covers the 26
  -- COLUMN-backed keys. `commercialSubtype` is deliberately excluded (its rule is
  -- `propertyType === 'commercial'`, which is TRUE for the NULL-subtype rows), and
  -- the two JOIN-TABLE keys — utilities, suitableUses — cannot be column-tested at
  -- all and carry their own EXISTS arms below. Sweeping one join table and not the
  -- other is the easy miss here: they are siblings in the same case group.
  WITH c AS (
    SELECT pl.listing_purpose AS purpose,
           CASE pl.property_type
             WHEN 'commercial_building' THEN 'BUILDING'
             WHEN 'warehouse'           THEN 'WAREHOUSE'
             WHEN 'commercial_land'     THEN 'LAND'
             ELSE pl.commercial_subtype
           END AS subtype,
           pl.*
      FROM public.property_listings pl
     WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
       AND pl.property_type IN ('commercial','commercial_building','warehouse','commercial_land')
  ), v AS (
    SELECT 'floor_choice on non-SHOP/OFFICE'  AS why, id FROM c
      WHERE floor_choice IS NOT NULL AND subtype NOT IN ('SHOP','OFFICE')
    UNION ALL SELECT 'hub_type on non-SHOP/OFFICE', id FROM c
      WHERE hub_type IS NOT NULL AND subtype NOT IN ('SHOP','OFFICE')
    UNION ALL SELECT 'floor_mode on non-BUILDING', id FROM c
      WHERE floor_mode IS NOT NULL AND subtype IS DISTINCT FROM 'BUILDING'
    UNION ALL SELECT 'power_load_kva on non-BUILDING', id FROM c
      WHERE power_load_kva IS NOT NULL AND subtype IS DISTINCT FROM 'BUILDING'
    UNION ALL SELECT 'occupancy_status on non-SHOP/BUILDING', id FROM c
      WHERE occupancy_status IS NOT NULL AND subtype NOT IN ('SHOP','BUILDING')
    UNION ALL SELECT 'office_* on non-OFFICE', id FROM c
      WHERE (office_seats IS NOT NULL OR office_cabins IS NOT NULL
             OR office_meeting_rooms IS NOT NULL) AND subtype IS DISTINCT FROM 'OFFICE'
    UNION ALL SELECT 'warehouse_* on non-WAREHOUSE', id FROM c
      WHERE (warehouse_clear_height_ft IS NOT NULL OR warehouse_loading_bays IS NOT NULL
             OR warehouse_truck_access IS NOT NULL OR warehouse_flooring IS NOT NULL)
        AND subtype IS DISTINCT FROM 'WAREHOUSE'
    UNION ALL SELECT 'zoning/ownership/approvals on non-LAND', id FROM c
      WHERE (commercial_zoning IS NOT NULL OR commercial_ownership IS NOT NULL
             OR commercial_approvals IS NOT NULL) AND subtype IS DISTINCT FROM 'LAND'
    UNION ALL SELECT 'built-space field on LAND', id FROM c
      WHERE (washrooms_public IS NOT NULL OR washrooms_private IS NOT NULL
             OR parking_public_count IS NOT NULL OR parking_private_count IS NOT NULL
             OR commercial_furnishing_status IS NOT NULL) AND subtype = 'LAND'
    UNION ALL SELECT 'sale-only financial on a non-sale row', id FROM c
      WHERE (expected_rental_yield_pct IS NOT NULL OR current_monthly_income_paise IS NOT NULL)
        AND purpose <> 'sale'
    UNION ALL SELECT 'lease term/escalation on a sale row', id FROM c
      WHERE (lease_term_months IS NOT NULL OR lease_escalation_pct IS NOT NULL)
        AND purpose = 'sale'
    -- NULL-subtype rows: no typed commercial field is applicable to ANY of them.
    -- Stated as one arm because the config gives the same answer for every field.
    UNION ALL SELECT 'typed field on a row with NO resolved subtype', id FROM c
      WHERE subtype IS NULL AND (
            floor_choice IS NOT NULL OR hub_type IS NOT NULL
         OR floor_mode IS NOT NULL OR power_load_kva IS NOT NULL
         OR occupancy_status IS NOT NULL
         OR office_seats IS NOT NULL OR office_cabins IS NOT NULL
         OR office_meeting_rooms IS NOT NULL
         OR warehouse_clear_height_ft IS NOT NULL OR warehouse_loading_bays IS NOT NULL
         OR warehouse_truck_access IS NOT NULL OR warehouse_flooring IS NOT NULL
         OR commercial_zoning IS NOT NULL OR commercial_ownership IS NOT NULL
         OR commercial_approvals IS NOT NULL
         OR washrooms_public IS NOT NULL OR washrooms_private IS NOT NULL
         OR parking_public_count IS NOT NULL OR parking_private_count IS NOT NULL
         OR commercial_furnishing_status IS NOT NULL
         OR commercial_availability IS NOT NULL OR commercial_area_unit IS NOT NULL
         OR expected_rental_yield_pct IS NOT NULL OR current_monthly_income_paise IS NOT NULL
         OR lease_term_months IS NOT NULL OR lease_escalation_pct IS NOT NULL)
    -- TWO multi-selects live in JOIN TABLES, outside this CTE's table, so neither is
    -- reachable by the column tests above — each needs its own EXISTS. They do NOT
    -- share a rule, so they are separate arms rather than one:
    --   utilities      -> every subtype EXCEPT LAND, and never with no subtype
    --   suitableUses   -> every RESOLVED subtype (no LAND exclusion)
    UNION ALL SELECT 'utilities/amenities on LAND or on a row with no subtype', id FROM c
      WHERE (subtype = 'LAND' OR subtype IS NULL)
        AND EXISTS (SELECT 1 FROM public.listing_amenities a WHERE a.listing_id = c.id)
    UNION ALL SELECT 'suitable_uses on a row with no resolved subtype', id FROM c
      WHERE subtype IS NULL
        AND EXISTS (SELECT 1 FROM public.listing_suitable_uses su WHERE su.listing_id = c.id)
  )
  SELECT COUNT(*), COALESCE(string_agg(DISTINCT why, '; '), '')
    INTO v_inapplic, v_inapplic_txt FROM v;
  IF v_inapplic > 0 THEN
    RAISE EXCEPTION 'commercial-listings-seed: % inapplicable typed value(s) — %. In-vocabulary is '
      'NOT enough: a field on a row whose subtype/purpose does not carry it makes a reader that '
      'forgot to gate by subtype look correct. Authority: listingFieldConfig.ts#isListingFieldVisible',
      v_inapplic, v_inapplic_txt;
  END IF;

  -- ── TYPED V104 FACT COVERAGE ──────────────────────────────────────────────
  -- Without these the rows exist but CommercialSpecsSection renders null, so every
  -- "hidden when absent" assertion about it passes while proving nothing. Asserting
  -- non-NULL here means a later edit that blanks these columns FAILS THE RESTORE
  -- rather than silently re-emptying the section.

  -- SCOPE, deliberate and not an oversight: the EXISTENCE gates (must-be-non-zero)
  -- use the full servable predicate, because a lower bound satisfied only by an
  -- archived or duplicate row is coverage that is never actually served. The
  -- MUST-BE-ZERO gates below (v_bad_floor, v_sale_lease, v_legacy_typed) keep the
  -- broader status='LIVE' scope ON PURPOSE: narrowing a "this must never appear"
  -- assertion can only ever make it weaker. Do not sweep these uniformly.

  -- floor_choice must be IN VOCABULARY. An out-of-vocabulary value is silently
  -- dropped by labelFor(...) rather than erroring, so only an explicit check
  -- catches it. This guards the exact defect found in review.
  SELECT COUNT(*) INTO v_bad_floor
    FROM public.property_listings
    WHERE status = 'LIVE' AND floor_choice IS NOT NULL
      AND floor_choice NOT IN ('GROUND_FLOOR','FIRST_FLOOR','UPPER_FLOOR','MULTIPLE_FLOORS');
  IF v_bad_floor > 0 THEN
    RAISE EXCEPTION 'commercial-listings-seed: % listing(s) carry an out-of-vocabulary floor_choice. '
      'Valid values are GROUND_FLOOR/FIRST_FLOOR/UPPER_FLOOR/MULTIPLE_FLOORS '
      '(CommercialFieldOptions.VALID_FLOOR_CHOICES). An invalid value does NOT error — labelFor() '
      'returns undefined and the field renders as nothing', v_bad_floor;
  END IF;

  SELECT COUNT(*) INTO v_typed_rows
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false AND title LIKE '[COMM]%' AND hub_type IS NOT NULL;
  IF v_typed_rows < 4 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 4 rows with hub_type set, got %', v_typed_rows;
  END IF;

  SELECT COUNT(*) INTO v_warehouse
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false AND property_type = 'warehouse'
      AND warehouse_clear_height_ft IS NOT NULL AND warehouse_loading_bays IS NOT NULL
      AND warehouse_truck_access IS NOT NULL AND warehouse_flooring IS NOT NULL;
  IF v_warehouse < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 warehouse row with all four typed '
      'warehouse facts set, got %', v_warehouse;
  END IF;

  SELECT COUNT(*) INTO v_office
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false AND office_seats IS NOT NULL;
  IF v_office < 2 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 2 rows with office_seats set, got %', v_office;
  END IF;

  SELECT COUNT(*) INTO v_building
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false AND property_type = 'commercial_building'
      AND floor_mode IS NOT NULL AND power_load_kva IS NOT NULL AND occupancy_status IS NOT NULL;
  IF v_building < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 building row with floor_mode, '
      'power_load_kva and occupancy_status set, got %', v_building;
  END IF;

  -- Lower bound for the sale-only financial pair. NOT the only typed group lacking
  -- one — the built-space fields and availability/area-unit still have no lower
  -- bound either, and saying otherwise would invite a reader to believe this set is
  -- complete. It is added here because an applicability gate alone stays green if a
  -- field is deleted everywhere, so applicability needs a paired existence check to
  -- mean anything; the remaining groups are a known, deliberate gap.
  SELECT COUNT(*) INTO v_sale_fin
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false AND listing_purpose = 'sale'
      AND expected_rental_yield_pct IS NOT NULL AND current_monthly_income_paise IS NOT NULL;
  IF v_sale_fin < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 SALE row carrying both '
      'expected_rental_yield_pct and current_monthly_income_paise, got %', v_sale_fin;
  END IF;

  SELECT COUNT(*) INTO v_land
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false AND property_type = 'commercial_land'
      AND commercial_zoning IS NOT NULL AND commercial_approvals IS NOT NULL
      AND commercial_ownership IS NOT NULL;
  IF v_land < 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 1 commercial_land row with zoning, '
      'approvals and ownership set, got %', v_land;
  END IF;

  -- Purpose split: lease terms belong to RENT rows and must never appear on SALE.
  SELECT COUNT(*) INTO v_rent_lease
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false AND title LIKE '[COMM]%' AND listing_purpose = 'rent'
      AND lease_term_months IS NOT NULL AND lease_escalation_pct IS NOT NULL;
  IF v_rent_lease < 2 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 2 RENT rows carrying lease_term_months '
      'and lease_escalation_pct, got % — the rent/sale purpose split is not exercised', v_rent_lease;
  END IF;

  SELECT COUNT(*) INTO v_sale_lease
    FROM public.property_listings
    WHERE status = 'LIVE' AND title LIKE '[COMM]%' AND listing_purpose = 'sale'
      AND (lease_term_months IS NOT NULL OR lease_escalation_pct IS NOT NULL);
  IF v_sale_lease > 0 THEN
    RAISE EXCEPTION 'commercial-listings-seed: % SALE row(s) carry lease terms — lease fields must '
      'never appear on a sale listing', v_sale_lease;
  END IF;

  -- Multi-selects.
  SELECT COUNT(*) INTO v_uses
    FROM public.listing_suitable_uses su
    JOIN public.property_listings pl ON pl.id = su.listing_id
    WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
      AND pl.title LIKE '[COMM]%';
  IF v_uses < 9 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 9 listing_suitable_uses rows, got %', v_uses;
  END IF;

  SELECT COUNT(*) INTO v_amenities
    FROM public.listing_amenities a
    JOIN public.property_listings pl ON pl.id = a.listing_id
    WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
      AND pl.title LIKE '[COMM]%';
  IF v_amenities < 10 THEN
    RAISE EXCEPTION 'commercial-listings-seed: expected >= 10 listing_amenities rows, got %', v_amenities;
  END IF;

  -- The legacy row must stay UNTYPED on every axis. Populating it would destroy
  -- the pre-V102 case it exists to represent.
  SELECT COUNT(*) INTO v_legacy_typed
    FROM public.property_listings
    WHERE id = 'c0110001-0000-0000-0000-000000000006'
      AND (hub_type IS NOT NULL OR floor_choice IS NOT NULL OR floor_mode IS NOT NULL
           OR occupancy_status IS NOT NULL OR commercial_availability IS NOT NULL
           OR commercial_area_unit IS NOT NULL OR commercial_ownership IS NOT NULL);
  IF v_legacy_typed > 0 THEN
    RAISE EXCEPTION 'commercial-listings-seed: the legacy row has acquired typed V104 values — it '
      'must stay NULL on every typed axis or the pre-V102 case it represents is destroyed';
  END IF;

  -- ── #2570: the bedrooms-per-shape trio ────────────────────────────────────
  -- Each arm is asserted INDEPENDENTLY and BY VALUE. A single "all three rows
  -- exist" check would stay green if R2 drifted to R1's bedroom count, which is
  -- exactly the degradation that makes the #2566 journey unfalsifiable — and it
  -- would then surface as a PASSING capture rather than a failing seed.
  SELECT bedrooms, property_type INTO v_beds_r1, v_type_r1
    FROM public.property_listings WHERE id = '25700001-0000-0000-0000-000000000001';
  SELECT bedrooms, property_type INTO v_beds_r2, v_type_r2
    FROM public.property_listings WHERE id = '25700001-0000-0000-0000-000000000002';
  SELECT property_type INTO v_type_r3
    FROM public.property_listings WHERE id = '25700001-0000-0000-0000-000000000003';

  IF v_beds_r1 IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'commercial-listings-seed (#2570 R1): expected bedrooms = 3 on the retained arm, got %', v_beds_r1;
  END IF;
  IF v_beds_r2 IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'commercial-listings-seed (#2570 R2): expected bedrooms = 2 (a count the request does NOT ask for), got % — without a wrong-count dwelling that stays excluded, the journey proves only retention and would pass against a fix that merely stopped filtering', v_beds_r2;
  END IF;

  -- R1 and R2 must share a property_type, or the discriminating request excludes R2
  -- by TYPE rather than by bedrooms and the arm proves nothing about bedroom
  -- narrowing. Asserted rather than left to the reader.
  IF v_type_r1 IS DISTINCT FROM v_type_r2 THEN
    RAISE EXCEPTION 'commercial-listings-seed (#2570): R1 (%) and R2 (%) must share a property_type — otherwise the request excludes R2 by type, not by bedrooms, and the arm would pass against a fix that dropped the bedroom predicate entirely', v_type_r1, v_type_r2;
  END IF;

  SELECT COUNT(*) INTO v_r3_rows
    FROM public.property_listings
    WHERE id = '25700001-0000-0000-0000-000000000003'
      AND status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND bedrooms IS NULL
      AND area_key = 'IN|KA|Bengaluru|Sanjeevini Nagar';
  IF v_r3_rows <> 1 THEN
    RAISE EXCEPTION 'commercial-listings-seed (#2570 R3): expected exactly 1 LIVE, non-archived, non-duplicate Sanjeevini Nagar row with bedrooms IS NULL, got % — bedrooms NULL is the property under test, not an omission', v_r3_rows;
  END IF;

  -- R3 must not be the type the area-first journey drops unconditionally. This
  -- cannot be caught by running the journey: the endpoint does NOT validate
  -- propertyType, so an excluded type and a typo both return 200 with ZERO rows,
  -- and on an area with no agricultural inventory an empty arm is indistinguishable
  -- from a correctly-failing pre-fix arm. Assert it at seed time instead.
  IF v_type_r3 = 'agricultural_land' THEN
    RAISE EXCEPTION 'commercial-listings-seed (#2570 R3): property_type is agricultural_land, which CityAreaListingsService excludes UNCONDITIONALLY from the area-first journey — R3 would be absent in BOTH arms, so the post-fix retention it exists to demonstrate could never be observed';
  END IF;
  IF v_type_r3 IS DISTINCT FROM 'residential_plot' THEN
    RAISE EXCEPTION 'commercial-listings-seed (#2570 R3): expected property_type = residential_plot (bedroom-incapable AND served by the area-first journey), got %', v_type_r3;
  END IF;

  RAISE NOTICE 'commercial-listings-seed #2570 trio OK: R1 beds=% R2 beds=% (both %) R3 %/bedrooms NULL, all at IN|KA|Bengaluru|Sanjeevini Nagar',
    v_beds_r1, v_beds_r2, v_type_r1, v_type_r3;

  RAISE NOTICE 'commercial-listings-seed OK: total=% residential=% commercial=% subtypes=% '
    'legacy_null=% dual_v102=% dual_v104=% | typed: hub=% warehouse=% office=% building=% land=% '
    'rent_lease=% uses=% amenities=% bad_floor=% v102_only=% mixed_areas=% inapplicable=% '
    'sale_fin=%',
    v_total, v_residential, v_commercial, v_subtypes, v_legacy_null, v_dual_v102, v_dual_v104,
    v_typed_rows, v_warehouse, v_office, v_building, v_land, v_rent_lease, v_uses, v_amenities,
    v_bad_floor, v_v102_only, v_mixed_areas, v_inapplic, v_sale_fin;
END $$;

COMMIT;
