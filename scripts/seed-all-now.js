require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;

const sql = postgres(connectionString, { 
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10
});

async function seedAll() {
  try {
    console.log('🚀 Starting database seed...');
    
    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await sql`DELETE FROM product_tags`;
    await sql`DELETE FROM product_categories`;  
    await sql`DELETE FROM tag_taxonomy`;
    await sql`DELETE FROM categories`;
    
    console.log('✅ Tables cleared');
    
    // Insert categories in order (parents before children)
    console.log('📂 Inserting categories...');
    
    const categories = [
      // Level 0 - Top departments
      { name: 'Fashion', parent: null, level: 0 },
      { name: 'Tools & Hardware', parent: null, level: 0 },
      
      // Level 1 - Fashion subcategories
      { name: 'Men', parent: 'Fashion', level: 1 },
      { name: 'Women', parent: 'Fashion', level: 1 },
      
      // Level 2 - Men's categories
      { name: 'Clothing', parent: 'Men', level: 2 },
      
      // Level 3 - Clothing categories
      { name: 'Tops', parent: 'Clothing', level: 3 },
      { name: 'Bottoms', parent: 'Clothing', level: 3 },
      
      // Level 4 - Specific items
      { name: 'Jeans', parent: 'Bottoms', level: 4 }
    ];
    
    const categoryMap = new Map();
    
    for (const cat of categories) {
      const parentId = cat.parent ? categoryMap.get(cat.parent) : null;
      
      const result = await sql`
        INSERT INTO categories (name, parent_id, level, slug)
        VALUES (${cat.name}, ${parentId}, ${cat.level}, ${cat.name.toLowerCase().replace(/\s+/g, '-')})
        RETURNING category_id
      `;
      
      categoryMap.set(cat.name, result[0].category_id);
      console.log(`  ✅ ${cat.name} (id: ${result[0].category_id})`);
    }
    
    console.log(`✅ ${categories.length} categories inserted`);
    
    // Insert essential tags
    console.log('🏷️  Inserting tags...');
    
    const tags = [
      // Colors
      { name: 'indigo', type: 'colors' },
      { name: 'black', type: 'colors' },
      { name: 'blue', type: 'colors' },
      { name: 'navy', type: 'colors' },
      
      // Materials
      { name: 'denim', type: 'materials' },
      { name: 'cotton', type: 'materials' },
      { name: 'elastane', type: 'materials' },
      { name: 'stretch', type: 'materials' },
      
      // Fit
      { name: 'slim-fit', type: 'fit' },
      { name: 'tapered', type: 'fit' },
      { name: 'relaxed-fit', type: 'fit' },
      { name: 'regular-fit', type: 'fit' },
      
      // Styles  
      { name: 'casual', type: 'styles' },
      { name: 'modern', type: 'styles' },
      { name: 'classic', type: 'styles' }
    ];
    
    for (const tag of tags) {
      await sql`
        INSERT INTO tag_taxonomy (name, tag_type, slug)
        VALUES (${tag.name}, ${tag.type}, ${tag.name.toLowerCase().replace(/\s+/g, '-')})
      `;
      console.log(`  ✅ ${tag.name} (${tag.type})`);
    }
    
    console.log(`✅ ${tags.length} tags inserted`);
    console.log('🎉 Database seeded successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding:', error);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

seedAll();
