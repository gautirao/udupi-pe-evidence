-- Kundapur CBSE/ICSE Schools Seed Fixture
-- Generated via Apify Google Maps Scraper (compass/crawler-google-places) & manual board verification
-- Idempotent and deterministic local/dev and remote-dev seed fixture

INSERT INTO public.schools (id, udise_code, name, board, board_type, state, district, source, address, latitude, longitude, prominence_tier, area_key)
VALUES
    (gen_random_uuid(), 'APIFY-KUN-KUND-01', 'Sri Siddhivinayaka Residential School', 'ICSE', 'ICSE', 'Karnataka', 'Udupi', 'Apify', 'Hattiangadi, Kundapura Taluk, Udupi District, Karnataka 576283, India', 13.6608569, 74.7399249, 'directory', 'IN|KA|Udupi|Kundapura'),
    (gen_random_uuid(), 'APIFY-KUN-KUND-02', 'Gurukula Public School', 'CBSE', 'CBSE', 'Karnataka', 'Udupi', 'Apify', 'Anupam Enclave, Vakwady, Kundapura Taluk, Udupi District, Karnataka 576257, India', 13.5823123, 74.7190699, 'directory', 'IN|KA|Udupi|Kundapura'),
    (gen_random_uuid(), 'APIFY-KUN-NAVU-01', 'Don Bosco School', 'CBSE', 'CBSE', 'Karnataka', 'Udupi', 'Apify', 'Hosadu Post, Trasi, Kundapura Taluk, Udupi District, Karnataka 576235, India', 13.6916548, 74.6650457, 'directory', 'IN|KA|Udupi|Navunda'),
    (gen_random_uuid(), 'APIFY-KUN-BYND-01', 'St. Thomas Residential School', 'CBSE', 'CBSE', 'Karnataka', 'Udupi', 'Apify', 'Yedthare Village, Byndoor Taluk, Udupi District, Karnataka 576214, India', 13.8763924, 74.6343347, 'directory', 'IN|KA|Udupi|Byndoor'),
    (gen_random_uuid(), 'APIFY-KUN-BYND-02', 'Sri Mookambika Public School', 'CBSE', 'CBSE', 'Karnataka', 'Udupi', 'Apify', 'Jayendra Nagar, Mavinamane, Byndoor Taluk, Udupi District, Karnataka 576214, India', 13.8684632, 74.6342709, 'directory', 'IN|KA|Udupi|Byndoor')
-- #1828 AC7: latitude, longitude AND area_key are deliberately EXCLUDED from this
-- DO UPDATE SET — see bangalore-mangalore-schools-seed.sql for the full rationale
-- (re-firing V80 collapses curated counts; re-writing area_key re-imposes stale attribution).
ON CONFLICT (udise_code) WHERE udise_code IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name,
    board = EXCLUDED.board,
    board_type = EXCLUDED.board_type,
    address = EXCLUDED.address,
    prominence_tier = EXCLUDED.prominence_tier;
