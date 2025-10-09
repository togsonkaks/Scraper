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