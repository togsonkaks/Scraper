require('dotenv').config();
const postgres = require('postgres');

async function createTable() {
  const sql = postgres({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: 'require'
  });
  
  try {
    console.log('📋 Creating tag_taxonomy table...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS tag_taxonomy (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        tag_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    console.log('✅ tag_taxonomy table created successfully');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sql.end();
  }
}

createTable();
