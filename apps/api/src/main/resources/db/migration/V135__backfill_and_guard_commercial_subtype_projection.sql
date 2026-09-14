-- =============================================================================
-- V135: #2520 — converge the V102 commercial-subtype projection onto the V104
--        write model, and guard the seam that let them drift apart.
-- =============================================================================
-- Issue: #2520 (owner ruling: Option A — backfill + guard; Option B, permanent
-- dual-source reads, is REJECTED).
--
-- THE DEFECT. `commercial_subtype` lives in two places:
--   * property_listings.commercial_subtype                  (V104 — WRITE model)
--   * listing_commercial_space_details.commercial_subtype   (V102 — READ model)
--
-- Every Discover read surface — the union predicate (DiscoverListingPredicate-
-- Builder), the card DTO (DiscoverListingsService), markers (DiscoverMarkers-
-- Service) and the OpenSearch document (ListingIndexDocument ← CommercialSpace-
-- Detail) — reads V102. ListingCrudService#refreshTypedProjections derives V102
-- from the entity in the same transaction as the save, so the invariant held for
-- every write routed through the application.
--
-- Nothing in the migrations enforced it. The #2304 data import
-- (data/imports/udupi-properties-2304/import.sql) writes property_listings
-- directly in raw SQL, with no Java in the call stack, so refreshTypedProjections
-- never ran for those rows.
--
-- THE PRECISE SHAPE MATTERS, because it decides which half of this migration
-- repairs the row. The import DOES write the projection table: three
-- INSERT INTO public.listing_commercial_space_details statements at import.sql
-- :632, :668 and :705. But their VALUES tuples (:633, :669, :706) set
-- commercial_subtype explicitly to NULL —
--   ((md5('99acres:' || 'Y92487718'))::uuid, NULL, NULL, 4, NULL, 0, NULL, NULL, NULL)
-- while the same listing's V104 property_listings.commercial_subtype carries
-- 'SHOP'. So the drifted row is NOT "no projection row at all"; it is
-- "projection row present, subtype NULL".
--
-- Consequences, both load-bearing:
--   * STEP 2's UPDATE converges these rows, not STEP 1's INSERT (STEP 1 finds a
--     row already there and its ON CONFLICT DO NOTHING correctly leaves it);
--   * the guard branch this trips is "out of step", not "projection missing".
--
-- Either way the row is unreachable: `UPPER(NULL) IN ('SHOP')` evaluates to NULL,
-- not TRUE, so it is excluded by the very filter that names it — broad Commercial
-- returns it, Commercial→Shop returns nothing.
--
-- An earlier revision of this header stated that the import "never touches the
-- projection". That was wrong, and is corrected rather than deleted because the
-- claim shaped both the fix and its tests.
--
-- THIS MIGRATION does two things, in order:
--   STEP 1/2 — backfill: converge V102 onto V104 for every commercial listing
--              whose write model carries a subtype.
--   STEP 3   — guard: a DEFERRED constraint trigger pair that makes the drifted
--              state unreachable. A write that reaches V104 without updating V102
--              now FAILS at COMMIT instead of silently diverging.
--
-- BACKFILL SCOPE == GUARD SCOPE, deliberately. A backfill narrower than the
-- invariant would leave pre-existing rows violating a live constraint; a guard
-- narrower than the backfill would leave the import path — the one that actually
-- caused this — unguarded. Both are exactly: property_type = 'commercial' AND
-- property_listings.commercial_subtype IS NOT NULL.
--
-- property_type, NOT listing_family, is the discriminator. An earlier revision of
-- this migration used listing_family = 'COMMERCIAL', reasoning that it is what
-- refreshTypedProjections routes on (ListingCrudService ~L784) and what
-- SearchOutboxPoller (~L233) uses to decide whether to load the projection. That
-- was wrong, and the canonical Commercial E2E fixture (#2517) proved it by being
-- REJECTED at load time on its BUILDING row.
--
-- ONLY listing_commercial_space_details carries a V102 commercial_subtype column:
--
--   commercial          -> SHOP | OFFICE | NULL -> listing_commercial_space_details
--   commercial_building -> BUILDING             -> listing_commercial_building_details
--   warehouse           -> WAREHOUSE            -> listing_warehouse_details
--   commercial_land     -> LAND                 -> listing_commercial_land_details
--
-- (the fixture states this asymmetry as its own contract,
-- scripts/db/fixtures/commercial-listings-seed.sql ~L79-88.)
--
-- For the self-describing types the V104 flat column is the subtype's ONLY home by
-- design, so a family-scoped guard demands a row the schema never creates. Those
-- rows also cannot exhibit this defect: every read surface resolves their subtype
-- from property_type alone, so a missing projection row loses nothing. 'commercial'
-- is the only type whose subtype is BEARING — the one axis on which SHOP and OFFICE
-- can be told apart, and therefore the only one a NULL projection can hide.
--
-- NO TAXONOMY CHANGE. This moves EXISTING values from one column to another. It
-- introduces, renames, merges and retires nothing. The five-value vocabulary
-- (SHOP / OFFICE / BUILDING / WAREHOUSE / LAND) landed with #2458 and is
-- untouched here; contracts/commercial-subtype-mapping.json is not modified.
--
-- EXPAND/CONTRACT (.claude/DEPLOYMENT.md). Expand-only: one new function, two new
-- triggers, and DML that converges derived data. No column or table is dropped,
-- no column becomes NOT NULL, no type changes, no CHECK constraint is added to
-- any column. Fully idempotent — re-running is a no-op on every step.
-- =============================================================================


-- =============================================================================
-- STEP 1: create the projection rows that never existed
-- =============================================================================
-- The shape the #2304 import leaves behind: a commercial listing with a V104
-- subtype and NO listing_commercial_space_details row at all.
--
-- The non-subtype columns mirror CommercialSpaceDetailRepository#upsertFromListing
-- exactly — the LEGACY flat columns, not the V104 split columns (washrooms_public
-- /private, office_*, warehouse_*) — so a row created here is byte-identical to
-- what the application would have written had the listing been saved through
-- ListingCrudService. created_at is omitted so it keeps its DEFAULT now(),
-- matching both the V102 backfill and upsertFromListing.
--
-- UPPER() stamps the canonical casing produced by
-- ListingController#resolveCommercialSubtype. The column has no CHECK constraint
-- (V102 ~L85, deliberate), so a lower-case value is storable; the read path
-- already normalises with UPPER() on both sides, so this changes no membership —
-- it only stops the new rows from being the ones that need normalising.
INSERT INTO public.listing_commercial_space_details
    (listing_id, commercial_subtype, floor_number, total_floors, furnishing_status,
     washrooms, parking_count, road_frontage_ft, commercial_usage)
SELECT pl.id,
       UPPER(pl.commercial_subtype),
       pl.floor_number,
       pl.total_floors,
       pl.furnishing_status,
       pl.washrooms,
       pl.parking_count,
       pl.road_frontage_ft,
       pl.commercial_usage
FROM public.property_listings pl
WHERE pl.property_type = 'commercial'
  AND pl.commercial_subtype IS NOT NULL
ON CONFLICT (listing_id) DO NOTHING;


-- =============================================================================
-- STEP 2: converge projection rows that exist but disagree
-- =============================================================================
-- Two sub-cases, one statement:
--   * projected subtype IS NULL — the V102 backfill shape (V102 ~L270 hardcodes
--     NULL for every legacy row, "cannot disambiguate shop vs office"), on a row
--     that has since acquired a real value in V104;
--   * projected subtype is present but DIFFERENT — genuine divergence. V104 wins,
--     because it is the declared write model and V102 is derived from it.
--
-- The comparison is case-insensitive on BOTH sides, so a row already storing
-- 'shop' against a V104 'SHOP' is left ALONE rather than rewritten. Those two
-- agree under every read path in the system (all four surfaces apply UPPER() or
-- normalizeCommercialSubtype), so rewriting them would be a change with no
-- observable effect on a row this issue is not about.
UPDATE public.listing_commercial_space_details lcsd
SET commercial_subtype = UPPER(pl.commercial_subtype)
FROM public.property_listings pl
WHERE lcsd.listing_id = pl.id
  AND pl.property_type = 'commercial'
  AND pl.commercial_subtype IS NOT NULL
  AND (lcsd.commercial_subtype IS NULL
       OR UPPER(lcsd.commercial_subtype) <> UPPER(pl.commercial_subtype));


-- =============================================================================
-- STEP 3: the guard
-- =============================================================================
-- After the two steps above the database satisfies the invariant. Without a
-- guard it satisfies it only until the next import: the fix would be worth
-- exactly one run.
--
-- WHY A DATABASE TRIGGER AND NOT AN APPLICATION CHECK. The write path that broke
-- the invariant was raw SQL executed against the database with no Java in the
-- call stack. A guard in ListingCrudService cannot observe it — that class is
-- precisely what the import bypassed. The guard has to live where the bypassing
-- write is actually possible.
--
-- WHY DEFERRED. ListingCrudService saves the listing and refreshes the projection
-- in ONE transaction, and the flush order between the two is Hibernate's to
-- choose. An IMMEDIATE check would fire between the two statements and reject a
-- write that is entirely correct by the time the transaction ends. DEFERRABLE
-- INITIALLY DEFERRED asks the only question worth asking: is the invariant true
-- at COMMIT?
--
-- Tests that need the check to fire inside an open transaction (a rolled-back
-- @DataJpaTest never commits, so a deferred trigger would never fire and the
-- negative case would pass vacuously) can force it with
--   SET CONSTRAINTS trg_property_listings_commercial_subtype_projected IMMEDIATE;
--
-- ⚠ DEFERRED MEANS A SEED'S TRANSACTION BOUNDARY IS LOAD-BEARING. Because the
-- check fires at COMMIT, a script that inserts a commercial listing and its
-- projection row inside ONE transaction passes, and the identical statements
-- statement-autocommitted do NOT: the property_listings INSERT commits alone and
-- the guard raises.
--
-- scripts/db/fixtures/commercial-listings-seed.sql survives only because it wraps
-- everything in BEGIN/COMMIT — and restore-test-fixture.sh runs every seed as
-- `psql -v ON_ERROR_STOP=1 -f` with NO --single-transaction anywhere (verified),
-- so nothing outside that file would supply one. Splitting that seed, dropping its
-- BEGIN/COMMIT, or adding a commercial row to any seed that is not itself wrapped
-- in a transaction aborts the whole fixture build. A matching note lives at that
-- file's BEGIN;.

CREATE OR REPLACE FUNCTION public.assert_commercial_subtype_projected(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_type      text;
    v_flat      text;
    v_projected text;
    v_has_row   boolean;
BEGIN
    SELECT pl.property_type, pl.commercial_subtype
      INTO v_type, v_flat
      FROM public.property_listings pl
     WHERE pl.id = p_listing_id;

    -- The listing is gone (ON DELETE CASCADE removed the parent in this same
    -- transaction). There is no invariant left to violate.
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Out of scope by design, and scoped on property_type rather than
    -- listing_family for a reason that is easy to get wrong.
    --
    -- ONLY listing_commercial_space_details carries a V102 commercial_subtype
    -- column. For the self-describing types the subtype lives ONLY in the V104
    -- flat column, and the typed projection row belongs in a DIFFERENT table:
    --
    --   commercial          -> SHOP | OFFICE | NULL -> listing_commercial_space_details
    --   commercial_building -> BUILDING             -> listing_commercial_building_details
    --   warehouse           -> WAREHOUSE            -> listing_warehouse_details
    --   commercial_land     -> LAND                 -> listing_commercial_land_details
    --
    -- (stated as the fixture's own contract in
    -- scripts/db/fixtures/commercial-listings-seed.sql ~L79-88.)
    --
    -- Scoping this on listing_family = 'COMMERCIAL' would demand an lcsd row for
    -- all four, which the schema deliberately does not provide. An earlier
    -- revision of this migration did exactly that and REJECTED the canonical
    -- Commercial E2E fixture (#2517) at load time, on its BUILDING row. Those
    -- rows also cannot exhibit the #2520 defect: every read surface resolves
    -- their subtype from property_type alone, so a missing lcsd row loses
    -- nothing. 'commercial' is the only type whose subtype is BEARING — the only
    -- axis on which SHOP and OFFICE can be told apart, and therefore the only one
    -- on which the projection going NULL makes a row unreachable.
    --
    -- A stray commercial_subtype on a non-commercial row (say an apartment) is
    -- likewise not a projection failure;
    -- contracts/commercial-subtype-mapping.json settles the read side of that
    -- case ("non-commercial-with-stray-subtype" resolves to null), and this
    -- trigger must not contradict it by demanding a projection row for it.
    IF v_type IS DISTINCT FROM 'commercial' THEN
        RETURN;
    END IF;

    -- Nothing to project. A commercial listing with no declared subtype is the
    -- legitimate legacy shape (V102's "never guess"), and stays legitimate.
    IF v_flat IS NULL THEN
        RETURN;
    END IF;

    SELECT lcsd.commercial_subtype, true
      INTO v_projected, v_has_row
      FROM public.listing_commercial_space_details lcsd
     WHERE lcsd.listing_id = p_listing_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'commercial_subtype projection missing: property_listings.commercial_subtype = % '
            'for listing %, but no listing_commercial_space_details row exists. Discover reads '
            'the projection, so this row would be invisible to a subtype filter. (#2520)',
            v_flat, p_listing_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_projected IS NULL OR UPPER(v_projected) <> UPPER(v_flat) THEN
        RAISE EXCEPTION
            'commercial_subtype projection out of step for listing %: write model (V104) = %, '
            'read model (V102) = %. Discover reads the projection, so these two must agree. (#2520)',
            p_listing_id, v_flat, COALESCE(v_projected, 'NULL')
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_commercial_subtype_projected(uuid) IS
    '#2520: asserts that a property_type=''commercial'' listing carrying a V104 commercial_subtype '
    'has a V102 listing_commercial_space_details row carrying the same value (case-insensitively). '
    'Scoped to ''commercial'' because that is the only type whose subtype is bearing; the '
    'self-describing types project into their own detail tables. Called from deferred constraint '
    'triggers on both tables.';


-- Trigger A — the write model moved. This is the one the #2304 import trips.
CREATE OR REPLACE FUNCTION public.trg_assert_commercial_subtype_projected_listing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Read the row's own NEW values first so the common case (a row that is not
    -- property_type 'commercial', or one with no declared subtype) costs no query
    -- at all. property_listings is updated on far more paths than this one.
    --
    -- 'commercial' is the ONLY type whose subtype is bearing, and therefore the
    -- only one whose projection going NULL can make a row unreachable. The
    -- self-describing types (commercial_building / warehouse / commercial_land)
    -- project into their OWN detail tables and resolve their subtype from
    -- property_type on every read surface — see the long note on
    -- assert_commercial_subtype_projected above.
    IF NEW.property_type IS DISTINCT FROM 'commercial' OR NEW.commercial_subtype IS NULL THEN
        RETURN NULL;
    END IF;
    PERFORM public.assert_commercial_subtype_projected(NEW.id);
    RETURN NULL;
END;
$$;

-- Trigger B — the read model moved. Catches the projection being cleared,
-- repointed or deleted out from under a populated write model, which would
-- re-open the identical hole from the other side.
--
-- NOTE, deliberately not fixed here: this trigger has NO WHEN clause, so it queues
-- a pending event for every UPDATE/DELETE on listing_commercial_space_details.
-- Trigger A needed its WHEN precisely because pending deferred events block DDL
-- (SQLSTATE 55006). A future migration that modifies rows in this table and then
-- ALTERs it in the SAME transaction would hit the identical failure. Nothing does
-- that today — there is no ALTER TABLE on listing_commercial_space_details anywhere
-- in the tree — so this is a latent hazard recorded rather than a defect fixed.
--
-- INSERT is omitted from this trigger on purpose: listing_id is the PRIMARY KEY, so
-- an lcsd INSERT can only occur where no row existed, and every route into that
-- state is already covered by trigger A on property_listings.
CREATE OR REPLACE FUNCTION public.trg_assert_commercial_subtype_projected_detail()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.assert_commercial_subtype_projected(
        CASE TG_OP WHEN 'DELETE' THEN OLD.listing_id ELSE NEW.listing_id END);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_listings_commercial_subtype_projected
    ON public.property_listings;
-- The WHEN clause is load-bearing, not an optimisation.
--
-- A deferred constraint trigger queues a pending event for every row it fires on, and Postgres
-- refuses DDL on a table that has pending trigger events: SQLSTATE 55006, "cannot ALTER TABLE
-- ... because it has pending trigger events". Without this clause, seeding rows into
-- property_listings and then running DDL on it in the SAME transaction fails — which is exactly
-- what V102TypedListingBackfillIT does (seed, then ALTER TABLE ... DROP CONSTRAINT at ~L313).
-- An earlier revision of this migration omitted the clause and broke all 10 tests in that class.
--
-- Postgres evaluates WHEN for a constraint trigger EAGERLY: "evaluation of the WHEN condition is
-- not deferred, but occurs immediately after the row update operation is performed. If the
-- condition does not evaluate to true then the trigger is not queued for deferred execution"
-- (CREATE TRIGGER, Parameters/condition). A row outside the invariant therefore queues NOTHING
-- and leaves DDL unblocked.
--
-- This does not weaken the guard. The condition IS the invariant's precondition, so every case
-- where WHEN is false is a case where the invariant is vacuously satisfied. Enqueue is decided
-- per modification: a row INSERTed out of scope and later UPDATEd into scope queues on THAT
-- update, because each modification re-evaluates WHEN independently. Every path ending in an
-- in-scope row passes through at least one modification whose post-values satisfy it.
--
-- The condition matches the function's own scope exactly: property_type 'commercial', the only
-- type whose subtype is BEARING. Scoping it on listing_family would enqueue — and then reject —
-- the self-describing BUILDING / WAREHOUSE / LAND rows, whose subtype has no V102 home at all.
CREATE CONSTRAINT TRIGGER trg_property_listings_commercial_subtype_projected
    AFTER INSERT OR UPDATE ON public.property_listings
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.property_type = 'commercial' AND NEW.commercial_subtype IS NOT NULL)
    EXECUTE FUNCTION public.trg_assert_commercial_subtype_projected_listing();

DROP TRIGGER IF EXISTS trg_commercial_detail_subtype_projected
    ON public.listing_commercial_space_details;
CREATE CONSTRAINT TRIGGER trg_commercial_detail_subtype_projected
    AFTER UPDATE OR DELETE ON public.listing_commercial_space_details
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_assert_commercial_subtype_projected_detail();


-- =============================================================================
-- END V135
-- Post-conditions, all machine-checkable and asserted in
-- CommercialSubtypeProjectionBackfill2520IT:
--   * no COMMERCIAL listing with a non-null property_listings.commercial_subtype
--     lacks a listing_commercial_space_details row;
--   * none of them disagrees with it case-insensitively;
--   * a write that creates either state fails at COMMIT rather than committing
--     a row Discover cannot reach.
-- =============================================================================
