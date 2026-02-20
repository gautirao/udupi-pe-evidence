-- V15: Create viewing_requests table for booking system
-- Security control M6: RLS enabled with policies as required by spec §6

CREATE TABLE public.viewing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  dealer_id UUID NOT NULL,
  requested_date DATE NOT NULL,
  requested_time_slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  requester_message TEXT,
  decline_reason TEXT,
  cancelled_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate active bookings per user per listing
CREATE UNIQUE INDEX idx_one_active_booking_per_user_listing
  ON viewing_requests (listing_id, requester_id)
  WHERE status IN ('REQUESTED', 'CONFIRMED');

-- Performance indexes
CREATE INDEX idx_viewing_requests_dealer_id ON viewing_requests (dealer_id, status);
CREATE INDEX idx_viewing_requests_requester_id ON viewing_requests (requester_id, status);

-- RLS (MANDATORY — security control M6)
ALTER TABLE public.viewing_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings"
    ON public.viewing_requests FOR SELECT
    TO authenticated
    USING (requester_id = auth.uid() OR dealer_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE by users — all mutations through backend service account
CREATE POLICY "Admins can manage all bookings"
    ON public.viewing_requests FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));
