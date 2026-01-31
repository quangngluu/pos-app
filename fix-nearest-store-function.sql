-- Fix nearest_store function: resolve ambiguous column reference
-- Execute this in Supabase Dashboard SQL Editor

-- Step 1: Drop the existing function
DROP FUNCTION IF EXISTS nearest_store(double precision, double precision, integer);

-- Step 2: Recreate with renamed parameters (p_lat, p_lng to avoid ambiguity)
CREATE OR REPLACE FUNCTION nearest_store(
  p_lat double precision,
  p_lng double precision,
  limit_n integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  name text,
  address_full text,
  distance_m double precision
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  safe_limit integer;
BEGIN
  -- Guard limit between 1 and 20
  safe_limit := GREATEST(1, LEAST(limit_n, 20));
  
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.address_full,
    ST_Distance(
      s.geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_m
  FROM public.stores s
  WHERE s.is_active = true
    AND s.geom IS NOT NULL
  ORDER BY s.geom <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
  LIMIT safe_limit;
END;
$$;

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION nearest_store(double precision, double precision, integer) TO authenticated, service_role, anon;

COMMENT ON FUNCTION nearest_store IS 'Find nearest active stores to given coordinates (renamed params to p_lat/p_lng to avoid ambiguity with table columns)';
