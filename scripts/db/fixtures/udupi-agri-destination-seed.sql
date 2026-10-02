-- Udupi agri_destination_classification seed for E2E
DO $$
DECLARE
  v_city_id INT;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'udupi';

  INSERT INTO public.agri_destination_classification
    (city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, direction_key, distance_band_key, generator_version, generated_at)
  VALUES
    (v_city_id, 'IN|KA|Udupi|Brahmavar', 13.3409, 74.7421, 13.0, 0.0, 'N', '10_25', 'e2e-udupi-fixture', NOW())
  ON CONFLICT (city_id, area_key) DO NOTHING;
END $$;
