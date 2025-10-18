-- ==========================================
-- CLEANUP DUPLICATE DEPARTMENTS & CATEGORIES
-- ==========================================
-- Run this in pgAdmin 4 on localhost:5433/Tagglo

-- STEP 1: Identify all duplicate root departments (parent_id IS NULL)
SELECT 
    name,
    COUNT(*) as duplicate_count,
    STRING_AGG(category_id::text, ', ') as category_ids,
    STRING_AGG(slug::text, ', ') as slugs
FROM categories
WHERE parent_id IS NULL
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY name;

-- STEP 2: For each duplicate department, see which one is the "seed" version (llm_discovered = 0)
-- and which one was created by LLM (llm_discovered = 1)
SELECT 
    category_id,
    name,
    slug,
    parent_id,
    llm_discovered,
    level,
    (SELECT COUNT(*) FROM product_categories WHERE category_id = c.category_id) as product_count
FROM categories c
WHERE name IN (
    SELECT name 
    FROM categories 
    WHERE parent_id IS NULL 
    GROUP BY name 
    HAVING COUNT(*) > 1
)
AND parent_id IS NULL
ORDER BY name, llm_discovered;

-- STEP 3: Delete duplicate LLM-discovered departments (keep seed versions with llm_discovered = 0)
-- This will DELETE all duplicate departments that were created by the LLM
-- and keep only the seed versions

-- IMPORTANT: First, delete product associations
WITH duplicate_llm_depts AS (
    SELECT c1.category_id
    FROM categories c1
    WHERE c1.parent_id IS NULL
    AND c1.llm_discovered = 1
    AND EXISTS (
        SELECT 1 FROM categories c2 
        WHERE c2.name = c1.name 
        AND c2.parent_id IS NULL 
        AND c2.llm_discovered = 0
    )
),
all_descendants AS (
    SELECT category_id FROM duplicate_llm_depts
    UNION ALL
    SELECT c.category_id
    FROM categories c
    INNER JOIN all_descendants ad ON c.parent_id = ad.category_id
)
DELETE FROM product_categories 
WHERE category_id IN (SELECT category_id FROM all_descendants);

-- Then, delete the duplicate categories and their descendants
WITH RECURSIVE duplicate_llm_depts AS (
    SELECT c1.category_id
    FROM categories c1
    WHERE c1.parent_id IS NULL
    AND c1.llm_discovered = 1
    AND EXISTS (
        SELECT 1 FROM categories c2 
        WHERE c2.name = c1.name 
        AND c2.parent_id IS NULL 
        AND c2.llm_discovered = 0
    )
),
dept_tree AS (
    SELECT category_id FROM duplicate_llm_depts
    UNION ALL
    SELECT c.category_id
    FROM categories c
    INNER JOIN dept_tree dt ON c.parent_id = dt.category_id
)
DELETE FROM categories WHERE category_id IN (SELECT category_id FROM dept_tree);

-- STEP 4: Verify cleanup - should show no duplicates
SELECT 
    name,
    COUNT(*) as count
FROM categories
WHERE parent_id IS NULL
GROUP BY name
HAVING COUNT(*) > 1;

-- STEP 5: Check for duplicate subcategories (e.g., "Backpack" appearing twice under "Bags")
SELECT 
    c.name,
    c.slug,
    c.parent_id,
    p.name as parent_name,
    COUNT(*) OVER (PARTITION BY c.parent_id, c.slug) as duplicate_count,
    c.category_id,
    c.llm_discovered,
    (SELECT COUNT(*) FROM product_categories WHERE category_id = c.category_id) as product_count
FROM categories c
LEFT JOIN categories p ON c.parent_id = p.category_id
WHERE EXISTS (
    SELECT 1 
    FROM categories c2 
    WHERE c2.parent_id = c.parent_id 
    AND c2.slug = c.slug 
    AND c2.category_id != c.category_id
)
ORDER BY parent_name, c.name, c.llm_discovered;

-- STEP 6: Delete duplicate subcategories (keep seed versions with llm_discovered = 0)
WITH duplicate_subcats AS (
    SELECT c1.category_id
    FROM categories c1
    WHERE c1.llm_discovered = 1
    AND EXISTS (
        SELECT 1 FROM categories c2 
        WHERE c2.parent_id = c1.parent_id
        AND c2.slug = c1.slug
        AND c2.llm_discovered = 0
        AND c2.category_id != c1.category_id
    )
)
DELETE FROM product_categories WHERE category_id IN (SELECT category_id FROM duplicate_subcats);

WITH RECURSIVE duplicate_subcats AS (
    SELECT c1.category_id
    FROM categories c1
    WHERE c1.llm_discovered = 1
    AND EXISTS (
        SELECT 1 FROM categories c2 
        WHERE c2.parent_id = c1.parent_id
        AND c2.slug = c1.slug
        AND c2.llm_discovered = 0
        AND c2.category_id != c1.category_id
    )
),
subcat_tree AS (
    SELECT category_id FROM duplicate_subcats
    UNION ALL
    SELECT c.category_id
    FROM categories c
    INNER JOIN subcat_tree st ON c.parent_id = st.category_id
)
DELETE FROM categories WHERE category_id IN (SELECT category_id FROM subcat_tree);

-- FINAL VERIFICATION: Count all categories
SELECT 
    (SELECT COUNT(*) FROM categories WHERE parent_id IS NULL) as departments,
    (SELECT COUNT(*) FROM categories) as total_categories;
