-- Migration: Add structured address fields to stores table
-- Date: 2026-01-28
-- Purpose: Support Google Places API address components for better address management

-- Add structured address columns (IF NOT EXISTS pattern via safe ALTER)
DO $$ 
BEGIN
  -- addr_line1: Street number + route (số nhà + tên đường)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_line1'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_line1 text NULL;
  END IF;

  -- addr_ward: Phường/Xã (administrative_area_level_3 or sublocality_level_2)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_ward'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_ward text NULL;
  END IF;

  -- addr_district: Quận/Huyện (sublocality_level_1 or administrative_area_level_2)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_district'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_district text NULL;
  END IF;

  -- addr_city: Thành phố (locality or administrative_area_level_1)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_city'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_city text NULL;
  END IF;

  -- addr_state: Tỉnh/State (administrative_area_level_1)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_state'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_state text NULL;
  END IF;

  -- addr_postcode: Mã bưu điện
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_postcode'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_postcode text NULL;
  END IF;

  -- addr_country: Quốc gia
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_country'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_country text NULL;
  END IF;

  -- addr_place_id: Google Place ID
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_place_id'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_place_id text NULL;
  END IF;

  -- addr_display_name: Formatted address from Google (ưu tiên formattedAddress)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_display_name'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_display_name text NULL;
  END IF;

  -- addr_raw: Raw JSON from Google Place Details API
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'addr_raw'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN addr_raw jsonb NULL;
  END IF;

END $$;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stores_addr_place_id ON public.stores(addr_place_id);
CREATE INDEX IF NOT EXISTS idx_stores_addr_city ON public.stores(addr_city);
CREATE INDEX IF NOT EXISTS idx_stores_addr_district ON public.stores(addr_district);

-- Create GIN index for JSON search on addr_raw
CREATE INDEX IF NOT EXISTS idx_stores_addr_raw_gin ON public.stores USING gin(addr_raw);

-- Add comment for documentation
COMMENT ON COLUMN public.stores.addr_line1 IS 'Street number + route (e.g., "123 Nguyễn Văn Cừ")';
COMMENT ON COLUMN public.stores.addr_ward IS 'Ward/Commune (Phường/Xã) from administrative_area_level_3 or sublocality_level_2';
COMMENT ON COLUMN public.stores.addr_district IS 'District (Quận/Huyện) from sublocality_level_1';
COMMENT ON COLUMN public.stores.addr_city IS 'City/Province (Thành phố/Tỉnh) from locality or administrative_area_level_1';
COMMENT ON COLUMN public.stores.addr_state IS 'State/Province level from administrative_area_level_1';
COMMENT ON COLUMN public.stores.addr_postcode IS 'Postal code';
COMMENT ON COLUMN public.stores.addr_country IS 'Country name';
COMMENT ON COLUMN public.stores.addr_place_id IS 'Google Place ID for reference';
COMMENT ON COLUMN public.stores.addr_display_name IS 'Formatted full address from Google formattedAddress';
COMMENT ON COLUMN public.stores.addr_raw IS 'Raw JSON response from Google Place Details API';

-- Migration complete
