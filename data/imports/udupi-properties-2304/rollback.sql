-- Rollback for issue #2304 Slice 2 Udupi import. Provenance-keyed DELETE.
-- Does NOT delete the public.profiles row for the owner: that row belongs to a real, pre-existing dev-DB account (testdealer@example.com), not a synthetic identity created by this import, so rollback must not remove it.
-- Keyed only on parsed_data->>'importIssue', NOT on created_by: created_by is now a real, shared account that may own other (non-import) listings, so matching on created_by alone would risk deleting listings this import did not create.

BEGIN;

DELETE FROM public.listing_images WHERE listing_id IN (SELECT id FROM public.property_listings WHERE parsed_data->>'importIssue' = '2304');

DELETE FROM public.property_listings WHERE parsed_data->>'importIssue' = '2304';

COMMIT;
