-- V16: Add insights_access_until to profiles with trial trigger + RLS hardening
-- SECURITY: The existing UPDATE policy on profiles allows unrestricted column updates.
-- This migration REPLACES it with a column-restricted policy to prevent users from
-- setting insights_access_until to an arbitrary future date via the Supabase REST API.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS insights_access_until TIMESTAMPTZ;

-- Retroactive trial for existing users (grace period: 3 days from now)
UPDATE public.profiles
  SET insights_access_until = NOW() + INTERVAL '3 days'
  WHERE insights_access_until IS NULL;

-- Trigger: set trial on new user profile creation
-- SECURITY DEFINER required for trigger context; this function must not be called directly.
CREATE OR REPLACE FUNCTION set_insights_trial()
RETURNS TRIGGER AS $$
BEGIN
  NEW.insights_access_until = NOW() + INTERVAL '3 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_set_trial
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_insights_trial();

-- RLS HARDENING: Replace the unrestricted UPDATE policy with a column-restricted one.
-- The backend service-account connection (JDBC DataSource) bypasses RLS and can still
-- update insights_access_until for payment grants.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update own profile display fields"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        -- Prevent modification of insights_access_until by the user directly
        AND (insights_access_until IS NOT DISTINCT FROM (
            SELECT insights_access_until FROM public.profiles WHERE user_id = auth.uid()
        ))
    );
