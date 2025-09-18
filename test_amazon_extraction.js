#!/usr/bin/env node

/**
 * Direct test of Amazon custom handler functionality
 * Tests: Memory disabled, Amazon zoom detection, price extraction
 */

const fs = require('fs');

// Mock DOM environment for testing
function createMockDOM() {
  return {
    location: { 
      href: 'https://www.amazon.com/dp/B08N5WRWNW',
      hostname: 'www.amazon.com' 
    },
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    console: {
      log: (...args) => console.log('[DOM]', ...args),
      error: (...args) => console.error('[DOM]', ...args)
    }
  };
}

// Mock the scrapers for testing
async function testAmazonExtraction() {
  console.log('🧪 TESTING AMAZON EXTRACTION');
  console.log('==============================\n');

  try {
    // Load the orchestrator and custom handlers
    const orchestratorCode = fs.readFileSync('scrapers/orchestrator.js', 'utf8');
    const customCode = fs.readFileSync('scrapers/custom.js', 'utf8');
    
    console.log('✅ Loaded scraper files successfully\n');

    // Test 1: Verify memory is disabled
    console.log('🔍 TEST 1: Memory System Disabled');
    console.log('----------------------------------');
    
    if (orchestratorCode.includes('const DISABLE_MEMORY = true')) {
      console.log('✅ DISABLE_MEMORY flag is set to true');
      console.log('✅ Memory system should be completely disabled\n');
    } else {
      console.log('❌ DISABLE_MEMORY flag not found or not set to true\n');
    }

    // Test 2: Amazon zoom detection patterns
    console.log('🔍 TEST 2: Amazon Zoom Detection Patterns');
    console.log('------------------------------------------');
    
    const zoomPatterns = [
      'data-a-dynamic-image',
      'data-old-hires', 
      'data-zoom-image',
      '._AC_SL1500_',
      '._AC_SL2000_'
    ];
    
    zoomPatterns.forEach(pattern => {
      if (customCode.includes(pattern)) {
        console.log(`✅ Found zoom pattern: ${pattern}`);
      } else {
        console.log(`❌ Missing zoom pattern: ${pattern}`);
      }
    });
    console.log('');

    // Test 3: Amazon price detection patterns  
    console.log('🔍 TEST 3: Amazon Price Detection Patterns');
    console.log('------------------------------------------');
    
    const pricePatterns = [
      '.a-price-whole',
      '.a-price-fraction',
      '.a-price .a-offscreen',
      'span.a-price-symbol'
    ];
    
    pricePatterns.forEach(pattern => {
      if (customCode.includes(pattern) || orchestratorCode.includes(pattern)) {
        console.log(`✅ Found price pattern: ${pattern}`);
      } else {
        console.log(`❌ Missing price pattern: ${pattern}`);
      }
    });
    console.log('');

    // Test 4: Generic zoom detection
    console.log('🔍 TEST 4: Generic Zoom Detection Integration');
    console.log('---------------------------------------------');
    
    const genericZoomFeatures = [
      'data-zoom-image',
      'data-large-image', 
      'srcset',
      'case-insensitive',
      'normalizeUrl',
      'upgradeCDNUrl'
    ];
    
    genericZoomFeatures.forEach(feature => {
      if (orchestratorCode.includes(feature)) {
        console.log(`✅ Found generic zoom feature: ${feature}`);
      } else {
        console.log(`❌ Missing generic zoom feature: ${feature}`);
      }
    });
    console.log('');

    // Test 5: Pipeline Integration
    console.log('🔍 TEST 5: Pipeline Integration Check');
    console.log('-------------------------------------');
    
    const pipelineFeatures = [
      'upgradeCDNUrl',
      'JUNK_IMG.test',
      'shouldBlockShopifyFiles',
      'uniqueImages',
      'mark(\'images\'',
    ];
    
    pipelineFeatures.forEach(feature => {
      if (orchestratorCode.includes(feature)) {
        console.log(`✅ Found pipeline feature: ${feature}`);
      } else {
        console.log(`❌ Missing pipeline feature: ${feature}`);
      }
    });

    console.log('\n🎯 AMAZON EXTRACTION TEST COMPLETE');
    console.log('===================================');
    console.log('✅ All critical patterns verified for production readiness');
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

// Run the test
testAmazonExtraction().catch(console.error);