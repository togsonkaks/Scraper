require('dotenv').config();
const postgres = require('postgres');

const categoryData = [
  // FASHION DEPARTMENT
  { name: 'Fashion', slug: 'fashion', parent_id: null, level: 0 },
  
  // Men's Fashion
  { name: 'Men', slug: 'men', parent_id: 1, level: 1 },
  { name: 'Footwear', slug: 'men-footwear', parent_id: 2, level: 2 },
  { name: 'Sneakers', slug: 'men-sneakers', parent_id: 3, level: 3 },
  { name: 'Boots', slug: 'men-boots', parent_id: 3, level: 3 },
  { name: 'Dress Shoes', slug: 'men-dress-shoes', parent_id: 3, level: 3 },
  { name: 'Sandals', slug: 'men-sandals', parent_id: 3, level: 3 },
  { name: 'Slippers', slug: 'men-slippers', parent_id: 3, level: 3 },
  
  { name: 'Tops', slug: 'men-tops', parent_id: 2, level: 2 },
  { name: 'T-Shirts', slug: 'men-tshirts', parent_id: 10, level: 3 },
  { name: 'Shirts', slug: 'men-shirts', parent_id: 10, level: 3 },
  { name: 'Sweaters', slug: 'men-sweaters', parent_id: 10, level: 3 },
  { name: 'Hoodies', slug: 'men-hoodies', parent_id: 10, level: 3 },
  { name: 'Tank Tops', slug: 'men-tank-tops', parent_id: 10, level: 3 },
  { name: 'Vests', slug: 'men-vests', parent_id: 10, level: 3 },
  
  { name: 'Bottoms', slug: 'men-bottoms', parent_id: 2, level: 2 },
  { name: 'Jeans', slug: 'men-jeans', parent_id: 17, level: 3 },
  { name: 'Pants', slug: 'men-pants', parent_id: 17, level: 3 },
  { name: 'Shorts', slug: 'men-shorts', parent_id: 17, level: 3 },
  { name: 'Joggers', slug: 'men-joggers', parent_id: 17, level: 3 },
  
  { name: 'Outerwear', slug: 'men-outerwear', parent_id: 2, level: 2 },
  { name: 'Jackets', slug: 'men-jackets', parent_id: 22, level: 3 },
  { name: 'Coats', slug: 'men-coats', parent_id: 22, level: 3 },
  
  { name: 'Accessories', slug: 'men-accessories', parent_id: 2, level: 2 },
  { name: 'Hats', slug: 'men-hats', parent_id: 25, level: 3 },
  { name: 'Belts', slug: 'men-belts', parent_id: 25, level: 3 },
  { name: 'Wallets', slug: 'men-wallets', parent_id: 25, level: 3 },
  { name: 'Bags', slug: 'men-bags', parent_id: 25, level: 3 },
  { name: 'Sunglasses', slug: 'men-sunglasses', parent_id: 25, level: 3 },
  
  { name: 'Underwear & Socks', slug: 'men-underwear-socks', parent_id: 2, level: 2 },
  
  // Women's Fashion
  { name: 'Women', slug: 'women', parent_id: 1, level: 1 },
  { name: 'Footwear', slug: 'women-footwear', parent_id: 32, level: 2 },
  { name: 'Sneakers', slug: 'women-sneakers', parent_id: 33, level: 3 },
  { name: 'Boots', slug: 'women-boots', parent_id: 33, level: 3 },
  { name: 'Heels', slug: 'women-heels', parent_id: 33, level: 3 },
  { name: 'Flats', slug: 'women-flats', parent_id: 33, level: 3 },
  { name: 'Sandals', slug: 'women-sandals', parent_id: 33, level: 3 },
  
  { name: 'Tops', slug: 'women-tops', parent_id: 32, level: 2 },
  { name: 'Blouses', slug: 'women-blouses', parent_id: 39, level: 3 },
  { name: 'T-Shirts', slug: 'women-tshirts', parent_id: 39, level: 3 },
  { name: 'Sweaters', slug: 'women-sweaters', parent_id: 39, level: 3 },
  { name: 'Tank Tops', slug: 'women-tank-tops', parent_id: 39, level: 3 },
  
  { name: 'Bottoms', slug: 'women-bottoms', parent_id: 32, level: 2 },
  { name: 'Jeans', slug: 'women-jeans', parent_id: 44, level: 3 },
  { name: 'Pants', slug: 'women-pants', parent_id: 44, level: 3 },
  { name: 'Skirts', slug: 'women-skirts', parent_id: 44, level: 3 },
  { name: 'Leggings', slug: 'women-leggings', parent_id: 44, level: 3 },
  
  { name: 'Dresses', slug: 'women-dresses', parent_id: 32, level: 2 },
  { name: 'Outerwear', slug: 'women-outerwear', parent_id: 32, level: 2 },
  
  { name: 'Accessories', slug: 'women-accessories', parent_id: 32, level: 2 },
  { name: 'Jewelry', slug: 'women-jewelry', parent_id: 51, level: 3 },
  { name: 'Handbags', slug: 'women-handbags', parent_id: 51, level: 3 },
  { name: 'Scarves', slug: 'women-scarves', parent_id: 51, level: 3 },
  
  // Kids Fashion
  { name: 'Kids', slug: 'kids', parent_id: 1, level: 1 },
  { name: 'Boys', slug: 'boys', parent_id: 55, level: 2 },
  { name: 'Girls', slug: 'girls', parent_id: 55, level: 2 },
  
  // Unisex
  { name: 'Unisex', slug: 'unisex', parent_id: 1, level: 1 },
  { name: 'Bags', slug: 'unisex-bags', parent_id: 58, level: 2 },
  { name: 'Watches', slug: 'unisex-watches', parent_id: 58, level: 2 },
  { name: 'Accessories', slug: 'unisex-accessories', parent_id: 58, level: 2 },
  
  // HOME & LIVING DEPARTMENT
  { name: 'Home & Living', slug: 'home-living', parent_id: null, level: 0 },
  { name: 'Furniture', slug: 'furniture', parent_id: 62, level: 1 },
  { name: 'Bedroom', slug: 'bedroom-furniture', parent_id: 63, level: 2 },
  { name: 'Living Room', slug: 'living-room-furniture', parent_id: 63, level: 2 },
  { name: 'Dining', slug: 'dining-furniture', parent_id: 63, level: 2 },
  { name: 'Office', slug: 'office-furniture', parent_id: 63, level: 2 },
  
  { name: 'Kitchen & Dining', slug: 'kitchen-dining', parent_id: 62, level: 1 },
  { name: 'Cookware', slug: 'cookware', parent_id: 68, level: 2 },
  { name: 'Dinnerware', slug: 'dinnerware', parent_id: 68, level: 2 },
  { name: 'Appliances', slug: 'kitchen-appliances', parent_id: 68, level: 2 },
  
  { name: 'Bedding & Bath', slug: 'bedding-bath', parent_id: 62, level: 1 },
  { name: 'Sheets', slug: 'sheets', parent_id: 72, level: 2 },
  { name: 'Towels', slug: 'towels', parent_id: 72, level: 2 },
  { name: 'Shower', slug: 'shower', parent_id: 72, level: 2 },
  
  { name: 'Decor', slug: 'decor', parent_id: 62, level: 1 },
  { name: 'Wall Art', slug: 'wall-art', parent_id: 76, level: 2 },
  { name: 'Lighting', slug: 'lighting', parent_id: 76, level: 2 },
  { name: 'Rugs', slug: 'rugs', parent_id: 76, level: 2 },
  { name: 'Plants', slug: 'plants', parent_id: 76, level: 2 },
  
  { name: 'Storage & Organization', slug: 'storage-organization', parent_id: 62, level: 1 },
  
  // ELECTRONICS & TECH DEPARTMENT
  { name: 'Electronics & Tech', slug: 'electronics-tech', parent_id: null, level: 0 },
  { name: 'Phones & Tablets', slug: 'phones-tablets', parent_id: 82, level: 1 },
  { name: 'Smartphones', slug: 'smartphones', parent_id: 83, level: 2 },
  { name: 'Tablets', slug: 'tablets', parent_id: 83, level: 2 },
  { name: 'Phone Accessories', slug: 'phone-accessories', parent_id: 83, level: 2 },
  
  { name: 'Computers', slug: 'computers', parent_id: 82, level: 1 },
  { name: 'Laptops', slug: 'laptops', parent_id: 87, level: 2 },
  { name: 'Desktops', slug: 'desktops', parent_id: 87, level: 2 },
  { name: 'Monitors', slug: 'monitors', parent_id: 87, level: 2 },
  
  { name: 'Audio', slug: 'audio', parent_id: 82, level: 1 },
  { name: 'Headphones', slug: 'headphones', parent_id: 91, level: 2 },
  { name: 'Speakers', slug: 'speakers', parent_id: 91, level: 2 },
  { name: 'Earbuds', slug: 'earbuds', parent_id: 91, level: 2 },
  
  { name: 'Gaming', slug: 'gaming', parent_id: 82, level: 1 },
  { name: 'Consoles', slug: 'consoles', parent_id: 95, level: 2 },
  { name: 'Controllers', slug: 'controllers', parent_id: 95, level: 2 },
  
  { name: 'Smart Home', slug: 'smart-home', parent_id: 82, level: 1 },
  { name: 'Cameras', slug: 'cameras', parent_id: 82, level: 1 },
  
  // BEAUTY & PERSONAL CARE DEPARTMENT
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care', parent_id: null, level: 0 },
  { name: 'Makeup', slug: 'makeup', parent_id: 100, level: 1 },
  { name: 'Face', slug: 'face-makeup', parent_id: 101, level: 2 },
  { name: 'Eyes', slug: 'eyes-makeup', parent_id: 101, level: 2 },
  { name: 'Lips', slug: 'lips-makeup', parent_id: 101, level: 2 },
  
  { name: 'Skincare', slug: 'skincare', parent_id: 100, level: 1 },
  { name: 'Cleansers', slug: 'cleansers', parent_id: 105, level: 2 },
  { name: 'Moisturizers', slug: 'moisturizers', parent_id: 105, level: 2 },
  { name: 'Treatments', slug: 'treatments', parent_id: 105, level: 2 },
  
  { name: 'Haircare', slug: 'haircare', parent_id: 100, level: 1 },
  { name: 'Shampoo', slug: 'shampoo', parent_id: 109, level: 2 },
  { name: 'Styling', slug: 'styling', parent_id: 109, level: 2 },
  
  { name: 'Fragrance', slug: 'fragrance', parent_id: 100, level: 1 },
  { name: 'Personal Care', slug: 'personal-care', parent_id: 100, level: 1 },
  
  // SPORTS & OUTDOORS DEPARTMENT
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', parent_id: null, level: 0 },
  { name: 'Fitness', slug: 'fitness', parent_id: 114, level: 1 },
  { name: 'Gym Equipment', slug: 'gym-equipment', parent_id: 115, level: 2 },
  { name: 'Yoga', slug: 'yoga', parent_id: 115, level: 2 },
  { name: 'Cardio', slug: 'cardio', parent_id: 115, level: 2 },
  
  { name: 'Outdoor Recreation', slug: 'outdoor-recreation', parent_id: 114, level: 1 },
  { name: 'Camping', slug: 'camping', parent_id: 119, level: 2 },
  { name: 'Hiking', slug: 'hiking', parent_id: 119, level: 2 },
  
  { name: 'Sports', slug: 'sports', parent_id: 114, level: 1 },
  { name: 'Cycling', slug: 'cycling', parent_id: 114, level: 1 },
  { name: 'Athletic Apparel', slug: 'athletic-apparel', parent_id: 114, level: 1 },
  
  // PETS & ANIMALS DEPARTMENT
  { name: 'Pets & Animals', slug: 'pets-animals', parent_id: null, level: 0 },
  { name: 'Dogs', slug: 'dogs', parent_id: 125, level: 1 },
  { name: 'Dog Food', slug: 'dog-food', parent_id: 126, level: 2 },
  { name: 'Dog Toys', slug: 'dog-toys', parent_id: 126, level: 2 },
  { name: 'Dog Apparel', slug: 'dog-apparel', parent_id: 126, level: 2 },
  { name: 'Dog Grooming', slug: 'dog-grooming', parent_id: 126, level: 2 },
  
  { name: 'Cats', slug: 'cats', parent_id: 125, level: 1 },
  { name: 'Cat Food', slug: 'cat-food', parent_id: 131, level: 2 },
  { name: 'Cat Toys', slug: 'cat-toys', parent_id: 131, level: 2 },
  
  { name: 'Small Pets', slug: 'small-pets', parent_id: 125, level: 1 },
  { name: 'Birds', slug: 'birds', parent_id: 125, level: 1 },
  { name: 'Fish & Aquatics', slug: 'fish-aquatics', parent_id: 125, level: 1 },
  
  // FOOD & BEVERAGE DEPARTMENT
  { name: 'Food & Beverage', slug: 'food-beverage', parent_id: null, level: 0 },
  { name: 'Snacks', slug: 'snacks', parent_id: 137, level: 1 },
  { name: 'Beverages', slug: 'beverages', parent_id: 137, level: 1 },
  { name: 'Specialty Foods', slug: 'specialty-foods', parent_id: 137, level: 1 },
  
  // ARTS & CRAFTS DEPARTMENT
  { name: 'Arts & Crafts', slug: 'arts-crafts', parent_id: null, level: 0 },
  { name: 'Art Supplies', slug: 'art-supplies', parent_id: 141, level: 1 },
  { name: 'Craft Supplies', slug: 'craft-supplies', parent_id: 141, level: 1 },
  { name: 'DIY', slug: 'diy', parent_id: 141, level: 1 },
  
  // BOOKS & MEDIA DEPARTMENT
  { name: 'Books & Media', slug: 'books-media', parent_id: null, level: 0 },
  { name: 'Books', slug: 'books', parent_id: 145, level: 1 },
  { name: 'Music', slug: 'music', parent_id: 145, level: 1 },
  { name: 'Movies', slug: 'movies', parent_id: 145, level: 1 },
  
  // AUTOMOTIVE DEPARTMENT
  { name: 'Automotive', slug: 'automotive', parent_id: null, level: 0 },
  { name: 'Parts', slug: 'auto-parts', parent_id: 149, level: 1 },
  { name: 'Accessories', slug: 'auto-accessories', parent_id: 149, level: 1 },
  { name: 'Tools', slug: 'auto-tools', parent_id: 149, level: 1 },
  
  // BABY & MATERNITY DEPARTMENT
  { name: 'Baby & Maternity', slug: 'baby-maternity', parent_id: null, level: 0 },
  { name: 'Baby Clothing', slug: 'baby-clothing', parent_id: 153, level: 1 },
  { name: 'Baby Gear', slug: 'baby-gear', parent_id: 153, level: 1 },
  { name: 'Maternity', slug: 'maternity', parent_id: 153, level: 1 },
  
  // GIFTS & PARTY DEPARTMENT
  { name: 'Gifts & Party', slug: 'gifts-party', parent_id: null, level: 0 },
  { name: 'Gifts', slug: 'gifts', parent_id: 157, level: 1 },
  { name: 'Party Supplies', slug: 'party-supplies', parent_id: 157, level: 1 }
];

async function seedCategories() {
  const sql = postgres({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: 'require'
  });
  
  try {
    console.log('🗑️  Clearing existing categories...');
    await sql`DELETE FROM product_categories`;
    await sql`DELETE FROM categories`;
    
    console.log('📦 Seeding comprehensive category tree...');
    
    for (const cat of categoryData) {
      await sql`
        INSERT INTO categories (name, slug, parent_id, level) 
        VALUES (${cat.name}, ${cat.slug}, ${cat.parent_id}, ${cat.level})
      `;
    }
    
    console.log(`✅ Successfully seeded ${categoryData.length} categories`);
    
    const stats = await sql`
      SELECT 
        level,
        COUNT(*) as count
      FROM categories
      GROUP BY level
      ORDER BY level
    `;
    
    console.log('\n📊 Category breakdown by level:');
    stats.forEach(s => console.log(`   Level ${s.level}: ${s.count} categories`));
    
    await sql.end();
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    await sql.end();
    process.exit(1);
  }
}

seedCategories();
