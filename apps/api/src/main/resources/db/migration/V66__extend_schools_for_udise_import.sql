-- V66: Extend schools table to support UDISE import from Kaggle Karnataka dataset.
-- Adds udise_code (unique, nullable for legacy rows), state, and canonical board columns.
-- Also back-fills the new board column from the existing board_type for the 20 seeded rows.
--
-- NOTE: V65 is a Java migration (EncryptPhoneAtRest). This SQL migration is V66.

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS udise_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS state      VARCHAR(100) NOT NULL DEFAULT 'Karnataka',
    ADD COLUMN IF NOT EXISTS board      VARCHAR(50);

-- Partial unique index: NULLs are excluded so the 20 legacy rows without udise_code
-- remain valid. Only rows with an actual udise_code must be globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_udise_code
    ON public.schools (udise_code)
    WHERE udise_code IS NOT NULL;

-- IMPORTANT: The partial index (WHERE udise_code IS NOT NULL) means:
-- - Rows with non-null udise_code are protected from duplicates via the index.
-- - Rows with NULL udise_code can coexist (NULLs are not equal in SQL).
-- - When using ON CONFLICT (udise_code) DO NOTHING in seed SQL, PostgreSQL
--   only applies the conflict clause for non-null udise_code rows.
--   NULL udise_code rows bypass the conflict clause and insert normally, which
--   is the intended behaviour for the 20 legacy V58 rows without UDISE codes.

-- Back-fill canonical board from board_type for the existing 20 hand-seeded rows.
-- board_type is kept for backward compatibility; board is the authoritative canonical value.
-- NOTE: AICTE rows (MIT Manipal, MAHE, KMC) are university/technical institutes,
-- not school-board affiliated. They keep 'AICTE' as their canonical board value.
UPDATE public.schools
SET board = CASE board_type
    WHEN 'CBSE'  THEN 'CBSE'
    WHEN 'ICSE'  THEN 'ICSE'
    WHEN 'State' THEN 'STATE'
    WHEN 'AICTE' THEN 'AICTE'
    ELSE               'STATE'
END
WHERE board IS NULL;
