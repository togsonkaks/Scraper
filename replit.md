# Tagglo Electron App

## Overview
Tagglo is a desktop Electron application designed for web scraping e-commerce product data. Its primary purpose is multi-field data extraction (title, price, images, specs, tags, brand, description) from product detail pages, featuring persistent selector memory, history tracking, and custom site-specific handlers. A key capability is its advanced auto-tagging system, which utilizes a database-centric taxonomy for intelligent product categorization and keyword extraction. The project aims to provide a robust solution for efficient and accurate e-commerce data acquisition and enrichment.

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
    - **Demographic Tags for Personalization**: Gender (women's, men's, unisex, lady, ladies) and age (kids, baby, teen) stored exclusively as tags, not in category structure.
    - Auto-tagger engine (`scrapers/auto-tagger.js`):
        - Keyword extraction from URL slugs and JSON-LD.
        - Weighted search priority (title, URL, breadcrumbs, JSON-LD > specs, brand > description).
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