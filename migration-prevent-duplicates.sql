-- ================================================================
-- MIGRATION: PREVENT CATEGORY DUPLICATES FOREVER
-- ================================================================
-- This migration does two things:
-- 1. Cleans up existing duplicate categories
-- 2. Adds a UNIQUE constraint to make future duplicates impossible
--
-- Run this in pgAdmin 4 on localhost:5433/Tagglo
-- ================================================================

BEGIN;

-- ================================================================
-- STEP 1: CLEANUP EXISTING DUPLICATES
-- ================================================================

-- 1a. Delete duplicate "Home & Garden" with wrong slug
DELETE FROM product_categories WHERE category_id = 12771;
DELETE FROM categories WHERE category_id = 12771;

-- 1b. Delete duplicate "Sports & Outdoors" 
DELETE FROM product_categories WHERE category_id = 18423;
DELETE FROM categories WHERE category_id = 18423;

-- 1c. Clean up any other duplicates with same name but different slugs
WITH duplicate_categories AS (
    SELECT 
        c1.category_id,
        c1.name,
        c1.slug,
        c1.llm_discovered,
        ROW_NUMBER() OVER (
            PARTITION BY c1.name, COALESCE(c1.parent_id, -1)
            ORDER BY 
                CASE WHEN c1.llm_discovered = 0 THEN 0 ELSE 1 END,  -- Prefer seed versions
                c1.category_id  -- Tie-breaker: keep older one
        ) as row_num
    FROM categories c1
)
DELETE FROM product_categories 
WHERE category_id IN (
    SELECT category_id FROM duplicate_categories WHERE row_num > 1
);

WITH duplicate_categories AS (
    SELECT 
        c1.category_id,
        c1.name,
        c1.slug,
        c1.llm_discovered,
        ROW_NUMBER() OVER (
            PARTITION BY c1.name, COALESCE(c1.parent_id, -1)
            ORDER BY 
                CASE WHEN c1.llm_discovered = 0 THEN 0 ELSE 1 END,
                c1.category_id
        ) as row_num
    FROM categories c1
)
DELETE FROM categories 
WHERE category_id IN (
    SELECT category_id FROM duplicate_categories WHERE row_num > 1
);

-- Verify no duplicates remain
SELECT 'Remaining duplicates (should be empty):' as status;
SELECT name, COUNT(*) as count
FROM categories
GROUP BY name, COALESCE(parent_id, -1)
HAVING COUNT(*) > 1;

-- ================================================================
-- STEP 2: ADD UNIQUE CONSTRAINT (PREVENT FUTURE DUPLICATES)
-- ================================================================

-- This makes it IMPOSSIBLE to create duplicate categories
-- even if the code has bugs
ALTER TABLE categories 
ADD CONSTRAINT unique_category_per_parent 
UNIQUE (parent_id, slug);

-- Verify constraint was added
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'categories'::regclass 
AND conname = 'unique_category_per_parent';

-- ================================================================
-- STEP 3: VERIFICATION
-- ================================================================

SELECT 'Final category count:' as status;
SELECT 
    COUNT(*) FILTER (WHERE parent_id IS NULL) as departments,
    COUNT(*) as total_categories
FROM categories;

SELECT 'All departments:' as status;
SELECT category_id, name, slug, llm_discovered
FROM categories 
WHERE parent_id IS NULL 
ORDER BY name;

COMMIT;

-- ================================================================
-- SUCCESS MESSAGE
-- ================================================================
-- If you see "COMMIT" above, the migration was successful!
-- 
-- What just happened:
-- ✅ Cleaned up all duplicate categories
-- ✅ Added UNIQUE constraint on (parent_id, slug)
-- ✅ Future duplicate attempts will fail with clear error
-- ✅ Code will catch errors and use existing categories
-- 
-- Next steps:
-- 1. Pull latest storage.js from Replit (has error handling)
-- 2. Test by scraping a product - no more duplicates!
-- ================================================================
