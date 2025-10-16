require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=require`;
const sql = postgres(connectionString);

function normalizeBreadcrumbs(breadcrumbs, productTitle = null) {
  if (!breadcrumbs) return [];
  if (Array.isArray(breadcrumbs)) {
    // Filter out product title if it matches last breadcrumb
    if (productTitle && breadcrumbs.length > 0) {
      const lastCrumb = breadcrumbs[breadcrumbs.length - 1];
      if (lastCrumb && lastCrumb.toLowerCase().includes(productTitle.toLowerCase().substring(0, 30))) {
        return breadcrumbs.slice(0, -1);
      }
    }
    return breadcrumbs;
  }
  if (typeof breadcrumbs === 'string') {
    // Handle comma-separated strings (e.g., "Ace,Hardware,Tools,Power Tools")
    // OR multiple spaces/newlines
    let parts;
    if (breadcrumbs.includes(',') && !breadcrumbs.includes('/') && !breadcrumbs.includes('>')) {
      // Comma-separated format
      parts = breadcrumbs.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else {
      // Space/newline separated format
      parts = breadcrumbs.split(/\s{2,}|\n+/).map(s => s.trim()).filter(s => s.length > 0);
    }
    
    // Filter out product title if it matches last item
    if (productTitle && parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart.toLowerCase().includes(productTitle.toLowerCase().substring(0, 30))) {
        parts = parts.slice(0, -1);
      }
    }
    
    return parts;
  }
  return [];
}

/**
 * Deduplicate category path by removing consecutive duplicate segments
 * Example: "Toys & Games > Toys & Games > Outdoor Play > Toys & Games > Outdoor Play > Bubbles"
 *       -> ["Toys & Games", "Outdoor Play", "Bubbles"]
 */
function deduplicateCategoryPath(categoryPath) {
  if (!categoryPath) return [];
  
  // If it's a string, split by " > "
  let segments = Array.isArray(categoryPath) 
    ? categoryPath 
    : categoryPath.split('>').map(s => s.trim()).filter(s => s.length > 0);
  
  // Remove consecutive duplicates while preserving order
  const cleaned = [];
  let lastSeen = null;
  
  for (const segment of segments) {
    if (segment !== lastSeen) {
      cleaned.push(segment);
      lastSeen = segment;
    }
  }
  
  console.log(`🧹 Path cleanup: "${segments.join(' > ')}" → "${cleaned.join(' > ')}"`);
  return cleaned;
}

/**
 * Save raw product data without tags (Phase 1: Initial Save)
 * LLM will add tags later via updateProductTags()
 */
async function saveRawProduct(productData) {
  try {
    const normalizedBreadcrumbs = normalizeBreadcrumbs(productData.breadcrumbs, productData.title);
    
    // Step 1: Save raw archive
    const rawResult = await sql`
      INSERT INTO products_raw (
        source_url, raw_title, raw_description, raw_breadcrumbs, 
        raw_price, raw_brand, raw_specs, raw_sku, raw_tags, raw_images, raw_json_ld
      ) VALUES (
        ${productData.url || ''},
        ${productData.title || null},
        ${productData.description || null},
        ${normalizedBreadcrumbs},
        ${productData.price || null},
        ${productData.brand || null},
        ${productData.specs || null},
        ${productData.sku || null},
        ${productData.tags || null},
        ${productData.images || []},
        ${productData.jsonLd ? JSON.stringify(productData.jsonLd) : null}
      )
      RETURNING raw_id
    `;
    
    const rawId = rawResult[0].raw_id;
    
    // Step 2: Save product with NULL tags (LLM will add them later)
    const productResult = await sql`
      INSERT INTO products (
        raw_id, title, brand, price, sku, category, gender, description,
        tags, specs, image_urls, confidence_score
      ) VALUES (
        ${rawId},
        ${productData.title || null},
        ${productData.brand || null},
        ${productData.price ? parseFloat(productData.price.replace(/[^0-9.]/g, '')) : null},
        ${productData.sku || null},
        ${null},  -- category NULL (LLM will add)
        ${null},  -- gender NULL (LLM will add)
        ${productData.description || null},
        ${[]},    -- tags empty (LLM will add)
        ${productData.specs ? JSON.stringify({ raw: productData.specs }) : null},
        ${productData.images || []},
        ${0}      -- confidence 0 (no tags yet)
      )
      RETURNING product_id
    `;
    
    const productId = productResult[0].product_id;
    
    return {
      success: true,
      productId,
      rawId
    };
    
  } catch (error) {
    console.error('Error saving raw product:', error);
    throw error;
  }
}

/**
 * Update existing product with LLM tags (Phase 2: After AI Analysis)
 */
async function updateProductTags(productId, tagResults) {
  try {
    const tagNames = tagResults.tags.map(t => t.name);
    
    // Step 1: Update product table with tags/categories
    await sql`
      UPDATE products
      SET 
        category = ${tagResults.primaryCategory || null},
        gender = ${tagResults.gender || null},
        tags = ${tagNames},
        confidence_score = ${tagResults.confidenceScore || 1.0},
        updated_at = NOW()
      WHERE product_id = ${productId}
    `;
    
    // Step 2: Delete old tag associations
    await sql`
      DELETE FROM product_tags WHERE product_id = ${productId}
    `;
    
    // Step 3: Delete old category associations
    await sql`
      DELETE FROM product_categories WHERE product_id = ${productId}
    `;
    
    // Step 3.5: Insert new LLM-discovered tags to the database (only when user clicks Save)
    console.log(`🔍 DEBUG: Received newTagsToLearn array with ${tagResults.newTagsToLearn?.length || 0} items`);
    if (tagResults.newTagsToLearn && tagResults.newTagsToLearn.length > 0) {
      const { refreshTaxonomy } = require('../scrapers/auto-tagger');
      
      console.log(`💾 Inserting ${tagResults.newTagsToLearn.length} new tags to database...`);
      for (const newTag of tagResults.newTagsToLearn) {
        console.log(`  → Inserting: ${newTag.name} (${newTag.type}, llm_discovered=${newTag.llm_discovered})`);
        await sql`
          INSERT INTO tags (name, slug, tag_type, llm_discovered)
          VALUES (${newTag.name}, ${newTag.slug}, ${newTag.type}, ${newTag.llm_discovered})
          ON CONFLICT (slug) DO NOTHING
        `;
      }
      console.log(`✨ Saved ${tagResults.newTagsToLearn.length} new LLM tags: ${tagResults.newTagsToLearn.map(t => t.name).join(', ')}`);
      
      // Refresh auto-tagger taxonomy so new tags are immediately available
      await refreshTaxonomy();
      console.log('✅ Auto-tagger taxonomy refreshed - new tags available for next scrape');
    } else {
      console.log('ℹ️ No new tags to learn in this save operation');
    }
    
    // Step 4: Insert new tags and create associations
    for (const tag of tagResults.tags) {
      let tagIdResult = await sql`
        SELECT tag_id FROM tags WHERE slug = ${tag.slug}
      `;
      
      let tagId;
      if (tagIdResult.length === 0) {
        const newTag = await sql`
          INSERT INTO tags (name, slug, tag_type)
          VALUES (${tag.name}, ${tag.slug}, ${tag.type})
          RETURNING tag_id
        `;
        tagId = newTag[0].tag_id;
      } else {
        tagId = tagIdResult[0].tag_id;
      }
      
      await sql`
        INSERT INTO product_tags (product_id, tag_id)
        VALUES (${productId}, ${tagId})
      `;
    }
    
    // Step 5: Insert category associations (hierarchical path matching)
    // tagResults.categories should be an array like ["Men", "Fashion", "Footwear", "Shoes"]
    // OR a path string like "Toys & Games > Outdoor Play > Bubbles"
    // We need to walk the path and verify parent-child relationships
    if (tagResults.categories && tagResults.categories.length > 0) {
      const { refreshTaxonomy } = require('../scrapers/auto-tagger');
      
      // CLEANUP: Deduplicate path to handle database corruption
      const cleanedCategories = deduplicateCategoryPath(tagResults.categories);
      
      let parentId = null;
      let createdNewCategories = false;
      
      for (let i = 0; i < cleanedCategories.length; i++) {
        const categoryName = cleanedCategories[i];
        const categorySlug = categoryName.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
        
        // Find category by slug AND parent_id to ensure correct hierarchy
        let categoryResult = await sql`
          SELECT category_id FROM categories 
          WHERE slug = ${categorySlug}
          ${parentId !== null ? sql`AND parent_id = ${parentId}` : sql`AND parent_id IS NULL`}
        `;
        
        let categoryId;
        
        if (categoryResult.length > 0) {
          categoryId = categoryResult[0].category_id;
        } else {
          // Category doesn't exist - CREATE IT with llm_discovered flag (if column exists)
          console.log(`📦 Creating missing category: "${categoryName}" (parent: ${parentId})`);
          createdNewCategories = true;
          
          try {
            const newCategory = await sql`
              INSERT INTO categories (name, slug, parent_id, level, llm_discovered)
              VALUES (${categoryName}, ${categorySlug}, ${parentId}, ${i}, 1)
              ON CONFLICT (slug) DO UPDATE SET name = ${categoryName}
              RETURNING category_id
            `;
            categoryId = newCategory[0].category_id;
          } catch (err) {
            // If llm_discovered column doesn't exist, create without it
            if (err.message && err.message.includes('llm_discovered')) {
              const newCategory = await sql`
                INSERT INTO categories (name, slug, parent_id, level)
                VALUES (${categoryName}, ${categorySlug}, ${parentId}, ${i})
                ON CONFLICT (slug) DO UPDATE SET name = ${categoryName}
                RETURNING category_id
              `;
              categoryId = newCategory[0].category_id;
            } else {
              throw err;
            }
          }
          
          console.log(`✅ Created category ID ${categoryId}: ${categoryName}`);
        }
        
        // Insert product-category association
        await sql`
          INSERT INTO product_categories (product_id, category_id)
          VALUES (${productId}, ${categoryId})
          ON CONFLICT DO NOTHING
        `;
        
        // This category becomes the parent for the next level
        parentId = categoryId;
      }
      
      // Refresh taxonomy ONCE after all categories created
      if (createdNewCategories) {
        console.log('🔄 Refreshing auto-tagger taxonomy with new categories...');
        await refreshTaxonomy();
        console.log('✅ Auto-tagger taxonomy refreshed - new categories available for next scrape');
      }
    }
    
    return {
      success: true,
      productId
    };
    
  } catch (error) {
    console.error('Error updating product tags:', error);
    throw error;
  }
}

async function saveProduct(productData, tagResults) {
  try {
    const normalizedBreadcrumbs = normalizeBreadcrumbs(productData.breadcrumbs, productData.title);
    const tagNames = tagResults.tags.map(t => t.name);
    const productUrl = productData.url || '';
    
    // Check if product exists by URL
    const existingProduct = await sql`
      SELECT product_id, raw_id FROM products 
      WHERE url = ${productUrl} 
      LIMIT 1
    `;
    
    let productId;
    let rawId;
    
    if (existingProduct.length > 0) {
      // UPDATE existing product
      productId = existingProduct[0].product_id;
      rawId = existingProduct[0].raw_id;
      
      console.log(`🔄 Updating existing product (ID: ${productId})...`);
      
      // Update products_raw
      await sql`
        UPDATE products_raw SET
          raw_title = ${productData.title || null},
          raw_description = ${productData.description || null},
          raw_breadcrumbs = ${normalizedBreadcrumbs},
          raw_price = ${productData.price || null},
          raw_brand = ${productData.brand || null},
          raw_specs = ${productData.specs || null},
          raw_sku = ${productData.sku || null},
          raw_tags = ${productData.tags || null},
          raw_images = ${productData.images || []},
          raw_json_ld = ${productData.jsonLd ? JSON.stringify(productData.jsonLd) : null}
        WHERE raw_id = ${rawId}
      `;
      
      // Update products table
      await sql`
        UPDATE products SET
          title = ${productData.title || null},
          brand = ${productData.brand || null},
          price = ${productData.price ? parseFloat(productData.price.replace(/[^0-9.]/g, '')) : null},
          sku = ${productData.sku || null},
          category = ${tagResults.primaryCategory || null},
          gender = ${tagResults.gender || null},
          description = ${productData.description || null},
          tags = ${tagNames},
          specs = ${productData.specs ? JSON.stringify({ raw: productData.specs }) : null},
          image_urls = ${productData.images || []},
          confidence_score = ${tagResults.confidenceScore || 0}
        WHERE product_id = ${productId}
      `;
      
      // Clear existing tag and category associations for update
      await sql`DELETE FROM product_tags WHERE product_id = ${productId}`;
      await sql`DELETE FROM product_categories WHERE product_id = ${productId}`;
      
    } else {
      // INSERT new product
      console.log(`✨ Creating new product...`);
      
      const rawResult = await sql`
        INSERT INTO products_raw (
          source_url, raw_title, raw_description, raw_breadcrumbs, 
          raw_price, raw_brand, raw_specs, raw_sku, raw_tags, raw_images, raw_json_ld
        ) VALUES (
          ${productUrl},
          ${productData.title || null},
          ${productData.description || null},
          ${normalizedBreadcrumbs},
          ${productData.price || null},
          ${productData.brand || null},
          ${productData.specs || null},
          ${productData.sku || null},
          ${productData.tags || null},
          ${productData.images || []},
          ${productData.jsonLd ? JSON.stringify(productData.jsonLd) : null}
        )
        RETURNING raw_id
      `;
      
      rawId = rawResult[0].raw_id;
      
      const productResult = await sql`
        INSERT INTO products (
          raw_id, url, title, brand, price, sku, category, gender, description,
          tags, specs, image_urls, confidence_score
        ) VALUES (
          ${rawId},
          ${productUrl},
          ${productData.title || null},
          ${productData.brand || null},
          ${productData.price ? parseFloat(productData.price.replace(/[^0-9.]/g, '')) : null},
          ${productData.sku || null},
          ${tagResults.primaryCategory || null},
          ${tagResults.gender || null},
          ${productData.description || null},
          ${tagNames},
          ${productData.specs ? JSON.stringify({ raw: productData.specs }) : null},
          ${productData.images || []},
          ${tagResults.confidenceScore || 0}
        )
        RETURNING product_id
      `;
      
      productId = productResult[0].product_id;
    }
    
    // Insert new LLM-discovered tags to the database (only when user clicks Save)
    if (tagResults.newTagsToLearn && tagResults.newTagsToLearn.length > 0) {
      const { refreshTaxonomy } = require('../scrapers/auto-tagger');
      
      for (const newTag of tagResults.newTagsToLearn) {
        await sql`
          INSERT INTO tags (name, slug, tag_type, llm_discovered)
          VALUES (${newTag.name}, ${newTag.slug}, ${newTag.type}, ${newTag.llm_discovered})
          ON CONFLICT (slug) DO NOTHING
        `;
      }
      console.log(`✨ Saved ${tagResults.newTagsToLearn.length} new LLM tags: ${tagResults.newTagsToLearn.map(t => t.name).join(', ')}`);
      
      // Refresh auto-tagger taxonomy so new tags are immediately available
      await refreshTaxonomy();
      console.log('✅ Auto-tagger taxonomy refreshed - new tags available for next scrape');
    }
    
    for (const tag of tagResults.tags) {
      let tagIdResult = await sql`
        SELECT tag_id FROM tags WHERE slug = ${tag.slug}
      `;
      
      let tagId;
      if (tagIdResult.length === 0) {
        const newTag = await sql`
          INSERT INTO tags (name, slug, tag_type)
          VALUES (${tag.name}, ${tag.slug}, ${tag.type})
          RETURNING tag_id
        `;
        tagId = newTag[0].tag_id;
      } else {
        tagId = tagIdResult[0].tag_id;
      }
      
      await sql`
        INSERT INTO product_tags (product_id, tag_id)
        VALUES (${productId}, ${tagId})
      `;
    }
    
    // Insert category associations (hierarchical path matching)
    if (tagResults.categories && tagResults.categories.length > 0) {
      let parentId = null;
      
      for (let i = 0; i < tagResults.categories.length; i++) {
        const categoryName = tagResults.categories[i];
        const categorySlug = categoryName.toLowerCase().replace(/\s+/g, '-');
        
        // Find category by slug AND parent_id to ensure correct hierarchy
        const categoryResult = await sql`
          SELECT category_id FROM categories 
          WHERE slug = ${categorySlug}
          ${parentId !== null ? sql`AND parent_id = ${parentId}` : sql`AND parent_id IS NULL`}
        `;
        
        if (categoryResult.length > 0) {
          const categoryId = categoryResult[0].category_id;
          
          // Insert product-category association
          await sql`
            INSERT INTO product_categories (product_id, category_id)
            VALUES (${productId}, ${categoryId})
            ON CONFLICT DO NOTHING
          `;
          
          // This category becomes the parent for the next level
          parentId = categoryId;
        } else {
          // Path broken - category doesn't exist at this level with this parent
          console.warn(`Category path broken at "${categoryName}" (expected parent: ${parentId})`);
          break;
        }
      }
    }
    
    return {
      success: true,
      productId,
      rawId,
      needsEnrichment: tagResults.needsLLMEnrichment
    };
    
  } catch (error) {
    console.error('Error saving product:', error);
    throw error;
  }
}

/**
 * Build full category path from category ID by walking up parent chain
 */
async function buildCategoryPath(categoryId) {
  try {
    const result = await sql`
      WITH RECURSIVE category_path AS (
        -- Start with the target category
        SELECT category_id, name, parent_id, 0 as depth
        FROM categories
        WHERE category_id = ${categoryId}
        
        UNION ALL
        
        -- Recursively get parent categories
        SELECT c.category_id, c.name, c.parent_id, cp.depth + 1
        FROM categories c
        INNER JOIN category_path cp ON c.category_id = cp.parent_id
      )
      SELECT string_agg(name, ' > ' ORDER BY depth DESC) as full_path
      FROM category_path
    `;
    
    return result[0]?.full_path || null;
  } catch (error) {
    console.error('Error building category path:', error);
    return null;
  }
}

async function getProducts(filters = {}) {
  try {
    let query = `
      WITH category_paths AS (
        SELECT 
          pc.product_id,
          c.category_id,
          c.name,
          c.level,
          -- Recursive CTE to build full path
          (
            WITH RECURSIVE path AS (
              SELECT category_id, name, parent_id, 0 as depth
              FROM categories
              WHERE category_id = c.category_id
              
              UNION ALL
              
              SELECT cat.category_id, cat.name, cat.parent_id, p.depth + 1
              FROM categories cat
              INNER JOIN path p ON cat.category_id = p.parent_id
            )
            SELECT string_agg(name, ' > ' ORDER BY depth DESC)
            FROM path
          ) as full_path
        FROM product_categories pc
        LEFT JOIN categories c ON pc.category_id = c.category_id
      )
      SELECT 
        p.*,
        pr.source_url,
        pr.scraped_at,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('name', t.name, 'type', t.tag_type)) 
          FILTER (WHERE t.tag_id IS NOT NULL), 
          '[]'
        ) as tag_details,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'name', cp.name, 
            'level', cp.level,
            'full_path', cp.full_path
          )) 
          FILTER (WHERE cp.category_id IS NOT NULL), 
          '[]'
        ) as category_details,
        -- Get the deepest (most specific) category's full path
        (
          SELECT cp2.full_path 
          FROM category_paths cp2 
          WHERE cp2.product_id = p.product_id 
          ORDER BY cp2.level DESC 
          LIMIT 1
        ) as category_full_path
      FROM products p
      LEFT JOIN products_raw pr ON p.raw_id = pr.raw_id
      LEFT JOIN product_tags pt ON p.product_id = pt.product_id
      LEFT JOIN tags t ON pt.tag_id = t.tag_id
      LEFT JOIN category_paths cp ON p.product_id = cp.product_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (filters.category) {
      conditions.push(`p.category = $${params.length + 1}`);
      params.push(filters.category);
    }
    
    if (filters.gender) {
      conditions.push(`p.gender = $${params.length + 1}`);
      params.push(filters.gender);
    }
    
    if (filters.minConfidence) {
      conditions.push(`p.confidence_score >= $${params.length + 1}`);
      params.push(filters.minConfidence);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += `
      GROUP BY p.product_id, pr.source_url, pr.scraped_at
      ORDER BY p.created_at DESC
      LIMIT ${filters.limit || 50}
    `;
    
    const results = await sql.unsafe(query, params);
    return results;
    
  } catch (error) {
    console.error('Error getting products:', error);
    throw error;
  }
}

async function getProductStats() {
  try {
    const stats = await sql`
      SELECT 
        COUNT(*) as total_products,
        COUNT(DISTINCT category) as unique_categories,
        AVG(confidence_score)::numeric(3,2) as avg_confidence,
        COUNT(*) FILTER (WHERE confidence_score < 0.70) as needs_enrichment
      FROM products
    `;
    
    return stats[0];
  } catch (error) {
    console.error('Error getting stats:', error);
    throw error;
  }
}

async function seedFullTaxonomy() {
  console.log('🌱 Starting full taxonomy seed...');
  
  try {
    // Load the comprehensive seed data
    const fs = require('fs');
    const path = require('path');
    
    // Extract categories array from seed file
    const catFileContent = fs.readFileSync(path.join(__dirname, '../scripts/seed-categories-comprehensive.js'), 'utf8');
    const catArrayMatch = catFileContent.match(/const COMPREHENSIVE_CATEGORIES = \[([\s\S]*?)\];/);
    
    if (!catArrayMatch) {
      throw new Error('Could not extract categories from seed file');
    }
    
    // Eval the array safely (it's our own trusted code)
    const categories = eval(`[${catArrayMatch[1]}]`);
    
    // Extract tags from seed file
    const tagFileContent = fs.readFileSync(path.join(__dirname, '../scripts/seed-tags-comprehensive.js'), 'utf8');
    const tagObjectMatch = tagFileContent.match(/const COMPREHENSIVE_TAGS = \{([\s\S]*?)\};/);
    
    if (!tagObjectMatch) {
      throw new Error('Could not extract tags from seed file');
    }
    
    const tagsObj = eval(`({${tagObjectMatch[1]}})`);
    
    // Clear existing data (preserve LLM-discovered tags)
    console.log('🗑️  Clearing existing taxonomy (preserving LLM discoveries)...');
    
    // Delete only product associations for tags being deleted (built-in tags)
    await sql`
      DELETE FROM product_tags 
      WHERE tag_id IN (
        SELECT tag_id FROM tags WHERE llm_discovered = 0 OR llm_discovered IS NULL
      )
    `;
    
    // Delete only built-in tags (preserve llm_discovered = 1)
    await sql`DELETE FROM tags WHERE llm_discovered = 0 OR llm_discovered IS NULL`;
    
    // Clear categories (no user data here)
    await sql`TRUNCATE TABLE product_categories, categories RESTART IDENTITY CASCADE`;
    
    console.log('✅ Cleared built-in taxonomy (kept LLM-discovered tags)');
    
    // Insert categories in order (parents first)
    console.log(`📂 Inserting ${categories.length} categories...`);
    const categoryMap = new Map();
    const levelStack = []; // Track ancestors at each level
    const slugCounter = {};
    
    for (const cat of categories) {
      // Update level stack to track current ancestry
      levelStack[cat.level] = cat.name;
      // Clear deeper levels when we go back up
      levelStack.length = cat.level + 1;
      
      // Build unique key from full path (e.g., "Fashion:Men:Clothing" vs "Fashion:Women:Clothing")
      const fullPath = levelStack.join(':');
      
      // Get parent ID from the previous level in the stack
      let parentId = null;
      if (cat.level > 0) {
        const parentPath = levelStack.slice(0, cat.level).join(':');
        parentId = categoryMap.get(parentPath) || null;
      }
      
      // Create base slug with counter for duplicates
      let slug = cat.name.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and');
      if (slugCounter[slug] !== undefined) {
        slugCounter[slug]++;
        slug = `${slug}-${slugCounter[slug]}`;
      } else {
        slugCounter[slug] = 0;
      }
      
      const result = await sql`
        INSERT INTO categories (name, parent_id, level, slug)
        VALUES (${cat.name}, ${parentId}, ${cat.level}, ${slug})
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          parent_id = EXCLUDED.parent_id,
          level = EXCLUDED.level
        RETURNING category_id
      `;
      
      // Store with full path as key so "Fashion:Men:Clothing" and "Fashion:Women:Clothing" are separate
      categoryMap.set(fullPath, result[0].category_id);
    }
    
    console.log(`✅ ${categories.length} categories inserted`);
    
    // Insert tags by type
    console.log('🏷️  Inserting tags...');
    let totalTags = 0;
    
    for (const [tagType, tagArray] of Object.entries(tagsObj)) {
      for (const tagName of tagArray) {
        await sql`
          INSERT INTO tags (name, tag_type, slug, llm_discovered)
          VALUES (${tagName}, ${tagType}, ${tagName.toLowerCase().replace(/\s+/g, '-')}, 0)
          ON CONFLICT (slug) DO NOTHING
        `;
        totalTags++;
      }
    }
    
    console.log(`✅ ${totalTags} tags inserted`);
    console.log('🎉 Full taxonomy seeded successfully!');
    
    return {
      success: true,
      categoriesCount: categories.length,
      tagsCount: totalTags
    };
    
  } catch (error) {
    console.error('❌ Error seeding taxonomy:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function viewTaxonomy() {
  try {
    console.log('📋 Fetching taxonomy from database...');
    
    // Get all categories ordered by level
    const categories = await sql`
      SELECT category_id, name, parent_id, level
      FROM categories
      ORDER BY level, name
    `;
    
    // Get all tags grouped by type
    const tags = await sql`
      SELECT name, tag_type
      FROM tags
      ORDER BY tag_type, name
    `;
    
    // Group tags by type
    const tagsByType = {};
    tags.forEach(tag => {
      if (!tagsByType[tag.tag_type]) {
        tagsByType[tag.tag_type] = [];
      }
      tagsByType[tag.tag_type].push(tag.name);
    });
    
    console.log(`✅ Retrieved ${categories.length} categories and ${tags.length} tags`);
    
    return {
      success: true,
      categories: categories,
      tagsByType: tagsByType,
      totalTags: tags.length
    };
    
  } catch (error) {
    console.error('❌ Error viewing taxonomy:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function getCategoryHierarchy() {
  try {
    // Get all categories with their relationships
    const categories = await sql`
      SELECT category_id, name, parent_id, level, slug
      FROM categories
      ORDER BY level, name
    `;
    
    return {
      success: true,
      categories: categories
    };
  } catch (error) {
    console.error('❌ Error getting category hierarchy:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a new category with proper parent linkage
 * @param {Object} categoryData - { name, parentId, level }
 * @returns {Object} { success, categoryId, slug }
 */
async function createCategory(categoryData) {
  try {
    const { name, parentId, level } = categoryData;
    
    if (!name || name.trim() === '') {
      return {
        success: false,
        error: 'Category name is required'
      };
    }
    
    // Create slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    // Check if category already exists with same name and parent
    const existing = await sql`
      SELECT category_id 
      FROM categories 
      WHERE name = ${name} 
      AND ${parentId ? sql`parent_id = ${parentId}` : sql`parent_id IS NULL`}
      LIMIT 1
    `;
    
    if (existing.length > 0) {
      return {
        success: false,
        error: 'Category with this name already exists at this level'
      };
    }
    
    // Insert new category with parent linkage
    const result = await sql`
      INSERT INTO categories (name, slug, parent_id, level, llm_discovered)
      VALUES (${name}, ${slug}, ${parentId || null}, ${level || 0}, 1)
      RETURNING category_id, slug
    `;
    
    const categoryId = result[0].category_id;
    const createdSlug = result[0].slug;
    
    console.log(`✅ Created category: "${name}" (ID: ${categoryId}, Level: ${level}, Parent: ${parentId || 'ROOT'})`);
    
    // Refresh auto-tagger taxonomy
    const { refreshTaxonomy } = require('../scrapers/auto-tagger');
    await refreshTaxonomy();
    console.log('✅ Auto-tagger taxonomy refreshed');
    
    return {
      success: true,
      categoryId: categoryId,
      slug: createdSlug
    };
    
  } catch (error) {
    console.error('❌ Error creating category:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  saveRawProduct,
  updateProductTags,
  saveProduct,
  getProducts,
  getProductStats,
  buildCategoryPath,
  seedFullTaxonomy,
  viewTaxonomy,
  getCategoryHierarchy,
  createCategory
};
