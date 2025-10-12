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
    - Comprehensive category tree (158 hierarchical categories) and tag taxonomy (335 tags by semantic type) loaded from PostgreSQL.
    - Auto-tagger engine (`scrapers/auto-tagger.js`) uses priority matching (breadcrumbs → keyword detection → confidence scoring).
    - Integrated workflow: Scrape → Auto-Tag → Preview → Save.
    - Optional LLM enhancement for low-confidence products.
    - LLM-powered tagging system using GPT-4o-mini for intelligent tag/category extraction with human review workflow. Prioritizes JSON-LD structured data.
    - Database operations (`server/storage.js`) include a 3-stage save pipeline.

## External Dependencies
- **Electron Framework**: Core application framework.
- **Xvfb**: Virtual display server for headless Electron execution in Replit.
- **VNC**: For displaying the desktop application output in the Replit environment.
- **PostgreSQL**: Database for storing product, category, and tag data, utilizing Drizzle ORM.
- **OpenAI API**: Used for LLM-powered tagging (specifically GPT-4o-mini).
- **Third-party CDNs**: Integrated with specific upgrade patterns and handlers for Shopify, Scene7, Mozu, Etsy, IKEA, Alibaba Cloud, LTWEBSTATIC, Swarovski, Cloudinary, Imgix, ImageKit, Fastly.
- **Gtk3, gsettings-desktop-schemas, glib, dconf**: System dependencies for Electron to run in NixOS.