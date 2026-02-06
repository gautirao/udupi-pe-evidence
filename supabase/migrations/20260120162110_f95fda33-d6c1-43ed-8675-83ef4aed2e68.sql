-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create enum for property types
CREATE TYPE public.property_type AS ENUM ('land', 'house', 'commercial', 'other');

-- Create enum for feed run status
CREATE TYPE public.feed_run_status AS ENUM ('pending', 'running', 'success', 'partial', 'failed');

-- Create profiles table for user data
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create facebook_groups table for ingestion sources
CREATE TABLE public.facebook_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    automation_enabled BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create feed_runs table for job tracking
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

-- Create raw_posts table for original Facebook post data
CREATE TABLE public.raw_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_run_id UUID REFERENCES public.feed_runs(id) ON DELETE CASCADE,
    external_post_id TEXT,
    content TEXT NOT NULL,
    posted_at TIMESTAMP WITH TIME ZONE,
    author_name TEXT,
    source_url TEXT,
    is_processed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create property_listings table for extracted data
CREATE TABLE public.property_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_post_id UUID REFERENCES public.raw_posts(id) ON DELETE SET NULL,
    property_type public.property_type NOT NULL DEFAULT 'other',
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
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create geocode_cache table for locality lookups
CREATE TABLE public.geocode_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    display_name TEXT,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_property_listings_locality ON public.property_listings(locality);
CREATE INDEX idx_property_listings_property_type ON public.property_listings(property_type);
CREATE INDEX idx_property_listings_price ON public.property_listings(price);
CREATE INDEX idx_property_listings_coordinates ON public.property_listings(latitude, longitude);
CREATE INDEX idx_property_listings_created_at ON public.property_listings(created_at);
CREATE INDEX idx_raw_posts_feed_run_id ON public.raw_posts(feed_run_id);
CREATE INDEX idx_feed_runs_status ON public.feed_runs(status);
CREATE INDEX idx_geocode_cache_locality ON public.geocode_cache(locality);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check admin role (prevents RLS recursion)
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

-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.has_role(_user_id, 'admin')
$$;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
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

-- Create function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    
    -- Auto-assign 'user' role to new users
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$;

-- Create trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_admin(auth.uid()));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
    ON public.user_roles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
    ON public.user_roles FOR ALL
    USING (public.is_admin(auth.uid()));

-- RLS Policies for facebook_groups (admin only)
CREATE POLICY "Admins can manage facebook groups"
    ON public.facebook_groups FOR ALL
    USING (public.is_admin(auth.uid()));

-- RLS Policies for feed_runs (admin only)
CREATE POLICY "Admins can manage feed runs"
    ON public.feed_runs FOR ALL
    USING (public.is_admin(auth.uid()));

-- RLS Policies for raw_posts (admin only)
CREATE POLICY "Admins can manage raw posts"
    ON public.raw_posts FOR ALL
    USING (public.is_admin(auth.uid()));

-- RLS Policies for property_listings
CREATE POLICY "Authenticated users can view valid listings"
    ON public.property_listings FOR SELECT
    TO authenticated
    USING (is_valid = true);

CREATE POLICY "Admins can manage all listings"
    ON public.property_listings FOR ALL
    USING (public.is_admin(auth.uid()));

-- RLS Policies for geocode_cache (admin only for writes, authenticated for reads)
CREATE POLICY "Authenticated users can view geocode cache"
    ON public.geocode_cache FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage geocode cache"
    ON public.geocode_cache FOR ALL
    USING (public.is_admin(auth.uid()));

-- Enable realtime for property_listings
ALTER PUBLICATION supabase_realtime ADD TABLE public.property_listings;
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'apartment';
