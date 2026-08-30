-- V100: Add area_slug column to areas table, backfill existing, and enforce uniqueness per (city_id, area_slug)

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS area_slug TEXT;

-- Backfill area_slug using app's canonical slugification rules (lower, replace non-alphanumeric run with hyphen, trim hyphens)
UPDATE public.areas
SET area_slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
WHERE area_slug IS NULL;

-- Enforce NOT NULL constraint
ALTER TABLE public.areas ALTER COLUMN area_slug SET NOT NULL;

-- Enforce uniqueness of area_slug within each city
ALTER TABLE public.areas ADD CONSTRAINT uq_areas_city_id_area_slug UNIQUE (city_id, area_slug);

CREATE OR REPLACE FUNCTION public.areas_populate_area_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.area_slug IS NULL THEN
        NEW.area_slug := trim(both '-' from regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_areas_populate_area_slug
BEFORE INSERT OR UPDATE ON public.areas
FOR EACH ROW
EXECUTE FUNCTION public.areas_populate_area_slug();
