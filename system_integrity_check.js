#!/usr/bin/env node
/**
 * ⚠️ TAGGLO SYSTEM INTEGRITY CHECK ⚠️
 * 
 * This script validates that all critical scraping functionality is intact.
 * Run this after any major changes to detect missing functionality.
 * 
 * Usage: node system_integrity_check.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 STARTING TAGGLO SYSTEM INTEGRITY CHECK...\n');

let issuesFound = 0;

// Check critical files exist
const criticalFiles = [
  'scrapers/orchestrator.js',
  'scrapers/custom.js', 
  'main.js',
  'control.html',
  'preload.js'
];

console.log('📁 CHECKING CRITICAL FILES:');
criticalFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING!`);
    issuesFound++;
  }
});

// Check orchestrator.js for critical functions and patterns
if (fs.existsSync('scrapers/orchestrator.js')) {
  console.log('\n🔧 CHECKING ORCHESTRATOR.JS CRITICAL PATTERNS:');
  const orchestratorContent = fs.readFileSync('scrapers/orchestrator.js', 'utf8');
  
  const criticalPatterns = [
    { name: 'Mozu CDN upgrade', pattern: /cdn-tp3\.mozu\.com.*\?quality=60/i },
    { name: 'Shopify CDN upgrade', pattern: /_1020x/i },
    { name: 'Shocho CDN upgrade', pattern: /cdn\.shocho\.co/i },
    { name: 'upgradeCDNUrl function', pattern: /function upgradeCDNUrl/i },
    { name: 'scoreImageURL function', pattern: /function scoreImageURL/i },
    { name: 'hybridUniqueImages function', pattern: /function hybridUniqueImages/i },
    { name: 'isJunkImage function', pattern: /function isJunkImage/i },
    { name: 'JUNK_IMG pattern', pattern: /const JUNK_IMG = /i },
    { name: 'canonicalKey function', pattern: /const canonicalKey = /i }
  ];
  
  criticalPatterns.forEach(({ name, pattern }) => {
    if (pattern.test(orchestratorContent)) {
      console.log(`  ✅ ${name}`);
    } else {
      console.log(`  ❌ ${name} - MISSING!`);
      issuesFound++;
    }
  });
}

// Check custom.js for major site handlers
if (fs.existsSync('scrapers/custom.js')) {
  console.log('\n🏪 CHECKING CUSTOM HANDLERS:');
  const customContent = fs.readFileSync('scrapers/custom.js', 'utf8');
  
  const majorSiteHandlers = [
    { name: 'Amazon (AMZ)', pattern: /const AMZ = \{/i },
    { name: 'Nike', pattern: /const NIKE = \{/i },
    { name: 'Adidas', pattern: /const ADIDAS = \{/i },
    { name: 'Home Depot', pattern: /const HOMEDEPOT = \{/i },
    { name: 'AliExpress', pattern: /const ALIEXPRESS = \{/i },
    { name: 'Registry array', pattern: /const REGISTRY = \[/i }
  ];
  
  majorSiteHandlers.forEach(({ name, pattern }) => {
    if (pattern.test(customContent)) {
      console.log(`  ✅ ${name}`);
    } else {
      console.log(`  ❌ ${name} - MISSING!`);
      issuesFound++;
    }
  });
}

// Check main.js for selector memory system
if (fs.existsSync('main.js')) {
  console.log('\n🧠 CHECKING SELECTOR MEMORY SYSTEM:');
  const mainContent = fs.readFileSync('main.js', 'utf8');
  
  const memoryPatterns = [
    { name: 'readSelectorFile function', pattern: /function readSelectorFile/i },
    { name: 'writeSelectorFile function', pattern: /function writeSelectorFile/i },
    { name: 'SELECTORS_DIR constant', pattern: /const SELECTORS_DIR = /i },
    { name: 'IPC memory handlers', pattern: /ipcMain\.handle\('memory-/i }
  ];
  
  memoryPatterns.forEach(({ name, pattern }) => {
    if (pattern.test(mainContent)) {
      console.log(`  ✅ ${name}`);
    } else {
      console.log(`  ❌ ${name} - MISSING!`);
      issuesFound++;
    }
  });
}

// Final results
console.log('\n📊 INTEGRITY CHECK RESULTS:');
if (issuesFound === 0) {
  console.log('🎉 ✅ ALL SYSTEMS INTACT - No critical functionality missing!');
  console.log('🛡️ Your Tagglo system is fully protected and operational.');
  process.exit(0);
} else {
  console.log(`🚨 ❌ ${issuesFound} CRITICAL ISSUES FOUND!`);
  console.log('🔧 Please restore missing functionality or check replit.md for guidance.');
  process.exit(1);
}