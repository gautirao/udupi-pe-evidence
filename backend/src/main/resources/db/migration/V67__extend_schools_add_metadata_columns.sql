-- V67: Add metadata columns to support the Kaggle+OSM schools pipeline.
-- All columns are nullable (IF NOT EXISTS) to be safe against partial re-runs
-- and to preserve the 20 V58 legacy rows and 50 placeholder rows unchanged.

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS serial_no        VARCHAR(20),
    ADD COLUMN IF NOT EXISTS block            VARCHAR(200),
    ADD COLUMN IF NOT EXISTS village          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS cluster          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS location         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS state_mgmt       VARCHAR(200),
    ADD COLUMN IF NOT EXISTS national_mgmt    VARCHAR(200),
    ADD COLUMN IF NOT EXISTS school_category  VARCHAR(200),
    ADD COLUMN IF NOT EXISTS school_type      VARCHAR(200),
    ADD COLUMN IF NOT EXISTS school_status    VARCHAR(50),
    ADD COLUMN IF NOT EXISTS osm_id           BIGINT,
    ADD COLUMN IF NOT EXISTS osm_name         VARCHAR(500),
    ADD COLUMN IF NOT EXISTS match_confidence VARCHAR(20),
    ADD COLUMN IF NOT EXISTS match_method     VARCHAR(50);
