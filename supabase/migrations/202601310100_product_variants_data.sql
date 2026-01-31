-- Data Migration: Populate Product Variants from Staging Data
-- Description: Migrate data from stg_products_sku_section to normalized variant model
-- Date: 2026-01-31
-- Prerequisites: Run 20260131_product_variants_schema.sql first
-- NOTE: This migration has been disabled - it was for one-time staging data import

-- Migration disabled - staging table schema does not match expectations
DO $$
BEGIN
  RAISE NOTICE 'Product variants data migration skipped - this was a one-time staging import';
  RAISE NOTICE 'Product variants should be managed through the admin interface or API';
END $$;
