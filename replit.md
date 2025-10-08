# Tagglo Electron App

## Project Overview
This is a desktop Electron application called "Tagglo" that provides web scraping capabilities for e-commerce product data. The app creates two Electron windows:

1. **Control Window** - Main interface for managing scraping operations
2. **Product Window** - Browser window for viewing target websites

## Project Architecture
- **Main Process**: `main.js` - Handles window management, IPC, and selector memory persistence  
- **Control Interface**: `control.html` - User interface for scraping controls and results
- **Preload Script**: `preload.js` - Secure IPC bridge between renderer and main process
- **Scrapers Directory**: Contains specialized scrapers for different data types:
  - `orchestrator.js` - Main scraping coordinator
  - `title.js`, `price.js`, `images.js` - Field-specific scrapers
  - `specs_tags.js` - Product specifications and tags
  - `custom.js` - Site-specific custom handlers
  - `utils.js` - Utility functions

## Key Features
- **Selector Memory**: Persistent storage of CSS selectors per domain
- **Multi-field Scraping**: Extracts title, price, images, specs, tags, brand, description
- **History Tracking**: Maintains change history for selector configurations
- **Pinterest-style Flow**: Optimized for product detail page scraping
- **Custom Handlers**: Site-specific scraping logic

## Development Setup
- Node.js with Electron framework
- Configured for Replit environment with virtual display (Xvfb)
- Uses VNC output for desktop app display
- Graphics acceleration disabled for compatibility

## Startup Configuration
- Custom startup script: `start-electron.sh`
- Runs with virtual display on :99
- Electron flags: `--no-sandbox --disable-dev-shm-usage --disable-gpu`

## Critical System Architecture
⚠️ **PROTECTION NOTICE**: These systems are CRITICAL - any modifications must preserve core functionality

### Core Scraping Systems (orchestrator.js)
1. **Price Detection** - Multi-strategy extraction with 20+ custom handlers and refinement algorithms
2. **Title & Brand Extraction** - JSON-LD, meta tags, breadcrumbs, URL patterns, title analysis
3. **Image Discovery** - Site-specific selectors + generic fallbacks for 20+ major e-commerce sites
4. **Image Scoring** - Sophisticated algorithm: size detection, quality bonuses, semantic penalties
5. **Custom Handlers** - Specialized logic for Amazon, Nike, Adidas, Home Depot, AliExpress, etc.
6. **Selector Memory** - File-based persistence with history tracking and automatic migration
7. **Filtering Systems** - Multi-stage junk detection, Shopify intelligence, quality thresholds
8. **Deduplication** - Canonical URL grouping with score-based selection

### CDN Upgrade Patterns (CRITICAL - DO NOT REMOVE)
- **Shopify**: _640x → _1020x dimension upgrades
- **Urban Outfitters**: Scene7 $redesign-zoom-5x$ template upgrades  
- **BBQ Guys/Shocho**: Remove resize parameters for full-size
- **Mozu**: ?max=100 → ?quality=60 conversions (RECENTLY RESTORED)
- **American Eagle Outfitters**: Scene7 $pdp-mdg-opt$ → $pdp-md-opt$ quality upgrades (md is better quality)
- **Etsy**: il_300x300 → il_1200x1200 dimension upgrades for high-quality product images
- **IKEA**: ?f=u/xxl → ?f=xxxl upgrades for highest quality available
- **Temu**: Alibaba Cloud imageView2 w/180 → w/1200, q/70 → q/90 quality boosts
- **Swarovski**: $size_360 → $size_2000, w_95 → w_2000 dimension upgrades
- **LTWEBSTATIC (SHEIN/MUSERA)**: Remove _thumbnail_XXXx suffixes for full-size images (preserves extension)

### Custom Handler Registry (custom.js)
- **Amazon (AMZ)**: Quality scoring, hi-res attributes, a-state JSON parsing
- **Nike**: t_PDP_1728_v1 high-res template conversions
- **Adidas**: [data-testid*="image"] targeting, w_600→w_1200 upgrades
- **Home Depot**: Thumbnail upgrades (_100→_1000), spin profile upgrades
- **AliExpress**: Multi-strategy title extraction, sophisticated filtering
- **Etsy**: Container-targeted main product gallery (eliminates cross-sell noise)
- **LTWEBSTATIC (SHEIN/MUSERA)**: Extracts from data-before-crop-src attributes, filters out cross-sell products
- **20+ other major retailers** with specialized price/image/title logic

## Recent Changes
- **Enhanced Breadcrumb Navigation Filtering (Oct 8, 2025)**: Improved breadcrumb extraction to prevent false positives from navigation menus
  - **Vertical Navigation Detection**: Detects and rejects vertically-stacked links (footer/sidebar menus) by analyzing Y-positions
  - **Navigation Pattern Filtering**: Skips elements with footer/header/menu/sidebar class/ID patterns
  - **Category List Detection**: Rejects diverse category lists (New, Sale, Shop, Gifts, etc.) that look like site navigation
  - **Position-based Scoring**: Prioritizes breadcrumbs in top 500px (score: 100) over those further down (score: 50/10)
  - **Multi-candidate System**: Collects all potential breadcrumbs and selects the highest-scoring one
  - **Use Case**: Fixes Adored Vintage extracting "New! > Modern > Vintage..." footer menu instead of "HOME / THOMASIN STRIPED SHORTS"
- **Individual Field Clear Buttons (Oct 8, 2025)**: Added granular selector memory management
  - **Clear Button UI**: 🗑️ button next to each field (Description, Specs, Title, Price, Brand, Breadcrumbs)
  - **Confirmation Dialog**: Browser confirm prompt before deletion ("Are you sure you want to delete saved selector for [field]?")
  - **Backend IPC**: New `deleteSelectorField` handler in preload.js → main.js
  - **Smart Cleanup**: Automatically deletes entire JSON file when no fields remain
  - **Use Case**: Remove outdated meta tag selectors to force smart generic extraction
- **Accordion Render Delay (Oct 8, 2025)**: 500ms post-load delay before extracting description/specs
  - **Timing**: Delay added after brand extraction, before description/specs extraction
  - **Purpose**: Allows accordion content already in DOM to fully render (no lazy-load triggers)
  - **Debug Logs**: "⏳ Waiting 500ms for accordion content to render..." → "✅ Accordion render delay complete"
- **Smart Description & Specs Extraction (Oct 8, 2025)**: Intelligent extraction targeting hidden accordion content
  - **Description Priority**: Data attributes → Semantic classes → Accordions → JSON-LD → Meta tags (last resort)
  - **Accordion Support**: Extracts from aria-expanded="false" sections already in DOM (no lazy-load triggers)
  - **Fluff Filtering**: Removes promotional text ("Shop now!", "Free shipping!") from descriptions
  - **New Specs Field**: Extracts product specifications from bullet lists and tables
  - **Specs Sources**: Data attributes ([data-testid*="spec"]) → Class patterns (.specifications) → Accordion sections
  - **Raw Format**: Preserves original key-value pairs (no normalization for cross-site compatibility)
- **Breadcrumb Text Splitting & Expanded Filtering (Oct 8, 2025)**: Enhanced breadcrumb cleaning for concatenated text and navigation junk
  - **Text Splitting**: Automatically splits concatenated strings like "BackHome/Women/Shoes" → ["Women", "Shoes"]
  - **Concatenation Detection**: Recognizes and splits patterns like "BackHome", "HomeShop", "ReturnStore"
  - **Expanded Junk Filter**: Removes navigation terms (exact match): Back, Return, Previous, Home (first only), Shop, Store, All Products, Products, All Categories, Categories, Main Menu, Menu, Start, Index, Root, arrow symbols (←, →, ‹, ›)
  - **Smart Filtering**: Only exact matches filtered - preserves "Home-Goods", "Shop Tools", "Store Locator", etc.
  - **Multi-separator Support**: Handles /, >, |, ›, » separators with normalization
- **Selector Memory Simplification (Oct 8, 2025)**: Streamlined selector memory system for cleaner UX and better performance
  - **Image Extraction Flow**: Priority-based extraction - saved selectors (direct, no scoring) → custom handler → generic scraper
  - **UI Cleanup**: Removed checkboxes from text fields (Title, Price, Brand, URL, Description) - now auto-saved
  - **Manual Curation**: Image checkboxes only - users manually select which images to save selectors for
  - **Clear Console Messages**: Shows exact flow - "Found saved selectors" / "No saved selector" / "Falling back to..."
  - **Auto-save Text Fields**: If text fields are successfully extracted, their selectors are automatically saved
  - **Saved Selectors Bypass Scoring**: Saved image selectors extract directly without competing in scoring system
- **LTWEBSTATIC/SHEIN/MUSERA Support (Oct 2025)**: Added comprehensive support for ltwebstatic CDN and SHEIN/MUSERA sites
  - Custom handler extracts from data-before-crop-src attributes (captures full uncropped URLs)
  - CDN upgrade pattern removes _thumbnail_XXXx suffixes for full-size images
  - Filters out cross-sell products by targeting .main-picture container only
- **Temu CDN Support (Oct 2025)**: Added Alibaba Cloud imageView2 API upgrade patterns for Temu product images
  - Automatic width upgrades: w/180 → w/1200 for 6.7x larger dimensions
  - Quality boost: q/70 → q/90 for sharper product photos
- **Electron Environment Fix (Sept 30, 2025)**: Fixed Electron startup in Replit NixOS environment
  - Installed required system dependencies: gtk3, gsettings-desktop-schemas, glib, dconf
  - Updated start-electron.sh to use xvfb-run wrapper for automatic X11 display management
  - Set XDG_DATA_DIRS for GSettings schemas to prevent file dialog crashes
  - Resolved sandbox permissions with ELECTRON_DISABLE_SANDBOX=1
- **System Integrity Audit (Sept 2025)**: Comprehensive audit revealed all core systems intact except missing Mozu CDN upgrade logic
- **Mozu CDN Restoration**: Fixed missing ?max=100 → ?quality=60 conversion for Ace Hardware product images
- **Code Protection Measures**: Added comprehensive system documentation and change tracking safeguards
- **Mobile Preview Interface**: Pinterest-style mobile testing interface with device simulation
- **Enhanced Image Pipeline**: Early-exit optimization, production debug toggle, observer consistency fixes
- **Scoring Improvements**: Threshold adjustments (500px→300px), flexible pattern matching, container tracking fixes
- **Custom Handler Expansion**: Urban Outfitters PWA targeting, hi-res augmentation, LQIP detection
- **Brand Detection Overhaul**: Multi-strategy approach with JSON-LD, meta tags, breadcrumbs, URL analysis
- **CDN Support Expansion**: 12+ major CDNs including Cloudinary, Imgix, ImageKit, Fastly platforms

## User Preferences
- Prefers existing project structure and conventions
- Focus on functionality over documentation

## Deployment
- Target: VM (always running)
- Command: `./start-electron.sh`
- Suitable for desktop applications requiring persistent state