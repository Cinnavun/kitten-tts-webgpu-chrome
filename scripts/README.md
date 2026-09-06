# Build & Packaging Scripts

Scripts for building, validating, staging, and packaging Kitten TTS WebGPU Chrome extension for the Chrome Web Store.

---

## Chrome Web Store Workflow

The packaging pipeline uses a two-stage workflow designed for safety:
1. **Stage**: Generates a clean directory (`dist-store/`) with only the necessary runtime extension files.
2. **Test**: Load `dist-store/` unpacked in Chrome to verify all functionality.
3. **Zip**: Compress `dist-store/` into `kitten-tts-webgpu-chrome-store.zip` for Developer Dashboard submission.

---

### Step 1: Stage Store Package (`dist-store/`)

```bash
npm run build:store
```

Or using PowerShell:

```powershell
.\scripts\build-store.ps1
```

This will:
1. Run `npm run build` to compile the bundles into `dist/`
2. Clean and create `dist-store/`
3. Copy only the necessary runtime files:
   - `manifest.json` (Extension configuration)
   - `sidepanel.html` & `sidepanel.css` (Side panel UI & styles)
   - `offscreen.html` (Offscreen audio document)
   - `content.js` (In-page toast content script)
   - `LICENSE` (GPL-3.0 license)
   - `icons/` (icon16, icon32, icon48, icon128)
   - `models/` (Local nano ONNX model & voice weights)
   - `dist/` (Bundled worker, background service worker, offscreen, sidepanel, readability extractor, and pronunciation rules)
4. Run pre-flight checks on `manifest.json` and verify all required internal paths exist.

---

### Step 2: Test Unpacked in Chrome

Before creating the final ZIP file, test the staged extension in Chrome:

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist-store` folder in the project root.
5. Verify the extension:
   - Click the extension icon to open the Side Panel.
   - Test audio playback with different voices and speeds.
   - Test full article extraction (<kbd>Alt+Shift+A</kbd>).
   - Test text selection context menu.
   - Verify no errors appear in Chrome DevTools or extension errors page.

---

### Step 3: Create Submission ZIP (`kitten-tts-webgpu-chrome-store.zip`)

Once tested and confirmed working:

```bash
npm run zip:store
```

Or using PowerShell:

```powershell
.\scripts\build-store.ps1 -Zip
```

Or to build, stage, and zip in a single command:

```bash
npm run package:store
```

This creates `kitten-tts-webgpu-chrome-store.zip` at the project root with optimal compression, verifying that the package is well within the Chrome Web Store 130 MB limit.

---

## What Gets Included vs. Excluded

| Category | Files Included in `dist-store/` | Files Excluded |
|---|---|---|
| **Configuration** | `manifest.json`, `LICENSE` | `package.json`, `package-lock.json`, `tsconfig.json`, `.gitattributes`, `.gitignore` |
| **UI & Styling** | `sidepanel.html`, `sidepanel.css`, `offscreen.html` | Source HTML mockups |
| **Scripts** | `content.js`, `dist/background.js`, `dist/sidepanel.js`, `dist/offscreen.js`, `dist/extractor.js`, `dist/worker.js` | `src/` (TypeScript/ESM source code), `node_modules/`, `scripts/`, `background.js` (source) |
| **Models & Rules** | `models/kitten_tts_nano_v0_8.onnx`, `models/voices.npz`, `dist/espeak-en-dict.tsv`, `dist/en_rules` | `assets/` raw source files |
| **Assets** | `icons/icon*.png` | `images/` (promo tiles and screenshots uploaded directly in developer console), markdown docs (`README.md`, `CHANGELOG.md`, `CHROMEWEBSTORE.md`) |

---

## Upload to Chrome Web Store

1. Visit the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. Click **New item** or select your existing item.
3. Upload `kitten-tts-webgpu-chrome-store.zip`.
4. Fill in listing details, privacy disclosures, and upload screenshots from the `images/` folder (refer to `CHROMEWEBSTORE.md`).
5. Submit for review!
