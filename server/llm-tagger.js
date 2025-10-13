const OpenAI = require('openai');
require('dotenv').config();
const postgres = require('postgres');
const { initializeTaxonomy } = require('../scrapers/auto-tagger');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString);

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
 * Load existing tags from database organized by type
 * @returns {Promise<Object>} Tag taxonomy organized by type
 */
async function loadExistingTags() {
  try {
    const tags = await sql`
      SELECT name, tag_type
      FROM tag_taxonomy
      ORDER BY tag_type, name
    `;
    
    const taxonomy = {};
    tags.forEach(tag => {
      if (!taxonomy[tag.tag_type]) {
        taxonomy[tag.tag_type] = [];
      }
      taxonomy[tag.tag_type].push(tag.name);
    });
    
    return taxonomy;
  } catch (error) {
    console.error('Error loading tags:', error);
    return {};
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
  
  // Load existing category structure and tags from database
  const existingPaths = await loadExistingCategoryPaths();
  const existingTags = await loadExistingTags();

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

  // Format tag taxonomy from database for LLM
  const tagTaxonomyLines = Object.entries(existingTags)
    .map(([type, tags]) => `${type.toUpperCase()}: ${tags.join(', ')}`)
    .join('\n\n');
  
  const tagTaxonomy = existingTags && Object.keys(existingTags).length > 0
    ? `🏷️ EXISTING TAG TAXONOMY (${Object.values(existingTags).flat().length} tags organized by type):\n\n${tagTaxonomyLines}`
    : '🏷️ EXISTING TAG TAXONOMY: None (you can suggest new tags)';

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
   - Find an EXACT path match from the taxonomy (e.g., "Fashion > Men > Clothing > Bottoms > Jeans")
   - Use the COMPLETE path including ALL parent levels (Department > Gender > Section > Category > Type)
   - DO NOT reorder or modify the path - use it exactly as shown
   - If you find "Fashion > Men > Clothing > Bottoms > Jeans", return ["Fashion", "Men", "Clothing", "Bottoms", "Jeans"]
   - ONLY mark isNewPath=false if the EXACT path exists in the order shown

2. **PRIORITY 2**: If NO exact match exists, suggest a NEW path
   - Follow hierarchy: Department → Gender/Age → Category → Subcategory
   - Include ALL parent levels, don't skip any
   - Example: ["Fashion", "Women", "Clothing", "Tops", "Blouses"]
   - Mark isNewPath=true and confidence lower (0.6-0.7)

3. **CRITICAL RULES**:
   - Categories END at product type (Jeans, Shoes, Drill, Saw)
   - Fit/style terms (tapered, slim-fit, casual, athletic) are TAGS, NEVER categories
   - ❌ WRONG: ["Men", "Bottoms", "Jeans", "Tapered"] - "Tapered" is a fit term
   - ✅ RIGHT: ["Fashion", "Men", "Clothing", "Bottoms", "Jeans"] + tag: {name: "tapered", type: "fit"}

4. Extract from JSON-LD first, then breadcrumbs, then title/description

5. Return as array in hierarchical order: ["Level1", "Level2", "Level3", "Level4", "Level5"]

BRAND EXTRACTION:
1. Extract the brand name and put it in the "brand" field (e.g., "GUESS", "Nike", "Adidas")
2. DO NOT include brand as a tag - it goes in the brand field only

TAG EXTRACTION RULES (USE EXISTING TAG TAXONOMY):
1. Extract 5-8 DESCRIPTIVE TAGS with their TYPE classification:
   - Match to EXISTING tags from the taxonomy above when possible
   - If tag exists, use it exactly as shown
   - If NEW tag (not in taxonomy), identify its type from available types: activities, materials, colors, styles, features, fit, occasions, tool-types, automotive, kitchen, beauty
   
2. **READ THE DESCRIPTION CAREFULLY** - Extract ALL relevant attributes:
   - Colors/patterns: Look for color words like "indigo", "black", "navy", "striped", "solid"
   - Materials: "cotton", "denim", "leather", "stretch", "recycled"
   - Fit: "slim-fit", "relaxed-fit", "tapered", "loose", "athletic-fit"
   - Styles: "athletic", "minimalist", "casual", "modern"
   - Features: "lightweight", "breathable", "stretchy", "eco-friendly", "moisture-wicking"
   - Activities/use-cases: "workout", "running", "casual-wear", "everyday"
   - Occasions: "everyday", "gym", "travel", "work"

3. **EXAMPLE from "Indigo denim wash. Tapered leg. Slim fit."**:
   - ✅ Extract: "indigo" (color), "denim" (material), "tapered" (fit), "slim-fit" (fit)
   - ❌ Don't skip color words! "Indigo" is a valid color tag

4. IMPORTANT: 
   - Fit/style terms (tapered, slim-fit, casual, athletic) are TAGS, NEVER categories
   - Skip generic words (product, item) and words already in category path (don't tag "jeans" if category is "Jeans")
   - Include the brand in the "brand" field, NOT as a tag

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4", "Level5"],
  "brand": "BRAND_NAME",
  "tags": [
    {"name": "slim-fit", "type": "fit", "isNew": false},
    {"name": "indigo", "type": "colors", "isNew": true},
    {"name": "casual", "type": "styles", "isNew": false}
  ],
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
    
    // VERIFY if path actually exists (don't trust LLM)
    const suggestedPath = (result.categories || []).join(' > ');
    const actuallyExists = existingPaths.some(path => path === suggestedPath);
    
    // Valid tag types (semantic categories)
    const VALID_TAG_TYPES = ['materials', 'colors', 'fit', 'styles', 'features', 'activities', 'occasions', 'tool-types', 'automotive', 'kitchen', 'beauty'];
    
    // Smart tag type classifier based on tag name
    const classifyTagType = (tagName) => {
      const name = tagName.toLowerCase();
      
      // Material patterns
      if (name.includes('leather') || name.includes('suede') || name.includes('cotton') || 
          name.includes('wool') || name.includes('silk') || name.includes('denim') ||
          name.includes('nylon') || name.includes('polyester') || name.includes('canvas') ||
          name.includes('mesh') || name.includes('fleece') || name.includes('cashmere')) {
        return 'materials';
      }
      
      // Color patterns
      if (name.includes('black') || name.includes('white') || name.includes('blue') || 
          name.includes('red') || name.includes('green') || name.includes('brown') ||
          name.includes('navy') || name.includes('indigo') || name.includes('gray') ||
          name.includes('beige') || name.includes('tan')) {
        return 'colors';
      }
      
      // Fit patterns
      if (name.includes('fit') || name.includes('tapered') || name.includes('relaxed') ||
          name.includes('slim') || name.includes('loose') || name.includes('tight')) {
        return 'fit';
      }
      
      // Style patterns
      if (name.includes('casual') || name.includes('formal') || name.includes('athletic') ||
          name.includes('vintage') || name.includes('modern') || name.includes('minimalist')) {
        return 'styles';
      }
      
      // Default to features
      return 'features';
    };
    
    // Process tags and learn new ones
    const processedTags = [];
    const newTagsToLearn = [];
    
    if (result.tags && Array.isArray(result.tags)) {
      for (const tag of result.tags) {
        if (typeof tag === 'object' && tag.name) {
          // Validate and fix tag type
          let tagType = tag.type || 'features';
          
          // If LLM returned invalid type, intelligently classify it
          if (!VALID_TAG_TYPES.includes(tagType)) {
            console.log(`⚠️ Invalid tag type "${tagType}" for "${tag.name}", auto-classifying...`);
            tagType = classifyTagType(tag.name);
          }
          
          // Check if tag exists in database (search across all types)
          let existsInDb = false;
          for (const type of VALID_TAG_TYPES) {
            if (existingTags[type]?.some(t => t.toLowerCase() === tag.name.toLowerCase())) {
              existsInDb = true;
              tagType = type; // Use the existing type from database
              break;
            }
          }
          
          processedTags.push({
            name: tag.name,
            slug: tag.name.toLowerCase().replace(/\s+/g, '-'),
            type: tagType
          });
          
          // If tag is truly new (not in our database), mark it for learning
          if (!existsInDb) {
            newTagsToLearn.push({
              name: tag.name,
              slug: tag.name.toLowerCase().replace(/\s+/g, '-'),
              type: tagType,
              llm_discovered: 1
            });
          }
        }
      }
    }
    
    // Auto-learn new tags by adding them to tag_taxonomy
    if (newTagsToLearn.length > 0) {
      try {
        for (const newTag of newTagsToLearn) {
          await sql`
            INSERT INTO tag_taxonomy (name, slug, tag_type, llm_discovered)
            VALUES (${newTag.name}, ${newTag.slug}, ${newTag.type}, ${newTag.llm_discovered})
            ON CONFLICT (slug) DO NOTHING
          `;
        }
        console.log(`✨ Learned ${newTagsToLearn.length} new tags: ${newTagsToLearn.map(t => t.name).join(', ')}`);
        
        // Append new tags to seed file for future reseeding
        await appendToSeedFile(newTagsToLearn);
        
        // Refresh auto-tagger taxonomy so new tags are immediately available
        await initializeTaxonomy(true);  // Force refresh
        console.log('🔄 Auto-tagger taxonomy refreshed with new tags');
      } catch (error) {
        console.error('Error learning new tags:', error);
      }
    }
    
    return {
      categories: result.categories || [],
      tags: processedTags,
      keywords: processedTags.map(t => t.name), // For backward compatibility
      brand: result.brand || productData.brand || null,
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || '',
      isNewPath: !actuallyExists,  // Override LLM - use actual database check
      learnedTags: newTagsToLearn.length
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
  
  // Load existing category structure and tags from database
  const existingPaths = await loadExistingCategoryPaths();
  const existingTags = await loadExistingTags();

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

  // Format tag taxonomy from database for LLM
  const tagTaxonomyLines = Object.entries(existingTags)
    .map(([type, tags]) => `${type.toUpperCase()}: ${tags.join(', ')}`)
    .join('\n\n');
  
  const tagTaxonomy = existingTags && Object.keys(existingTags).length > 0
    ? `🏷️ EXISTING TAG TAXONOMY (${Object.values(existingTags).flat().length} tags organized by type):\n\n${tagTaxonomyLines}`
    : '🏷️ EXISTING TAG TAXONOMY: None (you can suggest new tags)';

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
1. **MATCH EXISTING CATEGORY PATHS** from the taxonomy above in EXACT order
   - Find COMPLETE path like "Fashion > Men > Clothing > Bottoms > Jeans" and return ["Fashion", "Men", "Clothing", "Bottoms", "Jeans"]
   - Include ALL parent levels - don't skip any (Department > Gender > Section > Category > Type)
   - DO NOT reorder or modify - use the exact hierarchy shown
   - ONLY mark isNewPath=false if EXACT path exists
2. **Categories END at product type** (Jeans, Shoes, Drill, etc.)
   - Fit/style terms (tapered, slim-fit, casual, athletic) are TAGS, NEVER categories
   - ❌ WRONG: ["Men", "Bottoms", "Jeans", "Tapered"]
   - ✅ RIGHT: ["Fashion", "Men", "Clothing", "Bottoms", "Jeans"] + tag: {name: "tapered", type: "fit"}
3. Extract the brand name and put it in the "brand" field - DO NOT include as tag
4. **READ DESCRIPTION for ALL attributes**: colors (indigo, navy), materials (denim), fit (tapered, slim-fit), styles (casual)
5. Return tags with their type classification (match to existing taxonomy types)
6. Consider the user's feedback when making corrections
7. Prioritize JSON-LD structured data if available

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4", "Level5"],
  "brand": "BRAND_NAME",
  "tags": [
    {"name": "slim-fit", "type": "fit", "isNew": false},
    {"name": "indigo", "type": "colors", "isNew": true}
  ],
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
    
    // VERIFY if path actually exists (don't trust LLM)
    const suggestedPath = (result.categories || []).join(' > ');
    const actuallyExists = existingPaths.some(path => path === suggestedPath);
    
    // Valid tag types (same as extractTagsWithLLM)
    const VALID_TAG_TYPES = ['materials', 'colors', 'fit', 'styles', 'features', 'activities', 'occasions', 'tool-types', 'automotive', 'kitchen', 'beauty'];
    
    // Smart tag type classifier (same as extractTagsWithLLM)
    const classifyTagType = (tagName) => {
      const name = tagName.toLowerCase();
      if (name.includes('leather') || name.includes('suede') || name.includes('cotton') || 
          name.includes('wool') || name.includes('silk') || name.includes('denim') ||
          name.includes('nylon') || name.includes('polyester') || name.includes('canvas') ||
          name.includes('mesh') || name.includes('fleece') || name.includes('cashmere')) {
        return 'materials';
      }
      if (name.includes('black') || name.includes('white') || name.includes('blue') || 
          name.includes('red') || name.includes('green') || name.includes('brown') ||
          name.includes('navy') || name.includes('indigo') || name.includes('gray') ||
          name.includes('beige') || name.includes('tan')) {
        return 'colors';
      }
      if (name.includes('fit') || name.includes('tapered') || name.includes('relaxed') ||
          name.includes('slim') || name.includes('loose') || name.includes('tight')) {
        return 'fit';
      }
      if (name.includes('casual') || name.includes('formal') || name.includes('athletic') ||
          name.includes('vintage') || name.includes('modern') || name.includes('minimalist')) {
        return 'styles';
      }
      return 'features';
    };
    
    // Process tags and learn new ones (same logic as extractTagsWithLLM with validation)
    const processedTags = [];
    const newTagsToLearn = [];
    
    if (result.tags && Array.isArray(result.tags)) {
      for (const tag of result.tags) {
        if (typeof tag === 'object' && tag.name) {
          // Validate and fix tag type
          let tagType = tag.type || 'features';
          
          // If LLM returned invalid type, intelligently classify it
          if (!VALID_TAG_TYPES.includes(tagType)) {
            console.log(`⚠️ Invalid tag type "${tagType}" for "${tag.name}", auto-classifying...`);
            tagType = classifyTagType(tag.name);
          }
          
          // Check if tag exists in database (search across all types)
          let existsInDb = false;
          for (const type of VALID_TAG_TYPES) {
            if (existingTags[type]?.some(t => t.toLowerCase() === tag.name.toLowerCase())) {
              existsInDb = true;
              tagType = type; // Use the existing type from database
              break;
            }
          }
          
          processedTags.push({
            name: tag.name,
            slug: tag.name.toLowerCase().replace(/\s+/g, '-'),
            type: tagType
          });
          
          if (!existsInDb) {
            newTagsToLearn.push({
              name: tag.name,
              slug: tag.name.toLowerCase().replace(/\s+/g, '-'),
              type: tagType,
              llm_discovered: 1
            });
          }
        }
      }
    }
    
    // Auto-learn new tags
    if (newTagsToLearn.length > 0) {
      try {
        for (const newTag of newTagsToLearn) {
          await sql`
            INSERT INTO tag_taxonomy (name, slug, tag_type, llm_discovered)
            VALUES (${newTag.name}, ${newTag.slug}, ${newTag.type}, ${newTag.llm_discovered})
            ON CONFLICT (slug) DO NOTHING
          `;
        }
        console.log(`✨ Learned ${newTagsToLearn.length} new tags from retry: ${newTagsToLearn.map(t => t.name).join(', ')}`);
        
        // Append new tags to seed file for future reseeding
        await appendToSeedFile(newTagsToLearn);
        
        // Refresh auto-tagger taxonomy so new tags are immediately available
        await initializeTaxonomy(true);  // Force refresh
        console.log('🔄 Auto-tagger taxonomy refreshed with new tags');
      } catch (error) {
        console.error('Error learning new tags:', error);
      }
    }
    
    return {
      categories: result.categories || [],
      tags: processedTags,
      keywords: processedTags.map(t => t.name),
      brand: result.brand || productData.brand || null,
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || '',
      isNewPath: !actuallyExists,
      learnedTags: newTagsToLearn.length
    };
  } catch (error) {
    console.error('LLM retry error:', error);
    throw new Error(`LLM retry failed: ${error.message}`);
  }
}

/**
 * Append new tags to seed-tags-comprehensive.js
 * @param {Array} newTags - Array of {name, slug, type} objects
 */
async function appendToSeedFile(newTags) {
  if (!newTags || newTags.length === 0) return;
  
  const seedFilePath = path.join(__dirname, '../scripts/seed-tags-comprehensive.js');
  
  try {
    let fileContent = fs.readFileSync(seedFilePath, 'utf8');
    
    // Group tags by type
    const tagsByType = {};
    for (const tag of newTags) {
      if (!tagsByType[tag.type]) {
        tagsByType[tag.type] = [];
      }
      tagsByType[tag.type].push(tag.slug);
    }
    
    // For each tag type, append to the appropriate array
    for (const [tagType, tags] of Object.entries(tagsByType)) {
      // Find the array for this tag type using regex
      // Pattern: tagType: [ ... existing tags ... ]
      const arrayPattern = new RegExp(`(${tagType}:\\s*\\[)([\\s\\S]*?)(\\s*\\])`, 'i');
      const match = fileContent.match(arrayPattern);
      
      if (match) {
        const existingTagsSection = match[2];
        
        // Check which tags are not already in the file
        const tagsToAdd = tags.filter(tag => !existingTagsSection.includes(`'${tag}'`));
        
        if (tagsToAdd.length > 0) {
          // Find the last tag in the array (to append after it)
          const lastCommaIndex = match[2].lastIndexOf(',');
          
          // Build the new tags string
          const newTagsStr = tagsToAdd.map(tag => `'${tag}'`).join(', ');
          
          // Insert new tags before the closing bracket
          let updatedArray;
          if (lastCommaIndex > -1) {
            // There are existing tags - append after the last comma
            updatedArray = match[1] + match[2] + `, ${newTagsStr}` + match[3];
          } else {
            // Empty array - add as first items
            updatedArray = match[1] + `\n    ${newTagsStr}\n  ` + match[3];
          }
          
          // Replace in file content
          fileContent = fileContent.replace(arrayPattern, updatedArray);
          
          console.log(`📝 Appended ${tagsToAdd.length} new ${tagType} tags to seed file:`, tagsToAdd.join(', '));
        }
      }
    }
    
    // Write back to file
    fs.writeFileSync(seedFilePath, fileContent, 'utf8');
    console.log('✅ Seed file updated successfully');
    
  } catch (error) {
    console.error('⚠️ Error updating seed file:', error.message);
    // Don't throw - this is not critical, tags are already in database
  }
}

module.exports = {
  extractTagsWithLLM,
  retryWithFeedback
};
