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
    - Database-centric taxonomy with 8-table PostgreSQL architecture (Drizzle ORM) including `products_raw`, `products`, `products_enriched`, `categories`, `tags`, `tag_taxonomy`, `product_tags`, and `product_categories`.
    - **Comprehensive Universal Taxonomy** (346+ categories, 955+ tags) covering 19 major e-commerce verticals:
        - **Categories**: Tools & Hardware, Automotive, Sports & Outdoors, Kitchen & Dining, Home & Garden, Beauty & Personal Care, Electronics, Pet Supplies, Toys & Games, Office & School, Health & Wellness, Fashion, Baby & Kids, Books & Media, Grocery & Food, Jewelry & Watches, Luggage & Travel, Musical Instruments, Arts & Crafts
        - **Tags by Type**: features (154), materials (114), colors (116), styles (123), activities (138), fit (57), occasions (65), tool-types (79), automotive (68), kitchen (39), beauty (53)
        - Hierarchical categories with 4-5 levels (e.g., Tools & Hardware > Power Tools > Saws > Concrete Masonry Saws)
        - Specialized tags for power tools (cordless, brushless-motor, lithium-ion, masonry), automotive (OEM, aftermarket, performance), kitchen (non-stick, dishwasher-safe), beauty (SPF, cruelty-free), and all major product types
    - **Auto-tagger engine** (`scrapers/auto-tagger.js`):
        - **Category Matching**: Searches for category NAMES (not paths) in ALL product data (title, description, breadcrumbs, specs, JSON-LD) - identical logic to tag matching
        - **Tag Matching**: Word-boundary regex matching across all product text for 955+ tags
        - When category name found (e.g., "Jeans") → Automatically builds FULL hierarchical path from database ("Fashion > Men > Clothing > Bottoms > Jeans")
        - Works with OR without breadcrumbs - finds categories anywhere in product data
        - Achieves 80%+ auto-tag success rate with confidence scoring
    - Integrated workflow: Scrape → Auto-Tag → Preview → Save
    - Optional LLM enhancement for low-confidence products (manual trigger only)
    - **LLM-powered tagging system** using GPT-4o-mini:
        - Loads complete taxonomy from database (358 categories + 955 tags) and sends as context
        - Enforces strict rules: Categories END at product type (Jeans, Shoes), fit/style terms (tapered, slim-fit) are TAGS
        - Returns COMPLETE category paths with ALL parent levels (Fashion > Men > Clothing > Bottoms > Jeans)
        - Self-learning: Auto-adds new tags to database with correct type classification (e.g., "indigo" → type: colors)
        - Validates suggested paths against existing taxonomy before marking as "EXISTING"
    - LLM caching system prevents duplicate API calls for same product URL (saves to AppData/Roaming/Tagglo/llm_cache)
    - Database operations (`server/storage.js`) include a 3-stage save pipeline with full hierarchy path storage

## External Dependencies
- **Electron Framework**: Core application framework.
- **Xvfb**: Virtual display server for headless Electron execution in Replit.
- **VNC**: For displaying the desktop application output in the Replit environment.
- **PostgreSQL**: Database for storing product, category, and tag data, utilizing Drizzle ORM.
- **OpenAI API**: Used for LLM-powered tagging (specifically GPT-4o-mini).
- **Third-party CDNs**: Integrated with specific upgrade patterns and handlers for Shopify, Scene7, Mozu, Etsy, IKEA, Alibaba Cloud, LTWEBSTATIC, Swarovski, Cloudinary, Imgix, ImageKit, Fastly.
- **Gtk3, gsettings-desktop-schemas, glib, dconf**: System dependencies for Electron to run in NixOS.