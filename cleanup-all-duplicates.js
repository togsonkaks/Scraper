require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString, {
  ssl: process.env.PGHOST === 'localhost' ? false : 'require'
});

async function cleanupDuplicates() {
  console.log('🧹 Starting comprehensive duplicate cleanup...\n');
  
  // Find all duplicate categories (same name AND same parent_id)
  const duplicateGroups = await sql`
    SELECT name, parent_id, ARRAY_AGG(category_id ORDER BY llm_discovered DESC, created_at DESC) as ids
    FROM categories
    GROUP BY name, parent_id
    HAVING COUNT(*) > 1
    ORDER BY name, parent_id
  `;
  
  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicates found!');
    process.exit(0);
  }
  
  console.log(`Found ${duplicateGroups.length} categories with duplicates:\n`);
  
  let totalDeleted = 0;
  
  for (const group of duplicateGroups) {
    const ids = group.ids;
    const keepId = ids[0]; // First one has highest llm_discovered, then newest
    const deleteIds = ids.slice(1);
    
    // Get details of the one we're keeping
    const keeper = await sql`
      SELECT category_id, name, slug, parent_id, llm_discovered 
      FROM categories 
      WHERE category_id = ${keepId}
    `;
    
    console.log(`📦 "${group.name}" (parent: ${group.parent_id || 'NULL'}) - ${ids.length} duplicates`);
    console.log(`   ✅ Keeping ID ${keepId} (llm_discovered=${keeper[0].llm_discovered})`);
    console.log(`   🗑️  Deleting IDs: ${deleteIds.join(', ')}`);
    
    // Migrate product associations to the keeper
    for (const deleteId of deleteIds) {
      await sql`
        UPDATE product_categories 
        SET category_id = ${keepId}
        WHERE category_id = ${deleteId}
      `;
    }
    
    // Update any child categories that point to duplicates
    for (const deleteId of deleteIds) {
      await sql`
        UPDATE categories
        SET parent_id = ${keepId}
        WHERE parent_id = ${deleteId}
      `;
    }
    
    // Delete the duplicates
    await sql`
      DELETE FROM categories 
      WHERE category_id = ANY(${deleteIds})
    `;
    
    totalDeleted += deleteIds.length;
    console.log(`   ✅ Cleaned up ${deleteIds.length} duplicates\n`);
  }
  
  console.log(`\n🎉 Cleanup complete! Deleted ${totalDeleted} duplicate categories.`);
  
  // Verify no duplicates remain
  const remaining = await sql`
    SELECT name, COUNT(*) as count
    FROM categories
    GROUP BY name
    HAVING COUNT(*) > 1
  `;
  
  if (remaining.length === 0) {
    console.log('✅ Verified: No duplicates remain!');
  } else {
    console.log('⚠️  Warning: Some duplicates still exist:', remaining);
  }
  
  process.exit(0);
}

cleanupDuplicates().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
