# LLM Order Parsing Architecture Blueprint

## 🎯 Goal
Allow Customer Service (CS) to simply copy/paste a customer's raw chat message (e.g., from Zalo or Facebook) and have the system automatically build the structured JSON required to hit the `/api/quote` and `/api/orders` endpoint.

## 🏗️ Architecture Design

**1. The CS Input Interface**
Add a "Smart AI Order" button in the `src/app/pos/page.tsx`. When clicked, it opens a modal with a simple `<textarea>` where the CS agent pastes the raw message.
> _Ví dụ: "Cho mình 2 cf sữa đá ít đường, 1 bạc xỉu size L nghen shop. Số ko ba chín... Giao 123 Lê Lợi"_

**2. The Edge Function (Smart Parser)**
Create a new API route: `POST /api/ai/parse-order`.
This endpoint calls an LLM (e.g., GPT-4o-mini or Gemini Flash) with **Structured Outputs (JSON Schema)**.

### The System Prompt & Tools
Provide the LLM with the active menu catalog so it can map natural language to internal keys.
_Note: We should extract a lightweight version of the menu (Name, Product ID, Size Options) from `v_products_menu` to feed as context._

**System Prompt Example:**
```text
You are an expert order parser for a coffee shop. 
Extract the customer's order from the raw text.
Your goal is to map their request to our exact product IDs and size keys.
- "ít đường" maps to sugar_value_code: "50"
- "size L" maps to price_key: "SIZE_LA"
- "size vừa/nhỏ/mặc định" maps to price_key: "SIZE_PHE"

Return JSON matching the schema provided.
```

**JSON Schema Expected Output:**
```json
{
  "customer": {
    "phone": "string (extract numbers only)",
    "address": "string",
    "note": "string"
  },
  "lines": [
    {
      "product_id": "uuid",
      "qty": "number",
      "display_size": "SIZE_PHE | SIZE_LA | STD",
      "sugar_value_code": "string (0, 30, 50, 70, 100)",
      "note": "string"
    }
  ]
}
```

**3. The UI Hand-off**
Once the `/api/ai/parse-order` returns the JSON:
1. The POS frontend maps the JSON into the existing `lines` cart state.
2. It auto-fills the customer phone and address fields.
3. It immediately triggers the `fetchQuote` method to validate prices and calculate totals with the existing promotion engine.
4. The CS agent reviews the mapped cart on the POS screen, adjusts if the AI made a mistake, and clicks **"Place Order"**.

## 🚀 Implementation Steps

1. **Menu Context API**: Create an endpoint or server action that dumps a minimal JSON representation of active products.
2. **LLM Route**: Install the `ai` SDK (`@ai-sdk/openai` or `@ai-sdk/google`). Write the parser route using `generateObject()`.
3. **Frontend Integration**: Build the paste modal in `src/app/pos/page.tsx` and hook up the response to the shopping cart `dispatch` actions.

## ⚠️ Security & Cost Considerations
- Only Authenticated CS staff can hit the LLM parsing route to prevent abuse.
- Use a fast, cheap model (GPT-4o-mini or Gemini 1.5 Flash) since task complexity is low.
- Always require **Human-in-the-Loop**: The LLM merely *drafts* the cart; the CS agent must click the final submit button.
