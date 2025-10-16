require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString, {
  ssl: process.env.PGHOST === 'localhost' ? false : 'require'
});

async function cleanupDuplicates() {
  console.log('🔍 Checking for duplicate "Shoulder Bags" entries...\n');
  
  // Find all Shoulder Bags entries
  const shoulderBags = await sql`
    SELECT category_id, name, slug, parent_id, level, llm_discovered, created_at
    FROM categories 
    WHERE name = 'Shoulder Bags'
    ORDER BY llm_discovered DESC, created_at DESC
  `;
  
  console.log(`Found ${shoulderBags.length} entries:\n`);
  shoulderBags.forEach((cat, idx) => {
    console.log(`${idx + 1}. ID: ${cat.category_id}, Parent: ${cat.parent_id}, Level: ${cat.level}, LLM: ${cat.llm_discovered}, Created: ${cat.created_at}`);
  });
  
  if (shoulderBags.length <= 1) {
    console.log('\n✅ No duplicates found!');
    process.exit(0);
  }
  
  // Keep the first one (LLM-discovered if available, otherwise newest)
  const keepId = shoulderBags[0].category_id;
  const deleteIds = shoulderBags.slice(1).map(c => c.category_id);
  
  console.log(`\n📌 Keeping category ID: ${keepId} (llm_discovered=${shoulderBags[0].llm_discovered})`);
  console.log(`🗑️  Deleting category IDs: ${deleteIds.join(', ')}\n`);
  
  // Delete product associations for duplicate categories
  for (const id of deleteIds) {
    await sql`DELETE FROM product_categories WHERE category_id = ${id}`;
    console.log(`  ✅ Deleted product associations for category ${id}`);
  }
  
  // Delete duplicate categories
  await sql`DELETE FROM categories WHERE category_id = ANY(${deleteIds})`;
  console.log(`\n✅ Deleted ${deleteIds.length} duplicate categories`);
  
  // Verify cleanup
  const remaining = await sql`SELECT COUNT(*) FROM categories WHERE name = 'Shoulder Bags'`;
  console.log(`\n✅ Cleanup complete! Remaining "Shoulder Bags" entries: ${remaining[0].count}`);
  
  process.exit(0);
}

cleanupDuplicates().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
