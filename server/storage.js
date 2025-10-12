require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
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
        raw_id, title, brand, price, sku, category, gender, 
        tags, specs, image_urls, confidence_score
      ) VALUES (
        ${rawId},
        ${productData.title || null},
        ${productData.brand || null},
        ${productData.price ? parseFloat(productData.price.replace(/[^0-9.]/g, '')) : null},
        ${productData.sku || null},
        ${null},  -- category NULL (LLM will add)
        ${null},  -- gender NULL (LLM will add)
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
    // We need to walk the path and verify parent-child relationships
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
    
    const tagNames = tagResults.tags.map(t => t.name);
    
    const productResult = await sql`
      INSERT INTO products (
        raw_id, title, brand, price, sku, category, gender, 
        tags, specs, image_urls, confidence_score
      ) VALUES (
        ${rawId},
        ${productData.title || null},
        ${productData.brand || null},
        ${productData.price ? parseFloat(productData.price.replace(/[^0-9.]/g, '')) : null},
        ${productData.sku || null},
        ${tagResults.primaryCategory || null},
        ${tagResults.gender || null},
        ${tagNames},
        ${productData.specs ? JSON.stringify({ raw: productData.specs }) : null},
        ${productData.images || []},
        ${tagResults.confidenceScore || 0}
      )
      RETURNING product_id
    `;
    
    const productId = productResult[0].product_id;
    
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
    
    // Clear existing data using TRUNCATE CASCADE (faster and resets sequences)
    console.log('🗑️  Clearing existing taxonomy...');
    await sql`TRUNCATE TABLE product_tags, product_categories, tag_taxonomy, categories RESTART IDENTITY CASCADE`;
    
    // Insert categories in order (parents first)
    console.log(`📂 Inserting ${categories.length} categories...`);
    const categoryMap = new Map();
    
    for (const cat of categories) {
      const parentId = cat.parent ? categoryMap.get(cat.parent) : null;
      const slug = cat.name.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and');
      
      const result = await sql`
        INSERT INTO categories (name, parent_id, level, slug)
        VALUES (${cat.name}, ${parentId}, ${cat.level}, ${slug})
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          parent_id = EXCLUDED.parent_id,
          level = EXCLUDED.level
        RETURNING category_id
      `;
      
      categoryMap.set(cat.name, result[0].category_id);
    }
    
    console.log(`✅ ${categories.length} categories inserted`);
    
    // Insert tags by type
    console.log('🏷️  Inserting tags...');
    let totalTags = 0;
    
    for (const [tagType, tagArray] of Object.entries(tagsObj)) {
      for (const tagName of tagArray) {
        await sql`
          INSERT INTO tag_taxonomy (name, tag_type, slug)
          VALUES (${tagName}, ${tagType}, ${tagName.toLowerCase().replace(/\s+/g, '-')})
          ON CONFLICT (name) DO NOTHING
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

module.exports = {
  saveRawProduct,
  updateProductTags,
  saveProduct,
  getProducts,
  getProductStats,
  buildCategoryPath,
  seedFullTaxonomy
};
