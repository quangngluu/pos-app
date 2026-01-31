import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GOOGLE_PLACE_API_KEY = process.env.GOOGLE_PLACE_API_KEY || "";

// Simple in-memory cache for place details (10 minutes TTL)
const placeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedPlace(placeId: string) {
  const cached = placeCache.get(placeId);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    placeCache.delete(placeId);
    return null;
  }
  
  return cached.data;
}

function cachePlace(placeId: string, data: any) {
  placeCache.set(placeId, { data, timestamp: Date.now() });
  
  // Simple cache size limit (keep last 100 entries)
  if (placeCache.size > 100) {
    const firstKey = placeCache.keys().next().value;
    if (firstKey) placeCache.delete(firstKey);
  }
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get("placeId") || "";
    const sessionToken = searchParams.get("sessionToken") || "";

    if (!placeId) {
      return jsonError("Missing placeId parameter", 400);
    }

    if (!GOOGLE_PLACE_API_KEY) {
      return jsonError("Missing GOOGLE_PLACE_API_KEY in .env.local", 500);
    }

    // Check cache first
    const cachedData = getCachedPlace(placeId);
    if (cachedData) {
      return NextResponse.json(cachedData, {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=600",
          "X-Cache": "HIT",
        },
      });
    }

    // Build headers with optimized FieldMask (includes addressComponents for ward/district extraction)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACE_API_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents",
    };

    if (sessionToken) {
      headers["X-Goog-Session-Token"] = sessionToken;
    }

    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Place Details API error:", response.status, errorText.slice(0, 200));
      return jsonError("Failed to fetch place details", response.status);
    }

    const data = await response.json();

    // Extract location with consistent naming (lng not lon)
    const lat = data?.location?.latitude || null;
    const lng = data?.location?.longitude || null;

    // Extract display name and full address
    const formattedAddress = data?.formattedAddress || "";
    const displayNameText = data?.displayName?.text || "";
    
    const display_name = displayNameText || formattedAddress;
    const full_address = formattedAddress || displayNameText;

    // Parse address components
    const addressComponents = data?.addressComponents || [];
    const address: any = {
      line1: null,
      ward: null,
      district: null,
      city: null,
      state: null,
      postcode: null,
      country: null,
      country_code: null,
    };

    let streetNumber = "";
    let route = "";

    for (const component of addressComponents) {
      const types = component.types || [];
      const longText = component.longText || "";
      const shortText = component.shortText || "";

      // Street number
      if (types.includes("street_number")) {
        streetNumber = longText;
      }

      // Route (street name)
      if (types.includes("route")) {
        route = longText;
      }

      // Ward: administrative_area_level_3 OR sublocality_level_2 OR sublocality_level_3
      if (!address.ward && (types.includes("administrative_area_level_3") || types.includes("sublocality_level_2") || types.includes("sublocality_level_3"))) {
        address.ward = longText;
      }
      // Fallback: prefix match for VN ward patterns
      if (!address.ward && (longText.startsWith("Phường ") || longText.startsWith("Xã ") || longText.startsWith("Thị trấn "))) {
        address.ward = longText;
      }

      // District: sublocality_level_1 (priority) or administrative_area_level_2
      if (types.includes("sublocality_level_1") || types.includes("sublocality")) {
        address.district = longText;
      } else if (!address.district && types.includes("administrative_area_level_2")) {
        address.district = longText;
      }

      // City: locality (priority) or administrative_area_level_2 or administrative_area_level_1 (fallback)
      if (types.includes("locality")) {
        address.city = longText;
      } else if (!address.city && types.includes("administrative_area_level_2")) {
        address.city = longText;
      } else if (!address.city && types.includes("administrative_area_level_1")) {
        address.city = longText;
      }

      // State: administrative_area_level_1
      if (types.includes("administrative_area_level_1")) {
        address.state = longText;
      }

      // Postcode
      if (types.includes("postal_code")) {
        address.postcode = longText;
      }

      // Country
      if (types.includes("country")) {
        address.country = longText;
        address.country_code = shortText;
      }
    }

    // Build line1 from street_number + route
    if (streetNumber && route) {
      address.line1 = `${streetNumber} ${route}`;
    } else if (route) {
      address.line1 = route;
    } else if (streetNumber) {
      address.line1 = streetNumber;
    }

    // Build response (exclude raw data in production to reduce payload)
    const responseData: any = {
      ok: true,
      place_id: data.id || placeId,
      display_name: display_name || "",
      full_address: full_address || "",
      lat,
      lng,
      lon: lng, // Alias for backward compatibility
      address,
    };

    // Include raw data only in development
    if (process.env.NODE_ENV !== "production") {
      responseData.raw = data;
    }

    // Cache the result
    cachePlace(placeId, responseData);

    // Return minimal, stable response
    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=600",
        "X-Cache": "MISS",
      },
    });
  } catch (e: any) {
    console.error("Place details error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
