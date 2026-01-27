import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GOOGLE_PLACE_API_KEY = process.env.GOOGLE_PLACE_API_KEY || "";

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

    // Build headers with minimal FieldMask
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACE_API_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
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

    // Return minimal, stable response
    return NextResponse.json(
      {
        place_id: data.id || placeId,
        display_name,
        full_address,
        lat,
        lng,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=600",
        },
      }
    );
  } catch (e: any) {
    console.error("Place details error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
