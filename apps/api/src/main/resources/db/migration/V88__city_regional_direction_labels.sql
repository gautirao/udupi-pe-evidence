-- V88: Add city_regional_direction_labels for corridor-first cumulative agri regional UX (#1435)
--
-- GEO VERIFICATION TABLE (Udupi)
-- All bearings computed via RegionalGeo.bearingDeg(city_centroid → area_centroid).
-- Udupi centroid (from V71 cities seed): lat=13.3409, lon=74.7421
--
-- city_key | dir  | group_name                    | target        | city_centroid          | target_centroid       | bearing_deg | bucket | verdict
-- ---------|------|-------------------------------|---------------|------------------------|-----------------------|-------------|--------|--------
-- udupi    | N    | N towards Brahmavar           | Brahmavar     | 13.3409,74.7421        | 13.4286,74.7540       |    7.66     | N      | PASS
-- udupi    | NE   | NE towards Hiriadka           | Hiriadka      | 13.3409,74.7421        | 13.4200,74.8150       |   41.87     | NE     | PASS
-- udupi    | E    | E towards Manipal             | Manipal       | 13.3409,74.7421        | 13.3528,74.7947       |   75.45     | E      | PASS
-- udupi    | SE   | SE towards Karkala            | Karkala       | 13.3409,74.7421        | 13.2115,74.8986       |  130.33     | SE     | PASS
-- udupi    | S    | S towards Padubidri           | Padubidri     | 13.3409,74.7421        | 13.1843,74.7841       |  164.76     | S      | PASS
-- udupi    | SW   | SW corridor                   | (sea/neutral) | --                     | --                    | N/A         | N/A    | neutral (Arabian Sea to SW)
-- udupi    | W    | W towards Malpe               | Malpe         | 13.3409,74.7421        | 13.3537,74.7022       |  287.49     | W      | PASS
-- udupi    | NW   | NW corridor                   | (sea/neutral) | --                     | --                    | N/A         | N/A    | neutral (Arabian Sea to NW)
--
-- HARD CONSTRAINT VERIFICATION: Mangalore MUST NOT be labeled NW.
--   bearingDeg(udupi_centroid -> Mangalore 12.9141,74.8560) = 165.42 deg -> bucket = S
--   Mangalore is due SOUTH of Udupi. 'NW towards Mangalore' is PROHIBITED.
--
-- GEO VERIFICATION TABLE (Kundapur)
-- Kundapur centroid (from V71 cities seed): lat=13.6218, lon=74.6943
-- Only directions with classified area data are seeded (backfill uses V71 geo_center coords).
--
-- city_key  | dir  | group_name                    | target    | city_centroid        | target_centroid       | bearing_deg | bucket | verdict
-- ---------|------|-------------------------------|-----------|----------------------|-----------------------|-------------|--------|--------
-- kundapur | N    | N towards Byndoor             | Byndoor   | 13.6218,74.6943      | 13.8717,74.6508       |  350.41     | N      | PASS
-- kundapur | NW   | NW towards Kundapura          | Kundapura | 13.6218,74.6943      | 13.6236,74.6899       |  292.83     | NW     | PASS
--   (Note: Navunda also classifies NW: bearingDeg 317.81 deg -> NW; merged into same NW label)

CREATE TABLE IF NOT EXISTS city_regional_direction_labels (
    city_key        TEXT NOT NULL,
    direction_code  TEXT NOT NULL REFERENCES regional_directions(direction_key),
    group_name      TEXT NOT NULL,
    sort_order      INT  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_city_regional_direction_labels PRIMARY KEY (city_key, direction_code)
);

-- Udupi seed: 8 rows (6 landward-verified + 2 neutral sea/coastal corridors)
-- Bearing verification: RegionalGeo.directionKey(RegionalGeo.bearingDeg(udupi_centroid, target_centroid))
-- HARD CONSTRAINT: 'NW towards Mangalore' MUST NOT be seeded.
--   Mangalore bears ~165.4 deg (due SOUTH) from Udupi, not NW.
INSERT INTO city_regional_direction_labels (city_key, direction_code, group_name, sort_order)
VALUES
  ('udupi', 'N',  'N towards Brahmavar',  1),
  ('udupi', 'NE', 'NE towards Hiriadka',  2),
  ('udupi', 'E',  'E towards Manipal',    3),
  ('udupi', 'SE', 'SE towards Karkala',   4),
  ('udupi', 'S',  'S towards Padubidri',  5),
  ('udupi', 'SW', 'SW corridor',          6),
  ('udupi', 'W',  'W towards Malpe',      7),
  ('udupi', 'NW', 'NW corridor',          8)
ON CONFLICT (city_key, direction_code) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Kundapur seed: 2 rows (directions with classified area data per V71 geo_center backfill)
-- N -> Byndoor (bearing 350.41 deg), NW -> Kundapura/Navunda (bearings 292.83/317.81 deg)
INSERT INTO city_regional_direction_labels (city_key, direction_code, group_name, sort_order)
VALUES
  ('kundapur', 'N',  'N towards Byndoor',     1),
  ('kundapur', 'NW', 'NW towards Kundapura',  2)
ON CONFLICT (city_key, direction_code) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
