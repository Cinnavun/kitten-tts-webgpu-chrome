# Build store package - ZIP only necessary files for Chrome Web Store submission
# Run with: npm run build:store

param(
  [string]$OutputPath = "kitten-tts-webgpu-chrome-store.zip"
)

$includeItems = @(
  'manifest.json',
  'background.js',
  'content.js',
  'offscreen.html',
  'sidepanel.html',
  'sidepanel.css',
  'icons',
  'models',
  'assets',
  'dist',
  'src'
)

Write-Host "📦 Building store package..." -ForegroundColor Cyan
Write-Host ""

# Create temporary directory
$tempDir = Join-Path $env:TEMP "kitten-store-build-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  # Copy all required items
  foreach ($item in $includeItems) {
    $sourcePath = Join-Path (Get-Location) $item
    $destPath = Join-Path $tempDir $item
    
    if (Test-Path $sourcePath) {
      if ((Get-Item $sourcePath).PSIsContainer) {
        Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
        Write-Host "✓ Added folder: $item/" -ForegroundColor Green
      } else {
        Copy-Item -Path $sourcePath -Destination $destPath -Force
        Write-Host "✓ Added file: $item" -ForegroundColor Green
      }
    } else {
      Write-Host "⚠️  Warning: $item not found" -ForegroundColor Yellow
    }
  }
  
  Write-Host ""
  
  # Create ZIP file
  Compress-Archive -Path "$tempDir\*" -DestinationPath $OutputPath -Force
  
  # Get file size
  $size = (Get-Item $OutputPath).Length / 1MB
  
  Write-Host "✅ Store package created!" -ForegroundColor Green
  Write-Host "📁 $OutputPath ($('{0:N2}' -f $size) MB)" -ForegroundColor Green
  Write-Host ""
  Write-Host "📋 Ready to upload to Chrome Web Store at:" -ForegroundColor Cyan
  Write-Host "   https://chrome.google.com/webstore/devconsole/" -ForegroundColor Cyan
  
} finally {
  # Cleanup temp directory
  Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
