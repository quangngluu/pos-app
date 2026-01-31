-- Migration: Add PostGIS support and geom column to stores table
-- Date: 2026-01-31
-- Purpose: Enable spatial queries for nearest store lookup

-- Enable PostGIS extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geom column to stores table (SRID 4326 = WGS84)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'geom'
  ) THEN
    ALTER TABLE public.stores 
    ADD COLUMN geom geometry(Point, 4326) NULL;
    
    -- Create spatial index for performance
    CREATE INDEX idx_stores_geom_gist ON public.stores USING gist(geom);
    
    COMMENT ON COLUMN public.stores.geom IS 'PostGIS geometry point (SRID 4326) for spatial queries';
  END IF;
END $$;

-- Add columns for latitude and longitude if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'lat'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN lat double precision NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'lng'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN lng double precision NULL;
  END IF;
END $$;

-- Create trigger to auto-update geom when lat/lng changes
CREATE OR REPLACE FUNCTION update_stores_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_stores_geom ON public.stores;
CREATE TRIGGER trigger_update_stores_geom
  BEFORE INSERT OR UPDATE OF lat, lng
  ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION update_stores_geom();

-- Update existing stores: populate geom from lat/lng if they exist
UPDATE public.stores
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE lat IS NOT NULL 
  AND lng IS NOT NULL 
  AND geom IS NULL;

-- Add indexes for lat/lng columns for fallback queries
CREATE INDEX IF NOT EXISTS idx_stores_lat_lng ON public.stores(lat, lng);

COMMENT ON COLUMN public.stores.lat IS 'Latitude (WGS84 decimal degrees)';
COMMENT ON COLUMN public.stores.lng IS 'Longitude (WGS84 decimal degrees)';

-- Migration complete
