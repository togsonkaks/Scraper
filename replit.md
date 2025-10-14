# Tagglo Electron App

## Overview
Tagglo is a desktop Electron application for web scraping e-commerce product data. It features a Control Window for managing operations and a Product Window for viewing target websites. The project focuses on robust, multi-field data extraction (title, price, images, specs, tags, brand, description), persistent selector memory, history tracking, and custom site-specific handlers, specifically optimized for product detail page scraping. It also includes an advanced auto-tagging system with a database-centric taxonomy for product categorization and keyword extraction.

## User Preferences
- Prefers existing project structure and conventions
- Focus on functionality over documentation

## System Architecture
The application is built on the Electron framework, using a main process (`main.js`), a renderer process (`control.html`), and a `preload.js` script for secure IPC. Scraping logic is modularized in a `scrapers` directory with an `orchestrator.js` and specialized modules for data types. The system is configured for deployment on Replit using Node.js, Xvfb, and VNC.

**UI/UX Decisions:**
- Pinterest-style flow optimized for product detail page scraping.
- Individual field clear buttons for granular selector management.
- Mobile preview interface.
- New blue info panel to display JSON-LD fields below the URL.
- Review & Edit UI modal for LLM-suggested tags and categories.

**Technical Implementations & Feature Specifications:**
- **State Management**: Product ID clearing on new scrape prevents cross-contamination between products (Oct 2025)
- **Selector Memory**: Persistent, file-based storage of CSS selectors per domain with history and auto-migration.
- **Core Scraping Systems**:
    - **Price Detection**: Multi-strategy extraction with custom handlers.
    - **Title & Brand Extraction**: Utilizes JSON-LD, meta tags, breadcrumbs, and URL patterns.
    - **Image Discovery & Scoring**: Site-specific selectors, generic fallbacks, scoring algorithm considering size, quality, semantic penalties, lazy-loading support, and dimension-based quality filtering.
    - **Custom Handlers**: Specialized logic for major retailers (e.g., Amazon, Nike, Adidas) for enhanced extraction and CDN upgrades.
    - **Filtering Systems**: Multi-stage junk detection, Shopify intelligence, quality thresholds.
    - **Deduplication**: Canonical URL grouping with score-based selection.
    - **Description & Specs Extraction**: Intelligent extraction targeting hidden accordion content, fluff filtering, and dedicated specs fields.
    - **Breadcrumb Processing**: Enhanced cleaning, expanded junk filtering, and position-based scoring; smart word splitting.
    - **SKU Extraction**: Multi-strategy approach using JSON-LD, meta tags, DOM attributes, and URL parsing, with brand-aware validation.
- **CDN Upgrade Patterns**: Specific rules for optimizing image quality and dimensions across various CDNs (e.g., Shopify, Urban Outfitters, Temu, IKEA).
- **Auto-Tagging System**:
    - Database-centric taxonomy with 7-table PostgreSQL architecture (Drizzle ORM) including `products_raw`, `products`, `products_enriched`, `categories`, `tags` (with llm_discovered flag), `product_tags`, and `product_categories`.
    - Products table stores: title, brand, SKU, price, category, gender, description, tags, specs, images, and confidence scores
    - **Comprehensive Universal Taxonomy** (346+ categories, 955+ tags) covering 19 major e-commerce verticals:
        - **Categories**: Tools & Hardware, Automotive, Sports & Outdoors, Kitchen & Dining, Home & Garden, Beauty & Personal Care, Electronics, Pet Supplies, Toys & Games, Office & School, Health & Wellness, Fashion, Baby & Kids, Books & Media, Grocery & Food, Jewelry & Watches, Luggage & Travel, Musical Instruments, Arts & Crafts
        - **Tags by Type**: features (154), materials (114), colors (116), styles (123), activities (138), fit (57), occasions (65), tool-types (79), automotive (68), kitchen (39), beauty (53)
        - Hierarchical categories with 4-5 levels (e.g., Tools & Hardware > Power Tools > Saws > Concrete Masonry Saws)
        - Specialized tags for power tools (cordless, brushless-motor, lithium-ion, masonry), automotive (OEM, aftermarket, performance), kitchen (non-stick, dishwasher-safe), beauty (SPF, cruelty-free), and all major product types
    - **Auto-tagger engine** (`scrapers/auto-tagger.js`):
        - **URL Parsing**: Extracts keywords from product URL slug (e.g., "green" from "/jacket-green/") to catch colors/attributes missing from text
        - **Weighted Search Priority**: 3-tier system - Tier 1 (title, URL, breadcrumbs) > Tier 2 (specs, brand) > Tier 3 (description)
        - **Comprehensive Gender Detection** (`detectGender()` unified function):
            - 50+ exhaustive keywords per gender (women: woman/lady/mom/daughter/bride/femme; men: man/gentleman/dad/son/groom/homme; plus kids/unisex)
            - **4-tier search priority** with confidence scoring:
                - **Tier 1 (high)**: Title + URL keywords - cleanest, most reliable signals
                - **Tier 2 (medium)**: Breadcrumbs + Specs - structured metadata
                - **Tier 3 (low)**: Description - may contain noise
                - **Tier 4 (fallback)**: Category path extraction (e.g., "Fashion > Women" → women)
            - Returns `{ gender, source, confidence }` for full transparency
            - Used by both auto-tagger (early for category filtering) and save operation (final with category fallback)
            - Prevents "men" matching "women" via word-boundary regex
        - **Category-Aware Tag Filtering**: Blocks nonsense tags based on department (e.g., removes "construction" activity tags from Fashion products)
        - **Category Matching**: Searches for category NAMES (not paths) in ALL product data (title, description, breadcrumbs, specs, URL) - identical logic to tag matching
        - **Tag Matching**: Word-boundary regex matching across all product text for 955+ tags
        - When category name found (e.g., "Jeans") → Automatically builds FULL hierarchical path from database ("Fashion > Men > Clothing > Bottoms > Jeans")
        - Works with OR without breadcrumbs - finds categories anywhere in product data
        - Achieves 80%+ auto-tag success rate with confidence scoring
    - **Smart Tag Classification** (`server/llm-tagger.js: classifyTag()`):
        - 3-tier classification system for manually-typed tags: DB lookup → taxonomy pattern matching → LLM classification
        - DB Lookup: Checks if tag exists in database, returns existing type (prevents duplicates)
        - Pattern Matching: Recognizes materials, colors, fit, styles, activities using regex patterns
        - LLM Fallback: Uses GPT-4o-mini to classify unknown tags into proper type (materials, colors, fit, styles, features, activities, occasions, tool-types, automotive, kitchen, beauty)
        - Preserves llm_discovered flag when tag exists in DB
        - Only marks truly new tags with llm_discovered=1 for custom taxonomy growth
    - Integrated workflow: Scrape → Auto-Tag → Preview → Save
    - Optional LLM enhancement for low-confidence products (manual trigger only)
    - **LLM-powered tagging system** using GPT-4o-mini:
        - Loads complete taxonomy from database (358 categories + 955 tags) and sends as context
        - Enforces strict rules: Categories END at product type (Jeans, Shoes), fit/style terms (tapered, slim-fit) are TAGS
        - Returns COMPLETE category paths with ALL parent levels (Fashion > Men > Clothing > Bottoms > Jeans)
        - Self-learning workflow: LLM suggests new tags → Shows in Review modal → User approves → Saves to database with llm_discovered=1
        - Validates suggested paths against existing taxonomy before marking as "EXISTING"
    - **Hierarchical Category Builder** (Oct 2025):
        - Manual category path editor with cascading dropdowns in LLM Review modal
        - 5-level dropdown hierarchy: Department > Gender > Section > Category > Type
        - Loads real-time category relationships from database
        - Each dropdown shows only valid children of selected parent (prevents invalid paths)
        - Preview shows full path before adding (e.g., "Fashion > Men > Clothing > Tops > Shirt")
        - Saved paths automatically create full parent_id chain in database with llm_discovered=1
        - Triggers refreshTaxonomy() after save so auto-tagger learns immediately
        - Creates self-learning taxonomy loop: User corrections → Database → Auto-tagger knowledge
    - **Editable AI-Suggested Paths** (Oct 2025):
        - AI category suggestions display with individual ❌ delete buttons on each path segment
        - Users can remove ANY segment (not just last one) for granular path editing
        - Provides full control over AI suggestions before accepting
    - **Inline Category Creation** (Oct 2025):
        - "+ Add New" buttons in each dropdown level for missing categories
        - Creates categories with proper parent_id linking, level assignment, and llm_discovered=1 flag
        - Immediately refreshes taxonomy so auto-tagger learns new categories
        - Critical database operations: validates parent existence, prevents duplicates, auto-generates slugs
        - Self-learning loop: User adds missing category → Database → Auto-tagger knowledge → Future products auto-tagged
    - LLM caching system prevents duplicate API calls for same product URL (saves to AppData/Roaming/Tagglo/llm_cache)
    - Database operations (`server/storage.js`) include a 3-stage save pipeline with full hierarchy path storage
    - **Database Seeding**: One-click "🌱 Seed Taxonomy" button in Control Window populates database with complete 358 categories + 955 tags using app's stable database connection (bypasses standalone script connection issues); preserves LLM-discovered tags on re-seed (DELETE WHERE llm_discovered = 0)
    - **Category Path Uniqueness Fix** (Oct 2025): Fixed seed script to use full ancestral paths (Fashion:Men:Clothing vs Fashion:Women:Clothing) as unique keys to prevent parent_id mismatches; added ON CONFLICT handling in storage.js for graceful duplicate slug management

## External Dependencies
- **Electron Framework**: Core application framework.
- **Xvfb**: Virtual display server for headless Electron execution in Replit.
- **VNC**: For displaying the desktop application output in the Replit environment.
- **PostgreSQL**: Database for storing product, category, and tag data, utilizing Drizzle ORM.
- **OpenAI API**: Used for LLM-powered tagging (specifically GPT-4o-mini).
- **Third-party CDNs**: Integrated with specific upgrade patterns and handlers for Shopify, Scene7, Mozu, Etsy, IKEA, Alibaba Cloud, LTWEBSTATIC, Swarovski, Cloudinary, Imgix, ImageKit, Fastly.
- **Gtk3, gsettings-desktop-schemas, glib, dconf**: System dependencies for Electron to run in NixOS.