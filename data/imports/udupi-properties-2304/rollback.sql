-- Rollback for issue #2304 Slice 1 Udupi import. Provenance-keyed DELETE.

BEGIN;

DELETE FROM public.listing_images WHERE listing_id IN (SELECT id FROM public.property_listings WHERE created_by = 'c897318a-c850-6ee1-1db2-3a9537b0a3b4' OR parsed_data->>'importIssue' = '2304');

DELETE FROM public.property_listings WHERE created_by = 'c897318a-c850-6ee1-1db2-3a9537b0a3b4' OR parsed_data->>'importIssue' = '2304';

DELETE FROM public.profiles WHERE user_id = 'c897318a-c850-6ee1-1db2-3a9537b0a3b4';

COMMIT;
