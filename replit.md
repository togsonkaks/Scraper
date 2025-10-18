# Tagglo Electron App

## Overview
Tagglo is a desktop Electron application for web scraping e-commerce product data. It focuses on multi-field data extraction (title, price, images, specs, tags, brand, description) from product detail pages, featuring persistent selector memory, history tracking, and custom site-specific handlers. A core capability is its advanced auto-tagging system, which uses a database-centric taxonomy for intelligent product categorization and keyword extraction. The project aims to provide a robust solution for efficient and accurate e-commerce data acquisition and enrichment, with ambitions for market potential in e-commerce data acquisition.

## User Preferences
- Prefers existing project structure and conventions
- Focus on functionality over documentation

## System Architecture
The application is an Electron-based desktop application utilizing a main process, a renderer process, and a preload script for secure IPC. Scraping logic is modularized for different data types. The system is configured for deployment on Replit using Node.js, Xvfb, and VNC.

**UI/UX Decisions:**
- Pinterest-style flow for product detail page scraping.
- Granular field clear buttons.
- Mobile preview interface.
- Blue info panel for JSON-LD display.
- Review & Edit UI modal for LLM-suggested tags and categories.
- Browser navigation controls: Back button (navigate history) and Copy Link button (copy current URL to clipboard).

**Technical Implementations & Feature Specifications:**
- **State Management**: Prevents data cross-contamination during scraping.
- **Selector Memory**: Persistent, file-based storage of CSS selectors per domain with history and auto-migration.
- **Core Scraping Systems**:
    - Multi-strategy price detection, prioritizing meta tags and product container boundaries.
    - Title & brand extraction from JSON-LD, meta tags, breadcrumbs, and URLs.
    - Advanced image discovery, scoring, and lazy-loading support.
    - Custom handlers for major retailers and CDN upgrades.
    - Multi-stage junk detection and quality thresholds.
    - Canonical URL-based deduplication.
    - Intelligent description and specs extraction, including hidden content and fluff filtering.
    - Enhanced breadcrumb processing.
    - Multi-strategy SKU extraction with brand-aware validation.
- **CDN Upgrade Patterns**: Rules for optimizing image quality and dimensions across various CDNs.
- **Auto-Tagging System**:
    - Database-centric taxonomy (7-table PostgreSQL architecture with Drizzle ORM) for products, categories, and tags.
    - **Universal Category System**: Gender-neutral categories (e.g., "Fashion > Accessories > Bags").
    - **Demographic Tags**: Gender and age stored exclusively as tags for personalization, not in category structure.
    - Auto-tagger engine: Keyword extraction from URL slugs and JSON-LD, weighted category scoring (Title >> URL > Breadcrumbs > Specs > Description).
    - Comprehensive 5-tier gender detection and age tag detection.
    - Smart color detection, universal plural/singular matching (applied to all category names, synonym keys, and tag names), hierarchical path building.
    - Category-aware tag filtering by department.
    - **Self-Learning Category Synonym System**: Database table `category_synonyms` stores user-taught synonym mappings. The "Teach a Synonym" section is always visible in the LLM Review modal, with smart keyword suggestions for mapping.
    - **Multi-Word Synonym System**: Checks if ALL words in a phrase are present anywhere in product text (not necessarily adjacent). Example: "slouchy bag" matches "Hazel Slouchy Suede Bag" even though words aren't side-by-side. Multi-word matches receive a +5000 scoring boost to ensure specific categories (e.g., "Handbag") beat generic parent categories (e.g., "Bags"). Configured for bag types (slouchy bag, crossbody bag, shoulder bag), pants styles (cargo pants, jogger pants), jackets (bomber jacket, puffer jacket), and footwear (ankle boots, chelsea boots).
    - **Compound Material Detection**: Detects multi-word materials (faux leather, vegan leather, organic cotton) before single-word materials to prevent incorrect tagging. Example: "faux leather" is tagged as "faux-leather" (synthetic) rather than "leather" (genuine). Base materials are blocked when compound materials are found.
    - **Tag Taxonomy Reorganization**: Separated colors, finishes, and patterns into distinct tag categories. Implemented Canonical Tag System to deduplicate tag variations (e.g., "stripe" → "striped"). Added Neckline & Sleeve tags.
    - **Smart Tag Classification**: 3-tier system: DB lookup → taxonomy pattern matching → LLM classification.
    - **LLM-powered tagging system** (GPT-4o-mini): Utilizes complete taxonomy context, enforces strict rules for category paths and tags. LLM suggestions approved by user are saved with `llm_discovered=1`.
    - **Hierarchical Category Builder**: Manual category path editor with cascading dropdowns, real-time loading of relationships, editable AI-suggested paths, and inline category creation.
    - LLM caching system.
    - Database operations with a 3-stage save pipeline.
    - **Database Seeding**: "Seed Taxonomy" button populates the database, preserving LLM-discovered tags on re-seed.
    - Duplicate prevention system for categories with standardized slug generation and database UNIQUE constraints.

## External Dependencies
- **Electron Framework**: Core application.
- **Xvfb**: Virtual display server for headless Electron.
- **VNC**: For displaying desktop application output in Replit.
- **PostgreSQL**: Database for product, category, and tag data (with Drizzle ORM).
- **OpenAI API**: For LLM-powered tagging (GPT-4o-mini).
- **Third-party CDNs**: Integrated with specific upgrade patterns and handlers (e.g., Shopify, Scene7, Mozu, Etsy, IKEA, Alibaba Cloud, LTWEBSTATIC, Swarovski, Cloudinary, Imgix, ImageKit, Fastly).
- **Gtk3, gsettings-desktop-schemas, glib, dconf**: System dependencies for Electron on NixOS.