require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString, { ssl: 'require' });

const COMPREHENSIVE_TAGS = {
  // POWER TOOLS & HARDWARE FEATURES (150+ tags)
  features: [
    // Power Tool Features
    'cordless', 'corded', 'brushless-motor', 'brushed-motor', 'lithium-ion', 'battery-powered',
    'variable-speed', 'hammer-drill-mode', 'torque-control', 'quick-release-chuck', 'led-work-light',
    'dust-collection', 'blade-guard', 'laser-guide', 'electric-brake', 'soft-start', 'tool-free',
    'keyless-chuck', 'depth-stop', 'bevel-capacity', 'miter-capacity', 'sliding-compound',
    'orbital-action', 'scroll-cut', 'anti-vibration', 'ergonomic-grip', 'overmold-handle',
    
    // General Features
    'waterproof', 'water-resistant', 'weatherproof', 'breathable', 'moisture-wicking',
    'quick-dry', 'insulated', 'thermal', 'windproof', 'lightweight', 'heavy-duty',
    'durable', 'sturdy', 'flexible', 'stretchy', 'elastic', 'cushioned', 'padded',
    'supportive', 'arch-support', 'shock-absorbing', 'anti-slip', 'non-slip', 'grip',
    'traction', 'eco-friendly', 'sustainable', 'recycled', 'organic', 'natural',
    'biodegradable', 'vegan', 'cruelty-free', 'hypoallergenic', 'antimicrobial',
    'odor-resistant', 'stain-resistant', 'wrinkle-free', 'easy-care', 'machine-washable',
    'adjustable', 'convertible', 'reversible', 'foldable', 'collapsible', 'portable',
    'compact', 'stackable', 'modular', 'extendable', 'wireless', 'bluetooth', 'usb',
    'rechargeable', 'battery-operated', 'solar', 'smart', 'connected', 'app-controlled',
    'touchscreen', 'voice-activated', 'energy-efficient', 'high-performance', 'premium',
    'handmade', 'artisan', 'limited-edition', 'exclusive', 'imported', 'made-in-usa',
    
    // Kitchen Features
    'non-stick', 'dishwasher-safe', 'oven-safe', 'microwave-safe', 'freezer-safe',
    'induction-compatible', 'stovetop-safe', 'bpa-free', 'food-grade', 'heat-resistant',
    'ceramic-coating', 'stainless-steel', 'cast-iron', 'programmable', 'digital-display',
    
    // Automotive Features
    'oem', 'aftermarket', 'performance', 'all-season', 'all-weather', 'winter-rated',
    'heavy-duty-rated', 'corrosion-resistant', 'rust-proof', 'high-temperature',
    
    // Beauty Features
    'spf', 'fragrance-free', 'paraben-free', 'sulfate-free', 'gluten-free', 'dermatologist-tested',
    'oil-free', 'non-comedogenic', 'long-lasting', 'waterproof', 'smudge-proof', 'transfer-proof',
    
    // Electronics Features
    '4k', '8k', 'hdr', 'smart-tv', 'voice-control', 'wifi-enabled', 'noise-cancelling',
    'wireless-charging', 'fast-charging', 'dual-sim', 'fingerprint-sensor', 'face-id',
    
    // Fitness Features
    'heart-rate-monitor', 'calorie-tracking', 'gps', 'step-counter', 'sleep-tracking',
    'water-resistant', 'shock-resistant', 'impact-resistant'
  ],

  // MATERIALS (250+ tags)
  materials: [
    // Fabrics & Textiles
    'cotton', 'organic-cotton', 'polyester', 'wool', 'merino-wool', 'cashmere', 'alpaca',
    'leather', 'genuine-leather', 'vegan-leather', 'suede', 'nubuck', 'mesh', 'canvas',
    'denim', 'chambray', 'silk', 'satin', 'linen', 'fleece', 'nylon', 'spandex', 'elastane',
    'lycra', 'rubber', 'eva-foam', 'memory-foam', 'latex', 'bamboo', 'tencel', 'modal',
    'rayon', 'acrylic', 'microfiber', 'neoprene', 'gore-tex', 'ripstop', 'corduroy',
    'flannel', 'jersey', 'terry-cloth', 'velvet', 'tweed', 'twill', 'poplin', 'oxford',
    'down', 'feather', 'synthetic-fill', 'recycled-polyester', 'recycled-nylon',
    'hemp', 'jute', 'cork',
    
    // Metals & Minerals
    'wood', 'metal', 'plastic', 'glass', 'ceramic', 'stone', 'marble', 'granite',
    'steel', 'stainless-steel', 'carbon-steel', 'aluminum', 'copper', 'brass', 'bronze',
    'titanium', 'iron', 'cast-iron', 'chrome', 'nickel', 'zinc', 'pewter',
    'gold', 'silver', 'platinum', 'rose-gold', 'white-gold', 'yellow-gold',
    
    // Power Tool Materials
    'carbide', 'diamond-coated', 'tungsten', 'high-speed-steel', 'tool-steel',
    'fiberglass', 'carbon-fiber', 'kevlar', 'abs-plastic', 'polycarbonate',
    
    // Kitchen Materials
    'porcelain', 'earthenware', 'bone-china', 'tempered-glass', 'borosilicate',
    'silicone', 'melamine', 'enamel', 'hard-anodized', 'tri-ply', 'clad',
    
    // Automotive Materials
    'carbon-composite', 'alloy', 'galvanized-steel', 'reinforced-rubber', 'synthetic-rubber',
    
    // Beauty Materials
    'mineral', 'plant-based', 'botanical', 'chemical-free', 'synthetic', 'natural-ingredients'
  ],

  // COLORS & PATTERNS (200+ tags)
  colors: [
    // Basic Colors
    'black', 'white', 'gray', 'grey', 'charcoal', 'slate', 'silver', 'beige', 'tan', 'khaki',
    'brown', 'chocolate', 'camel', 'navy', 'blue', 'royal-blue', 'sky-blue', 'teal', 'turquoise',
    'red', 'burgundy', 'maroon', 'crimson', 'pink', 'rose', 'blush', 'coral', 'orange',
    'rust', 'peach', 'yellow', 'gold', 'mustard', 'green', 'olive', 'forest-green', 'sage',
    'mint', 'emerald', 'purple', 'lavender', 'plum', 'violet', 'cream', 'ivory', 'ecru',
    
    // Extended Colors
    'neon', 'pastel', 'matte', 'glossy', 'metallic', 'pearl', 'iridescent', 'holographic',
    'chrome', 'copper', 'bronze', 'gunmetal', 'champagne', 'rose-gold',
    'lime', 'chartreuse', 'aqua', 'cyan', 'magenta', 'fuchsia', 'indigo', 'mauve',
    'taupe', 'sand', 'stone', 'ash', 'smoke', 'onyx', 'jet-black', 'snow-white',
    
    // Patterns
    'striped', 'plaid', 'checkered', 'gingham', 'solid', 'floral', 'geometric', 'abstract',
    'camo', 'camouflage', 'tie-dye', 'ombre', 'gradient', 'colorblock', 'multi-color',
    'polka-dot', 'paisley', 'herringbone', 'houndstooth', 'chevron', 'argyle', 'animal-print',
    'leopard-print', 'zebra-print', 'snakeskin', 'tribal', 'bohemian-print', 'aztec',
    'two-tone', 'three-tone', 'color-splash', 'textured', 'embossed', 'quilted',
    
    // Tool/Equipment Colors
    'safety-yellow', 'high-visibility', 'reflective', 'anodized', 'powder-coated', 'zinc-plated'
  ],

  // STYLES & AESTHETICS (250+ tags)
  styles: [
    // Fashion Styles
    'casual', 'athletic', 'sporty', 'minimalist', 'modern', 'contemporary', 'classic',
    'traditional', 'vintage', 'retro', 'bohemian', 'boho', 'preppy', 'streetwear',
    'urban', 'edgy', 'grunge', 'punk', 'elegant', 'sophisticated', 'chic', 'luxe',
    'business-casual', 'smart-casual', 'dressy', 'feminine', 'masculine',
    'unisex', 'androgynous', 'oversized', 'fitted', 'tailored', 'relaxed', 'slim',
    
    // Home Styles
    'rustic', 'farmhouse', 'industrial', 'scandinavian', 'mid-century', 'coastal',
    'nautical', 'tropical', 'western', 'southwestern', 'eastern', 'zen', 'minimalistic',
    'maximalist', 'eclectic', 'artisan', 'handcrafted', 'designer', 'budget-friendly',
    'shabby-chic', 'cottage', 'colonial', 'victorian', 'art-deco', 'craftsman',
    
    // Product Design Styles
    'performance', 'technical', 'tactical', 'outdoor', 'adventure', 'expedition',
    'professional', 'commercial-grade', 'residential', 'contractor-grade', 'pro-level',
    'beginner-friendly', 'advanced', 'expert', 'entry-level', 'high-end', 'mid-range',
    'budget', 'value', 'economy', 'luxury', 'premium', 'deluxe', 'standard', 'basic',
    
    // Power Tool Styles
    'compact-design', 'ergonomic', 'one-handed', 'two-handed', 'pistol-grip', 'barrel-grip',
    'inline', 'right-angle', 'offset', 'straight', 'curved', 'angled',
    
    // Automotive Styles
    'stock', 'custom', 'modified', 'tuned', 'racing', 'off-road', 'on-road', 'street',
    'track', 'drift', 'lowered', 'lifted', 'aggressive', 'sleeper',
    
    // Beauty Styles
    'natural-look', 'glam', 'smokey-eye', 'nude', 'bold', 'subtle', 'dramatic',
    'dewy', 'matte-finish', 'satin-finish', 'shimmer', 'glitter', 'metallic-finish'
  ],

  // ACTIVITIES & USE CASES (300+ tags)
  activities: [
    // Sports & Fitness
    'workout', 'gym', 'training', 'running', 'jogging', 'hiking', 'walking', 'yoga', 'pilates',
    'cycling', 'biking', 'swimming', 'golf', 'tennis', 'basketball', 'soccer', 'climbing',
    'skiing', 'snowboarding', 'surfing', 'skateboarding', 'crossfit', 'boxing', 'martial-arts',
    'dance', 'athleisure', 'weightlifting', 'cardio', 'strength-training', 'marathon',
    'triathlon', 'mountain-biking', 'road-cycling', 'track-running', 'trail-running',
    
    // Outdoor Activities
    'camping', 'backpacking', 'trekking', 'mountaineering', 'rock-climbing', 'kayaking',
    'canoeing', 'fishing', 'hunting', 'birdwatching', 'nature-photography', 'picnic',
    'beach', 'poolside', 'outdoor', 'indoor', 'gardening', 'lawn-care', 'landscaping',
    
    // Work & Professional
    'construction', 'woodworking', 'metalworking', 'plumbing', 'electrical', 'carpentry',
    'renovation', 'remodeling', 'diy', 'home-improvement', 'automotive-repair', 'maintenance',
    'fabrication', 'welding', 'machining', 'assembly', 'installation', 'demolition',
    'framing', 'roofing', 'flooring', 'painting', 'drywall', 'masonry', 'concrete',
    
    // Daily Life
    'travel', 'commute', 'office', 'casual-wear', 'everyday', 'loungewear', 'sleepwear',
    'formal', 'business', 'party', 'wedding', 'date-night', 'dinner', 'brunch',
    'shopping', 'errands', 'school', 'study', 'work-from-home', 'remote-work',
    
    // Occasions & Events
    'holiday', 'vacation', 'festival', 'concert', 'sport-event', 'weekend',
    'special-occasion', 'gift', 'housewarming', 'baby-shower', 'birthday', 'anniversary',
    'graduation', 'prom', 'homecoming', 'cocktail-party', 'gala', 'charity-event',
    
    // Cooking & Kitchen
    'baking', 'roasting', 'grilling', 'frying', 'sauteing', 'steaming', 'boiling',
    'slow-cooking', 'pressure-cooking', 'meal-prep', 'food-storage', 'entertaining',
    
    // Automotive Activities
    'daily-driving', 'long-distance', 'city-driving', 'highway', 'off-roading',
    'track-day', 'car-show', 'detailing', 'restoration'
  ],

  // FIT & SIZING (100+ tags)
  fit: [
    // Clothing Fit
    'slim-fit', 'skinny-fit', 'regular-fit', 'relaxed-fit', 'loose-fit', 'oversized',
    'plus-size', 'petite', 'tall', 'maternity', 'big-and-tall', 'athletic-fit',
    'tailored-fit', 'comfort-fit', 'true-to-size', 'runs-small', 'runs-large',
    'adjustable-fit', 'custom-fit', 'one-size-fits-all', 'stretchable',
    
    // Sizes
    'xs', 'small', 'medium', 'large', 'xl', 'xxl', '3xl', '4xl', '5xl',
    'extra-small', 'extra-large', 'youth', 'junior', 'infant', 'toddler',
    
    // Tool Sizing
    'compact-size', 'mid-size', 'full-size', 'mini', 'standard-size', 'heavy-duty-size',
    'professional-size', 'home-use', 'commercial-use',
    
    // Shoe Sizing
    'wide-width', 'narrow-width', 'medium-width', 'extra-wide', 'half-size',
    
    // Universal Sizing
    'adjustable-sizing', 'universal-fit', 'versatile-sizing', 'expandable',
    'telescoping', 'retractable', 'variable-length'
  ],

  // OCCASIONS (100+ tags)
  occasions: [
    // Social Events
    'work', 'office', 'business', 'meeting', 'presentation', 'interview', 'wedding',
    'party', 'cocktail', 'formal-event', 'date-night', 'dinner', 'brunch', 'vacation',
    'travel', 'holiday', 'festival', 'concert', 'sport-event', 'everyday', 'weekend',
    'special-occasion', 'gift', 'housewarming', 'baby-shower',
    
    // Seasonal
    'summer', 'winter', 'spring', 'fall', 'autumn', 'all-season', 'year-round',
    'cold-weather', 'warm-weather', 'hot-weather', 'rainy-season', 'snow-season',
    
    // Time of Day
    'morning', 'afternoon', 'evening', 'night', 'overnight', 'dawn', 'dusk',
    
    // Lifestyle
    'luxury', 'budget-friendly', 'eco-conscious', 'health-conscious', 'fitness-lifestyle',
    'active-lifestyle', 'sedentary', 'busy-lifestyle', 'minimalist-lifestyle',
    
    // Gift Occasions
    'mothers-day', 'fathers-day', 'christmas', 'valentines-day', 'anniversary-gift',
    'birthday-gift', 'graduation-gift', 'retirement-gift', 'thank-you-gift',
    'corporate-gift', 'stocking-stuffer', 'secret-santa'
  ],

  // POWER TOOL SPECIFIC (200+ tags)
  'tool-types': [
    // Tool Categories
    'power-drill', 'impact-driver', 'hammer-drill', 'rotary-hammer', 'circular-saw',
    'miter-saw', 'table-saw', 'jigsaw', 'reciprocating-saw', 'band-saw', 'cutoff-saw',
    'angle-grinder', 'die-grinder', 'bench-grinder', 'belt-sander', 'orbital-sander',
    'random-orbital-sander', 'detail-sander', 'drywall-sander', 'disc-sander',
    'router', 'plunge-router', 'trim-router', 'rotary-tool', 'oscillating-tool',
    'nail-gun', 'staple-gun', 'brad-nailer', 'framing-nailer', 'finish-nailer',
    'paint-sprayer', 'heat-gun', 'soldering-iron', 'welding-machine', 'air-compressor',
    
    // Tool Brands
    'dewalt', 'milwaukee', 'makita', 'bosch', 'ryobi', 'craftsman', 'black-decker',
    'porter-cable', 'ridgid', 'hitachi', 'metabo', 'festool', 'hilti', 'kobalt',
    
    // Power Types
    '18v', '20v', '12v', '40v', '60v', '110v', '120v', '220v', '240v', 'dual-voltage',
    'battery-platform', 'tool-only', 'kit', 'combo-kit', 'bare-tool',
    
    // Blade/Bit Types
    'carbide-blade', 'diamond-blade', 'masonry-blade', 'wood-blade', 'metal-blade',
    'bi-metal-blade', 'titanium-coated', 'cobalt-bits', 'twist-bits', 'spade-bits',
    'hole-saw', 'forstner-bit', 'step-bit', 'countersink', 'pilot-bit'
  ],

  // AUTOMOTIVE SPECIFIC (150+ tags)
  'automotive': [
    // Part Types
    'brake-pad', 'brake-rotor', 'brake-caliper', 'brake-line', 'brake-fluid',
    'oil-filter', 'air-filter', 'fuel-filter', 'cabin-filter', 'transmission-filter',
    'spark-plug', 'ignition-coil', 'distributor', 'alternator', 'starter',
    'battery', 'radiator', 'water-pump', 'thermostat', 'coolant-hose',
    'timing-belt', 'serpentine-belt', 'drive-belt', 'tensioner', 'pulley',
    'shock-absorber', 'strut', 'coil-spring', 'control-arm', 'ball-joint',
    'tie-rod', 'sway-bar', 'bushing', 'bearing', 'cv-joint', 'axle',
    
    // Vehicle Types
    'sedan', 'suv', 'truck', 'van', 'coupe', 'convertible', 'hatchback',
    'crossover', 'minivan', 'pickup', 'sports-car', 'luxury-car', 'economy-car',
    
    // Brands
    'oem-part', 'genuine-part', 'aftermarket-part', 'performance-part', 'racing-part',
    'upgraded', 'replacement', 'universal-fit', 'direct-fit', 'custom-fit',
    
    // Specifications
    'heavy-duty', 'severe-duty', 'extended-life', 'high-performance', 'race-grade',
    'street-legal', 'emissions-compliant', 'carb-compliant', 'dot-approved'
  ],

  // KITCHEN SPECIFIC (100+ tags)
  'kitchen': [
    // Cookware Types
    'non-stick-pan', 'cast-iron-skillet', 'stainless-pan', 'copper-cookware',
    'ceramic-cookware', 'hard-anodized', 'enameled-cast-iron', 'carbon-steel-pan',
    
    // Appliance Features
    'programmable', 'digital-controls', 'manual-controls', 'touch-screen',
    'self-cleaning', 'auto-shutoff', 'timer', 'temperature-control', 'speed-settings',
    'pulse-function', 'ice-crushing', 'hot-cold', 'variable-temperature',
    
    // Capacity
    'personal-size', 'family-size', 'large-capacity', 'small-capacity',
    'single-serve', 'multi-serve', '1-cup', '2-cup', '10-cup', '12-cup',
    
    // Kitchen Styles
    'commercial-kitchen', 'home-kitchen', 'professional-chef', 'everyday-cooking',
    'gourmet', 'quick-meals', 'healthy-cooking', 'batch-cooking'
  ],

  // BEAUTY SPECIFIC (100+ tags)
  'beauty': [
    // Skin Types
    'oily-skin', 'dry-skin', 'combination-skin', 'sensitive-skin', 'normal-skin',
    'acne-prone', 'mature-skin', 'aging-skin', 'all-skin-types',
    
    // Formulations
    'cream', 'gel', 'serum', 'lotion', 'oil', 'balm', 'foam', 'mousse',
    'powder', 'liquid', 'stick', 'spray', 'mist', 'sheet-mask', 'clay-mask',
    
    // Benefits
    'anti-aging', 'hydrating', 'moisturizing', 'brightening', 'exfoliating',
    'firming', 'toning', 'soothing', 'calming', 'clarifying', 'purifying',
    'nourishing', 'repairing', 'protecting', 'smoothing', 'plumping',
    
    // Finish Types
    'matte', 'dewy', 'satin', 'natural-finish', 'radiant', 'luminous',
    'semi-matte', 'velvet', 'sheer', 'full-coverage', 'medium-coverage',
    'light-coverage', 'buildable'
  ]
};

async function seedTags() {
  try {
    console.log('🚀 Starting comprehensive tag taxonomy seed...\n');

    // Clear existing tags
    console.log('🗑️  Clearing existing tags...');
    await sql`DELETE FROM product_tags`;
    await sql`DELETE FROM tag_taxonomy`;
    console.log('✅ Cleared existing tags\n');

    console.log('📊 Inserting tags by type...');
    let totalCount = 0;

    for (const [tagType, tags] of Object.entries(COMPREHENSIVE_TAGS)) {
      console.log(`\n   Inserting ${tagType} (${tags.length} tags)...`);
      
      // Prepare batch data
      const batchData = tags.map(tagName => ({
        name: tagName,
        slug: tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        tag_type: tagType
      }));
      
      // Batch insert
      await sql`
        INSERT INTO tag_taxonomy ${sql(batchData, 'name', 'slug', 'tag_type')}
        ON CONFLICT (slug) DO NOTHING
      `;
      
      totalCount += tags.length;
      console.log(`   ✅ Inserted ${tags.length} ${tagType} tags`);
    }

    console.log(`\n✅ Seeded ${totalCount} tags across ${Object.keys(COMPREHENSIVE_TAGS).length} types:`);
    
    for (const [tagType, tags] of Object.entries(COMPREHENSIVE_TAGS)) {
      console.log(`   - ${tagType}: ${tags.length} tags`);
    }

    console.log('\n🎉 Tag taxonomy seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding tags:', error);
    process.exit(1);
  }
}

seedTags();
