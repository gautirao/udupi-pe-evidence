-- Add images column to raw_posts to store extracted image URLs
ALTER TABLE public.raw_posts 
ADD COLUMN images jsonb DEFAULT '[]'::jsonb;