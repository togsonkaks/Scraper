require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString, {
  ssl: process.env.PGHOST === 'localhost' ? false : 'require'
});

async function checkSchema() {
  console.log('🔍 Checking categories table schema...\n');
  
  const columns = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'categories'
    ORDER BY ordinal_position
  `;
  
  console.log('Categories table columns:');
  columns.forEach(col => {
    console.log(`  - ${col.column_name} (${col.data_type}) ${col.column_default ? `[default: ${col.column_default}]` : ''}`);
  });
  
  // Check for duplicates without llm_discovered column
  const shoulderBags = await sql`
    SELECT category_id, name, slug, parent_id, level, created_at
    FROM categories 
    WHERE name = 'Shoulder Bags'
    ORDER BY created_at DESC
  `;
  
  console.log(`\n📦 Found ${shoulderBags.length} "Shoulder Bags" entries:`);
  shoulderBags.forEach((cat, idx) => {
    console.log(`  ${idx + 1}. ID: ${cat.category_id}, Parent: ${cat.parent_id}, Level: ${cat.level}, Created: ${cat.created_at}`);
  });
  
  process.exit(0);
}

checkSchema().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
