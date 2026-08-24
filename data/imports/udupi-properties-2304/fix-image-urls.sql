-- Issue #2304 follow-up: repair Housing.com listing_images.url rows that were
-- inserted with an unresolved CDN template placeholder ('version') and 417 at
-- request time. Idempotent (WHERE clause only matches unfixed rows; re-running
-- after the fix is applied is a safe no-op). No DDL. Scoped to this import only
-- via a join back to parsed_data->>'importIssue' = '2304'.

BEGIN;

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/0f1f802c6db4bed26b07edf65d9cd965/v0/original/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/0f1f802c6db4bed26b07edf65d9cd965/v0/original/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/0f1f802c6db4bed26b07edf65d9cd965/v0/version/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/17f3142f8a00bb8dacf70b227daba2bc/v0/original/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/17f3142f8a00bb8dacf70b227daba2bc/v0/original/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/17f3142f8a00bb8dacf70b227daba2bc/v0/version/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/6d3f73d912baa79de3f261e24a0f228e/v0/original/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/6d3f73d912baa79de3f261e24a0f228e/v0/original/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/6d3f73d912baa79de3f261e24a0f228e/v0/version/3_bhk_apartment-for-sale-eshwar_nagar-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/475f477ffdeed3f6f917514dbef7e68a/v0/original/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/475f477ffdeed3f6f917514dbef7e68a/v0/original/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/475f477ffdeed3f6f917514dbef7e68a/v0/version/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/8af848ca5501ba5f84d9416b2b64804a/v0/original/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/8af848ca5501ba5f84d9416b2b64804a/v0/original/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/8af848ca5501ba5f84d9416b2b64804a/v0/version/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/fe6b18742d660ce8bae60604bd6a431b/v0/original/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/fe6b18742d660ce8bae60604bd6a431b/v0/original/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/fe6b18742d660ce8bae60604bd6a431b/v0/version/3_bhk_apartment-for-sale-nittur-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/12a5a25b1aea578c9250a337710fa0c3/v0/original/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/12a5a25b1aea578c9250a337710fa0c3/v0/original/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/12a5a25b1aea578c9250a337710fa0c3/v0/version/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/2b761e5f5b93b8d00d80d5bbcb4dfe33/v0/original/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/2b761e5f5b93b8d00d80d5bbcb4dfe33/v0/original/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/2b761e5f5b93b8d00d80d5bbcb4dfe33/v0/version/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/36843b8d5e8371d772b497574cd3bbdb/v0/original/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/36843b8d5e8371d772b497574cd3bbdb/v0/original/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/36843b8d5e8371d772b497574cd3bbdb/v0/version/1_bhk_apartment-for-sale-adi_udupi-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/3bf13ef1dc222fee114b0828a07c97ae/v0/original/2_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/3bf13ef1dc222fee114b0828a07c97ae/v0/original/2_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/3bf13ef1dc222fee114b0828a07c97ae/v0/version/2_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/765b12a7329973bcb7233657040cd1d7/v0/original/2_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/765b12a7329973bcb7233657040cd1d7/v0/original/2_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/765b12a7329973bcb7233657040cd1d7/v0/version/2_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/45238e362b636f696fa7397b8b715040/v0/original/2_bhk_apartment-for-sale-santhekatte-Udupi-balcony.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/45238e362b636f696fa7397b8b715040/v0/original/2_bhk_apartment-for-sale-santhekatte-Udupi-balcony.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/45238e362b636f696fa7397b8b715040/v0/version/2_bhk_apartment-for-sale-santhekatte-Udupi-balcony.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/6cabea291a5629f5a6053c795b802d8e/v0/original/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/6cabea291a5629f5a6053c795b802d8e/v0/original/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/6cabea291a5629f5a6053c795b802d8e/v0/version/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/415ce2d830b5641c77b57f9cbb1fb251/v0/original/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/415ce2d830b5641c77b57f9cbb1fb251/v0/original/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/415ce2d830b5641c77b57f9cbb1fb251/v0/version/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/53b90de814f11fd54f2a76e9a87b0571/v0/original/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/53b90de814f11fd54f2a76e9a87b0571/v0/original/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/53b90de814f11fd54f2a76e9a87b0571/v0/version/3_bhk_apartment-for-sale-santhekatte-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/e337b054a2df4d73799f40d507e85ed7/v0/original/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/e337b054a2df4d73799f40d507e85ed7/v0/original/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/e337b054a2df4d73799f40d507e85ed7/v0/version/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/6a958f5268a891bbb567a447c690b553/v0/original/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/6a958f5268a891bbb567a447c690b553/v0/original/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/6a958f5268a891bbb567a447c690b553/v0/version/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/79f5d758f2bc577c4698f6a973ed69c4/v0/original/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/79f5d758f2bc577c4698f6a973ed69c4/v0/original/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/79f5d758f2bc577c4698f6a973ed69c4/v0/version/3_bhk_apartment-for-sale-hayagriva_nagar-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/32de54465f903574698bc8d962da7f87/v0/original/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/32de54465f903574698bc8d962da7f87/v0/original/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/32de54465f903574698bc8d962da7f87/v0/version/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/67751e4eacb9358f050cdddfbe2d7199/v0/original/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/67751e4eacb9358f050cdddfbe2d7199/v0/original/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/67751e4eacb9358f050cdddfbe2d7199/v0/version/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/9f1e73057d197cf24167f0def25e6980/v0/original/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/9f1e73057d197cf24167f0def25e6980/v0/original/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/9f1e73057d197cf24167f0def25e6980/v0/version/3_bhk_apartment-for-sale-brahmagiri-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/c936c557ee7fc1349100c4cced7a63a7/v0/original/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/c936c557ee7fc1349100c4cced7a63a7/v0/original/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/c936c557ee7fc1349100c4cced7a63a7/v0/version/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/1771496090363_5e49f6eab261cb7742720eff6b0369c5/v0/original/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/1771496090363_5e49f6eab261cb7742720eff6b0369c5/v0/original/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/1771496090363_5e49f6eab261cb7742720eff6b0369c5/v0/version/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/1771496308046_33a1627a5a128fd3355075bee81df152/v0/original/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/1771496308046_33a1627a5a128fd3355075bee81df152/v0/original/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/1771496308046_33a1627a5a128fd3355075bee81df152/v0/version/2_bhk_apartment-for-sale-brahmagiri-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/bcd638a9c040c650c9cb1f9ec4962463/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-entrance.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/bcd638a9c040c650c9cb1f9ec4962463/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-entrance.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/bcd638a9c040c650c9cb1f9ec4962463/v0/version/4_bhk_independent_house-for-sale-brahmagiri-Udupi-entrance.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/371387c7103225609e7aa4480f5571d4/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/371387c7103225609e7aa4480f5571d4/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/371387c7103225609e7aa4480f5571d4/v0/version/4_bhk_independent_house-for-sale-brahmagiri-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/3892f8260e30cbce5a478bbe8e61f4fb/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/3892f8260e30cbce5a478bbe8e61f4fb/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/3892f8260e30cbce5a478bbe8e61f4fb/v0/version/4_bhk_independent_house-for-sale-brahmagiri-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/f1bbe27e61f1c6e198abdcf8952cb6c4/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/f1bbe27e61f1c6e198abdcf8952cb6c4/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/f1bbe27e61f1c6e198abdcf8952cb6c4/v0/version/4_bhk_independent_house-for-sale-brahmagiri-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/f60c40514c80ed199a33e5e7e98f7e6b/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-balcony.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/f60c40514c80ed199a33e5e7e98f7e6b/v0/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-balcony.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/f60c40514c80ed199a33e5e7e98f7e6b/v0/version/4_bhk_independent_house-for-sale-brahmagiri-Udupi-balcony.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/55d511c81f4cf69cd88c0d1aa47c4a6f/v1/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/55d511c81f4cf69cd88c0d1aa47c4a6f/v1/original/4_bhk_independent_house-for-sale-brahmagiri-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/55d511c81f4cf69cd88c0d1aa47c4a6f/v1/version/4_bhk_independent_house-for-sale-brahmagiri-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/3f50515802684814e747a2af328baac3/v0/original/2_bhk_apartment-for-sale-kuthpady-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/3f50515802684814e747a2af328baac3/v0/original/2_bhk_apartment-for-sale-kuthpady-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/3f50515802684814e747a2af328baac3/v0/version/2_bhk_apartment-for-sale-kuthpady-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/f451280e9299089f502e079ab1e156ba/v0/original/2_bhk_apartment-for-sale-kuthpady-Udupi-balcony.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/f451280e9299089f502e079ab1e156ba/v0/original/2_bhk_apartment-for-sale-kuthpady-Udupi-balcony.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/f451280e9299089f502e079ab1e156ba/v0/version/2_bhk_apartment-for-sale-kuthpady-Udupi-balcony.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/804407aecf498bce665d220b37fc7283/v0/original/2_bhk_apartment-for-sale-kuthpady-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/804407aecf498bce665d220b37fc7283/v0/original/2_bhk_apartment-for-sale-kuthpady-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/804407aecf498bce665d220b37fc7283/v0/version/2_bhk_apartment-for-sale-kuthpady-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/2916c5db834f3a70ae3977f150b87e3f/v0/original/3_bhk_apartment-for-sale-manipal_1-Udupi-balcony.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/2916c5db834f3a70ae3977f150b87e3f/v0/original/3_bhk_apartment-for-sale-manipal_1-Udupi-balcony.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/2916c5db834f3a70ae3977f150b87e3f/v0/version/3_bhk_apartment-for-sale-manipal_1-Udupi-balcony.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/bbc12f7f7ea450a44a0ed045883a7b9c/v0/original/3_bhk_apartment-for-sale-manipal_1-Udupi-balcony.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/bbc12f7f7ea450a44a0ed045883a7b9c/v0/original/3_bhk_apartment-for-sale-manipal_1-Udupi-balcony.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/bbc12f7f7ea450a44a0ed045883a7b9c/v0/version/3_bhk_apartment-for-sale-manipal_1-Udupi-balcony.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/4f2250e8/b812a09d15dcea1f412a622b1def5ffc/v0/original.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/4f2250e8/b812a09d15dcea1f412a622b1def5ffc/v0/original.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/4f2250e8/b812a09d15dcea1f412a622b1def5ffc/v0/version.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/012c1500/00882fa9390f980652c76d9f8230abed/v0/original.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/012c1500/00882fa9390f980652c76d9f8230abed/v0/original.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/012c1500/00882fa9390f980652c76d9f8230abed/v0/version.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/012c1500/1fad3f23c608e7dfb8f13d7132ec5384/v0/original.jpeg',
    storage_path = 'external:https://is1-2.housingcdn.com/012c1500/1fad3f23c608e7dfb8f13d7132ec5384/v0/original.jpeg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/012c1500/1fad3f23c608e7dfb8f13d7132ec5384/v0/version.jpeg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/0486e509b28cc64f7381e0da6060f5f3/v0/original/2_bhk_apartment-for-sale-kunjibettu-Udupi-others.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/0486e509b28cc64f7381e0da6060f5f3/v0/original/2_bhk_apartment-for-sale-kunjibettu-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/0486e509b28cc64f7381e0da6060f5f3/v0/version/2_bhk_apartment-for-sale-kunjibettu-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/4f2250e8/2f1634558e0e1ce83d348b9cdc815462/v0/original.jpeg',
    storage_path = 'external:https://is1-2.housingcdn.com/4f2250e8/2f1634558e0e1ce83d348b9cdc815462/v0/original.jpeg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/4f2250e8/2f1634558e0e1ce83d348b9cdc815462/v0/version.jpeg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/012c1500/26401eddccf6a9fae007b8133e65e17a/v0/original.jpeg',
    storage_path = 'external:https://is1-2.housingcdn.com/012c1500/26401eddccf6a9fae007b8133e65e17a/v0/original.jpeg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/012c1500/26401eddccf6a9fae007b8133e65e17a/v0/version.jpeg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/a50daefe152cf685badba5015a41fbf1/v0/original/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/a50daefe152cf685badba5015a41fbf1/v0/original/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/a50daefe152cf685badba5015a41fbf1/v0/version/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/6b7a7c6a933eaceed9a25c59774864a5/v0/original/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/6b7a7c6a933eaceed9a25c59774864a5/v0/original/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/6b7a7c6a933eaceed9a25c59774864a5/v0/version/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/a9f320b16cb8c4cf81510db3686bdda7/v0/original/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/a9f320b16cb8c4cf81510db3686bdda7/v0/original/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/a9f320b16cb8c4cf81510db3686bdda7/v0/version/2_bhk_apartment-for-sale-hayagriva_nagar-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/805a07c80b9929f0c8fed277e07c6d75/v0/original/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/805a07c80b9929f0c8fed277e07c6d75/v0/original/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/805a07c80b9929f0c8fed277e07c6d75/v0/version/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/840fe367c38cea3c0abc788469ddc5a6/v0/original/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/840fe367c38cea3c0abc788469ddc5a6/v0/original/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/840fe367c38cea3c0abc788469ddc5a6/v0/version/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/aeaac865dc5768bcaec74fdbd318eea3/v0/original/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/aeaac865dc5768bcaec74fdbd318eea3/v0/original/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/aeaac865dc5768bcaec74fdbd318eea3/v0/version/2_bhk_apartment-for-sale-ambalpadi-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/153060851ec70029a9d38304288e476c/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/153060851ec70029a9d38304288e476c/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/153060851ec70029a9d38304288e476c/v0/version/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/3cb0526d46b04432768ba6e6eb9fc700/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/3cb0526d46b04432768ba6e6eb9fc700/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/3cb0526d46b04432768ba6e6eb9fc700/v0/version/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/5e48a4b52dcfb1e581e65756e723c23d/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/5e48a4b52dcfb1e581e65756e723c23d/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/5e48a4b52dcfb1e581e65756e723c23d/v0/version/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/49fb11397e06dab456f76c6c03cb745a/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/49fb11397e06dab456f76c6c03cb745a/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/49fb11397e06dab456f76c6c03cb745a/v0/version/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/8f0c811bdf28ca1eacd242b228ffb635/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/8f0c811bdf28ca1eacd242b228ffb635/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/8f0c811bdf28ca1eacd242b228ffb635/v0/version/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/c059e72c8742d95e3544d583a9dfdfd0/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/c059e72c8742d95e3544d583a9dfdfd0/v0/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/c059e72c8742d95e3544d583a9dfdfd0/v0/version/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/54dd244c23438c6a64eb2d382df7e8c3/v1/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/54dd244c23438c6a64eb2d382df7e8c3/v1/original/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/54dd244c23438c6a64eb2d382df7e8c3/v1/version/residential_plot-for-sale-ambalpadi-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/c385101a7848238a0969d5afbc8c50d9/v0/original/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/c385101a7848238a0969d5afbc8c50d9/v0/original/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/c385101a7848238a0969d5afbc8c50d9/v0/version/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/88fa200ded04ae528a95982f160ddf3e/v0/original/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/88fa200ded04ae528a95982f160ddf3e/v0/original/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/88fa200ded04ae528a95982f160ddf3e/v0/version/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/f7c5aacafab967252f78a3f349581320/v0/original/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/f7c5aacafab967252f78a3f349581320/v0/original/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/f7c5aacafab967252f78a3f349581320/v0/version/3_bhk_independent_house-for-sale-ambalpadi-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/2554e349d346b22ccdc3d2214853f721/v0/original/2_bhk_apartment-for-sale-brahmavar-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/2554e349d346b22ccdc3d2214853f721/v0/original/2_bhk_apartment-for-sale-brahmavar-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/2554e349d346b22ccdc3d2214853f721/v0/version/2_bhk_apartment-for-sale-brahmavar-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/ff1855a2c0a7839bea8899cd97e2a82e/v0/original/2_bhk_apartment-for-sale-brahmavar-Udupi-hall.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/ff1855a2c0a7839bea8899cd97e2a82e/v0/original/2_bhk_apartment-for-sale-brahmavar-Udupi-hall.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/ff1855a2c0a7839bea8899cd97e2a82e/v0/version/2_bhk_apartment-for-sale-brahmavar-Udupi-hall.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/34a52f19c90429906d52de29e4fc06d5/v0/original/2_bhk_apartment-for-sale-brahmavar-Udupi-bathroom.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/34a52f19c90429906d52de29e4fc06d5/v0/original/2_bhk_apartment-for-sale-brahmavar-Udupi-bathroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/34a52f19c90429906d52de29e4fc06d5/v0/version/2_bhk_apartment-for-sale-brahmavar-Udupi-bathroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/2b2a3296161416d94fb69d01478d70d4/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/2b2a3296161416d94fb69d01478d70d4/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/2b2a3296161416d94fb69d01478d70d4/v0/version/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/fc9c2d7d850e1f63599d9977d2f0ee96/v0/original/3_bhk_independent_house-for-sale-brahmavar-Udupi-others.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/fc9c2d7d850e1f63599d9977d2f0ee96/v0/original/3_bhk_independent_house-for-sale-brahmavar-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/fc9c2d7d850e1f63599d9977d2f0ee96/v0/version/3_bhk_independent_house-for-sale-brahmavar-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/1698501f962904358077fa704873ab48/v0/original/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/1698501f962904358077fa704873ab48/v0/original/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/1698501f962904358077fa704873ab48/v0/version/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/07ef3ae1b0e63b5c8f5774b8ce384658/v0/original/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/07ef3ae1b0e63b5c8f5774b8ce384658/v0/original/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/07ef3ae1b0e63b5c8f5774b8ce384658/v0/version/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/b6e6167979b58c26ca88b0382bc715c9/v0/original/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/b6e6167979b58c26ca88b0382bc715c9/v0/original/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/b6e6167979b58c26ca88b0382bc715c9/v0/version/2_bhk_apartment-for-sale-chitpady-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/07d029eacccd57137db69c643837d903/v0/original/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/07d029eacccd57137db69c643837d903/v0/original/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/07d029eacccd57137db69c643837d903/v0/version/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/5dafc9347b0787ef9ee3f4354caee624/v0/original/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/5dafc9347b0787ef9ee3f4354caee624/v0/original/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/5dafc9347b0787ef9ee3f4354caee624/v0/version/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/6b801643765ce3426aadca7373425fad/v0/original/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/6b801643765ce3426aadca7373425fad/v0/original/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/6b801643765ce3426aadca7373425fad/v0/version/2_bhk_apartment-for-sale-manipal_1-Udupi-others.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/1f4de8d1c115308c40a8ca7444c42600/v0/original/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/1f4de8d1c115308c40a8ca7444c42600/v0/original/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/1f4de8d1c115308c40a8ca7444c42600/v0/version/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/4127f29caa85c1766af9a94fe7d2407c/v0/original/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/4127f29caa85c1766af9a94fe7d2407c/v0/original/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/4127f29caa85c1766af9a94fe7d2407c/v0/version/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/773e8a0eca7755b0d4b1ca21c06a8a19/v0/original/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/773e8a0eca7755b0d4b1ca21c06a8a19/v0/original/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/773e8a0eca7755b0d4b1ca21c06a8a19/v0/version/3_bhk_apartment-for-sale-kunjibettu-Udupi-bedroom.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/3b03ffa8c5f4c63b307929f38dfa1cbf/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/3b03ffa8c5f4c63b307929f38dfa1cbf/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/3b03ffa8c5f4c63b307929f38dfa1cbf/v0/version/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/41248105fc5d732195c6565e6b543b21/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/41248105fc5d732195c6565e6b543b21/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/41248105fc5d732195c6565e6b543b21/v0/version/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/656b06677d017720c1f2e575e1fd5287/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/656b06677d017720c1f2e575e1fd5287/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/656b06677d017720c1f2e575e1fd5287/v0/version/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/3b03ffa8c5f4c63b307929f38dfa1cbf/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/3b03ffa8c5f4c63b307929f38dfa1cbf/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/3b03ffa8c5f4c63b307929f38dfa1cbf/v0/version/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/41248105fc5d732195c6565e6b543b21/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/41248105fc5d732195c6565e6b543b21/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/41248105fc5d732195c6565e6b543b21/v0/version/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/656b06677d017720c1f2e575e1fd5287/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/656b06677d017720c1f2e575e1fd5287/v0/original/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/656b06677d017720c1f2e575e1fd5287/v0/version/residential_plot-for-sale-tenkanidyoor-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/1327291b1d4b8b1971573946537a2a53/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/1327291b1d4b8b1971573946537a2a53/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/1327291b1d4b8b1971573946537a2a53/v0/version/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/545eb0214517425497bb4693a76d3b64/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/545eb0214517425497bb4693a76d3b64/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/545eb0214517425497bb4693a76d3b64/v0/version/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/63328de96d4281dc5ae047aa89843e82/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/63328de96d4281dc5ae047aa89843e82/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/63328de96d4281dc5ae047aa89843e82/v0/version/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/58c671049c028fd98f0018d962441087/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/58c671049c028fd98f0018d962441087/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/58c671049c028fd98f0018d962441087/v0/version/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/972753160085b292eb65b3926ec01e7a/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/972753160085b292eb65b3926ec01e7a/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/972753160085b292eb65b3926ec01e7a/v0/version/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/bad86692eb5a07052462f68890730f30/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/bad86692eb5a07052462f68890730f30/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/bad86692eb5a07052462f68890730f30/v0/version/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/79a06e08b0e6d6b1e19e78f1f47532b0/v0/original/6_bhk_villa-for-sale-kinnimulki-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/79a06e08b0e6d6b1e19e78f1f47532b0/v0/original/6_bhk_villa-for-sale-kinnimulki-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/79a06e08b0e6d6b1e19e78f1f47532b0/v0/version/6_bhk_villa-for-sale-kinnimulki-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/03ebaa66aa23b39ff2d551ac7b66682f/v0/original/6_bhk_villa-for-sale-kinnimulki-Udupi-living_room.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/03ebaa66aa23b39ff2d551ac7b66682f/v0/original/6_bhk_villa-for-sale-kinnimulki-Udupi-living_room.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/03ebaa66aa23b39ff2d551ac7b66682f/v0/version/6_bhk_villa-for-sale-kinnimulki-Udupi-living_room.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/77c397d711aa57a3ca35705b6cb97421/v0/original/6_bhk_villa-for-sale-kinnimulki-Udupi-kitchen.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/77c397d711aa57a3ca35705b6cb97421/v0/original/6_bhk_villa-for-sale-kinnimulki-Udupi-kitchen.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/77c397d711aa57a3ca35705b6cb97421/v0/version/6_bhk_villa-for-sale-kinnimulki-Udupi-kitchen.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/19fecc898749299876053c5fd6739f7d/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/19fecc898749299876053c5fd6739f7d/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/19fecc898749299876053c5fd6739f7d/v0/version/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/4311864fa7c82b71c8840b19e8202367/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/4311864fa7c82b71c8840b19e8202367/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/4311864fa7c82b71c8840b19e8202367/v0/version/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/979efe7a2e94b3e960ad07522506d5c0/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/979efe7a2e94b3e960ad07522506d5c0/v0/original/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/979efe7a2e94b3e960ad07522506d5c0/v0/version/residential_plot-for-sale-santhekatte-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/1b5e44ec191d2cb5e32b2f0a2f3ea533/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/1b5e44ec191d2cb5e32b2f0a2f3ea533/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/1b5e44ec191d2cb5e32b2f0a2f3ea533/v0/version/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/238caf484a6a110a89ee2036943f7819/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/238caf484a6a110a89ee2036943f7819/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/238caf484a6a110a89ee2036943f7819/v0/version/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/4a7e6d793dec633f2d6f5f3328c968dc/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/4a7e6d793dec633f2d6f5f3328c968dc/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/4a7e6d793dec633f2d6f5f3328c968dc/v0/version/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/021f65080fadf9388c6a34bcac49e5c4/v0/original/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/021f65080fadf9388c6a34bcac49e5c4/v0/original/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/021f65080fadf9388c6a34bcac49e5c4/v0/version/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/114fb1e1e114e960ce1b9d0a87c9211d/v0/original/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/114fb1e1e114e960ce1b9d0a87c9211d/v0/original/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/114fb1e1e114e960ce1b9d0a87c9211d/v0/version/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/3cecd7896785240226d1f8c1a41ce829/v0/original/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/3cecd7896785240226d1f8c1a41ce829/v0/original/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/3cecd7896785240226d1f8c1a41ce829/v0/version/residential_plot-for-sale-maruthi_veethika-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/55975b95885304b43fee6729d747e6aa/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/55975b95885304b43fee6729d747e6aa/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/55975b95885304b43fee6729d747e6aa/v0/version/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/81b1daec880f05a61d4a1647161cfeee/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/81b1daec880f05a61d4a1647161cfeee/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/81b1daec880f05a61d4a1647161cfeee/v0/version/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/901542c1fa78bb7bd8ab4a0eab91f4cb/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/901542c1fa78bb7bd8ab4a0eab91f4cb/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/901542c1fa78bb7bd8ab4a0eab91f4cb/v0/version/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/5aedd2b436df44e9b1ed6c5a2c969e2a/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/5aedd2b436df44e9b1ed6c5a2c969e2a/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/5aedd2b436df44e9b1ed6c5a2c969e2a/v0/version/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/5264927f07934b62dccc7327dfd2ae16/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/5264927f07934b62dccc7327dfd2ae16/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/5264927f07934b62dccc7327dfd2ae16/v0/version/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/b088f73603c5d00d6d294c9f79eb7dfa/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/b088f73603c5d00d6d294c9f79eb7dfa/v0/original/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/b088f73603c5d00d6d294c9f79eb7dfa/v0/version/residential_plot-for-sale-chitpady-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/14520ac213088102685167696ae7207e/v0/original/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/14520ac213088102685167696ae7207e/v0/original/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/14520ac213088102685167696ae7207e/v0/version/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/37ded5e145a51c011f0ad399d551e8b5/v0/original/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/37ded5e145a51c011f0ad399d551e8b5/v0/original/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/37ded5e145a51c011f0ad399d551e8b5/v0/version/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/90bda4189cad5970167eb51c8ad2b2a4/v0/original/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/90bda4189cad5970167eb51c8ad2b2a4/v0/original/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/90bda4189cad5970167eb51c8ad2b2a4/v0/version/residential_plot-for-sale-ambagilu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/57dbd231fb0eb2d63e32ad20867adc7c/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/57dbd231fb0eb2d63e32ad20867adc7c/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/57dbd231fb0eb2d63e32ad20867adc7c/v0/version/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/6c22aa672db1097b80bab38b40eec530/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/6c22aa672db1097b80bab38b40eec530/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/6c22aa672db1097b80bab38b40eec530/v0/version/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/85889467706488b8323aa2bbee822aad/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/85889467706488b8323aa2bbee822aad/v0/original/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/85889467706488b8323aa2bbee822aad/v0/version/residential_plot-for-sale-kunjibettu-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/0a87a8ea736f9dc66892883d74d99844/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/0a87a8ea736f9dc66892883d74d99844/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/0a87a8ea736f9dc66892883d74d99844/v0/version/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/0b0361df1ee07e1c6782e1130b50772d/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/0b0361df1ee07e1c6782e1130b50772d/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/0b0361df1ee07e1c6782e1130b50772d/v0/version/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/8874c4de7a07ea1ff6ef195a04713f2b/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/8874c4de7a07ea1ff6ef195a04713f2b/v0/original/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/8874c4de7a07ea1ff6ef195a04713f2b/v0/version/residential_plot-for-sale-kinnimulki-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/50bc0744fd3be5f56b2bb78dcc34561a/v0/original/residential_plot-for-sale-manipal_1-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/50bc0744fd3be5f56b2bb78dcc34561a/v0/original/residential_plot-for-sale-manipal_1-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/50bc0744fd3be5f56b2bb78dcc34561a/v0/version/residential_plot-for-sale-manipal_1-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/b1270fa96e030fc543f51d81400928c4/v0/original/residential_plot-for-sale-manipal_1-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/b1270fa96e030fc543f51d81400928c4/v0/original/residential_plot-for-sale-manipal_1-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/b1270fa96e030fc543f51d81400928c4/v0/version/residential_plot-for-sale-manipal_1-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/13a152b95073dd395000e7bb6ce1ff93/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/13a152b95073dd395000e7bb6ce1ff93/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/13a152b95073dd395000e7bb6ce1ff93/v0/version/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/4e7bf0f9612c1b462a02124a95d9839d/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/4e7bf0f9612c1b462a02124a95d9839d/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/4e7bf0f9612c1b462a02124a95d9839d/v0/version/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/8724545b673d2105c9b538f7f42e0aca/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/8724545b673d2105c9b538f7f42e0aca/v0/original/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/8724545b673d2105c9b538f7f42e0aca/v0/version/residential_plot-for-sale-brahmavar-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/2d78f874fe68558add61915d15397a15/v0/original/residential_plot-for-sale-shirva-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/2d78f874fe68558add61915d15397a15/v0/original/residential_plot-for-sale-shirva-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/2d78f874fe68558add61915d15397a15/v0/version/residential_plot-for-sale-shirva-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/2f2c574f326955492ad200935caa9bdb/v0/original/residential_plot-for-sale-shirva-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/2f2c574f326955492ad200935caa9bdb/v0/original/residential_plot-for-sale-shirva-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/2f2c574f326955492ad200935caa9bdb/v0/version/residential_plot-for-sale-shirva-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/6ee7eafe5c453436121bb5de7767f134/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpeg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/6ee7eafe5c453436121bb5de7767f134/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpeg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/6ee7eafe5c453436121bb5de7767f134/v0/version/residential_plot-for-sale-padubidri-Udupi-plot_view.jpeg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/895ebfa66f087d90369a8f7d96493125/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/895ebfa66f087d90369a8f7d96493125/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/895ebfa66f087d90369a8f7d96493125/v0/version/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-2.housingcdn.com/01c16c28/bfe63d262597554157c0ea80ef496405/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-2.housingcdn.com/01c16c28/bfe63d262597554157c0ea80ef496405/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-2.housingcdn.com/01c16c28/bfe63d262597554157c0ea80ef496405/v0/version/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/c11781802d33720b8449f5496b7d9967/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/c11781802d33720b8449f5496b7d9967/v0/original/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/c11781802d33720b8449f5496b7d9967/v0/version/residential_plot-for-sale-padubidri-Udupi-plot_view.jpg';

UPDATE public.listing_images li
SET url = 'https://is1-3.housingcdn.com/01c16c28/1e845d499b584463106105f679000b3d/v0/original/3_bhk_villa-for-sale-tenkanidyoor-Udupi-entrance.jpg',
    storage_path = 'external:https://is1-3.housingcdn.com/01c16c28/1e845d499b584463106105f679000b3d/v0/original/3_bhk_villa-for-sale-tenkanidyoor-Udupi-entrance.jpg'
FROM public.property_listings pl
WHERE li.listing_id = pl.id
  AND pl.parsed_data->>'importIssue' = '2304'
  AND li.url = 'https://is1-3.housingcdn.com/01c16c28/1e845d499b584463106105f679000b3d/v0/version/3_bhk_villa-for-sale-tenkanidyoor-Udupi-entrance.jpg';

COMMIT;
