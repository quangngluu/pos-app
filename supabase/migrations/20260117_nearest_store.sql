-- Create RPC function to find nearest stores
-- Usage: SELECT * FROM nearest_store(10.776, 106.701, 5);

CREATE OR REPLACE FUNCTION nearest_store(
  lat double precision,
  lng double precision,
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
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) AS distance_m
  FROM public.stores s
  WHERE s.is_active = true
    AND s.geom IS NOT NULL
  ORDER BY s.geom <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  LIMIT safe_limit;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION nearest_store(double precision, double precision, integer) TO authenticated, service_role, anon;

COMMENT ON FUNCTION nearest_store IS 'Find nearest active stores to given coordinates, ordered by distance';
