# scripts/build-store.ps1
# Generates a clean staging folder (default: dist-store/) containing strictly
# the necessary Chrome Web Store submission files for testing unpacked before zipping.
#
# Usage:
#   .\scripts\build-store.ps1              # Generates dist-store/
#   .\scripts\build-store.ps1 -Zip         # Generates dist-store/ AND kitten-tts-webgpu-chrome-store.zip
#   .\scripts\build-store.ps1 -OutputDir "my-store-dir" -Zip

param(
  [string]$OutputDir = "dist-store",
  [switch]$Zip,
  [string]$OutputPath = "kitten-tts-webgpu-chrome-store.zip"
)

$ErrorActionPreference = "Stop"

$includeItems = @(
  'manifest.json',
  'sidepanel.html',
  'sidepanel.css',
  'offscreen.html',
  'content.js',
  'LICENSE',
  'icons',
  'models',
  'dist'
)

$criticalFiles = @(
  'dist\background.js',
  'dist\sidepanel.js',
  'dist\offscreen.js',
  'dist\extractor.js',
  'dist\worker.js',
  'dist\espeak-en-dict.tsv',
  'dist\en_rules',
  'icons\icon16.png',
  'icons\icon32.png',
  'icons\icon48.png',
  'icons\icon128.png',
  'models\kitten_tts_nano_v0_8.onnx',
  'models\kitten_tts_micro_v0_8.onnx',
  'models\kitten_tts_mini_v0_8.onnx',
  'models\voices.npz'
)

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "🐾 Kitten TTS WebGPU - Chrome Web Store Packaging" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

$rootPath = Resolve-Path (Join-Path $PSScriptRoot "..")
$targetPath = Join-Path $rootPath $OutputDir
$zipFullPath = Join-Path $rootPath $OutputPath

Write-Host "📁 Staging store files in: $OutputDir\" -ForegroundColor Cyan

# Clean previous target directory
if (Test-Path $targetPath) {
  Remove-Item -Path $targetPath -Recurse -Force
}
New-Item -ItemType Directory -Path $targetPath -Force | Out-Null

# Copy required items
foreach ($item in $includeItems) {
  $sourceItem = Join-Path $rootPath $item
  $destItem = Join-Path $targetPath $item

  if (Test-Path $sourceItem) {
    if ((Get-Item $sourceItem).PSIsContainer) {
      Copy-Item -Path $sourceItem -Destination $destItem -Recurse -Force
      $files = Get-ChildItem -Path $destItem -Recurse -File
      $totalFolderBytes = ($files | Measure-Object -Property Length -Sum).Sum
      $sizeFormatted = "{0:N2} MB" -f ($totalFolderBytes / 1MB)
      Write-Host "  ✓ Added folder: $item/ ($($files.Count) files, $sizeFormatted)" -ForegroundColor Green
    } else {
      Copy-Item -Path $sourceItem -Destination $destItem -Force
      $size = (Get-Item $sourceItem).Length
      $sizeFormatted = if ($size -ge 1MB) { "{0:N2} MB" -f ($size / 1MB) } else { "{0:N2} KB" -f ($size / 1KB) }
      Write-Host "  ✓ Added file:   $item ($sizeFormatted)" -ForegroundColor Green
    }
  } else {
    if ($item -eq "LICENSE") {
      Write-Host "  ⚠️  Optional item not found: $item" -ForegroundColor Yellow
    } else {
      Write-Host "  ❌ Required item not found: $item" -ForegroundColor Red
      if ($item -eq "dist") {
        Write-Host "     Please run 'npm run build' before staging store package!" -ForegroundColor Yellow
      }
      exit 1
    }
  }
}

Write-Host ""
Write-Host "🔍 Running pre-flight checks on staged files..." -ForegroundColor Cyan

$missingCritical = 0
foreach ($rel in $criticalFiles) {
  $chk = Join-Path $targetPath $rel
  if (-not (Test-Path $chk)) {
    Write-Host "  ❌ Missing critical file: $rel" -ForegroundColor Red
    $missingCritical++
  }
}

if ($missingCritical -gt 0) {
  Write-Host "❌ Pre-flight check failed: $missingCritical required file(s) are missing." -ForegroundColor Red
  exit 1
}

$allFiles = Get-ChildItem -Path $targetPath -Recurse -File
$totalBytes = ($allFiles | Measure-Object -Property Length -Sum).Sum
$totalMB = "{0:N2} MB" -f ($totalBytes / 1MB)

Write-Host ""
Write-Host "✅ Staging complete: $($allFiles.Count) files in '$OutputDir/' ($totalMB uncompressed)" -ForegroundColor Green

# Handle zipping if requested
if ($Zip) {
  Write-Host ""
  Write-Host "📦 Compressing '$OutputDir' into '$OutputPath'..." -ForegroundColor Cyan

  if (Test-Path $zipFullPath) {
    Remove-Item -Path $zipFullPath -Force
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::Open($zipFullPath, [System.IO.Compression.ZipArchiveMode]::Create)
  $filesToZip = Get-ChildItem -Path $targetPath -Recurse -File
  foreach ($f in $filesToZip) {
    $rel = $f.FullName.Substring($targetPath.Length).TrimStart('\', '/') -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  $archive.Dispose()

  $zipSize = (Get-Item $zipFullPath).Length / 1MB
  $zipSizeFormatted = "{0:N2} MB" -f $zipSize

  Write-Host "✅ ZIP package created: $OutputPath ($zipSizeFormatted)" -ForegroundColor Green

  if ($zipSize -gt 2048) {
    Write-Host "⚠️  WARNING: ZIP size exceeds Chrome Web Store 2 GB limit!" -ForegroundColor Yellow
  } else {
    Write-Host "✓ Size is within Chrome Web Store limit ($zipSizeFormatted / 2,048 MB)." -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "----------------------------------------------------" -ForegroundColor DarkGray
Write-Host "📋 NEXT STEPS FOR TESTING & SUBMISSION:" -ForegroundColor Cyan
Write-Host "----------------------------------------------------" -ForegroundColor DarkGray
Write-Host "1. Test unpacked in Chrome:"
Write-Host "   a. Open Chrome and go to: chrome://extensions"
Write-Host "   b. Turn ON 'Developer mode' (top right toggle)"
Write-Host "   c. Click 'Load unpacked' and select:"
Write-Host "      $targetPath"
Write-Host "   d. Test audio generation, side panel, options, and shortcuts."
Write-Host ""
if (-not $Zip) {
  Write-Host "2. Once verified, create the submission ZIP:"
  Write-Host "   npm run zip:store   (or: .\scripts\build-store.ps1 -Zip)"
  Write-Host ""
  Write-Host "3. Submit to Chrome Developer Dashboard:"
  Write-Host "   Upload '$OutputPath' at https://chrome.google.com/webstore/devconsole/"
} else {
  Write-Host "2. Submit to Chrome Developer Dashboard:"
  Write-Host "   Upload '$OutputPath' at https://chrome.google.com/webstore/devconsole/"
}
Write-Host "----------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
