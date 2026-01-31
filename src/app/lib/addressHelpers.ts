/**
 * Shared helpers for address/coordinate handling
 */

/**
 * Safely parse a coordinate value to number
 * Handles: number, string with comma/dot, null/undefined
 */
export function parseCoord(x: any): number | null {
  if (typeof x === "number") {
    return Number.isFinite(x) ? x : null;
  }
  if (typeof x === "string") {
    const trimmed = x.trim().replace(",", ".");
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Extract numeric lat/lng from various address object structures
 * Returns { lat: number | null, lng: number | null }
 */
export function extractCoords(addr: any): { lat: number | null; lng: number | null } {
  if (!addr) return { lat: null, lng: null };

  // Try direct fields first
  let lat = parseCoord(addr.lat);
  let lng = parseCoord(addr.lng) ?? parseCoord(addr.lon);

  // Fallback to nested structures (old API responses)
  if (lat === null || lng === null) {
    lat = lat ?? parseCoord(addr.raw?.location?.latitude) ?? parseCoord(addr.raw?.geometry?.location?.lat);
    lng = lng ?? parseCoord(addr.raw?.location?.longitude) ?? parseCoord(addr.raw?.geometry?.location?.lng);
  }

  return { lat, lng };
}
