-- V0.1: Auth-specific SQL — RLS policies, auth.users references, and Supabase features.
--
-- WARNING: This migration requires elevated permissions (superuser or supabase-admin).
-- It references auth.users and auth.uid() which are Supabase-specific schemas.
-- On non-Supabase databases, skip this migration or adapt the auth references.
--
-- For existing databases where the Supabase schema is already applied,
-- set the Flyway baseline to skip this migration.

-- Foreign keys referencing auth.users
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.facebook_groups
    ADD CONSTRAINT facebook_groups_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.property_listings
    ADD CONSTRAINT property_listings_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

-- Function to auto-create profile on user signup
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

-- Trigger on auth.users to auto-create profile on signup
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

-- RLS Policies for geocode_cache
CREATE POLICY "Authenticated users can view geocode cache"
    ON public.geocode_cache FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage geocode cache"
    ON public.geocode_cache FOR ALL
    USING (public.is_admin(auth.uid()));

-- Enable realtime for property_listings (Supabase-specific)
ALTER PUBLICATION supabase_realtime ADD TABLE public.property_listings;
