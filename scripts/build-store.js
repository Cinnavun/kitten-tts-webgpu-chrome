// Build store package (local script)
// Run with: npm run build:store or node scripts/build-store.js

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Files/folders to INCLUDE in the store package
const includeItems = [
  'manifest.json',
  'background.js',
  'content.js',
  'offscreen.html',
  'sidepanel.html',
  'sidepanel.css',
  'icons',
  'models',
  'assets',
  'dist'
];

// Create output ZIP
const output = fs.createWriteStream('kitten-tts-webgpu-chrome-store.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

console.log('📦 Building store package...');
console.log('');

archive.pipe(output);

// Add each required file/folder
includeItems.forEach(item => {
  const fullPath = path.join(__dirname, '..', item);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  Warning: ${item} not found`);
    return;
  }
  
  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    archive.directory(fullPath, item);
    console.log(`✓ Added folder: ${item}/`);
  } else {
    archive.file(fullPath, { name: item });
    console.log(`✓ Added file: ${item}`);
  }
});

archive.on('end', () => {
  const size = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log('');
  console.log('✅ Store package created!');
  console.log(`📁 kitten-tts-webgpu-chrome-store.zip (${size} MB)`);
  console.log('');
  console.log('📋 Ready to upload to Chrome Web Store at:');
  console.log('   https://chrome.google.com/webstore/devconsole/');
});

archive.on('error', (err) => {
  console.error('❌ Error creating package:', err);
  process.exit(1);
});

archive.finalize();
