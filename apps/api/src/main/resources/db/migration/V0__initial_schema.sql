-- V0: Initial schema — consolidated from Supabase migrations.
-- Contains all application-level DDL (enums, tables, indexes, functions, triggers).
-- Auth-specific SQL (RLS policies, auth.users references) is in V0.1.
--
-- For existing databases where the Supabase schema is already applied,
-- set the Flyway baseline to skip this migration.

-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.property_type AS ENUM ('land', 'house', 'commercial', 'other', 'apartment');
CREATE TYPE public.feed_run_status AS ENUM ('pending', 'running', 'success', 'partial', 'failed');

-- Profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role public.app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Facebook groups table (ingestion sources)
CREATE TABLE public.facebook_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    automation_enabled BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Feed runs table (job tracking)
CREATE TABLE public.feed_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facebook_group_id UUID REFERENCES public.facebook_groups(id) ON DELETE CASCADE,
    status public.feed_run_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    posts_fetched INTEGER DEFAULT 0,
    posts_parsed INTEGER DEFAULT 0,
    posts_failed INTEGER DEFAULT 0,
    error_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Raw posts table (original Facebook post data)
CREATE TABLE public.raw_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_run_id UUID REFERENCES public.feed_runs(id) ON DELETE CASCADE,
    external_post_id TEXT,
    content TEXT NOT NULL,
    posted_at TIMESTAMP WITH TIME ZONE,
    author_name TEXT,
    source_url TEXT,
    is_processed BOOLEAN NOT NULL DEFAULT false,
    images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Property listings table (extracted data)
CREATE TABLE public.property_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_post_id UUID REFERENCES public.raw_posts(id) ON DELETE SET NULL,
    property_type public.property_type NOT NULL DEFAULT 'other',
    title TEXT,
    locality TEXT,
    price NUMERIC,
    price_unit TEXT DEFAULT 'INR',
    land_area NUMERIC,
    land_area_unit TEXT,
    built_area NUMERIC,
    built_area_unit TEXT,
    bedrooms INTEGER,
    bathrooms INTEGER,
    contact_info TEXT,
    contact_phone TEXT,
    description TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    language_detected TEXT,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    is_duplicate BOOLEAN NOT NULL DEFAULT false,
    parsed_data JSONB DEFAULT '{}'::jsonb,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Geocode cache table (locality lookups)
CREATE TABLE public.geocode_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    display_name TEXT,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_property_listings_locality ON public.property_listings(locality);
CREATE INDEX idx_property_listings_property_type ON public.property_listings(property_type);
CREATE INDEX idx_property_listings_price ON public.property_listings(price);
CREATE INDEX idx_property_listings_coordinates ON public.property_listings(latitude, longitude);
CREATE INDEX idx_property_listings_created_at ON public.property_listings(created_at);
CREATE INDEX idx_raw_posts_feed_run_id ON public.raw_posts(feed_run_id);
CREATE INDEX idx_feed_runs_status ON public.feed_runs(status);
CREATE INDEX idx_geocode_cache_locality ON public.geocode_cache(locality);

-- Security definer function to check role (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.has_role(_user_id, 'admin')
$$;

-- Function to update timestamps automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facebook_groups_updated_at
    BEFORE UPDATE ON public.facebook_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_property_listings_updated_at
    BEFORE UPDATE ON public.property_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
