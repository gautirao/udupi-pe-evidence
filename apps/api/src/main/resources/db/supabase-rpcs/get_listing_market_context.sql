-- Reference copy only. Run this in the Supabase SQL editor (not via Flyway).
-- Function: get_listing_market_context
-- Returns monthly price-per-unit buckets for a given locality + property type.
-- Used by useListingMarketContext hook to power the AreaMarketWidget.

CREATE OR REPLACE FUNCTION get_listing_market_context(
  p_locality TEXT,
  p_property_type TEXT,
  p_bedrooms INT DEFAULT NULL,
  p_months INT DEFAULT 6
)
RETURNS TABLE (
  month DATE,
  listing_count INT,
  median_price_per_unit NUMERIC,
  p25_price_per_unit NUMERIC,
  p75_price_per_unit NUMERIC,
  price_basis TEXT,
  total_similar_count INT
)
LANGUAGE SQL STABLE AS $$
  WITH price_basis AS (
    SELECT CASE
      WHEN p_property_type IN ('apartment', 'house', 'commercial') THEN 'per_sqft'
      ELSE 'per_cent'
    END AS basis
  ),
  normalized AS (
    SELECT
      DATE_TRUNC('month', pl.created_at)::DATE AS month,
      CASE
        WHEN p_property_type IN ('apartment', 'house', 'commercial')
          THEN ROUND(pl.price / NULLIF(pl.built_area, 0))
        ELSE ROUND(pl.price_per_cent_paise / 100.0)
      END AS price_per_unit
    FROM property_listings pl, price_basis pb
    WHERE pl.locality = p_locality
      AND pl.property_type::TEXT = p_property_type
      AND pl.is_valid = true
      AND (p_bedrooms IS NULL OR pl.bedrooms = p_bedrooms)
      AND pl.created_at > NOW() - (p_months || ' months')::INTERVAL
      AND (
        (p_property_type IN ('apartment', 'house', 'commercial')
          AND pl.built_area IS NOT NULL AND pl.built_area > 0
          AND pl.built_area_unit = 'sqft' AND pl.price IS NOT NULL)
        OR
        (p_property_type NOT IN ('apartment', 'house', 'commercial')
          AND pl.price_per_cent_paise IS NOT NULL)
      )
  ),
  totals AS (
    SELECT COUNT(*)::INT AS total_similar_count FROM normalized
  )
  SELECT
    month,
    COUNT(*)::INT AS listing_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_unit)::NUMERIC AS median_price_per_unit,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_unit)::NUMERIC AS p25_price_per_unit,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_unit)::NUMERIC AS p75_price_per_unit,
    (SELECT basis FROM price_basis) AS price_basis,
    (SELECT total_similar_count FROM totals) AS total_similar_count
  FROM normalized
  WHERE price_per_unit IS NOT NULL
  GROUP BY month
  ORDER BY month ASC;
$$;
