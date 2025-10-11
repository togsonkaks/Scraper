const OpenAI = require('openai');
require('dotenv').config();
const postgres = require('postgres');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const sql = postgres(process.env.DATABASE_URL);

/**
 * Master Tag Taxonomy - Comprehensive reference for LLM keyword extraction
 * Organized by type for intelligent tag selection
 */
const MASTER_TAG_TAXONOMY = {
  // ACTIVITIES & USE CASES (50+)
  activities: [
    'workout', 'gym', 'training', 'running', 'jogging', 'hiking', 'walking', 'yoga', 'pilates',
    'cycling', 'biking', 'swimming', 'golf', 'tennis', 'basketball', 'soccer', 'climbing',
    'skiing', 'snowboarding', 'surfing', 'skateboarding', 'travel', 'commute', 'office',
    'casual-wear', 'everyday', 'loungewear', 'sleepwear', 'formal', 'business', 'party',
    'wedding', 'date-night', 'beach', 'poolside', 'outdoor', 'indoor', 'gardening',
    'crossfit', 'boxing', 'martial-arts', 'dance', 'athleisure', 'streetwear'
  ],
  
  // MATERIALS & FABRICS (60+)
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
  
  // COLORS & PATTERNS (50+)
  colors: [
    'black', 'white', 'gray', 'grey', 'charcoal', 'slate', 'silver', 'beige', 'tan', 'khaki',
    'brown', 'chocolate', 'camel', 'navy', 'blue', 'royal-blue', 'sky-blue', 'teal', 'turquoise',
    'red', 'burgundy', 'maroon', 'crimson', 'pink', 'rose', 'blush', 'coral', 'orange',
    'rust', 'peach', 'yellow', 'gold', 'mustard', 'green', 'olive', 'forest-green', 'sage',
    'mint', 'emerald', 'purple', 'lavender', 'plum', 'violet', 'cream', 'ivory', 'ecru',
    'striped', 'plaid', 'checkered', 'gingham', 'solid', 'floral', 'geometric', 'abstract',
    'camo', 'camouflage', 'tie-dye', 'ombre', 'gradient', 'colorblock', 'multi-color'
  ],
  
  // STYLES & AESTHETICS (60+)
  styles: [
    'casual', 'athletic', 'sporty', 'minimalist', 'modern', 'contemporary', 'classic',
    'traditional', 'vintage', 'retro', 'bohemian', 'boho', 'preppy', 'streetwear',
    'urban', 'edgy', 'grunge', 'punk', 'elegant', 'sophisticated', 'chic', 'luxe',
    'rustic', 'farmhouse', 'industrial', 'scandinavian', 'mid-century', 'coastal',
    'nautical', 'tropical', 'western', 'southwestern', 'eastern', 'zen', 'minimalistic',
    'maximalist', 'eclectic', 'artisan', 'handcrafted', 'designer', 'premium', 'budget',
    'performance', 'technical', 'tactical', 'outdoor', 'adventure', 'expedition',
    'professional', 'smart-casual', 'business-casual', 'dressy', 'feminine', 'masculine',
    'unisex', 'androgynous', 'oversized', 'fitted', 'tailored', 'relaxed', 'slim'
  ],
  
  // FEATURES & ATTRIBUTES (70+)
  features: [
    'waterproof', 'water-resistant', 'weatherproof', 'breathable', 'moisture-wicking',
    'quick-dry', 'insulated', 'thermal', 'windproof', 'lightweight', 'heavy-duty',
    'durable', 'sturdy', 'flexible', 'stretchy', 'elastic', 'cushioned', 'padded',
    'supportive', 'arch-support', 'shock-absorbing', 'anti-slip', 'non-slip', 'grip',
    'traction', 'eco-friendly', 'sustainable', 'recycled', 'organic', 'natural',
    'biodegradable', 'vegan', 'cruelty-free', 'hypoallergenic', 'antimicrobial',
    'odor-resistant', 'stain-resistant', 'wrinkle-free', 'easy-care', 'machine-washable',
    'adjustable', 'convertible', 'reversible', 'foldable', 'collapsible', 'portable',
    'compact', 'stackable', 'modular', 'extendable', 'wireless', 'bluetooth', 'usb',
    'rechargeable', 'battery-powered', 'solar', 'smart', 'connected', 'app-controlled',
    'touchscreen', 'voice-activated', 'energy-efficient', 'high-performance', 'premium',
    'handmade', 'artisan', 'limited-edition', 'exclusive', 'imported', 'made-in-usa'
  ],
  
  // FIT & SIZING (20+)
  fit: [
    'slim-fit', 'skinny-fit', 'regular-fit', 'relaxed-fit', 'loose-fit', 'oversized',
    'plus-size', 'petite', 'tall', 'maternity', 'big-and-tall', 'athletic-fit',
    'tailored-fit', 'comfort-fit', 'true-to-size', 'runs-small', 'runs-large',
    'adjustable-fit', 'custom-fit', 'one-size-fits-all'
  ],
  
  // OCCASIONS (25+)
  occasions: [
    'work', 'office', 'business', 'meeting', 'presentation', 'interview', 'wedding',
    'party', 'cocktail', 'formal-event', 'date-night', 'dinner', 'brunch', 'vacation',
    'travel', 'holiday', 'festival', 'concert', 'sport-event', 'everyday', 'weekend',
    'special-occasion', 'gift', 'housewarming', 'baby-shower'
  ]
};

/**
 * Load existing categories from database and build hierarchical paths
 * @returns {Promise<string[]>} Array of category paths like ["Men > Fashion > Footwear", ...]
 */
async function loadExistingCategoryPaths() {
  try {
    const categories = await sql`
      SELECT category_id, name, slug, parent_id, level
      FROM categories
      ORDER BY level ASC, name ASC
    `;
    
    if (categories.length === 0) {
      return [];
    }
    
    // Build parent-child map
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.category_id, cat);
    });
    
    // Build full paths for each category
    const paths = [];
    categories.forEach(cat => {
      const path = [];
      let current = cat;
      
      // Walk up the tree to build full path
      while (current) {
        path.unshift(current.name);
        current = current.parent_id ? categoryMap.get(current.parent_id) : null;
      }
      
      if (path.length > 0) {
        paths.push(path.join(' > '));
      }
    });
    
    // Remove duplicates and sort
    return [...new Set(paths)].sort();
  } catch (error) {
    console.error('Error loading categories:', error);
    return [];
  }
}

/**
 * Extract hierarchical categories and 5-6 high-quality keywords from product data using LLM
 * @param {Object} productData - The scraped product data
 * @param {string} productData.title - Product title
 * @param {string} productData.description - Product description
 * @param {string} productData.specs - Product specifications
 * @param {Array<string>} productData.breadcrumbs - Breadcrumb array
 * @param {string} productData.brand - Product brand
 * @param {Object} productData.jsonLd - JSON-LD structured data (prioritized source)
 * @returns {Promise<Object>} { categories: string[], keywords: string[], confidence: number }
 */
async function extractTagsWithLLM(productData) {
  const { title, description, specs, breadcrumbs, brand, jsonLd } = productData;
  
  // Load existing category structure from database
  const existingPaths = await loadExistingCategoryPaths();

  // Format JSON-LD data for better readability in prompt
  let jsonLdInfo = 'N/A';
  if (jsonLd && typeof jsonLd === 'object') {
    const relevantFields = {};
    const priorityKeys = ['name', 'category', 'gender', 'color', 'material', 'brand', 'sku', 'productID', 'model', 'style', 'audience'];
    for (const key of priorityKeys) {
      if (jsonLd[key]) {
        relevantFields[key] = jsonLd[key];
      }
    }
    if (Object.keys(relevantFields).length > 0) {
      jsonLdInfo = JSON.stringify(relevantFields, null, 2);
    }
  }

  // Format existing category paths for LLM
  const categoryContext = existingPaths.length > 0 
    ? `\n📂 EXISTING CATEGORY TAXONOMY (${existingPaths.length} paths):\n${existingPaths.map(p => `   - ${p}`).join('\n')}`
    : '\n📂 EXISTING CATEGORY TAXONOMY: None (you can create new paths)';

  // Format master tag taxonomy for LLM
  const tagTaxonomy = `
🏷️ MASTER TAG REFERENCE (350+ tags organized by type):

ACTIVITIES/USE-CASES: ${MASTER_TAG_TAXONOMY.activities.join(', ')}

MATERIALS: ${MASTER_TAG_TAXONOMY.materials.join(', ')}

COLORS/PATTERNS: ${MASTER_TAG_TAXONOMY.colors.join(', ')}

STYLES: ${MASTER_TAG_TAXONOMY.styles.join(', ')}

FEATURES: ${MASTER_TAG_TAXONOMY.features.join(', ')}

FIT/SIZING: ${MASTER_TAG_TAXONOMY.fit.join(', ')}

OCCASIONS: ${MASTER_TAG_TAXONOMY.occasions.join(', ')}`;

  const prompt = `Analyze this e-commerce product and extract:
1. HIERARCHICAL CATEGORIES - Full category path from general to specific
2. 6-8 HIGH-QUALITY KEYWORDS/TAGS - Brand, product line, and descriptive attributes

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- JSON-LD Structured Data (⭐ PRIORITIZE THIS): ${jsonLdInfo}
- Breadcrumbs: ${Array.isArray(breadcrumbs) ? breadcrumbs.join(' > ') : (breadcrumbs || 'N/A')}
- Description: ${description?.substring(0, 800) || 'N/A'}
- Specs: ${specs?.substring(0, 400) || 'N/A'}
${categoryContext}
${tagTaxonomy}

CATEGORY EXTRACTION RULES (STRICT TAXONOMY MATCHING):
1. **PRIORITY 1**: Match product to EXISTING category paths above
   - Look for the closest matching path in the existing taxonomy
   - Use the EXACT path format (e.g., "Men > Fashion > Footwear > Shoes > Sneakers")
   - Match as deeply as possible (prefer full path over partial)

2. **PRIORITY 2**: If NO good match exists (>70% certainty), suggest a NEW path
   - Follow hierarchy: Gender/Age → Department → Category → Subcategory
   - Example NEW path: ["Unisex", "Accessories", "Tech", "Phone Cases"]
   - Mark confidence lower (0.6-0.7) when suggesting new paths

3. Extract from JSON-LD first, then breadcrumbs, then title/description

4. Return as array: ["Men", "Fashion", "Footwear", "Shoes", "Sneakers"]

KEYWORD/TAG EXTRACTION RULES (USE MASTER TAG REFERENCE):
1. MUST include (if available):
   - Brand name (e.g., "Allbirds")
   - Product line/model (e.g., "Tree-Glider")

2. Add 4-6 DESCRIPTIVE TAGS from the Master Tag Reference above:
   - Extract from DESCRIPTION and JSON-LD fields
   - Activities/use-cases: "workout", "running", "casual-wear" (check description for activity keywords!)
   - Materials: "merino-wool", "mesh", "leather", "recycled"
   - Colors/patterns: "black", "natural", "solid"
   - Styles: "athletic", "minimalist", "casual"
   - Features: "lightweight", "breathable", "eco-friendly"
   - Occasions: "everyday", "gym", "travel"

3. IMPORTANT: 
   - Style/activity words like "casual", "running", "workout", "athletic" are TAGS, not categories
   - ❌ WRONG: Category = "Men > Footwear > Casual Shoes"
   - ✅ RIGHT: Category = "Men > Fashion > Footwear > Shoes > Sneakers", Tags = ["casual", "workout", "athletic"]

4. Skip generic words (shoes, product, item) and words already in category path
5. Extract 6-8 keywords total (brand + model + 4-6 descriptive tags)

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4", "Level5"],
  "keywords": ["brand", "product-model", "activity-tag", "material", "color", "style", "feature", "occasion"],
  "confidence": 0.85,
  "reasoning": "Brief explanation - mention if existing path matched or new path suggested, and which tags came from description",
  "isNewPath": false
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      categories: result.categories || [],
      keywords: result.keywords || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || '',
      isNewPath: result.isNewPath || false
    };
  } catch (error) {
    console.error('LLM tagging error:', error);
    throw new Error(`LLM tagging failed: ${error.message}`);
  }
}

/**
 * Retry LLM tagging with user feedback
 * @param {Object} productData - Original product data
 * @param {string} feedback - User's feedback about what was wrong
 * @returns {Promise<Object>} New suggestions
 */
async function retryWithFeedback(productData, feedback) {
  const { title, description, specs, breadcrumbs, brand, jsonLd } = productData;
  
  // Load existing category structure from database
  const existingPaths = await loadExistingCategoryPaths();

  // Format JSON-LD data for better readability in prompt
  let jsonLdInfo = 'N/A';
  if (jsonLd && typeof jsonLd === 'object') {
    const relevantFields = {};
    const priorityKeys = ['name', 'category', 'gender', 'color', 'material', 'brand', 'sku', 'productID', 'model', 'style', 'audience'];
    for (const key of priorityKeys) {
      if (jsonLd[key]) {
        relevantFields[key] = jsonLd[key];
      }
    }
    if (Object.keys(relevantFields).length > 0) {
      jsonLdInfo = JSON.stringify(relevantFields, null, 2);
    }
  }

  // Format existing category paths for LLM
  const categoryContext = existingPaths.length > 0 
    ? `\n📂 EXISTING CATEGORY TAXONOMY (${existingPaths.length} paths):\n${existingPaths.map(p => `   - ${p}`).join('\n')}`
    : '\n📂 EXISTING CATEGORY TAXONOMY: None (you can create new paths)';

  // Format master tag taxonomy for LLM
  const tagTaxonomy = `
🏷️ MASTER TAG REFERENCE (350+ tags organized by type):

ACTIVITIES/USE-CASES: ${MASTER_TAG_TAXONOMY.activities.join(', ')}

MATERIALS: ${MASTER_TAG_TAXONOMY.materials.join(', ')}

COLORS/PATTERNS: ${MASTER_TAG_TAXONOMY.colors.join(', ')}

STYLES: ${MASTER_TAG_TAXONOMY.styles.join(', ')}

FEATURES: ${MASTER_TAG_TAXONOMY.features.join(', ')}

FIT/SIZING: ${MASTER_TAG_TAXONOMY.fit.join(', ')}

OCCASIONS: ${MASTER_TAG_TAXONOMY.occasions.join(', ')}`;

  const prompt = `The previous tagging attempt was rejected with this feedback: "${feedback}"

Please re-analyze this product and provide better suggestions.

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- JSON-LD Structured Data (⭐ PRIORITIZE THIS): ${jsonLdInfo}
- Breadcrumbs: ${Array.isArray(breadcrumbs) ? breadcrumbs.join(' > ') : (breadcrumbs || 'N/A')}
- Description: ${description?.substring(0, 800) || 'N/A'}
- Specs: ${specs?.substring(0, 400) || 'N/A'}
${categoryContext}
${tagTaxonomy}

IMPORTANT RULES:
1. **MATCH EXISTING CATEGORY PATHS** from the taxonomy above - don't invent new ones unless no match exists
2. Style/activity words like "casual", "running", "workout", "athletic" are TAGS, not categories
3. Use the Master Tag Reference above to extract 6-8 descriptive tags
4. Check DESCRIPTION for activity keywords (workout, running, etc.)
5. Consider the user's feedback when making corrections
6. Prioritize JSON-LD structured data if available

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4", "Level5"],
  "keywords": ["brand", "product-model", "activity-tag", "material", "color", "style", "feature", "occasion"],
  "confidence": 0.85,
  "reasoning": "How this addresses the feedback and matches existing taxonomy",
  "isNewPath": false
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      categories: result.categories || [],
      keywords: result.keywords || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || '',
      isNewPath: result.isNewPath || false
    };
  } catch (error) {
    console.error('LLM retry error:', error);
    throw new Error(`LLM retry failed: ${error.message}`);
  }
}

module.exports = {
  extractTagsWithLLM,
  retryWithFeedback
};
