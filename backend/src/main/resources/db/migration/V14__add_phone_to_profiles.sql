-- V14: Add phone column to profiles for dealer contact display
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone TEXT;
