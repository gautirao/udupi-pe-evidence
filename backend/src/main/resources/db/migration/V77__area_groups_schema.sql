-- V77: area_groups + area_group_members tables.
-- area_groups  — named groupings of areas within a city (e.g. "Tech Corridors", "Coastal Belt").
-- area_group_members — ordered membership of areas inside a group.
-- FK area_group_members.area_group_id has ON DELETE CASCADE so deleting a group removes members.
-- FK area_group_members.area_key references areas(area_key) — TEXT PRIMARY KEY, no surrogate id.
-- UNIQUE(area_group_id, area_key) prevents duplicate membership.

CREATE TABLE IF NOT EXISTS public.area_groups (
    id             SERIAL PRIMARY KEY,
    city_id        INTEGER          NOT NULL REFERENCES public.cities (id),
    slug           TEXT             NOT NULL,
    name           TEXT             NOT NULL,
    subtitle       TEXT,
    region_label   TEXT,
    display_order  INTEGER          NOT NULL DEFAULT 0,
    is_active      BOOLEAN          NOT NULL DEFAULT true,
    -- optional focus point for the group (map centering)
    focus_lat      DOUBLE PRECISION,
    focus_lon      DOUBLE PRECISION,
    -- optional bounding box for the group
    min_lat        DOUBLE PRECISION,
    min_lon        DOUBLE PRECISION,
    max_lat        DOUBLE PRECISION,
    max_lon        DOUBLE PRECISION,
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
    UNIQUE (city_id, slug)
);

CREATE TABLE IF NOT EXISTS public.area_group_members (
    id             SERIAL PRIMARY KEY,
    area_group_id  INTEGER NOT NULL REFERENCES public.area_groups (id) ON DELETE CASCADE,
    area_key       TEXT    NOT NULL REFERENCES public.areas (area_key),
    display_order  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (area_group_id, area_key)
);

-- Index: city + active flag + display_order — used by the API query WHERE/ORDER
CREATE INDEX IF NOT EXISTS idx_area_groups_city_active_order
    ON public.area_groups (city_id, is_active, display_order);

-- Index: group members ordered — used by the JOIN on area_group_members
CREATE INDEX IF NOT EXISTS idx_area_group_members_group_order
    ON public.area_group_members (area_group_id, display_order);
