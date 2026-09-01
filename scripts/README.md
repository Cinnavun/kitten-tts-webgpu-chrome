# Build Scripts

Scripts for building and packaging Kitten TTS WebGPU Chrome extension.

## Build Store Package

Creates a ZIP file with only the files needed for Chrome Web Store submission.

### Option 1: Using npm (recommended)

```bash
npm run build:store
```

This runs `node scripts/build-store.js` which:
- Builds the extension with `npm run build`
- Collects only necessary files
- Creates `kitten-tts-webgpu-chrome-store.zip`
- Outputs ready-for-submission package

### Option 2: Using PowerShell

```powershell
.\scripts\build-store.ps1
```

Same result as npm script, but runs as a PowerShell script.

## What Gets Included in Store Package

✅ **Included:**
- `manifest.json` — Extension configuration
- `background.js` — Service worker
- `content.js` — Content script
- `offscreen.html` — Offscreen document
- `sidepanel.html` — Side panel UI
- `sidepanel.css` — Styles
- `icons/` — All extension icons
- `models/` — Pre-bundled nano model + voices
- `assets/` — Language files (espeak dictionary, rules)
- `dist/` — Built bundles (sidepanel.js, offscreen.js, extractor.js, worker.js)
- `src/` — Source TypeScript/JavaScript files

❌ **Excluded:**
- `node_modules/` — Dependencies (Chrome handles, don't upload)
- `dist/` (if regenerated) — Rebuilt on installation
- `.git/` — Version control (development only)
- Documentation files — Optional for store (but should be on GitHub)
- `.gitignore`, `.vscode/`, etc. — Development files only

## Upload to Chrome Web Store

1. Go to https://chrome.google.com/webstore/devconsole/
2. Click "New item"
3. Upload the ZIP file: `kitten-tts-webgpu-chrome-store.zip`
4. Fill in store listing details (from CHROMEWEBSTORE.md)
5. Upload screenshots
6. Submit for review

## Automated Release Workflow

When you push a git tag, GitHub Actions automatically:
- Builds the extension
- Creates the store package ZIP
- Attaches it to a GitHub Release

Push a version tag to trigger:
```bash
git tag v1.1.0
git push origin v1.1.0
```

GitHub will automatically create a release with the store package attached!

---

**Total package size is kept small (~10 MB) because:**
- node_modules not included (large, not needed for runtime)
- source maps are inline but minimal
- WebGPU models are pre-compressed
