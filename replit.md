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

## Recent Changes
- **Scoring Threshold Adjustment**: Lowered small width penalty from 500px to 300px threshold to accept quality product images (320px-480px range now passes scoring)
- **Flexible Pattern Matching**: Added CSS attribute selectors `[class*="pattern"]` to catch gallery variations across sites (e.g., lululemon's `product-media-slides_slide_image`)
- **Selector Optimization**: Replaced overly broad selectors with targeted patterns while maintaining comprehensive coverage - improved performance from 60+ to 8-15 images
- **Container Tracking Bug Fix**: Fixed critical hi-res augmentation bug that was causing high-quality images to lose gallery bonuses and get rejected (scores dropped from 205 to 8)
- **Urban Outfitters Custom Handler**: Created dedicated custom handler for Urban Outfitters with PWA container targeting and $redesign-zoom-5x$ quality upgrades
- **PWA Pattern Recognition**: Added comprehensive wildcard pattern support for Progressive Web App containers across multiple ecommerce sites
- **Container Bonus System**: Enhanced gallery detection with +100 point bonuses for primary product containers from proven custom handlers
- **Hi-Res Augmentation Expansion**: Extended scope selectors to include battle-tested patterns from Nike, Adidas, American Eagle, and other major retailers
- **LQIP Detection System**: Implemented comprehensive Low Quality Image Placeholder detection with automatic high-resolution upgrades
- **Enhanced Brand Detection**: Replaced simple brand logic with comprehensive detection including JSON-LD, meta tags, breadcrumbs, URL patterns, and title analysis
- **CDN Pattern Recognition**: Added support for 12+ major CDNs including Cloudinary, Imgix, ImageKit, Fastly, and e-commerce platforms
- **Image Quality Scoring**: Enhanced scoring system with LQIP penalties and high-resolution upgrade bonuses
- Installed system dependencies for Electron GUI support
- Configured virtual display setup for Replit environment
- Added deployment configuration as VM target

## User Preferences
- Prefers existing project structure and conventions
- Focus on functionality over documentation

## Deployment
- Target: VM (always running)
- Command: `./start-electron.sh`
- Suitable for desktop applications requiring persistent state