-- =============================================================================
-- V141: Agricultural acquisition staging (#2607) — additive-only staging tables.
-- =============================================================================
-- Creates STAGING tables only. No existing table is altered, no existing row is
-- touched, and nothing here makes any listing visible to a buyer. Mirrors the
-- expand-only staging convention established by V113/V115/V118/V121/V136.
--
-- WHY A SIBLING TABLE AND NOT A WIDENED chk_cic_subtype. V136's own comment on
-- chk_cic_subtype states a sixth commercial_subtype value "is a taxonomy fork,
-- which #2575 forbids" — #2575 also states outright: no new Commercial subtype
-- taxonomy without an explicit product decision. #2607's owner ruling (#2597)
-- is explicit: defer the 34 Agricultural rows the #2575 import could not place,
-- do NOT widen the Commercial staging schema, and build the sibling boundary
-- instead. This migration is that sibling: same lifecycle shape as V136,
-- separate table, separate identity space, separate subtype vocabulary.
--
-- WHY STAGING IS NOT property_listings. Same rationale as V136: staging rows
-- live here until an explicit, separately-testable promotion step copies them
-- across. Promotion is NOT part of this migration (out of scope per #2607).
--
-- THE MISCLASSIFICATION RISK (#2607). An AGRICULTURAL_LAND record forced into
-- a Commercial subtype would stage cleanly and reconcile perfectly under V136's
-- own constraints — the same failure shape as the property_type/commercial_
-- subtype pairing defect found under #2575. This table's chk_aic_subtype admits
-- ONLY 'AGRICULTURAL_LAND'; V136's chk_cic_subtype (unmodified by this
-- migration) admits only the five canonical Commercial values and already
-- excludes AGRICULTURAL_LAND. Neither table can accept the other's subtype
-- vocabulary — see AgriculturalStagingDiscrimination2607IT for the proof in
-- both directions.
--
-- PLOT AREA, NEVER BUILT-UP AREA (#2607). Agricultural land has no built-up
-- area by definition. This table deliberately carries NO built_area column at
-- all — only plot_area/plot_area_unit — so a Plot Area measurement cannot be
-- written into a built-up-area field even by mistake; the prevention is
-- structural (the column does not exist), not merely a validation rule that
-- could be skipped.
--
-- NO BEDROOM/BHK FIELDS (#2607). Agricultural Land carries no bedroom/BHK
-- semantics. This table carries NO bedroom/bathroom/BHK column — the same
-- structural prevention as built_area. A source row carrying bedroom/BHK
-- signal must be REJECTED by the adapter before it ever reaches this table
-- (see data/imports/agricultural-inventory-2607/adapter_agricultural.py); the
-- reject is a row here with an outcome and a reason, not a silent field drop,
-- matching V136's own "rejects are inspectable rows, not absences" convention.

-- ── agricultural_import_batch ────────────────────────────────────────────────
-- One row per adapter run. Purely a staging/audit record; carries no listing
-- semantics on its own and is never read by any Discover code path. Mirrors
-- commercial_import_batch (V136) field-for-field.

CREATE TABLE IF NOT EXISTS public.agricultural_import_batch (
    id                    SERIAL PRIMARY KEY,
    import_issue          INTEGER     NOT NULL,
    source_platform       TEXT        NOT NULL,
    city                  TEXT        NOT NULL,
    actor                 TEXT,
    actor_run_id          TEXT,
    dataset_id            TEXT,
    capture_file          TEXT,
    capture_sha256        TEXT,
    actor_input           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    source_terms_note     TEXT,
    captured_at           TIMESTAMPTZ,
    fetched_count         INTEGER,
    normalized_count      INTEGER,
    rejected_count        INTEGER,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agricultural_import_batch IS
    'Staging record of one #2607 Agricultural acquisition/adapter run. Never read by any '
    'Discover or listing code path; exists so an imported row can be audited back to the '
    'exact capture and actor input that produced it. Mirrors commercial_import_batch (V136).';
COMMENT ON COLUMN public.agricultural_import_batch.capture_sha256 IS
    'sha256 over the deterministic serialisation of the immutable raw capture — lets a later '
    'reader prove which bytes a batch was derived from without rereading a file that may have '
    'moved or changed.';
COMMENT ON COLUMN public.agricultural_import_batch.actor_input IS
    'The exact actor input payload for this run (city, searchMode, caps). Reproducibility: a '
    'rerun is only comparable if the input is known, not remembered.';
COMMENT ON COLUMN public.agricultural_import_batch.source_terms_note IS
    'Free-text record of the collection-permission position at run time. NULL means '
    'undocumented, which is itself a finding — never read it as "no restrictions".';

-- ── agricultural_import_candidate ────────────────────────────────────────────
-- One row per source listing considered, INCLUDING rejected ones. Rejects are
-- rows here with an outcome and a reason, not absences — mirrors V136's own
-- "rejected rows must be inspectable" requirement.

CREATE TABLE IF NOT EXISTS public.agricultural_import_candidate (
    id                      SERIAL PRIMARY KEY,
    batch_id                INTEGER     NOT NULL REFERENCES public.agricultural_import_batch (id),

    -- Identity (mirrors V136 #2575): prefer a stable source id; source_url is
    -- supporting provenance only, never the identity, so a portal URL reshuffle
    -- cannot duplicate a row.
    source_platform         TEXT        NOT NULL,
    source_listing_id       TEXT        NOT NULL,
    source_url              TEXT,

    -- Original source vocabulary, preserved alongside the normalized value so a
    -- mapping decision stays auditable after the fact.
    source_property_type    TEXT,
    source_transaction_type TEXT,

    scraped_at              TIMESTAMPTZ,
    source_updated_at       TIMESTAMPTZ,

    city                    TEXT,
    locality                TEXT,
    area_key                TEXT,
    area_label              TEXT,
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,

    -- Deliberately AGRICULTURAL-only vocabulary, kept in its own namespace so
    -- it can never be confused with property_family/commercial_subtype on the
    -- Commercial staging table.
    property_family         TEXT,
    agricultural_subtype    TEXT,
    listing_purpose          TEXT,

    -- Sale and Rent money kept in SEPARATE columns rather than one coalesced
    -- amount, mirroring V136's own rationale (a coalesced amount produces a
    -- sale-price band on a Rent row).
    price                   BIGINT,
    price_paise             BIGINT,
    monthly_rent            BIGINT,

    -- Plot Area ONLY. There is deliberately no built_area/built_area_unit
    -- column on this table — see the migration header. area_type is retained
    -- explicitly (rather than assumed) so a future reader can see the source's
    -- own area-type label was checked, not inferred.
    area_type               TEXT,
    plot_area               NUMERIC,
    plot_area_unit          TEXT,

    title                   TEXT,

    raw_payload             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    payload_checksum        TEXT,

    outcome                 TEXT        NOT NULL,
    reject_reason           TEXT,
    reject_detail           TEXT,

    -- Soft reference, deliberately NOT a foreign key — mirrors V136/V115 D2. A
    -- candidate is staged long before any listing exists to point at, and a FK
    -- would reject exactly the rows this table exists to hold.
    promoted_listing_id     UUID,
    promoted_at             TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_aic_outcome
        CHECK (outcome IN ('STAGED', 'REJECTED', 'PROMOTED')),

    -- A rejected candidate must say why. Without this, a reject reason can go
    -- NULL and the reject report silently loses its own subject.
    CONSTRAINT chk_aic_reject_reason
        CHECK (outcome <> 'REJECTED' OR reject_reason IS NOT NULL),

    -- A row that failed a data-quality gate can never be promoted. Mirrors the
    -- V136 fix (MED-2, exact-head review of 1e2878cc): this table enforces
    -- rather than trusts the same property from the moment it is created.
    CONSTRAINT chk_aic_promoted_not_rejected
        CHECK (outcome <> 'PROMOTED' OR reject_reason IS NULL),

    -- Purpose/money agreement, enforced rather than trusted to the adapter,
    -- mirroring chk_cic_purpose_money (V136).
    CONSTRAINT chk_aic_purpose_money
        CHECK (
            listing_purpose IS NULL
            OR (listing_purpose = 'sale' AND monthly_rent IS NULL)
            OR (listing_purpose = 'rent' AND price IS NULL AND price_paise IS NULL)
        ),

    -- listing_purpose mirrors chk_listing_purpose (V32) / chk_cic_listing_purpose
    -- (V136): 'lease' is NOT a persistable value and must not enter through the
    -- staging door either.
    CONSTRAINT chk_aic_listing_purpose
        CHECK (listing_purpose IS NULL OR listing_purpose IN ('sale', 'rent')),

    -- THE discrimination guarantee, half 1 of 2 (#2607). This table admits
    -- ONLY the Agricultural vocabulary. A Commercial subtype value (SHOP,
    -- OFFICE, BUILDING, WAREHOUSE, LAND — chk_cic_subtype's own canonical
    -- five, V136) reaching this column is rejected by the database itself,
    -- not merely by adapter intent. Half 2 of 2 is chk_cic_subtype on
    -- commercial_import_candidate (V136, UNMODIFIED by this migration),
    -- which already excludes AGRICULTURAL_LAND. See
    -- AgriculturalStagingDiscrimination2607IT for both directions proved
    -- against a real Postgres.
    CONSTRAINT chk_aic_subtype
        CHECK (agricultural_subtype IS NULL
               OR agricultural_subtype IN ('AGRICULTURAL_LAND')),

    -- property_family, if present, must actually say "agricultural" — belt
    -- alongside chk_aic_subtype's suspenders, so a row cannot claim a
    -- non-agricultural family while still carrying an agricultural_subtype.
    CONSTRAINT chk_aic_property_family
        CHECK (property_family IS NULL OR property_family = 'AGRICULTURAL'),

    -- No bedroom/BHK column exists on this table (see migration header), so
    -- there is nothing to constrain here — the prevention is the column's
    -- absence, not a CHECK on it. Documented at the table level below.

    -- area_type, if present, must say Plot Area — the source-declared area
    -- type is retained (not assumed) but is itself gated to the only value
    -- this table's plot_area column is allowed to represent.
    CONSTRAINT chk_aic_area_type
        CHECK (area_type IS NULL OR area_type = 'Plot Area')
);

-- THE identity constraint. This is what makes a rerun an UPDATE rather than a
-- duplicate: the staging upsert targets this key. Mirrors
-- uq_commercial_import_candidate_source_identity (V136).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agricultural_import_candidate_source_identity
    ON public.agricultural_import_candidate (source_platform, source_listing_id);

CREATE INDEX IF NOT EXISTS idx_agricultural_import_candidate_batch
    ON public.agricultural_import_candidate (batch_id);

CREATE INDEX IF NOT EXISTS idx_agricultural_import_candidate_outcome
    ON public.agricultural_import_candidate (outcome);

COMMENT ON TABLE public.agricultural_import_candidate IS
    'One row per source listing considered by a #2607 Agricultural acquisition run, INCLUDING '
    'rejected ones. Staging only — a row here is not a listing and is invisible to buyers '
    'until an explicit promotion step creates a property_listings row and records its id in '
    'promoted_listing_id (promotion is out of scope for this migration). Sibling to '
    'commercial_import_candidate (V136) — deliberately a SEPARATE table with a SEPARATE '
    'subtype vocabulary, never a widened chk_cic_subtype.';
COMMENT ON COLUMN public.agricultural_import_candidate.source_listing_id IS
    'Stable per-listing id from the source platform. Together with source_platform this is the '
    'dedupe/update identity — deliberately NOT the generic listing dedupe hash, and '
    'deliberately not source_url.';
COMMENT ON COLUMN public.agricultural_import_candidate.outcome IS
    'STAGED = normalized and eligible for promotion; REJECTED = failed a data-quality gate, '
    'reject_reason says which; PROMOTED = a property_listings row exists, see promoted_listing_id.';
COMMENT ON COLUMN public.agricultural_import_candidate.agricultural_subtype IS
    'Agricultural-only subtype vocabulary (currently just AGRICULTURAL_LAND). Deliberately a '
    'distinct column from commercial_import_candidate.commercial_subtype — never shared, never '
    'merged — so the two staging tables cannot cross-contaminate by construction.';
COMMENT ON COLUMN public.agricultural_import_candidate.plot_area IS
    'Land/plot area measurement ONLY. This table has no built_area column: a Plot Area '
    'measurement can never be written into a built-up-area field because that field does '
    'not exist here.';
COMMENT ON COLUMN public.agricultural_import_candidate.promoted_listing_id IS
    'Soft reference to property_listings.id — intentionally NOT a foreign key (mirrors V136 / '
    'V115 D2): a staged candidate has no listing row to point at yet.';
COMMENT ON COLUMN public.agricultural_import_candidate.raw_payload IS
    'Immutable JSONB snapshot of the PII-sanitised source row this candidate was derived from, '
    'including any bedroom/BHK signal that caused a REJECTED outcome — so a reject can be '
    'inspected rather than merely asserted.';

-- ── RLS: default-deny for every client-facing role ───────────────────────────
-- Neither table is exposed by any Discover/API code path — but that is an
-- application-layer fact, not an authorization boundary. V128's own finding
-- (apps/api/src/main/resources/db/migration/V128__revoke_browser_contact_column_grants.sql)
-- is directly on point: the Supabase platform bootstraps
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role` for
-- every table created in this schema, outside of and invisible to this migration
-- history. Without RLS, that blanket grant alone would let `anon`/`authenticated` —
-- the two PostgREST roles every browser request executes as — read or write these
-- staging rows directly, including raw_payload and its source provenance, the moment
-- any future code (or a stray PostgREST query) reaches them by name.
--
-- RLS strategy (mirrors the "admin + no client policy" shape of V47
-- listing_verification_dimension, minus its public/owner read policies — this table has
-- no buyer-facing reason to be read at all):
--   - The Spring Boot backend writes via the service_role key / the migration/owner role,
--     which bypasses RLS entirely (service_role is created BYPASSRLS on real Supabase and
--     on scripts/db/restore-test-fixture.sh's Testcontainers fixture). No client-role
--     policy is needed for the backend's own staging writes.
--   - Admin: full access, so admin tooling can inspect staging data if ever needed.
--   - anon / authenticated / any other role: ZERO policies means ZERO rows and every
--     write rejected — Postgres's own row-security default-deny — regardless of the
--     platform's table-level GRANT ALL. This is deliberately NOT a buyer-facing table;
--     there is no public or owner-read policy to add, unlike V47's listing-adjacent table.
--
-- V136's commercial_import_batch/commercial_import_candidate predate this hardening and
-- carry the identical gap; retrofitting them is out of scope here (a change to already-
-- merged #2575 schema) and is tracked as a separate follow-up rather than folded into
-- this PR.

ALTER TABLE public.agricultural_import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agricultural_import_candidate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all agricultural_import_batch rows"
    ON public.agricultural_import_batch FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage all agricultural_import_candidate rows"
    ON public.agricultural_import_candidate FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));
