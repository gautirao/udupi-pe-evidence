CREATE TABLE IF NOT EXISTS public.area_overview_stats (
    area_key              TEXT PRIMARY KEY,
    area_level            VARCHAR(10)  NOT NULL DEFAULT 'locality',
    listing_count_90d     INTEGER      NOT NULL DEFAULT 0,
    median_price_paise    BIGINT,
    price_p10_paise       BIGINT,
    price_p90_paise       BIGINT,
    property_type_dist    JSONB,
    trend_direction       VARCHAR(10),
    trend_pct_change      NUMERIC(6,2),
    confidence_tier       VARCHAR(12)  NOT NULL DEFAULT 'fallback',
    nearby_area_keys      TEXT[],
    centroid_lat          DOUBLE PRECISION,
    centroid_lon          DOUBLE PRECISION,
    district_area_key     TEXT,
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.area_overview_stats.area_level IS
  '''locality'' = 4-segment key (e.g. IN|KA|Udupi|Manipal); ''district'' = 3-segment key (e.g. IN|KA|Udupi)';
COMMENT ON COLUMN public.area_overview_stats.district_area_key IS
  'NULL on district rows. On locality rows: the 3-segment prefix for district fallback lookup.';
COMMENT ON COLUMN public.area_overview_stats.property_type_dist IS
  'JSONB map: {"apartment": 0.6, "house": 0.3, "plot": 0.1} — proportions sum to ~1.0';
COMMENT ON COLUMN public.area_overview_stats.nearby_area_keys IS
  'Up to 4 sibling locality area_keys sorted by centroid distance (ascending). Locality rows only; NULL on district rows.';
