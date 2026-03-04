import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 30;

// Schema for parsed order output
const ParsedOrderSchema = z.object({
    customer: z.object({
        phone: z.string().nullable().describe("Phone number extracted from text, digits only"),
        address: z.string().nullable().describe("Delivery address if mentioned"),
        note: z.string().nullable().describe("General customer note not related to specific items"),
    }).nullable(),
    lines: z.array(z.object({
        product_id: z.string().describe("Product UUID from the menu catalog"),
        product_name: z.string().describe("Product name as understood from the text"),
        qty: z.number().min(1).describe("Quantity ordered"),
        size: z.enum(["SIZE_PHE", "SIZE_LA", "STD"]).describe("Size key"),
        sugar_value_code: z.string().describe("Sugar level: 0, 30, 50, 70, 100, or empty string for default"),
        note: z.string().optional().describe("Item-specific note like 'ít đá', 'không đá', 'thêm topping'"),
    })),
    raw_note: z.string().nullable().describe("Any text that couldn't be parsed into order items"),
});

export type ParsedOrder = z.infer<typeof ParsedOrderSchema>;

async function getMenuContext(): Promise<string> {
    const { data: products, error } = await supabaseAdmin
        .from("v_products_menu")
        .select("product_id, product_code, name, category, price_phe, price_la, price_std, has_sugar_options")
        .order("name");

    if (error) throw error;

    const menu = (products || [])
        .filter((p: any) => p.price_phe != null || p.price_la != null || p.price_std != null)
        .map((p: any) => {
            const sizes: string[] = [];
            if (p.price_phe != null) sizes.push("PHE");
            if (p.price_la != null) sizes.push("LA");
            if (p.price_std != null) sizes.push("STD");

            return `- ${p.name} (id=${p.product_id}, sizes=[${sizes.join(",")}]${p.has_sugar_options ? ", has_sugar" : ""})`;
        });

    return menu.join("\n");
}

function buildSystemPrompt(menuCatalog: string): string {
    return `You are an expert order parser for a Vietnamese coffee shop POS system.
Your job: extract structured order data from raw customer messages (usually from Zalo, Facebook, or phone calls).

## PRODUCT CATALOG (use these exact product IDs):
${menuCatalog}

## SIZE MAPPING RULES:
- "size L", "lớn", "size lớn" → SIZE_LA
- "size S", "nhỏ", "size nhỏ", "phê", "size vừa" → SIZE_PHE  
- "size M", "vừa" for drinks with only PHE/LA → SIZE_PHE
- Default (no size mentioned): if product has PHE+LA sizes → SIZE_PHE, if only STD → STD

## SUGAR MAPPING RULES:
- "không đường", "ko đường", "0 đường" → "0"
- "ít ít đường", "30% đường" → "30"
- "ít đường", "nửa đường", "50% đường" → "50"
- "đường bình thường", "70% đường" → "70"
- "nhiều đường", "ngọt", "100% đường", "full đường" → "100"
- Not mentioned → "" (empty string = default)

## ICE/TEMPERATURE NOTES:
- "đá", "iced" → normal (no note needed, it's default)
- "không đá", "ko đá" → note: "không đá"
- "ít đá" → note: "ít đá"  
- "nóng", "hot" → note: "nóng"

## QUANTITY RULES:
- Default quantity is 1 if not specified
- "2 cf sữa" → qty=2
- "cf sữa x3" → qty=3

## CUSTOMER INFO:
- Extract phone numbers (Vietnamese format: 09xx, 03xx, 07xx, 08xx, etc.)
- Extract delivery address if mentioned
- Extract general notes not related to specific items

## IMPORTANT:
- Match products by name similarity. Vietnamese coffee names have many informal variants:
  - "cf" / "cà phê" / "cafe" = cà phê
  - "bx" / "bạc xỉu" = bạc xỉu
  - "trà đào" / "td" = trà đào
- If you cannot match a product, use the closest match and put uncertainty in the note
- Always return valid product_id from the catalog above`;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { text } = body;

        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return NextResponse.json({ ok: false, error: "Missing 'text' field" }, { status: 400 });
        }

        if (text.length > 2000) {
            return NextResponse.json({ ok: false, error: "Text too long (max 2000 chars)" }, { status: 400 });
        }

        // Get menu context
        const menuCatalog = await getMenuContext();

        if (!menuCatalog) {
            return NextResponse.json({ ok: false, error: "No products found in menu" }, { status: 500 });
        }

        // Call LLM with structured output
        const { object: parsed } = await generateObject({
            model: google("gemini-2.0-flash"),
            schema: ParsedOrderSchema,
            system: buildSystemPrompt(menuCatalog),
            prompt: `Parse this customer order message:\n\n"${text.trim()}"`,
            temperature: 0.1,
        });

        return NextResponse.json({
            ok: true,
            parsed,
            _debug: {
                model: "gemini-2.0-flash",
                input_length: text.length,
                lines_count: parsed.lines.length,
            },
        });
    } catch (err: any) {
        console.error("AI parse error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Failed to parse order" },
            { status: 500 }
        );
    }
}
