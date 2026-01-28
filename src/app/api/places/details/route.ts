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

    // Build headers with comprehensive FieldMask including addressComponents
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

    // Extract display name and formatted address
    const formattedAddress = data?.formattedAddress || "";
    const displayNameText = data?.displayName?.text || "";
    
    // Parse address components to extract ward/district/city
    const addressComponents = data?.addressComponents || [];
    let ward = "";
    let district = "";
    let city = "";
    
    for (const component of addressComponents) {
      const types = component.types || [];
      const longName = component.longText || "";
      
      // Ward (phường) - priority order
      if (!ward && (
        types.includes("sublocality_level_2") ||
        types.includes("sublocality_level_3") ||
        types.includes("administrative_area_level_3") ||
        types.includes("neighborhood")
      )) {
        ward = longName;
      }
      
      // District (quận)
      if (!district && (
        types.includes("sublocality_level_1") ||
        types.includes("administrative_area_level_2")
      )) {
        district = longName;
      }
      
      // City (thành phố)
      if (!city && (
        types.includes("locality") ||
        types.includes("administrative_area_level_1")
      )) {
        city = longName;
      }
    }
    
    // Prefer formattedAddress as the full address to display
    const address_full = formattedAddress || displayNameText;
    const display_name = displayNameText || formattedAddress;

    // Build response
    const responseData = {
      place_id: data.id || placeId,
      display_name,
      address_full, // Use this for input display (includes ward/district/city)
      full_address: address_full, // Alias for backward compatibility
      lat,
      lng,
      ward,
      district,
      city,
    };

    // Cache the result
    cachePlace(placeId, responseData);

    // Return comprehensive response
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
