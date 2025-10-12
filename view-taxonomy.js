require('dotenv').config();
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL, { 
  ssl: 'require',
  max: 1
});

async function viewTaxonomy() {
  try {
    console.log('\n📂 CATEGORY HIERARCHY\n');
    console.log('='.repeat(80));
    
    // Get all categories
    const categories = await sql`
      SELECT category_id, name, parent_id, level
      FROM categories
      ORDER BY level, name
    `;
    
    // Build hierarchy map
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.category_id, cat);
    });
    
    // Function to build full path
    function buildPath(catId) {
      const parts = [];
      let current = categoryMap.get(catId);
      
      while (current) {
        parts.unshift(current.name);
        current = current.parent_id ? categoryMap.get(current.parent_id) : null;
      }
      
      return parts.join(' > ');
    }
    
    // Display categories by level
    const byLevel = {};
    categories.forEach(cat => {
      if (!byLevel[cat.level]) byLevel[cat.level] = [];
      byLevel[cat.level].push(cat);
    });
    
    Object.keys(byLevel).sort().forEach(level => {
      console.log(`\n📍 LEVEL ${level}:\n`);
      byLevel[level].forEach(cat => {
        const indent = '  '.repeat(parseInt(level));
        const path = buildPath(cat.category_id);
        console.log(`${indent}${cat.name}`);
        if (level > 0) {
          console.log(`${indent}  └─ Full Path: ${path}`);
        }
      });
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Total Categories: ${categories.length}\n`);
    
    // Get tags by type
    console.log('\n🏷️  TAGS BY TYPE\n');
    console.log('='.repeat(80));
    
    const tags = await sql`
      SELECT name, tag_type
      FROM tag_taxonomy
      ORDER BY tag_type, name
    `;
    
    const byType = {};
    tags.forEach(tag => {
      if (!byType[tag.tag_type]) byType[tag.tag_type] = [];
      byType[tag.tag_type].push(tag.name);
    });
    
    Object.keys(byType).sort().forEach(type => {
      console.log(`\n📌 ${type.toUpperCase()} (${byType[type].length} tags):`);
      console.log(`   ${byType[type].join(', ')}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Total Tags: ${tags.length}\n`);
    
    // Summary stats
    console.log('\n📊 SUMMARY\n');
    console.log('='.repeat(80));
    console.log(`Total Categories: ${categories.length}`);
    console.log(`Total Tags: ${tags.length}`);
    console.log(`Tag Types: ${Object.keys(byType).length}`);
    console.log(`Hierarchy Depth: ${Math.max(...categories.map(c => c.level)) + 1} levels`);
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

viewTaxonomy();
