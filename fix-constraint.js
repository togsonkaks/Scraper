require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=require`;
const sql = postgres(connectionString);

async function fixConstraint() {
  try {
    console.log('🔧 Dropping old unique constraint on slug...');
    await sql`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_unique`;
    
    console.log('✅ Adding new composite unique constraint (parent_id, slug)...');
    await sql`ALTER TABLE categories ADD CONSTRAINT categories_parent_slug_unique UNIQUE (parent_id, slug)`;
    
    console.log('✅ Schema updated successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await sql.end();
    process.exit(1);
  }
}

fixConstraint();
