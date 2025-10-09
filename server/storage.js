require('dotenv').config();
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);

async function saveProduct(productData, tagResults) {
  try {
    const rawResult = await sql`
      INSERT INTO products_raw (
        source_url, raw_title, raw_description, raw_breadcrumbs, 
        raw_price, raw_brand, raw_specs, raw_sku, raw_tags, raw_images
      ) VALUES (
        ${productData.url || ''},
        ${productData.title || null},
        ${productData.description || null},
        ${productData.breadcrumbs || []},
        ${productData.price || null},
        ${productData.brand || null},
        ${productData.specs || null},
        ${productData.sku || null},
        ${productData.tags || null},
        ${productData.images || []}
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
    
    for (const categorySlug of [tagResults.primaryCategory, ...tagResults.allCategories]) {
      if (!categorySlug) continue;
      
      const categoryResult = await sql`
        SELECT category_id FROM categories WHERE slug = ${categorySlug}
      `;
      
      if (categoryResult.length > 0) {
        await sql`
          INSERT INTO product_categories (product_id, category_id)
          VALUES (${productId}, ${categoryResult[0].category_id})
          ON CONFLICT DO NOTHING
        `;
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

async function getProducts(filters = {}) {
  try {
    let query = `
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
          json_agg(DISTINCT jsonb_build_object('name', c.name, 'slug', c.slug, 'level', c.level)) 
          FILTER (WHERE c.category_id IS NOT NULL), 
          '[]'
        ) as category_details
      FROM products p
      LEFT JOIN products_raw pr ON p.raw_id = pr.raw_id
      LEFT JOIN product_tags pt ON p.product_id = pt.product_id
      LEFT JOIN tags t ON pt.tag_id = t.tag_id
      LEFT JOIN product_categories pc ON p.product_id = pc.product_id
      LEFT JOIN categories c ON pc.category_id = c.category_id
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

module.exports = {
  saveProduct,
  getProducts,
  getProductStats
};
