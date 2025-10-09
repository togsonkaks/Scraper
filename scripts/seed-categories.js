require('dotenv').config();
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { categories } = require('../shared/schema.ts');

const categoryData = [
  { name: 'Fashion', slug: 'fashion', parent_id: null, level: 0 },
  { name: 'Men', slug: 'men', parent_id: 1, level: 1 },
  { name: 'Women', slug: 'women', parent_id: 1, level: 1 },
  { name: 'Kids', slug: 'kids', parent_id: 1, level: 1 },
  { name: 'Shoes', slug: 'shoes', parent_id: 2, level: 2 },
  { name: 'Tops', slug: 'tops', parent_id: 2, level: 2 },
  { name: 'Bottoms', slug: 'bottoms', parent_id: 2, level: 2 },
  { name: 'Outerwear', slug: 'outerwear', parent_id: 2, level: 2 },
  { name: 'Shoes', slug: 'women-shoes', parent_id: 3, level: 2 },
  { name: 'Dresses', slug: 'dresses', parent_id: 3, level: 2 },
  { name: 'Tops', slug: 'women-tops', parent_id: 3, level: 2 },
  { name: 'Bottoms', slug: 'women-bottoms', parent_id: 3, level: 2 },
  
  { name: 'Home', slug: 'home', parent_id: null, level: 0 },
  { name: 'Furniture', slug: 'furniture', parent_id: 13, level: 1 },
  { name: 'Kitchen', slug: 'kitchen', parent_id: 13, level: 1 },
  { name: 'Bedding', slug: 'bedding', parent_id: 13, level: 1 },
  { name: 'Decor', slug: 'decor', parent_id: 13, level: 1 },
  
  { name: 'Electronics', slug: 'electronics', parent_id: null, level: 0 },
  { name: 'Phones', slug: 'phones', parent_id: 18, level: 1 },
  { name: 'Laptops', slug: 'laptops', parent_id: 18, level: 1 },
  { name: 'Audio', slug: 'audio', parent_id: 18, level: 1 },
  { name: 'Gaming', slug: 'gaming', parent_id: 18, level: 1 },
  
  { name: 'Beauty', slug: 'beauty', parent_id: null, level: 0 },
  { name: 'Makeup', slug: 'makeup', parent_id: 23, level: 1 },
  { name: 'Skincare', slug: 'skincare', parent_id: 23, level: 1 },
  { name: 'Haircare', slug: 'haircare', parent_id: 23, level: 1 },
  
  { name: 'Sports', slug: 'sports', parent_id: null, level: 0 },
  { name: 'Fitness', slug: 'fitness', parent_id: 27, level: 1 },
  { name: 'Outdoor', slug: 'outdoor', parent_id: 27, level: 1 },
  { name: 'Cycling', slug: 'cycling', parent_id: 27, level: 1 }
];

async function seedCategories() {
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);
  
  try {
    const existingCount = await client`SELECT COUNT(*) FROM categories`;
    
    if (existingCount[0].count > 0) {
      console.log(`Categories already seeded (${existingCount[0].count} rows). Skipping.`);
      await client.end();
      return;
    }
    
    for (const cat of categoryData) {
      await client`
        INSERT INTO categories (name, slug, parent_id, level) 
        VALUES (${cat.name}, ${cat.slug}, ${cat.parent_id}, ${cat.level})
      `;
    }
    
    console.log(`✅ Successfully seeded ${categoryData.length} categories`);
    await client.end();
  } catch (error) {
    console.error('Error seeding categories:', error);
    await client.end();
    process.exit(1);
  }
}

seedCategories();
