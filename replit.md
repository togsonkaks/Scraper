# Tagglo Electron App

## Overview
Tagglo is a desktop Electron application designed for web scraping e-commerce product data. Its primary purpose is multi-field data extraction (title, price, images, specs, tags, brand, description) from product detail pages, featuring persistent selector memory, history tracking, and custom site-specific handlers. A key capability is its advanced auto-tagging system, which utilizes a database-centric taxonomy for intelligent product categorization and keyword extraction. The project aims to provide a robust solution for efficient and accurate e-commerce data acquisition and enrichment.

## Recent Changes (October 18, 2025)
- **CRITICAL Slug Generation Bug Fix (COMPLETE)**:
  - Fixed inconsistent slug generation between seed script and storage.js that caused duplicate departments
  - **Root cause**: Multiple functions in storage.js used different slug formats than seed script
  - **Example**: "Sports & Outdoors" → seed created "sports-outdoors" but storage created "sports--outdoors" (double dash)
  - Standardized ALL 4 slug generation points in storage.js (lines 240, 502, 790, 948) to match seed script format: `replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
  - Fixed both `updateProductTags()` and `saveProduct()` functions
  - Created `cleanup-duplicates.sql` script to identify and delete all duplicate departments/categories
  - Now when LLM suggests "Sports & Outdoors > Tennis > Racket", it correctly finds existing seed "Sports & Outdoors" instead of creating duplicate
- **Flattened Fashion Category Structure**: 
  - REMOVED all Tops/Bottoms groupings from Fashion taxonomy
  - Flattened to direct garment types under Clothing: Fashion > Clothing > Shirts, Fashion > Clothing > Pants, Fashion > Clothing > Dresses, etc.
  - Consolidated Footwear into Fashion > Clothing > Shoes with subtypes (Sneakers, Boots, Heels, etc.)
  - Moved Hats from Accessories to Fashion > Clothing > Hats
  - Updated LLM prompts in server/llm-tagger.js to reflect new paths (removed all "Fashion > Clothing > Tops/Bottoms" examples)
  - Re-seeded database with 429 universal categories across 19 departments
- **Universal Category Architecture**:
  - Removed ALL gendered categories (Men's Watch, Women's Watch) and replaced with universal types (Analog Watch, Digital Watch, Smartwatch)
  - Fixed UI category builder level names from ["Department", "Gender", ...] to ["Department", "Category", "Subcategory", "Type", "Subtype"]
  - Gender completely removed from ALL category paths - exists ONLY as demographic tags for personalization
- **Database Configuration & Gender Detection Fixes**:
  - Clarified local database setup: pgAdmin 4 database on localhost:5433/Tagglo, Electron runs locally (not in Replit)
  - Fixed seed script SSL configuration: disables SSL for localhost, requires SSL for remote databases
  - Removed "tie" from men's gender keywords to prevent false positives (e.g., "tie-dye", "tie-waist" incorrectly triggering men's tag)
  - Kept "necktie" as men's keyword for accurate detection of actual men's neckties
- **Tag Taxonomy Reorganization**:
  - Separated colors, finishes, and patterns into distinct tag categories
  - **Colors**: ~60 pure color tags (black, white, navy, burgundy, etc.) plus color variations (two-tone, multi-color)
  - **Finishes**: ~30 surface finish tags (matte, glossy, metallic, pearl, brushed, polished, shimmer, etc.)
  - **Patterns**: ~50 design pattern tags (striped, plaid, floral, leopard-print, tie-dye, quilted, etc.)
  - Auto-tagger updated to recognize and match patterns and finishes tags
  - Department tag rules updated to include patterns/finishes where relevant (Fashion, Home & Garden, Tools, etc.)
  - Confidence scoring includes patterns (+0.10) and finishes (+0.10)
  - Fixed Fashion deletion in seed script to delete ALL Fashion departments (including LLM-discovered) before re-seeding to prevent duplicates
  - Fixed manual tag insertion to set `llm_discovered = 1` so user-created tags survive re-seeding
- **Canonical Tag System** (Surgical Implementation):
  - Added TAG_CANONICALS mapping to consolidate tag variations without database changes
  - Deduplicates similar tags: stripe/stripes/striped → striped, plaid/plaids → plaid, floral/florals → floral, checkers/checked → checkered
  - All variations remain in database for matching, but only canonical form returned to user
  - Implemented via `deduplicateTags()` function applied to tagsByType before final return
  - Easy to extend with new mappings as patterns emerge
- **Neckline & Sleeve Tags** (Garment Feature Detection):
  - Added 15 neckline tags (v-neck, crew-neck, turtle-neck, scoop-neck, cowl-neck, halter-neck, mock-neck, boat-neck, square-neck, sweetheart-neck, off-shoulder, one-shoulder, strapless, high-neck, round-neck)
  - Added 14 sleeve tags (short-sleeve, long-sleeve, sleeveless, 3/4-sleeve, cap-sleeve, bell-sleeve, puffed-sleeve, bishop-sleeve, dolman-sleeve, raglan-sleeve, flutter-sleeve, kimono-sleeve, batwing-sleeve, lantern-sleeve)
  - Category synonym mapping: "top"/"tops" → Shirts, "sneaker" → Sneakers, "bralette" → Bra, "panty"/"panties" → Underwear, "pajamas" → Sleepwear
  - False positive filters prevent descriptor words from matching categories (e.g., "short sleeve" blocked from matching "Shorts" category)
  - Feature tag boosting: When neckline/sleeve tags detected, boosts Shirts/Sweaters/Tanks categories by +200 points
  - Cross-department false positive protection for filter, belt, battery, pants categories
- **Self-Learning Category Synonym System** (October 18, 2025):
  - NEW database table `category_synonyms` stores user-taught synonym mappings (synonym → category_name)
  - Auto-tagger loads synonyms from database on initialization, merges with hardcoded fallbacks (DB takes priority)
  - **Always-visible synonym prompt**: "📚 Teach a Synonym" section now appears automatically in LLM Review modal whenever categories are present
  - Smart keyword suggestions: Extracts unique words from product title (e.g., "sundress") and pre-fills as suggestion for mapping
  - Dynamic updates: Synonym category auto-updates when user removes/changes category chips
  - One-click synonym saving: Type keyword (e.g., "bralette"), click "✓ Save Synonym", future products with that term auto-match the category
  - Automatically refreshes auto-tagger taxonomy after saving new synonym for immediate availability
  - Backend API: `saveCategorySynonym()` and `getCategorySynonyms()` in server/storage.js
  - IPC handlers: `save-category-synonym` and `get-category-synonyms` in main.js
  - Frontend API: `window.api.saveCategorySynonym(synonym, categoryName)` in preload.js
  - Helper functions: `extractSynonymSuggestion()` for smart keyword detection, `updateSynonymLearner()` for dynamic UI updates
  - **Gender Column Cleanup**: Removed ALL remaining gender column references from server/storage.js (4 INSERT/UPDATE statements + 1 filter query) to match database schema changes
- **Athletic Shoe Tag Support** (October 18, 2025):
  - Added 'activities' tag type to Fashion department's allowed tags (e.g., pickleball, tennis, running, basketball)
  - Enables unified shoe browsing under Fashion > Clothing > Shoes while preserving sport-specific activity tags
  - Athletic shoes now get both category (Shoes/Sneakers) + activity tags (pickleball, running, etc.) for precise filtering
- **Universal Department Re-seeding Fix** (October 18, 2025):
  - Fixed seed script to delete ALL seed departments before re-seeding (not just Fashion)
  - Prevents duplicate departments when users create LLM-discovered subcategories under any department
  - User-created categories with `llm_discovered=1` always survive re-seeding across all departments

## User Preferences
- Prefers existing project structure and conventions
- Focus on functionality over documentation

## System Architecture
The application is built on the Electron framework, using a main process, a renderer process, and a preload script for secure IPC. Scraping logic is modularized, with an orchestrator and specialized modules for different data types. The system is configured for deployment on Replit using Node.js, Xvfb, and VNC.

**UI/UX Decisions:**
- Pinterest-style flow optimized for product detail page scraping.
- Individual field clear buttons for granular selector management.
- Mobile preview interface.
- Blue info panel for displaying JSON-LD fields.
- Review & Edit UI modal for LLM-suggested tags and categories.

**Technical Implementations & Feature Specifications:**
- **State Management**: Prevents cross-contamination of product data during scraping.
- **Selector Memory**: Persistent, file-based storage of CSS selectors per domain with history and auto-migration.
- **Core Scraping Systems**:
    - Multi-strategy price detection.
    - Title & brand extraction using JSON-LD, meta tags, breadcrumbs, and URL patterns.
    - Advanced image discovery, scoring, and lazy-loading support.
    - Custom handlers for major retailers (e.g., Amazon, Nike, Adidas) for enhanced extraction and CDN upgrades.
    - Multi-stage junk detection and quality thresholds.
    - Canonical URL-based deduplication.
    - Intelligent description and specs extraction, including hidden content and fluff filtering.
    - Enhanced breadcrumb processing with cleaning, filtering, and scoring.
    - Multi-strategy SKU extraction with brand-aware validation.
- **CDN Upgrade Patterns**: Specific rules for optimizing image quality and dimensions across various CDNs.
- **Auto-Tagging System** (Pinterest-style Personalization Architecture):
    - Database-centric taxonomy (7-table PostgreSQL architecture with Drizzle ORM) for products, categories, and tags.
    - **Universal Category System**: Categories are completely gender-neutral (e.g., "Fashion > Accessories > Bags > Shoulder Bags", "Fashion > Clothing > Dresses") for clean browsing.
    - **Demographic Tags for Personalization**: Gender (women's, men's, unisex, lady, ladies) and age (kids, baby, teen) stored exclusively as tags, not in category structure or UI display.
    - **Gender Architecture**: Gender completely removed from products.gender database column and UI preview display. Gender detection still occurs but outputs directly to tags array only.
    - Auto-tagger engine (`scrapers/auto-tagger.js`):
        - Keyword extraction from URL slugs and JSON-LD.
        - **Weighted category scoring**: Title (1000x) >> URL (500x) > Breadcrumbs (300x) > Specs (100x) > Description (50x), with +10 depth bonus per level as tiebreaker. Title matches dominate to prevent description fluff from overriding core product type.
        - **Universal category search** - searches ALL categories regardless of gender (no filtering).
        - Comprehensive 5-tier gender detection with confidence scoring, conflict detection, and context awareness.
        - **Gender tag assignment**: Always assigns at least one gender tag, defaults to "unisex" if unclear.
        - **Age tag detection**: Only adds kids/baby/teen tags when explicit terms found (kids, infants, baby, child, toddler, boys, girls).
        - Smart color detection with a 2-tier priority system.
        - Comprehensive plural/singular matching for all tags and categories.
        - Automatic hierarchical path building for categories.
        - Category-aware tag filtering by department (removes nonsense tag combinations).
    - **Smart Tag Classification** (`server/llm-tagger.js: classifyTag()`):
        - 3-tier system: DB lookup → taxonomy pattern matching → LLM classification for manually-typed tags.
    - **LLM-powered tagging system** using GPT-4o-mini:
        - Utilizes complete taxonomy as context, enforces strict rules for category paths and tags.
        - Self-learning workflow: LLM suggestions approved by user are saved to database with `llm_discovered=1`.
    - **Hierarchical Category Builder**:
        - Manual category path editor with cascading dropdowns in LLM Review modal.
        - Real-time loading of category relationships to ensure valid paths.
        - Editable AI-suggested paths with individual delete buttons for segments.
        - Inline category creation with "+ Add New" buttons for missing categories, updating taxonomy in real-time.
    - LLM caching system to prevent duplicate API calls.
    - Database operations (`server/storage.js`) include a 3-stage save pipeline.
    - **Database Seeding**: One-click "🌱 Seed Taxonomy" button to populate the database with the complete taxonomy, preserving LLM-discovered tags on re-seed.
    - Category path uniqueness fixed to use full ancestral paths and `ON CONFLICT` handling for duplicate slugs.
    - Category schema fixed to allow duplicate category names under different parents.

## External Dependencies
- **Electron Framework**: Core application framework.
- **Xvfb**: Virtual display server for headless Electron execution.
- **VNC**: For displaying desktop application output in the Replit environment.
- **PostgreSQL**: Database for storing product, category, and tag data (with Drizzle ORM).
- **OpenAI API**: Used for LLM-powered tagging (GPT-4o-mini).
- **Third-party CDNs**: Integrated with specific upgrade patterns and handlers for Shopify, Scene7, Mozu, Etsy, IKEA, Alibaba Cloud, LTWEBSTATIC, Swarovski, Cloudinary, Imgix, ImageKit, Fastly.
- **Gtk3, gsettings-desktop-schemas, glib, dconf**: System dependencies for Electron on NixOS.