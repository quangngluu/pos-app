/**
 * Shared Pricing Engine
 * 
 * Purpose: Single source of truth for order pricing logic.
 * - Used by /api/quote for preview
 * - Used by /api/orders for server-side recomputation (don't trust client)
 * 
 * CRITICAL: Server must recompute all pricing to prevent manipulation.
 * 
 * NOTE: This file now delegates to the modular promotion engine at
 * src/app/lib/promotions/. All types and logic are defined there.
 * This file exists for backward compatibility with existing imports.
 */

// Re-export everything from the modular promotion engine
export { quoteOrder } from "./promotions/engine";

// Re-export types for backward compatibility
export type {
  QuoteLine,
  QuoteLineResult,
  QuoteResult,
} from "./promotions/types";
