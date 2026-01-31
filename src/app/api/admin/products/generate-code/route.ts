import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

/**
 * GET /api/admin/products/generate-code?category=DRINK&name=Pho mai ca phe
 * Generate unique product code
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "";
    const name = searchParams.get("name") || "";

    if (!name.trim()) {
      return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    }

    const code = await generateProductCode(category, name);

    return NextResponse.json({ ok: true, code });
  } catch (e: any) {
    console.error("[Generate Code] exception:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * Generate product code from category and name
 * - Prefix based on category
 * - Slug from name (normalized Vietnamese, uppercase, underscore)
 * - Check uniqueness, add _2, _3... if needed
 */
async function generateProductCode(category: string, name: string): Promise<string> {
  // Determine prefix
  const prefix = getCategoryPrefix(category);

  // Generate slug from name
  const slug = slugify(name);

  // Base code
  let baseCode = `${prefix}${slug}`;
  
  // Truncate if too long (keep reasonable length)
  if (baseCode.length > 30) {
    baseCode = baseCode.substring(0, 30);
  }

  // Check uniqueness
  let code = baseCode;
  let suffix = 1;

  while (await codeExists(code)) {
    suffix++;
    code = `${baseCode}_${suffix}`;
  }

  return code;
}

function getCategoryPrefix(category: string): string {
  const cat = category.toUpperCase().trim();
  
  switch (cat) {
    case "DRINK":
    case "DRK":
      return "DRK_";
    case "CAKE":
    case "BANH":
      return "CAKE_";
    case "TOPPING":
    case "TOP":
      return "TOP_";
    case "MERCHANDISE":
    case "MERCH":
    case "MER":
      return "ACC_";
    case "PCTC":
      return "PCTC_";
    default:
      return "PRD_";
  }
}

function slugify(text: string): string {
  // Remove Vietnamese diacritics
  let str = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Handle special Vietnamese characters
  str = str.replace(/Đ/g, "D").replace(/đ/g, "d");
  
  // Uppercase and replace spaces with underscores
  str = str.toUpperCase().trim();
  
  // Replace multiple spaces with single underscore
  str = str.replace(/\s+/g, "_");
  
  // Remove special characters (keep only letters, numbers, underscore)
  str = str.replace(/[^A-Z0-9_]/g, "");
  
  // Remove leading/trailing underscores
  str = str.replace(/^_+|_+$/g, "");
  
  // Collapse multiple underscores
  str = str.replace(/_+/g, "_");
  
  return str;
}

async function codeExists(code: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("products")
    .select("code")
    .eq("code", code)
    .maybeSingle();
  
  return !!data;
}
