-- =============================================================================
-- V140: Price on Request (#2606) — explicit price_status, never inferred from NULL.
-- =============================================================================
-- Adds an explicit `price_status` axis to property_listings and to the #2575
-- commercial staging table (commercial_import_candidate), additive-only.
--
-- WHY A NEW COLUMN AND NOT "null price means on request". #2606 explicitly forbids
-- inferring Price on Request from a null price: null already means several different
-- things on this table today (never-priced legacy rows, a rent row's sale-price
-- columns, a listing mid-draft). Collapsing all of those into ON_REQUEST would be a
-- silent reclassification of existing data, not a new feature. price_status is the
-- explicit, honest-null-respecting signal: 'NUMERIC' for a listing carrying a real
-- asking price (the overwhelming default, and the value every pre-existing row gets
-- on this additive migration), 'ON_REQUEST' for a listing whose price is genuinely
-- unstated by the source.
--
-- WHY NOT A SENTINEL (0, -1, a display string in a numeric column). #2606 forbids all
-- three. A sentinel is a fabricated number that every future numeric consumer (price
-- filter, price sort, price/sqft, EMI) must remember to special-case or it silently
-- corrupts an aggregate. An explicit status column with price=NULL is the only shape
-- where forgetting to special-case it fails safe: NULL is invisible to SQL numeric
-- comparisons (see the CHECK below and DiscoverListingPredicateBuilder, which already
-- excludes NULL-price rows from any priceMin/priceMax filter by ordinary SQL NULL
-- semantics — no code change needed there, verified by this PR's tests).
--
-- THE INVARIANT THIS MIGRATION ENFORCES, NOT JUST DOCUMENTS: an ON_REQUEST row must
-- carry no numeric price. Without the CHECK below, a future writer could set
-- price_status='ON_REQUEST' and leave a stale numeric price in place (e.g. an edit
-- that clears the display text but not the column), which would then leak through
-- price/sqft, price/cent and the price filter as a real number attached to a listing
-- the source explicitly declined to price.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS price_status TEXT NOT NULL DEFAULT 'NUMERIC';

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_price_status
        CHECK (price_status IN ('NUMERIC', 'ON_REQUEST'));

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_price_status_on_request
        CHECK (price_status <> 'ON_REQUEST' OR (price IS NULL AND price_paise IS NULL));

COMMENT ON COLUMN public.property_listings.price_status IS
    '#2606: NUMERIC = price/price_paise carry a real asking price (default, matches every '
    'pre-existing row); ON_REQUEST = the source explicitly declined to state a price — price '
    'and price_paise are NULL by the chk_listing_price_status_on_request CHECK, never a '
    'sentinel. Never inferred from a null price alone: a NUMERIC row can also have a null '
    'price for unrelated legacy reasons, so consumers must read this column, not price IS '
    'NULL, to know whether a listing is Price on Request.';

-- ── commercial_import_candidate (V136 staging) ───────────────────────────────
-- Mirrors the property_listings column exactly, so promote.sql can carry it straight
-- across without translation. Nullable here (unlike property_listings) because
-- non-#2606 adapters/rows written before this migration leave it unset; promote.sql
-- treats a NULL staged price_status as NUMERIC (see promote.sql for the COALESCE).

ALTER TABLE public.commercial_import_candidate
    ADD COLUMN IF NOT EXISTS price_status TEXT;

ALTER TABLE public.commercial_import_candidate
    ADD CONSTRAINT chk_cic_price_status
        CHECK (price_status IS NULL OR price_status IN ('NUMERIC', 'ON_REQUEST'));

ALTER TABLE public.commercial_import_candidate
    ADD CONSTRAINT chk_cic_price_status_on_request
        CHECK (price_status <> 'ON_REQUEST' OR (price IS NULL AND price_paise IS NULL));

COMMENT ON COLUMN public.commercial_import_candidate.price_status IS
    '#2606: staging mirror of property_listings.price_status. NULL means the adapter run '
    'that produced this row predates #2606 and made no claim either way; promote.sql treats '
    'NULL as NUMERIC (the pre-#2606 default) rather than silently promoting an unstated status.';
