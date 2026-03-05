-- Migration: 20260221_product_data_refactoring
-- Purpose: 
-- 1. Add has_sugar_options to products
-- 2. Clear unused product-mapping data from product_categories
-- 3. Reseed subcategories to match Phe La website

-- Add has_sugar_options to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_sugar_options BOOLEAN DEFAULT false;

-- Clear all subcategories from the table
DELETE FROM public.subcategories;

-- Re-seed the subcategories based on Phe La website structure
-- We map these subcategories to standard category_codes (DRINK, TOPPING, MERCHANDISE, CAKE)
INSERT INTO public.subcategories (category_code, name, sort_order, is_active) VALUES
('DRINK', 'CÀ PHÊ', 1, true),
('DRINK', 'SYPHON', 2, true),
('DRINK', 'FRENCH PRESS', 3, true),
('DRINK', 'MOKA POT', 4, true),
('DRINK', 'COLD BREW', 5, true),
('DRINK', 'Ô LONG MATCHA', 6, true),
('TOPPING', 'TOPPING', 7, true),
('DRINK', 'PLUS - LON/CHAI TIỆN LỢI', 8, true),
('MERCHANDISE', 'MANG PHÊ LA VỀ NHÀ', 9, true);

-- The old product-mapping UI was incorrectly inserting mapping rules into `product_categories`
-- with obscure codes and menu_sections. We will clean up `product_categories` to only contain
-- the TRUE standard categories (DRINK, CAKE, TOPPING, MERCHANDISE).
DELETE FROM public.product_categories 
WHERE code NOT IN ('DRINK', 'CAKE', 'TOPPING', 'MERCHANDISE', 'PHỤ KIỆN');

-- Ensure the main categories are present
INSERT INTO public.product_categories (code, name, sort_order, is_active) VALUES 
('DRINK', 'Đồ uống', 1, true),
('CAKE', 'Bánh', 2, true),
('TOPPING', 'Topping', 3, true),
('MERCHANDISE', 'Hàng hóa', 4, true)
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;
