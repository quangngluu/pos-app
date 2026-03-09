import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
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
    const [productsResult, sugarResult] = await Promise.all([
        supabaseAdmin
            .from("v_products_menu")
            .select("product_id, product_code, name, category, price_phe, price_la, price_std")
            .order("name"),
        supabaseAdmin
            .from("v_product_sugar_options")
            .select("product_id"),
    ]);

    if (productsResult.error) throw productsResult.error;

    const sugarSet = new Set<string>();
    if (!sugarResult.error && sugarResult.data) {
        sugarResult.data.forEach((r: any) => sugarSet.add(r.product_id));
    }

    const items = (productsResult.data || [])
        .filter((p: any) => p.price_phe != null || p.price_la != null || p.price_std != null)
        .map((p: any) => {
            const sizes: string[] = [];
            if (p.price_phe != null) sizes.push("SIZE_PHE");
            if (p.price_la != null) sizes.push("SIZE_LA");
            if (p.price_std != null) sizes.push("STD");
            const hasSugar = sugarSet.has(p.product_id);
            const cat = p.category || "OTHER";
            return { name: p.name, code: p.product_code, id: p.product_id, sizes, hasSugar, cat };
        });

    // Group by category for clarity
    const byCategory: Record<string, typeof items> = {};
    for (const d of items) {
        (byCategory[d.cat] ??= []).push(d);
    }

    const lines: string[] = [];
    for (const [cat, prods] of Object.entries(byCategory)) {
        lines.push(`\n### ${cat}`);
        for (const p of prods) {
            lines.push(`- "${p.name}" [code=${p.code}, id=${p.id}, sizes=${p.sizes.join("/")}${p.hasSugar ? ", sugar_options" : ""}]`);
        }
    }

    return lines.join("\n");
}

function buildSystemPrompt(menuCatalog: string): string {
    return `You are an expert order parser for a Vietnamese coffee shop called "Phê La".
Your ONLY job: extract structured order data from raw customer messages.

## STRICT RULES:
1. Each distinct product mention in the text = exactly ONE line in the output
2. "2 olong sữa" = ONE line with qty=2 and product="Ô long sữa", NOT two separate lines
3. "1 phê nâu, 2 bòng bưởi" = TWO lines (qty=1 phê nâu + qty=2 bòng bưởi)
4. ONLY use product_id values from the catalog below. NEVER invent IDs.
5. If a product cannot be matched, skip it and put it in raw_note
6. DRINK items are the most common orders. MERCHANDISE/CAKE/TOPPING are less common.

## PRODUCT CATALOG:
${menuCatalog}

## COMMON ALIASES (Vietnamese informal → exact product name):
⚠️ CRITICAL: "phê xỉu" / "pxv" / "xỉu" = "Phê Xỉu Vani" (code DRK_PXV). This is NOT "Phê Nâu"!
⚠️ CRITICAL: "phê nâu" / "nâu" / "pn" = "Phê Nâu" (code DRK_PN). This is NOT "Phê Xỉu"!
- "olong sữa" / "ô long sữa" / "OLS" → "Ô Long Sữa Phê La" (code DRK_OLS)
- "olong nhài" / "ô long nhài" → "Ô Long Nhài Sữa" (code DRK_OLNS)
- "mật nhãn" / "mn" → "Mật Nhãn" (code DRK_MN)
- "sc bòng bưởi" / "sữa chua bòng bưởi" → "Sữa Chua Bòng Bưởi" (code DRK_SCBB)
- "bòng bưởi" / "bb" → "Bòng Bưởi" (code DRK_BB)
- "matcha" / "matcha pxp" → "Matcha Phan Xi Păng" (code DRK_MPXPDX)
- "matcha coco" / "mcl" → "Matcha Coco Latte" (code DRK_MCL)
- "đà lạt" / "dl" → "Đà Lạt" (code DRK_DL)
- "lụa đào" / "ld" → "Lụa Đào" (code DRK_LD)
- "đen" / "đen đá" / "pd" → "Phê Đen" (code DRK_PD)
- "tấm" → "Tấm" (code DRK_T)
- "gấm" → "Gấm" (code DRK_G)
- "phong lan" / "pl" → "Phong Lan" (code DRK_PL)
- "shot" / "shot cf" → "Shot cà phê" (code DRK_SC)

## TOPPINGS:
- "+ trân châu" or "thêm trân châu" → add a SEPARATE topping line (e.g. "Trân châu Ô Long" TOP_TCOL) with qty matching the drink
- "+ thạch" → add a SEPARATE topping line
- Toppings are in the TOPPING category in the catalog

## SIZE MAPPING:
- "size L" / "lớn" / "size lớn" → SIZE_LA
- "size S" / "nhỏ" / "size nhỏ" / "phê" / "size vừa" → SIZE_PHE
- No size mentioned → if product has SIZE_PHE → SIZE_PHE; if only STD → STD

## SUGAR MAPPING:
- "không đường" / "ko đường" / "0 đường" → "0"
- "ít ít đường" / "30%" → "30"
- "ít đường" / "nửa đường" → "50"
- "70%" / "đường vừa" → "70"
- "nhiều đường" / "ngọt" / "full" → "100"
- Not mentioned → "" (empty = default)

## ICE NOTES:
- "đá" = default (no note)
- "không đá" / "ko đá" → note: "không đá"
- "ít đá" → note: "ít đá"
- "nóng" / "hot" → note: "nóng"
- "đá chung" / "đá riêng" → note: "đá chung" / "đá riêng"

## CUSTOMER INFO:
- Phone: Vietnamese format (09xx, 03xx, 07xx, 08xx, 05xx)
- Address: if mentioned
- General notes: anything not item-specific`;
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

        // OpenRouter provider (OpenAI-compatible)
        const routerKey = process.env.OPENROUTER_API_KEY;
        if (!routerKey) {
            return NextResponse.json({ ok: false, error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
        }
        const openrouter = createOpenAI({
            apiKey: routerKey,
            baseURL: "https://openrouter.ai/api/v1",
        });

        // Call LLM with structured output
        const { object: parsed } = await generateObject({
            model: openrouter("google/gemini-2.0-flash-001"),
            schema: ParsedOrderSchema,
            system: buildSystemPrompt(menuCatalog),
            prompt: `Parse this customer order message:\n\n"${text.trim()}"`,
            temperature: 0.1,
        });

        return NextResponse.json({
            ok: true,
            parsed,
            _debug: {
                model: "google/gemini-2.0-flash-001 (via OpenRouter)",
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
