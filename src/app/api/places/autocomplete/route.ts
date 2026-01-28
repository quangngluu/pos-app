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

/**
 * Google Places Autocomplete (New API)
 * GET /api/places/autocomplete?q=<query>&sessionToken=<token>
 * 
 * Returns normalized format:
 * { items: [{ place_id, display_name, full_address?, raw? }] }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const input = (searchParams.get("q") || "").trim();
    const sessionToken = searchParams.get("sessionToken") || "";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 6), 1), 10);

    if (!input || input.length < 2) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    if (!GOOGLE_PLACE_API_KEY) {
      console.error("[Autocomplete] Missing GOOGLE_PLACE_API_KEY");
      return jsonError("Missing GOOGLE_PLACE_API_KEY in .env.local", 500);
    }

    console.debug(`[Autocomplete] Query: "${input}", sessionToken: ${sessionToken ? "present" : "none"}`);

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
        console.error(`[Autocomplete] Google API error: ${response.status}`, errorText.slice(0, 200));
        continue; // Try next bias location
      }

      const data = await response.json();
      const suggestions = data?.suggestions || [];

      if (suggestions.length > 0) {
        // Map to UI contract format with mainText/secondaryText for 2-line display
        // Deduplicate by placeId
        const seenPlaceIds = new Set<string>();
        const items = suggestions
          .slice(0, limit * 2) // Get more to account for deduplication
          .map((s: any) => {
            const placePrediction = s?.placePrediction || {};
            const placeId = placePrediction.placeId || null;
            
            // Skip duplicates
            if (placeId && seenPlaceIds.has(placeId)) {
              return null;
            }
            if (placeId) {
              seenPlaceIds.add(placeId);
            }
            
            const structuredFormat = placePrediction.structuredFormat || {};
            const mainText = structuredFormat.mainText?.text || "";
            const secondaryText = structuredFormat.secondaryText?.text || "";
            const fullText = placePrediction.text?.text || "";
            
            return {
              place_id: placeId,
              main_text: mainText || fullText || "",
              secondary_text: secondaryText || "",
              display_name: mainText || fullText || "",
              full_address: secondaryText ? `${mainText}, ${secondaryText}` : fullText,
              raw: s,
            };
          })
          .filter((item: any) => item !== null) // Remove nulls from deduplication
          .slice(0, limit); // Limit to requested amount after deduplication

        console.debug(`[Autocomplete] Returning ${items.length} suggestions (deduplicated)`);
        return NextResponse.json({ items }, { status: 200 });
      }
    }

    // No results from either bias location
    console.debug(`[Autocomplete] No results found`);
    return NextResponse.json({ items: [] }, { status: 200 });
  } catch (e: any) {
    console.error("[Autocomplete] Error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
