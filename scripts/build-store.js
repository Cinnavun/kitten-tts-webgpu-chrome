#!/usr/bin/env node
/**
 * scripts/build-store.js
 *
 * Generates a clean staging folder (default: dist-store/) containing strictly
 * the necessary Chrome Web Store submission files for testing unpacked before zipping.
 *
 * Usage:
 *   node scripts/build-store.js            # Generates dist-store/
 *   node scripts/build-store.js --zip      # Generates dist-store/ AND kitten-tts-webgpu-chrome-store.zip
 *   node scripts/build-store.js --zip-only # Zips existing dist-store/ without re-copying
 *   node scripts/build-store.js --out my-store-dir
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Command line arguments
const args = process.argv.slice(2);
const shouldZipOnly = args.includes('--zip-only');
const shouldZip = args.includes('--zip') || shouldZipOnly;

let outputDirName = 'dist-store';
const outIndex = args.findIndex(a => a === '--out' || a === '--output');
if (outIndex !== -1 && args[outIndex + 1]) {
  outputDirName = args[outIndex + 1];
}

let zipFileName = 'kitten-tts-webgpu-chrome-store.zip';
const zipFileIndex = args.findIndex(a => a === '--zip-file');
if (zipFileIndex !== -1 && args[zipFileIndex + 1]) {
  zipFileName = args[zipFileIndex + 1];
}

const TARGET_DIR = path.resolve(PROJECT_ROOT, outputDirName);
const ZIP_PATH = path.resolve(PROJECT_ROOT, zipFileName);

// Files and folders strictly required for the extension runtime
const REQUIRED_ITEMS = [
  { path: 'manifest.json', type: 'file', required: true },
  { path: 'sidepanel.html', type: 'file', required: true },
  { path: 'sidepanel.css', type: 'file', required: true },
  { path: 'offscreen.html', type: 'file', required: true },
  { path: 'content.js', type: 'file', required: true },
  { path: 'LICENSE', type: 'file', required: false },
  { path: 'icons', type: 'dir', required: true },
  { path: 'models', type: 'dir', required: true },
  { path: 'dist', type: 'dir', required: true }
];

// Critical internal assets within folders that must exist for functional validation
const CRITICAL_INTERNAL_CHECKS = [
  'dist/background.js',
  'dist/sidepanel.js',
  'dist/offscreen.js',
  'dist/extractor.js',
  'dist/worker.js',
  'dist/espeak-en-dict.tsv',
  'dist/en_rules',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'models/kitten_tts_nano_v0_8.onnx',
  'models/voices.npz'
];

/**
 * Calculates total size and count of files in a directory recursively.
 */
function getDirectoryStats(dirPath) {
  let totalSize = 0;
  let fileCount = 0;

  function traverse(current) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile()) {
        fileCount++;
        totalSize += fs.statSync(fullPath).size;
      }
    }
  }

  traverse(dirPath);
  return { totalSize, fileCount };
}

/**
 * Format bytes to readable human-friendly string.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Compresses target directory into a ZIP file using platform utilities or archiver if present.
 */
function createZip(sourceDir, destZip) {
  console.log(`\n📦 Compressing '${outputDirName}' into '${path.basename(destZip)}'...`);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Cannot create zip: source directory '${sourceDir}' does not exist.`);
  }

  // Remove existing zip if present
  if (fs.existsSync(destZip)) {
    fs.unlinkSync(destZip);
  }

  // Attempt 1: If archiver package is available
  try {
    const archiver = require('archiver');
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destZip);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  } catch (_) {
    // Archiver not installed - proceed to native OS tools
  }

  // Attempt 2: Windows PowerShell with System.IO.Compression (forces standard forward slashes in ZIP paths)
  if (process.platform === 'win32') {
    const psScript = `
      Add-Type -AssemblyName System.IO.Compression;
      Add-Type -AssemblyName System.IO.Compression.FileSystem;
      $target = (Resolve-Path '${sourceDir}').Path;
      $archive = [System.IO.Compression.ZipFile]::Open('${destZip}', [System.IO.Compression.ZipArchiveMode]::Create);
      $files = Get-ChildItem -Path $target -Recurse -File;
      foreach ($f in $files) {
        $rel = $f.FullName.Substring($target.Length).TrimStart('\\', '/') -replace '\\\\', '/';
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;
      }
      $archive.Dispose();
    `.replace(/\r?\n\s*/g, ' ');

    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      stdio: 'inherit'
    });

    if (result.status !== 0 || !fs.existsSync(destZip)) {
      throw new Error(`Failed to create ZIP using PowerShell System.IO.Compression (exit code ${result.status}).`);
    }
    return Promise.resolve();
  }

  // Attempt 3: Unix zip command
  const zipResult = spawnSync('zip', ['-r', '-q', destZip, '.'], {
    cwd: sourceDir,
    stdio: 'inherit'
  });

  if (zipResult.status !== 0 || !fs.existsSync(destZip)) {
    throw new Error(`Failed to create ZIP using 'zip' utility (exit code ${zipResult.status}).`);
  }

  return Promise.resolve();
}

/**
 * Main execution flow
 */
async function main() {
  console.log('====================================================');
  console.log('🐾 Kitten TTS WebGPU — Chrome Web Store Packaging');
  console.log('====================================================');

  if (!shouldZipOnly) {
    console.log(`\n📁 Staging store files in: ${outputDirName}/`);

    // Clean previous output directory
    if (fs.existsSync(TARGET_DIR)) {
      fs.rmSync(TARGET_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TARGET_DIR, { recursive: true });

    // Copy all required items
    for (const item of REQUIRED_ITEMS) {
      const srcPath = path.join(PROJECT_ROOT, item.path);
      const destPath = path.join(TARGET_DIR, item.path);

      if (!fs.existsSync(srcPath)) {
        if (item.required) {
          console.error(`❌ Error: Required item '${item.path}' was not found in project root!`);
          if (item.path === 'dist') {
            console.error(`   Did you run 'npm run build' first?`);
          }
          process.exit(1);
        } else {
          console.log(`⚠️  Optional item skipped: ${item.path}`);
          continue;
        }
      }

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        fs.cpSync(srcPath, destPath, { recursive: true });
        const dirStats = getDirectoryStats(destPath);
        console.log(`  ✓ Added folder: ${item.path}/ (${dirStats.fileCount} files, ${formatBytes(dirStats.totalSize)})`);
      } else {
        fs.cpSync(srcPath, destPath);
        console.log(`  ✓ Added file:   ${item.path} (${formatBytes(stat.size)})`);
      }
    }

    // Run pre-flight validation on the staged directory
    console.log('\n🔍 Running pre-flight checks on staged files...');

    const manifestPath = path.join(TARGET_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error('❌ Manifest validation failed: manifest.json is missing.');
      process.exit(1);
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.error('❌ Manifest validation failed: manifest.json is not valid JSON.', err.message);
      process.exit(1);
    }

    if (manifest.manifest_version !== 3) {
      console.error(`❌ Invalid manifest_version: ${manifest.manifest_version}. Expected 3.`);
      process.exit(1);
    }

    // Verify critical files
    let missingCritical = 0;
    for (const relPath of CRITICAL_INTERNAL_CHECKS) {
      const checkPath = path.join(TARGET_DIR, relPath);
      if (!fs.existsSync(checkPath)) {
        console.error(`  ❌ Missing critical file: ${relPath}`);
        missingCritical++;
      }
    }

    if (missingCritical > 0) {
      console.error(`\n❌ Pre-flight check failed: ${missingCritical} required file(s) are missing.`);
      process.exit(1);
    }

    const { totalSize, fileCount } = getDirectoryStats(TARGET_DIR);
    console.log(`\n✅ Staging complete: ${fileCount} files in '${outputDirName}/' (${formatBytes(totalSize)} uncompressed)`);
  }

  // Handle zipping
  if (shouldZip) {
    try {
      await createZip(TARGET_DIR, ZIP_PATH);
      const zipStat = fs.statSync(ZIP_PATH);
      const zipSizeMb = (zipStat.size / (1024 * 1024)).toFixed(2);

      console.log(`✅ ZIP package created: ${zipFileName} (${zipSizeMb} MB)`);
      if (zipStat.size > 130 * 1024 * 1024) {
        console.warn(`⚠️  WARNING: ZIP size (${zipSizeMb} MB) exceeds Chrome Web Store 130 MB limit!`);
      } else {
        console.log(`✓ Size is within Chrome Web Store limit (130 MB).`);
      }
    } catch (err) {
      console.error(`❌ Failed to create ZIP package:`, err.message);
      process.exit(1);
    }
  }

  // Print helpful next steps
  console.log('\n----------------------------------------------------');
  console.log('📋 NEXT STEPS FOR TESTING & SUBMISSION:');
  console.log('----------------------------------------------------');
  console.log('1. Test unpacked in Chrome:');
  console.log('   a. Open Chrome and go to: chrome://extensions');
  console.log('   b. Turn ON "Developer mode" (top right toggle)');
  console.log(`   c. Click "Load unpacked" and select:`);
  console.log(`      ${TARGET_DIR}`);
  console.log('   d. Test audio generation, side panel, options, and shortcuts.');
  console.log('');
  if (!shouldZip) {
    console.log('2. Once verified, create the submission ZIP:');
    console.log('   npm run zip:store');
    console.log('');
    console.log('3. Submit to Chrome Developer Dashboard:');
    console.log(`   Upload '${zipFileName}' at https://chrome.google.com/webstore/devconsole/`);
  } else {
    console.log('2. Submit to Chrome Developer Dashboard:');
    console.log(`   Upload '${zipFileName}' at https://chrome.google.com/webstore/devconsole/`);
  }
  console.log('----------------------------------------------------\n');
}

main().catch((err) => {
  console.error('❌ Unexpected error during build-store:', err);
  process.exit(1);
});
