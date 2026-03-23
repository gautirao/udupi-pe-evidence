-- V53: Add OTP attempt tracking and lockout columns to listing_verification_dimension.
-- otp_attempt_count: incremented on each failed verify-otp call; reset to 0 on a new OTP send.
-- otp_locked_until:  set to NOW() + 24h when attempt count reaches MAX_ATTEMPTS;
--                    NULL means no active lockout.
ALTER TABLE public.listing_verification_dimension
    ADD COLUMN IF NOT EXISTS otp_attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS otp_locked_until  TIMESTAMPTZ;
