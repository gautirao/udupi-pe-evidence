-- flyway:executeInTransaction=false

ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'commercial_building';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'warehouse';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'commercial_land';
