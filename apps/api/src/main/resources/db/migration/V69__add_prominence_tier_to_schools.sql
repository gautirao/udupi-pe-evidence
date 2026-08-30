-- V69: Add prominence_tier to distinguish discovery-notable schools from directory-only rows.
-- Computed by the pipeline script from UDISE board, school_category, and national_mgmt fields.
-- Values: 'notable' | 'directory'
ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS prominence_tier VARCHAR(20);

-- Back-fill legacy rows (V58 hand-seeded schools without UDISE metadata) to 'directory'.
-- These 20 rows have no board/school_category data, so 'directory' is the correct default.
-- Rows inserted by the Kaggle pipeline already carry explicit 'directory' values.
UPDATE public.schools
SET prominence_tier = 'directory'
WHERE prominence_tier IS NULL;

ALTER TABLE public.schools
    ADD CONSTRAINT chk_prominence_tier
    CHECK (prominence_tier IN ('notable', 'directory'));
