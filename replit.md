# Tagglo Electron App

## Overview
Tagglo is a desktop Electron application designed for web scraping e-commerce product data. It operates with a Control Window for managing scraping operations and a Product Window for viewing target websites. The project aims to provide robust, multi-field data extraction (title, price, images, specs, tags, brand, description) with persistent selector memory, history tracking, and custom site-specific handlers, optimized for product detail page scraping.

## User Preferences
- Prefers existing project structure and conventions
- Focus on functionality over documentation

## System Architecture
The application is built on the Electron framework, utilizing a main process (`main.js`) for window management and IPC, and a renderer process (`control.html`) for the user interface. A `preload.js` script provides a secure IPC bridge. Scraping logic is modularized within a `scrapers` directory, featuring an `orchestrator.js` for coordination and specialized modules for different data types (e.g., `title.js`, `price.js`, `images.js`).

**Key Architectural Decisions & Features:**
- **Selector Memory**: Persistent, file-based storage of CSS selectors per domain with history and auto-migration.
- **Core Scraping Systems**:
    - **Price Detection**: Multi-strategy extraction with custom handlers and refinement.
    - **Title & Brand Extraction**: Utilizes JSON-LD, meta tags, breadcrumbs, and URL patterns.
    - **Image Discovery & Scoring**: Site-specific selectors, generic fallbacks, and a sophisticated scoring algorithm considering size, quality, and semantic penalties. Includes intelligent lazy-loading image support with attribute fallbacks and dimension-based quality filtering.
    - **Custom Handlers**: Specialized logic for major retailers (e.g., Amazon, Nike, Adidas, Home Depot, AliExpress) for enhanced extraction and CDN upgrades.
    - **Filtering Systems**: Multi-stage junk detection, Shopify intelligence, and quality thresholds.
    - **Deduplication**: Canonical URL grouping with score-based selection.
- **CDN Upgrade Patterns**: Specific rules for optimizing image quality and dimensions across various CDNs (e.g., Shopify, Urban Outfitters, Temu, IKEA, Swarovski).
- **Description & Specs Extraction**: Intelligent extraction targeting hidden accordion content, with fluff filtering and dedicated specs fields.
- **Breadcrumb Processing**: Enhanced cleaning for concatenated text, expanded junk filtering, and position-based scoring.
- **UI/UX**: Features a Pinterest-style flow optimized for product detail page scraping, individual field clear buttons for granular selector management, and a mobile preview interface.
- **Deployment**: Configured for Replit environment using Node.js with a custom `start-electron.sh` script, leveraging Xvfb for virtual display and VNC for output.

## External Dependencies
- **Electron Framework**: Core application framework.
- **Xvfb**: Virtual display server for headless Electron execution in Replit.
- **VNC**: For displaying the desktop application output in the Replit environment.
- **Third-party CDNs**: Integrated with specific upgrade patterns and handlers for: Shopify, Scene7 (Urban Outfitters, American Eagle Outfitters), Mozu (BBQ Guys/Shocho), Etsy, IKEA, Alibaba Cloud (Temu), LTWEBSTATIC (SHEIN/MUSERA), Swarovski, Cloudinary, Imgix, ImageKit, Fastly.
- **Gtk3, gsettings-desktop-schemas, glib, dconf**: System dependencies for Electron to run in NixOS.

## Auto-Tagging & Database Architecture (Oct 9, 2025)
- **Database Schema**: 7-table PostgreSQL architecture with Drizzle ORM
  - `products_raw` - Archive of original scraped data
  - `products` - Main queryable product table with auto-tags
  - `products_enriched` - LLM-enhanced metadata (optional)
  - `categories` - Hierarchical taxonomy (30 seed categories - **must be seeded before tagging works**)
  - `tags` - Flat cross-cutting labels with type classification
  - `product_tags` & `product_categories` - Junction tables
- **Database Setup**: Before using auto-tagging, seed the categories table with `node scripts/seed-categories.js`
- **Keyword Dictionary**: 400+ keywords organized by gender, materials, colors, styles, features, occasions, categories
- **Auto-Tagger Engine** (`scrapers/auto-tagger.js`):
  - Priority matching: breadcrumbs → keyword detection → confidence scoring
  - Skips last breadcrumb if matches title (avoids product-specific names)
  - Confidence calculation: gender (15%) + category (30%) + materials (10%) + styles (15%) + features (15%) + colors (10%) + occasions (5%)
  - Flags products <70% confidence for LLM enrichment
- **Database Operations** (`server/storage.js`):
  - 3-stage save pipeline: raw → keyword-tagged → (optional LLM-enriched)
  - Auto-creates tags/categories with slug normalization
  - Junction table population for many-to-many relationships
- **UI Integration**: "Save to Database" button with real-time tag preview showing category, gender, confidence, and extracted tags
- **Cost Strategy**: Keyword matching (free, 70-80% coverage) + LLM batch processing for low-confidence products (~$0.0001/product with GPT-4o-mini)

## Recent Changes
- **JSON-LD Priority Tagging (Oct 11, 2025)**: Enhanced LLM tagger to prioritize structured data over breadcrumbs
  - **JSON-LD Extraction**: Scraper now extracts full JSON-LD structured data (category, gender, color, material, style, model)
  - **UI Display**: New blue info panel shows JSON-LD fields below URL for transparency
  - **LLM Integration**: Prompt prioritizes JSON-LD data (⭐) over breadcrumbs for category extraction
  - **Database Storage**: `raw_json_ld` field added to products_raw table to preserve original structured data
  - **Slug Generation**: Fixed bug - frontend now auto-generates slugs for LLM tags (lowercase, hyphens)
  - **Use Case**: Fixes Allbirds categorization - JSON-LD contains "gender: mens" + proper category vs useless breadcrumbs
- **LLM-Powered Tagging System (Oct 11, 2025)**: AI-assisted categorization with human review workflow
  - **OpenAI Integration**: Uses GPT-4o-mini for intelligent tag/category extraction (~$0.001-0.003/product)
  - **Smart Extraction** (`server/llm-tagger.js`): 
    - Hierarchical categories with full path (Women > Shoes > Sneakers > Running)
    - 5-6 curated keywords: Brand (must) + Product Line/Model + 3-4 attributes (material, color, style)
    - Skips generic/redundant words, validates against category path
  - **Review & Edit UI**: Modal interface allows users to:
    - Review AI reasoning and suggestions
    - Edit category path inline (e.g., "Women > Shoes > Sneakers > Running")
    - Add/remove keywords with visual tag chips
    - Retry with feedback if AI misunderstood
    - Save approved tags to database
  - **IPC Handlers**: `llm-tag-product`, `llm-retry-with-feedback` for main/renderer communication
  - **UI Elements**: "🤖 Get AI Tags" button → review modal → save with confirmation
  - **Cost Optimization**: Uses JSON response format, 0.3 temperature, 500 token limit for consistent results
- **Breadcrumb & Description Fixes (Oct 10, 2025)**: Fixed malformed breadcrumb and description extraction issues
  - **Comma-Separated Breadcrumbs**: Added comma to split regex in breadcrumb scraper to handle formats like "Ace,Hardware,Tools,Product Name"
  - **Breadcrumb Normalizer**: Detects comma format vs space format, auto-filters product title from end of breadcrumb array
  - **Breadcrumb Extraction**: Improved link text extraction to use direct text nodes and reject concatenated strings
  - **Description Accordion Filter**: Added header/title element filtering to avoid extracting accordion headers (e.g., "Description" header on Adidas)
  - **Word Count Validation**: Rejects single-word descriptions to prevent header extraction
  - **Use Cases**: Fixes Ace Hardware comma-separated breadcrumbs and Adidas accordion header extraction
- **SKU Memory Fix (Oct 9, 2025)**: Fixed JSON-LD SKU extraction from saved selectors
  - **Issue**: Memory system saved JSON-LD selector but couldn't retrieve SKU value, always fell back to generic
  - **Root Cause**: `fromMemory()` had hardcoded cases for price/brand/description but missing SKU case
  - **Solution**: Added SKU case to JSON-LD extraction logic with priority: `sku → productID → gtin13 → mpn`
  - **Result**: Saved JSON-LD SKU selectors now work correctly on subsequent page visits
- **SKU Extraction System (Oct 9, 2025)**: Comprehensive SKU extraction with multi-strategy approach
  - **Priority Extraction**: JSON-LD (sku/productID/gtin13/mpn) → meta tags → DOM attributes → URL parsing
  - **Brand-Aware Validation**: Cross-validates SKU with product brand to avoid recommendation carousel SKUs
  - **Context Filtering**: Checks parent containers to exclude SKUs from "Related Products" sections
  - **Database Integration**: SKU stored in both `products_raw.raw_sku` and `products.sku` for deduplication
  - **UI Field**: New SKU field with checkbox under Specs for selector memory
  - **Use Case**: Enables product matching across different sites and duplicate detection
- **Breadcrumb Word Splitting (Oct 9, 2025)**: Smart breadcrumb parsing prevents concatenation in auto-tagger
  - **Capital Letter Boundaries**: Splits "HomeTool" → ["Home", "Tool"] for proper keyword matching
  - **Dictionary Validation**: Uses keyword dictionary to validate split words before applying
  - **Crash Prevention**: Auto-tagger now defensive against string breadcrumbs, converts to arrays if needed
  - **Use Case**: Fixes keyword matching failures on concatenated breadcrumbs (e.g., "Tool" keyword now matches)
- **Allbirds Handler Re-enabled (Oct 9, 2025)**: Re-enabled Allbirds custom handler after generic scraper failed
  - **Issue**: Generic scraper could not reach images in Swiper carousel structure (.swiper-slide > .slide-content > img)
  - **Root Cause**: Carousel slides hidden/offscreen, deep nested structure, lazy-loading behavior
  - **Solution**: Allbirds handler specifically targets .swiper-slide elements regardless of visibility
  - **Lesson Learned**: Custom handlers ARE justified for unique carousel/slider implementations
  - **Philosophy Refined**: Generic first, but custom handlers needed for: unique DOM patterns (carousels), proprietary data sources, CDN-specific upgrades
- **Image Dimension Quality Filter (Oct 8, 2025)**: Added actual image dimension checking to filter marketing badges
  - **Load & Measure**: Loads each image to check naturalWidth/naturalHeight before final ranking
  - **Small Image Penalty**: -50 score penalty for images smaller than 400x400px (filters badges, icons, trust seals)
  - **Re-sort After Penalty**: Images re-sorted by score after dimension penalties applied
  - **Timeout Protection**: 3s timeout per image to prevent slow CDNs from blocking pipeline
  - **Use Case**: Filters Albany Park marketing badges (shipping, warranty icons) that passed URL scoring
- **Description Cart/Bag Filter (Oct 8, 2025)**: Rejects description elements inside shopping cart containers
  - **Container Detection**: Checks for cart/bag/checkout/minicart ancestors using closest()
  - **Prevents False Positives**: Stops extracting "Added to Cart" messages as product descriptions
  - **Use Case**: Fixes Albany Park extracting cart confirmation text instead of product descriptions
- **Marketing Badge Keyword Filter (Oct 8, 2025)**: Expanded junk image regex to catch marketing badges
  - **New Keywords**: shipping, warranty, trial, interest_free, premium_materials, hypoallergenic
  - **Pattern Matching**: Matches badge/icon/logo/img/image with marketing terms in URL
  - **Early Blocking**: Caught at URL regex stage before scoring begins
  - **Use Case**: Blocks Albany Park "Free Shipping", "100 Day Trial" badge images from extraction