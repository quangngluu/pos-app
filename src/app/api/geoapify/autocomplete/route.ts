import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GOOGLE_PLACE_API_KEY = process.env.GOOGLE_PLACE_API_KEY || "";

// Location bias: HCM first, then HN fallback
const BIAS_LOCATIONS = [
  { center: { latitude: 10.776, longitude: 106.701 }, radius: 50000 }, // HCMC, 50km radius
  { center: { latitude: 21.0278, longitude: 105.8342 }, radius: 50000 }, // Hanoi, 50km radius
];

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = (body.input || "").trim();
    const sessionToken = body.sessionToken || null;
    const limit = Math.min(Math.max(Number(body.limit || 6), 1), 10);

    if (!input || input.length < 2) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    if (!GOOGLE_PLACE_API_KEY) {
      return jsonError("Missing GOOGLE_PLACE_API_KEY in .env.local", 500);
    }

    // Try HCM first, then HN fallback
    for (const locationBias of BIAS_LOCATIONS) {
      const requestBody: any = {
        input,
        languageCode: "vi",
        regionCode: "VN",
        includedRegionCodes: ["VN"],
        locationBias: {
          circle: locationBias,
        },
      };

      if (sessionToken) {
        requestBody.sessionToken = sessionToken;
      }

      const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACE_API_KEY,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Google Places API error:", response.status, errorText);
        continue; // Try next bias location
      }

      const data = await response.json();
      const suggestions = data?.suggestions || [];

      if (suggestions.length > 0) {
        // Map to UI contract format
        const items = suggestions.slice(0, limit).map((s: any) => {
          const placePrediction = s?.placePrediction || {};
          return {
            place_id: placePrediction.placeId || null,
            display_name: placePrediction.text?.text || placePrediction.structuredFormat?.mainText?.text || "",
            lat: null, // Will be fetched via Place Details
            lon: null,
            address: {}, // Will be fetched via Place Details
            raw: s,
          };
        });

        return NextResponse.json({ items }, { status: 200 });
      }
    }

    // No results from either bias location
    return NextResponse.json({ items: [] }, { status: 200 });
  } catch (e: any) {
    console.error("Autocomplete error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
