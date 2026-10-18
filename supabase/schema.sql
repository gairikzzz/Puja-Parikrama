-- =========================================================================
-- PUJA PARIKRAMA - SUPABASE SCHEMA FOR N8N MODERATION PIPELINE
-- =========================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create `submissions` table
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    image_path TEXT,
    image_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    llm_verdict JSONB,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Indexes for fast map queries and status filtering
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_published_at ON public.submissions (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_metadata ON public.submissions USING gin (metadata);

-- 3. Row Level Security (RLS) Policies
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Allow anyone (public anon) to view only APPROVED submissions on the map
DROP POLICY IF EXISTS "Public can view approved submissions" ON public.submissions;
CREATE POLICY "Public can view approved submissions" 
ON public.submissions 
FOR SELECT 
USING (status = 'approved');

-- Allow service_role (used by n8n workflow) full read/write access
DROP POLICY IF EXISTS "Service role has full access" ON public.submissions;
CREATE POLICY "Service role has full access" 
ON public.submissions 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Allow authenticated or anon users to submit if inserting directly
DROP POLICY IF EXISTS "Anyone can submit a photo for review" ON public.submissions;
CREATE POLICY "Anyone can submit a photo for review" 
ON public.submissions 
FOR INSERT 
WITH CHECK (status = 'pending');

-- 4. Storage Bucket Setup (for storing pandal photos)
-- In Supabase Dashboard -> Storage:
-- 1. Create a bucket named "pandal-photos"
-- 2. Set it to "Public Bucket" so image URLs can be rendered on the map
-- Or run:
INSERT INTO storage.buckets (id, name, public)
VALUES ('pandal-photos', 'pandal-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public access to view images in pandal-photos bucket
DROP POLICY IF EXISTS "Public Access to pandal-photos" ON storage.objects;
CREATE POLICY "Public Access to pandal-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'pandal-photos');

-- Allow service_role to upload images
DROP POLICY IF EXISTS "Service role can upload to pandal-photos" ON storage.objects;
CREATE POLICY "Service role can upload to pandal-photos"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'pandal-photos');

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_submissions_updated_at ON public.submissions;
CREATE TRIGGER set_submissions_updated_at
BEFORE UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 6. Sample Approved Seed Post for Live Testing (Optional)
INSERT INTO public.submissions (
    status,
    image_url,
    published_at,
    metadata
) VALUES (
    'approved',
    'https://images.unsplash.com/photo-1571216332002-282dce467b32?auto=format&fit=crop&w=1200&q=80',
    now(),
    jsonb_build_object(
        'pandalName', 'Bharat Ratna Sangha',
        'neighborhood', 'Usha Bazar',
        'userName', 'Shatadru Sarkar',
        'userAvatar', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Shatadru&backgroundColor=ffdfbf',
        'lat', 23.8820,
        'lng', 91.2785,
        'viewsCount', 1420,
        'likesCount', 188,
        'emoji', '🪔',
        'locationSource', 'Photo EXIF GPS'
    )
) ON CONFLICT DO NOTHING;
