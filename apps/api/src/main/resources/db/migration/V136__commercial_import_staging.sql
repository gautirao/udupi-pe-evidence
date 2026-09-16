-- =============================================================================
-- V136: Commercial acquisition staging (#2575) — additive-only staging tables.
-- =============================================================================
-- Creates STAGING tables only. No existing table is altered, no existing row is
-- touched, and nothing here makes any listing visible to a buyer. Mirrors the
-- expand-only staging convention established by V113/V115/V118/V121.
--
-- WHY A TABLE AND NOT JUST A FILE. #2575 requires that "repeated runs are
-- idempotent" and that "an updated source listing updates the staged record
-- rather than creating a duplicate". Both are statements about IDENTITY, and the
-- identity the issue asks for — (source_platform, source_listing_id) — has no
-- home in the current schema: `git grep source_platform` over this directory
-- returns nothing, and the #2304 import carries provenance only inside
-- parsed_data jsonb with the primary key derived as (md5('<source>:'||id))::uuid.
-- A UNIQUE constraint is what makes "update, never duplicate" enforceable rather
-- than merely intended.
--
-- WHY STAGING IS NOT property_listings. #2575: "The scraper must not write
-- directly into live property_listings" and "scraping alone cannot make a
-- listing LIVE". Staging rows live here until an explicit, separately-testable
-- promotion step copies them across. Promotion is NOT part of this migration.
--
-- A NOTE ON 'SCRAPED'. property_listings.status already permits 'SCRAPED'
-- (V7 default, V60 chk_listing_status), which looks like the natural staging
-- state. It is NOT sufficient on its own: V60's RLS SELECT policy is
--     status = 'LIVE' OR (status = 'SCRAPED' AND is_valid = true)
-- so a SCRAPED row with is_valid = true is readable by any authenticated user.
-- Staging in a separate table avoids depending on a flag whose meaning is
-- entangled with visibility.

-- ── commercial_import_batch ──────────────────────────────────────────────────
-- One row per adapter run. Purely a staging/audit record; carries no listing
-- semantics on its own and is never read by any Discover code path.

CREATE TABLE IF NOT EXISTS public.commercial_import_batch (
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

COMMENT ON TABLE public.commercial_import_batch IS
    'Staging record of one #2575 Commercial acquisition/adapter run. Never read by any '
    'Discover or listing code path; exists so an imported row can be audited back to the '
    'exact capture and actor input that produced it.';
COMMENT ON COLUMN public.commercial_import_batch.capture_sha256 IS
    'sha256 over the deterministic serialisation of the immutable raw capture — lets a later '
    'reader prove which bytes a batch was derived from without rereading a file that may have '
    'moved or changed.';
COMMENT ON COLUMN public.commercial_import_batch.actor_input IS
    'The exact actor input payload for this run (city, searchMode, caps). Reproducibility: a '
    'rerun is only comparable if the input is known, not remembered.';
COMMENT ON COLUMN public.commercial_import_batch.source_terms_note IS
    'Free-text record of the collection-permission position at run time (#2575 requires source '
    'terms be documented BEFORE a production run). NULL means undocumented, which is itself a '
    'finding — never read it as "no restrictions".';

-- ── commercial_import_candidate ──────────────────────────────────────────────
-- One row per source listing considered, INCLUDING rejected ones. Rejects are
-- rows here with an outcome and a reason, not absences — #2575 requires rejected
-- rows be inspectable, and a silently dropped row is indistinguishable from a
-- row the source never returned.

CREATE TABLE IF NOT EXISTS public.commercial_import_candidate (
    id                      SERIAL PRIMARY KEY,
    batch_id                INTEGER     NOT NULL REFERENCES public.commercial_import_batch (id),

    -- Identity (#2575): prefer a stable source id; source_url is supporting
    -- provenance only, never the identity, so a portal URL reshuffle cannot
    -- duplicate a row.
    source_platform         TEXT        NOT NULL,
    source_listing_id       TEXT        NOT NULL,
    source_url              TEXT,

    -- Original source vocabulary, preserved alongside the normalized value so a
    -- mapping decision stays auditable after the fact (#2575 mapping rules).
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

    property_family         TEXT,
    property_type           TEXT,
    commercial_subtype      TEXT,
    listing_purpose         TEXT,

    -- Sale and Rent money are kept in SEPARATE columns rather than one coalesced
    -- amount. Coalescing is what produces a sale-price band on a Rent row, which
    -- the #2575 verification contract forbids outright.
    price                   BIGINT,
    price_paise             BIGINT,
    monthly_rent            BIGINT,

    built_area              NUMERIC,
    built_area_unit         TEXT,
    land_area               NUMERIC,
    land_area_unit          TEXT,
    floor_number            INTEGER,
    total_floors            INTEGER,
    washrooms               INTEGER,
    commercial_furnishing_status TEXT,
    title                   TEXT,

    raw_payload             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    payload_checksum        TEXT,

    outcome                 TEXT        NOT NULL,
    reject_reason           TEXT,
    reject_detail           TEXT,

    -- Soft reference, deliberately NOT a foreign key — mirrors V115 D2. A
    -- candidate is staged long before any listing exists to point at, and a FK
    -- would reject exactly the rows this table exists to hold.
    promoted_listing_id     UUID,
    promoted_at             TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_cic_outcome
        CHECK (outcome IN ('STAGED', 'REJECTED', 'PROMOTED')),

    -- A rejected candidate must say why. Without this, a reject reason can go
    -- NULL and the reject report silently loses its own subject.
    CONSTRAINT chk_cic_reject_reason
        CHECK (outcome <> 'REJECTED' OR reject_reason IS NOT NULL),

    -- A row that failed a data-quality gate can never be promoted. Without this,
    -- the 71 coordinate-untrusted rows are protected only by the ABSENCE of code
    -- that would promote them — and absence of code is not a constraint. This
    -- table enforces rather than trusts everywhere else; it should here too.
    -- Raised as MED-2 in the exact-head review of 1e2878cc and fixed while V136
    -- is still unmerged, rather than deferred to a later PR.
    CONSTRAINT chk_cic_promoted_not_rejected
        CHECK (outcome <> 'PROMOTED' OR reject_reason IS NULL),

    -- Purpose/money agreement, enforced rather than trusted to the adapter:
    -- a sale candidate carries no monthly_rent, a rent candidate carries no
    -- sale price. This is the schema-level half of "no null sale-only price
    -- band on Rent rows".
    CONSTRAINT chk_cic_purpose_money
        CHECK (
            listing_purpose IS NULL
            OR (listing_purpose = 'sale' AND monthly_rent IS NULL)
            OR (listing_purpose = 'rent' AND price IS NULL AND price_paise IS NULL)
        ),

    -- The canonical five. A sixth value reaching staging is a taxonomy fork,
    -- which #2575 forbids ("no new Commercial subtype taxonomy").
    CONSTRAINT chk_cic_subtype
        CHECK (commercial_subtype IS NULL
               OR commercial_subtype IN ('SHOP', 'OFFICE', 'BUILDING', 'WAREHOUSE', 'LAND')),

    -- listing_purpose mirrors chk_listing_purpose (V32): 'lease' is NOT a
    -- persistable value and must not enter through the staging door either.
    CONSTRAINT chk_cic_listing_purpose
        CHECK (listing_purpose IS NULL OR listing_purpose IN ('sale', 'rent'))
);

-- THE identity constraint (#2575). This is what makes a rerun an UPDATE rather
-- than a duplicate: the promotion/staging upsert targets this key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_import_candidate_source_identity
    ON public.commercial_import_candidate (source_platform, source_listing_id);

CREATE INDEX IF NOT EXISTS idx_commercial_import_candidate_batch
    ON public.commercial_import_candidate (batch_id);

CREATE INDEX IF NOT EXISTS idx_commercial_import_candidate_outcome
    ON public.commercial_import_candidate (outcome);

COMMENT ON TABLE public.commercial_import_candidate IS
    'One row per source listing considered by a #2575 Commercial acquisition run, INCLUDING '
    'rejected ones. Staging only — a row here is not a listing and is invisible to buyers '
    'until an explicit promotion step creates a property_listings row and records its id in '
    'promoted_listing_id.';
COMMENT ON COLUMN public.commercial_import_candidate.source_listing_id IS
    'Stable per-listing id from the source platform. Together with source_platform this is the '
    'dedupe/update identity (#2575) — deliberately NOT the generic listing dedupe hash, and '
    'deliberately not source_url.';
COMMENT ON COLUMN public.commercial_import_candidate.outcome IS
    'STAGED = normalized and eligible for promotion; REJECTED = failed a data-quality gate, '
    'reject_reason says which; PROMOTED = a property_listings row exists, see promoted_listing_id.';
COMMENT ON COLUMN public.commercial_import_candidate.promoted_listing_id IS
    'Soft reference to property_listings.id — intentionally NOT a foreign key (mirrors V115 D2): '
    'a staged candidate has no listing row to point at yet.';
COMMENT ON COLUMN public.commercial_import_candidate.raw_payload IS
    'Immutable JSONB snapshot of the PII-sanitised source row this candidate was derived from, '
    'so a mapping decision can be re-examined without rereading the capture file.';
