-- Issue #2575 Visibility Remediation (Phase 3 — Class B: Verified Aliases)
-- Remediation script for Housing commercial listings (created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775' AND listing_family = 'COMMERCIAL')

BEGIN;

-- 1. Insert verified area alias records into public.area_alias
INSERT INTO public.area_alias (city_id, area_key, alias, alias_normalised, source)
VALUES
  (1, 'IN|KA|Bengaluru|Anjanapura', 'Anjanapura Township', 'anjanapura township', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Mailasandra', 'Mylasandra', 'mylasandra', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Banashankari', 'Banashankari 6th Stage 6th Block', 'banashankari 6th stage 6th block', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Banashankari', 'Banashankari 6th Stage 4th Block', 'banashankari 6th stage 4th block', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Chikkagubbi Village', 'Chikkagubbi', 'chikkagubbi', '2575_class_b_alias'),
  (3, 'IN|KA|Udupi|Kaup', 'Kapu', 'kapu', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Kacharakanahalli,Bisnahalli', 'Kacharakanahalli', 'kacharakanahalli', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Kodihalli', 'Kodihalli Village', 'kodihalli village', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Tirumanahalli', 'Thirumanahalli', 'thirumanahalli', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Byatarayanapura', 'Byatarayanapura CMC And OG Part', 'byatarayanapura cmc and og part', '2575_class_b_alias'),
  (1, 'IN|KA|Bengaluru|Halasahalli', 'Halasahalli Thippasandra', 'halasahalli thippasandra', '2575_class_b_alias')
ON CONFLICT (city_id, alias_normalised) DO UPDATE
SET area_key = EXCLUDED.area_key,
    alias = EXCLUDED.alias,
    source = EXCLUDED.source;

-- 2. Remediate matching unresolved Housing commercial listings
UPDATE public.property_listings pl
SET 
  area_key = aa.area_key,
  area_label = a.name || ', ' || c.name,
  area_resolution_status = 'RESOLVED',
  area_resolution_method = 'ALIAS',
  updated_at = NOW()
FROM public.area_alias aa
JOIN public.areas a ON a.area_key = aa.area_key
JOIN public.cities c ON c.id = a.city_id
WHERE pl.created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
  AND pl.listing_family = 'COMMERCIAL'
  AND pl.area_resolution_status = 'UNRESOLVED'
  AND aa.alias_normalised = LOWER(TRIM(pl.locality))
  AND aa.source = '2575_class_b_alias';

COMMIT;
