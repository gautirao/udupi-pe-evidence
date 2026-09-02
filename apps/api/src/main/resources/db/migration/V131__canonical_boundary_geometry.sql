-- flyway:no-transaction
-- V131: Authoritative OSM Area/City boundary geometry (#2422), prerequisite for #2420.
--
-- Deliberately additive and separate from `areas`/`cities`: writing a value into
-- areas.geometry_source or any areas.osm_* column would flip GeometryTrust.classify()
-- from PROVISIONAL to VERIFIED and silently change AreaOnboardingApplyService's D4
-- comparison. This table carries its own provenance instead, so existing
-- GeometryTrust/AreaOnboarding behaviour is provably unregressed (ACCEPTED_DEVIATION,
-- PARTIAL_PLAN_GATE review 5082746219).
--
-- geometry(MultiPolygon, 4326) — not geography — because ST_Intersection/ST_Contains
-- (needed by #2420's polygon containment checks) are unsupported on geography.
--
-- No automatic repair: invalid/self-intersecting source geometry is quarantined
-- (status = 'QUARANTINED'), never silently fixed via ST_MakeValid/buffer(0), since that
-- would alter containment semantics #2420 depends on.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, hence no-transaction mode.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS canonical_boundary_geometry (
    id                       BIGSERIAL PRIMARY KEY,
    city_id                  INTEGER NOT NULL REFERENCES public.cities(id),
    -- 'CITY' rows describe the city's own outer boundary; 'AREA' rows describe one
    -- area within that city. area_key is NULL for CITY rows, required for AREA rows.
    entity_type              TEXT NOT NULL,
    area_key                 TEXT,

    -- Tri-state import outcome. VALID rows carry geometry; non-VALID rows explain why
    -- there isn't one — never a silently-approximated substitute.
    status                   TEXT NOT NULL,
    unavailable_reason       TEXT,
    geom                     geometry(MultiPolygon, 4326),

    -- Provenance (this table's own columns — never shared with areas.osm_*).
    geometry_source          TEXT NOT NULL,
    osm_element_type         TEXT,
    osm_element_id           BIGINT,
    osm_version               BIGINT,
    osm_extract_date         DATE,
    osm_source_name          TEXT,
    osm_source_checksum_sha256 TEXT,

    imported_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_cbg_entity_type CHECK (entity_type IN ('CITY', 'AREA')),
    CONSTRAINT ck_cbg_status CHECK (status IN ('VALID', 'QUARANTINED', 'ABSENT_IN_SOURCE')),

    -- CITY rows never carry an area_key; AREA rows always do.
    CONSTRAINT ck_cbg_area_key_matches_entity_type CHECK (
        (entity_type = 'CITY' AND area_key IS NULL)
        OR (entity_type = 'AREA' AND area_key IS NOT NULL)
    ),

    -- VALID <=> geometry present and no unavailable_reason.
    -- Non-VALID <=> geometry absent and unavailable_reason present.
    CONSTRAINT ck_cbg_status_geom CHECK (
        (status = 'VALID' AND geom IS NOT NULL AND unavailable_reason IS NULL)
        OR (status <> 'VALID' AND geom IS NULL AND unavailable_reason IS NOT NULL)
    ),

    -- Persisted geometry must actually be a valid, correctly-SRID'd MultiPolygon —
    -- belt-and-braces alongside the application-side ST_IsValid quarantine check.
    CONSTRAINT ck_cbg_geom_valid CHECK (
        geom IS NULL OR (ST_IsValid(geom) AND ST_SRID(geom) = 4326)
    )
);

-- One boundary per city (entity_type = 'CITY').
CREATE UNIQUE INDEX ${concurrently_keyword}IF NOT EXISTS uq_cbg_city_boundary
    ON canonical_boundary_geometry (city_id)
    WHERE entity_type = 'CITY';

-- One boundary per (city, area_key) pair (entity_type = 'AREA').
CREATE UNIQUE INDEX ${concurrently_keyword}IF NOT EXISTS uq_cbg_area_boundary
    ON canonical_boundary_geometry (city_id, area_key)
    WHERE entity_type = 'AREA';

CREATE INDEX ${concurrently_keyword}IF NOT EXISTS idx_cbg_geom
    ON canonical_boundary_geometry USING GIST (geom)
    WHERE geom IS NOT NULL;

CREATE INDEX ${concurrently_keyword}IF NOT EXISTS idx_cbg_city_id
    ON canonical_boundary_geometry (city_id);
