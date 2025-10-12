require('dotenv').config();
const postgres = require('postgres');

const MASTER_TAG_TAXONOMY = {
  activities: [
    'training', 'jogging', 'walking', 'yoga', 'pilates',
    'cycling', 'biking', 'swimming', 'golf', 'tennis', 'basketball', 'soccer', 'climbing',
    'skiing', 'snowboarding', 'surfing', 'skateboarding', 'commute',
    'casual-wear', 'loungewear', 'sleepwear', 'outdoor', 'indoor', 'gardening',
    'crossfit', 'boxing', 'martial-arts', 'dance', 'athleisure'
  ],
  
  materials: [
    'cotton', 'organic-cotton', 'polyester', 'wool', 'merino-wool', 'cashmere', 'alpaca',
    'leather', 'genuine-leather', 'vegan-leather', 'suede', 'nubuck', 'mesh', 'canvas',
    'denim', 'chambray', 'silk', 'satin', 'linen', 'fleece', 'nylon', 'spandex', 'elastane',
    'lycra', 'rubber', 'eva-foam', 'memory-foam', 'latex', 'bamboo', 'tencel', 'modal',
    'rayon', 'acrylic', 'microfiber', 'neoprene', 'gore-tex', 'ripstop', 'corduroy',
    'flannel', 'jersey', 'terry-cloth', 'velvet', 'tweed', 'twill', 'poplin', 'oxford',
    'down', 'feather', 'synthetic-fill', 'recycled-polyester', 'recycled-nylon',
    'hemp', 'jute', 'cork', 'wood', 'metal', 'plastic', 'glass', 'ceramic', 'stone'
  ],
  
  colors: [
    'black', 'white', 'gray', 'grey', 'charcoal', 'slate', 'silver', 'beige', 'tan', 'khaki',
    'brown', 'caramel', 'chocolate', 'navy', 'blue', 'royal-blue', 'sky-blue', 'teal',
    'turquoise', 'aqua', 'green', 'olive', 'forest-green', 'sage', 'mint', 'lime',
    'yellow', 'gold', 'mustard', 'orange', 'rust', 'coral', 'peach', 'pink', 'blush',
    'rose', 'magenta', 'purple', 'lavender', 'plum', 'burgundy', 'wine', 'red', 'crimson',
    'maroon', 'multicolor', 'rainbow', 'camo', 'camouflage', 'neutral', 'earth-tones'
  ],
  
  styles: [
    'casual', 'formal', 'business', 'sporty', 'athletic', 'vintage', 'retro', 'modern',
    'contemporary', 'classic', 'timeless', 'minimalist', 'bohemian', 'boho', 'preppy',
    'streetwear', 'urban', 'edgy', 'punk', 'grunge', 'elegant', 'sophisticated', 'chic',
    'trendy', 'fashion-forward', 'avant-garde', 'artsy', 'rustic', 'western', 'cowboy',
    'nautical', 'military', 'utilitarian', 'workwear', 'heritage', 'americana', 'ivy-league',
    'scandinavian', 'japanese', 'korean', 'french', 'italian', 'british', 'luxe', 'luxury',
    'designer', 'high-end', 'premium', 'budget-friendly', 'affordable', 'eco-friendly',
    'sustainable', 'ethical', 'vegan', 'cruelty-free', 'handmade', 'artisan', 'custom'
  ],
  
  features: [
    'waterproof', 'water-resistant', 'breathable', 'moisture-wicking', 'quick-dry',
    'windproof', 'insulated', 'thermal', 'lightweight', 'packable', 'foldable',
    'reversible', 'convertible', 'adjustable', 'elastic', 'stretchy', 'flexible',
    'non-slip', 'anti-slip', 'grip', 'cushioned', 'padded', 'quilted', 'lined',
    'unlined', 'seamless', 'tagless', 'wrinkle-free', 'wrinkle-resistant', 'stain-resistant',
    'odor-resistant', 'anti-microbial', 'hypoallergenic', 'uv-protection', 'spf',
    'reflective', 'glow-in-the-dark', 'hidden-pocket', 'zip-pocket', 'snap-closure',
    'button-closure', 'velcro', 'magnetic', 'drawstring', 'tie-waist', 'belt-loops',
    'hooded', 'hood', 'collar', 'collared', 'collarless', 'crew-neck', 'v-neck',
    'scoop-neck', 'turtleneck', 'mock-neck', 'sleeveless', 'short-sleeve', 'long-sleeve',
    'roll-up-sleeve', 'cuffed', 'hemmed', 'raw-hem', 'distressed', 'ripped', 'torn',
    'faded', 'washed', 'pre-washed', 'stone-washed', 'acid-wash', 'tie-dye', 'printed',
    'embroidered', 'embellished', 'sequined', 'beaded'
  ],
  
  fit: [
    'slim-fit', 'skinny', 'tight', 'fitted', 'tailored', 'regular-fit', 'classic-fit',
    'relaxed-fit', 'loose', 'oversized', 'baggy', 'wide-leg', 'straight-leg', 'bootcut',
    'flare', 'tapered', 'cropped', 'ankle-length', 'full-length', 'petite', 'tall',
    'plus-size', 'maternity', 'true-to-size', 'runs-small', 'runs-large'
  ],
  
  occasions: [
    'everyday', 'daily', 'weekend', 'work', 'office', 'business-casual', 'meeting',
    'presentation', 'interview', 'date', 'date-night', 'night-out', 'party', 'cocktail',
    'formal-event', 'black-tie', 'wedding', 'bridal', 'bridesmaid', 'prom', 'homecoming',
    'graduation', 'holiday', 'vacation', 'travel', 'beach', 'pool', 'gym', 'workout',
    'running', 'hiking', 'camping', 'festival', 'concert'
  ]
};

function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-');
}

async function seedTagTaxonomy() {
  const sql = postgres({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: false
  });
  
  try {
    console.log('🗑️  Clearing existing tag taxonomy...');
    await sql`DELETE FROM tag_taxonomy`;
    
    console.log('📦 Seeding tag taxonomy...');
    
    const allTags = [];
    for (const [tagType, tags] of Object.entries(MASTER_TAG_TAXONOMY)) {
      for (const tag of tags) {
        allTags.push({ name: tag, slug: slugify(tag), tag_type: tagType });
      }
    }
    
    await sql`
      INSERT INTO tag_taxonomy ${sql(allTags, 'name', 'slug', 'tag_type')}
    `;
    
    console.log(`✅ Successfully seeded ${allTags.length} tags`);
    
    const stats = await sql`
      SELECT 
        tag_type,
        COUNT(*) as count
      FROM tag_taxonomy
      GROUP BY tag_type
      ORDER BY tag_type
    `;
    
    console.log('\n📊 Tag breakdown by type:');
    for (const row of stats) {
      console.log(`   ${row.tag_type}: ${row.count} tags`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sql.end();
  }
}

seedTagTaxonomy();
