-- V119: enforce area_groups.slug / city_regions.region_key disjointness at
-- the database level (#1910 PR2 review follow-up).
--
-- CityRegionOnboardingService.apply() already rejects a region_model whose
-- canonical region keys collide with an active area_groups.slug for the
-- city — but that check only runs at the moment apply() executes. area_groups
-- rows are never written by application code (only by Flyway seed
-- migrations, see V101/V106/V109 etc.); nothing previously stopped a LATER
-- migration from adding an area_group whose slug matches an
-- already-materialized city_regions.region_key for that city, since apply()
-- is not re-run automatically on every deploy. These two triggers guard
-- against that collision for any non-concurrent write to either table —
-- a fresh migration, a future admin write path, or CityRegionOnboardingService
-- itself — not just the one code path that happened to check for it before.
-- (Concurrent-write locking, e.g. an advisory lock closing the TOCTOU race
-- between the trigger's SELECT EXISTS check and its guarded write, is a
-- tracked follow-up, not solved here.)
--
-- Both triggers mirror CityRegionOnboardingService.apply()'s own collision
-- message wording so an operator sees the same explanation whether the
-- rejection happens in application code or here.
--
-- PREFLIGHT: before installing the triggers, this migration first checks
-- whether the invariant is ALREADY violated in existing data (e.g. rows
-- seeded before this migration existed). The triggers only guard future
-- writes — silently installing them over a pre-existing collision would
-- leave that corruption undetected. See the DO $$ block below.

-- ── PREFLIGHT — reject if the disjointness invariant is already violated ────────────────────────

DO $$
DECLARE
    v_collisions TEXT;
BEGIN
    SELECT string_agg(
        format('city_id=%s slug/region_key=%s', ag.city_id, ag.slug),
        '; '
    )
    INTO v_collisions
    FROM public.area_groups ag
    JOIN public.city_regions cr
        ON cr.city_id = ag.city_id AND cr.region_key = ag.slug
    WHERE ag.is_active;

    IF v_collisions IS NOT NULL THEN
        RAISE EXCEPTION
            'V119 preflight failed: pre-existing area_groups.slug / city_regions.region_key collision(s) found before installing the disjointness triggers — %. Resolve these rows (rename the colliding area_group.slug or city_regions.region_key, or deactivate the area_group) before re-running this migration.',
            v_collisions;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_reject_area_group_region_key_collision()
RETURNS trigger AS $$
BEGIN
    IF NEW.is_active AND EXISTS (
        SELECT 1 FROM public.city_regions cr
        WHERE cr.city_id = NEW.city_id AND cr.region_key = NEW.slug
    ) THEN
        RAISE EXCEPTION
            'area_groups.slug=% collides with an existing city_regions.region_key for city_id=% — region keys and area_group slugs must be disjoint (#1910)',
            NEW.slug, NEW.city_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_area_groups_region_key_disjoint ON public.area_groups;
CREATE TRIGGER trg_area_groups_region_key_disjoint
    BEFORE INSERT OR UPDATE OF slug, is_active, city_id ON public.area_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_reject_area_group_region_key_collision();

CREATE OR REPLACE FUNCTION public.fn_reject_city_region_area_group_collision()
RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.area_groups ag
        WHERE ag.city_id = NEW.city_id AND ag.slug = NEW.region_key AND ag.is_active
    ) THEN
        RAISE EXCEPTION
            'city_regions.region_key=% collides with an existing active area_groups.slug for city_id=% — region keys and area_group slugs must be disjoint (#1910)',
            NEW.region_key, NEW.city_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_city_regions_area_group_disjoint ON public.city_regions;
CREATE TRIGGER trg_city_regions_area_group_disjoint
    BEFORE INSERT OR UPDATE OF region_key, city_id ON public.city_regions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_reject_city_region_area_group_collision();
