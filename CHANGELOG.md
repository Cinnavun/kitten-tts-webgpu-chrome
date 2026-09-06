# Changelog

All notable changes to this project will be documented in this file.

## [1.13] / [1.3.15] - 2026-09-06

### Meridiem Enunciation & Image Credit Deduplication
- **Uppercase Meridiem Expansion (`A-M` / `P-M`)**:
  - In `stripAbbreviationPeriods()` ([`src/textpreprocessor.js`](file:///c:/Users/llsha/Documents/Atomic_chat/Kitten-tts-webgpu-Chrome/src/textpreprocessor.js)), carved out dotted meridiem (`a.m.`, `p.m.`, `A.M.`, `P.M.`, `a. m.`, `p. m.`) before the general dotted initialism hyphenator, expanding them directly to uppercase `A-M` and `P-M`.
  - Lowercase `a` is parsed by eSpeak-ng as the English indefinite article `/ɐ/` (*"uh"*), which caused lowercase `a-m` to slur into *"uh-mm"* (`/ɐm/`). Uppercase `A-M` and `P-M` invoke true letter-name pronunciation (`ˈeɪˈɛm` and `pˈiːˈɛm`), matching `B-B-Q` and `R-N-S`.
  - Preserved plain words like *"I am"* by requiring the dotted format (`([AaPp])\.\s*([Mm])(?:\.(?!\w)|\b)`).
  - Updated `RE_TIME` and `expandTime()` in [`src/textpreprocessor.js`](file:///c:/Users/llsha/Documents/Atomic_chat/Kitten-tts-webgpu-Chrome/src/textpreprocessor.js) to recognize `A-M` / `P-M` suffixes and prevent optional suffix whitespace consumption from eating spaces before subsequent words.
- **Image Credit Chrome Stripping & Suffix Deduplication**:
  - In `stripCaptionUI()` ([`src/articleCleaner.js`](file:///c:/Users/llsha/Documents/Atomic_chat/Kitten-tts-webgpu-Chrome/src/articleCleaner.js)), added explicit DOM removal for credit chrome elements: `span.credit, [class*="credit" i], [aria-label="Image credit" i]`.
  - In `applyLineFilters()` ([`src/articleCleaner.js`](file:///c:/Users/llsha/Documents/Atomic_chat/Kitten-tts-webgpu-Chrome/src/articleCleaner.js)), added suffix-deduplication (`if (line.length >= 16 && prev.endsWith(line)) continue;`), dropping trailing sibling credit chunks (e.g. Religion News Service / AP credit lines) when the text was already flushed as part of the caption block.
  - Updated and expanded test suites in [`scripts/test-preprocessor.mjs`](file:///c:/Users/llsha/Documents/Atomic_chat/Kitten-tts-webgpu-Chrome/scripts/test-preprocessor.mjs) and [`scripts/test-article-cleaner.mjs`](file:///c:/Users/llsha/Documents/Atomic_chat/Kitten-tts-webgpu-Chrome/scripts/test-article-cleaner.mjs). Rebuilt production bundles in `dist/`.

## [1.12] / [1.3.14] - 2026-09-06

### Store Branding, Least-Privilege Permission Migration & CWS Optimization
- **Rebranded to "Mews Reader: Private Full-Page TTS"**:
  - Renamed the extension from "Kitten TTS WebGPU" to "Mews Reader: Private Full-Page TTS" to avoid trademark/copyright ambiguity with KittenML while preserving proper attribution.
  - Synchronized the manifest name identically with the store listing name across `manifest.json`, `sidepanel.html`, `background.js`, `scripts/build-store.js`, `scripts/build-store.ps1`, and `CHROMEWEBSTORE.md`.
- **Permission Migration from `tabs` to `activeTab` (Least Privilege & Zero History Warning)**:
  - Eliminated the broad `"tabs"` permission from `manifest.json`, removing Chrome's high-risk installation warning (*"Read your browsing history"*).
  - Adopted `"activeTab"` alongside existing `optional_host_permissions` (`http://*/*`, `https://*/*`), strictly observing the Principle of Least Privilege.
  - Context menu reading and `Alt+Shift+A` shortcuts now activate temporary tab execution via `activeTab` immediately on any page, fixing fresh-install script injection restrictions.
  - In `background.js`, simplified `commands.onCommand` active tab resolution to check `!targetTab?.id` directly, removing unnecessary dependence on `targetTab?.url`.
- **Store Listing Policy & Differentiation Optimization (`CHROMEWEBSTORE.md`)**:
  - Implemented Google's spam policy guardrails, ensuring no single keyword repeats more than ~5 times across the entire detailed description.
  - Placed key value propositions ("WebGPU", "on-device", "offline", "no cloud", "privacy") prominently within the 132-character short description and lead paragraph.
  - Incorporated clear, ethical single-line attribution: *"Powered by the KittenTTS model by KittenML (Apache-2.0), running fully on-device via WebGPU."*
  - Updated review justification table with specific rationale for `activeTab`.

## [1.12] / [1.3.13] - 2026-09-06

### Chrome Web Store Pre-Flight Compliance, License Verification & Store Readiness
- **Comprehensive Store Documentation (`CHROMEWEBSTORE.md`)**:
  - Authored official `CHROMEWEBSTORE.md` in project root following Chrome Web Store guidelines.
  - Added copy-paste store listing metadata (name, 132-character short description, user-benefit detailed description, accessibility category, and single-purpose statement).
  - Authored explicit plain-English review justifications for each declared permission (`contextMenus`, `sidePanel`, `storage`, `offscreen`, `scripting`, `tabs`, `notifications`) and `optional_host_permissions` (`http://*/*`, `https://*/*`).
  - Documented complete Privacy & Data Use disclosures (zero data collected, zero off-device transmission, zero tracking).
  - Cataloged visual assets from `images/` (store icon, 1280x800 dark/light screenshots, context menu demo, 440x280 promo tile).
- **License Compliance & Build Packaging Enforcements**:
  - Verified and confirmed that the GPL-3.0 `LICENSE` file is strictly bundled in the root of the Chrome Web Store submission ZIP package to ensure compliance with GNU GPLv3 §4–§6.
  - Updated `REQUIRED_ITEMS` in `scripts/build-store.js` to set `LICENSE` to `required: true`, preventing packaging if the license is missing.
- **Async/Await Refactoring & Robust Error Handling**:
  - Replaced the last remaining `.then()` chains in `background.js` (`ENSURE_OFFSCREEN` and `CLEAR_AUDIO_CACHE`) with standard `async/await` wrapped in async IIFEs, ensuring 100% adherence to MV3 async/await best practices.
  - Added explicit `try/catch` error handling to `ENSURE_OFFSCREEN` in `background.js`, ensuring `sendResponse({ ready: false, error: err.message })` fires if offscreen document setup rejects, preventing hung message channels and `"The message port closed before a response was received"` runtime errors.
- **Cross-Documentation & Version Alignment**:
  - Synchronized `package.json` version from `1.11` to `1.12` matching `manifest.json`.
  - Cleaned up repository placeholders (`your-username` -> `cinnavun`) in `README.md` and `SECURITY.md`.
  - Corrected `phonemizer` repository attribution in `ATTRIBUTION.md` from an errant HuggingFace model link to Xenova's GitHub repo.
  - Aligned permissions list in `PRIVACY_POLICY.md` (removed stale `activeTab` reference; accurately described `tabs` and `optional_host_permissions`).
  - Updated staged asset lists in `scripts/README.md` and testing checklist in `FIREFOX_PORT_ROADMAP.md` to reflect that all 3 models and dedicated voice latents (`voices.npz`, `voices_micro.npz`, `voices_mini.npz`) are pre-bundled locally.

## [1.3.12] - 2026-09-06

### Local Pre-Bundling of All 3 Models & Air-Gapped Security Hardening
- **Bundled All 3 KittenTTS Models & Dedicated Voice Embeddings Out of the Box**:
  - Pre-bundled `kitten_tts_micro_v0_8.onnx` (~41 MB), `kitten_tts_mini_v0_8.onnx` (~78 MB), `kitten_tts_nano_v0_8.onnx` (~24 MB) inside `models/`.
  - Discovered that each model size requires its own trained voice latent embeddings to prevent distorted/static speech. Bundled model-specific voice files: `models/voices.npz` (nano, 8aa7cee2...), `models/voices_micro.npz` (micro, 112710c1...), and `models/voices_mini.npz` (mini, 40ad2638...), completely eliminating distorted/muffled output.
  - Updated `LOCAL_MODELS` in `src/worker.js` to map each model to its matching ONNX weights and voice NPZ.
  - Eliminated `REMOTE_MODELS` and the runtime HuggingFace CDN download logic in `getEngine()`. All model loads now resolve directly via `chrome.runtime.getURL()` with zero network requests.
- **Silenced Non-Float Graph Constant Initializer Warnings**:
  - Silenced benign ONNX initializers of `dtype: 6` (INT32 constants) and `dtype: 9` (BOOL constants) alongside `case 7:` (INT64) in `kitten-tts-webgpu`, preventing Chrome from registering false-positive warnings as extension errors in `chrome://extensions`.
- **Pre-Warm Status Lifecycle & UI Transition Repair**:
  - Fixed pre-warm state lock: `worker.js` now posts `{ type: "TTS_STATUS", status: "Ready", state: "idle" }` upon pre-warm completion, allowing `sidepanel.js` to transition cleanly from `"Loading local ... model…"` to `"Ready"`.
  - Fixed race condition on side panel open: model pre-warming now triggers with the user's stored `preferredModel` rather than defaulting to `"nano"` before storage loads.
  - Added dynamic model pre-warming on `modelSelect` change so switching quality in the UI immediately pre-warms the target model in the background.
- **Store Packaging & Validation Updates**:
  - Updated `CRITICAL_INTERNAL_CHECKS` in `scripts/build-store.js` and `$criticalFiles` in `scripts/build-store.ps1` to enforce that all 3 models and all 3 voice files are staged and verified.
  - Corrected store size check threshold to modern Chrome Web Store limits (2 GB / 2,048 MB), verifying the package at ~119.78 MB zipped (~5.8% of store capacity).
  - Enhanced `scripts/download-models.mjs` utility with SHA-256 validation for both model weights and voice files.
- **Comprehensive Documentation Updates**:
  - Synchronized `SECURITY.md`, `PRIVACY_POLICY.md`, `PRIVACY_POLICY_SIMPLE.md`, `README.md`, `ATTRIBUTION.md`, and `scripts/README.md` to reflect that all models and voices are pre-bundled from the jump and zero network requests are made.

## [1.3.11] - 2026-09-06

### Caption UI Control Stripping & Scoped DOM Filtering
- **Centralized Caption UI Cleaner (`stripCaptionUI`)**:
  - Implemented and exported `stripCaptionUI(doc)` in `src/articleCleaner.js` with shared selectors `CAPTION_UI_SELECTORS` and command set `CAPTION_TOGGLE_COMMANDS`.
  - Scoped all text-matched removals strictly to `el.closest("figure, figcaption") !== null`, ensuring body prose containing words like `"hide caption option"` or `"toggle caption setting"` is 100% preserved.
  - Protected inline sentence formatting: inline words like `<p>... detailed <em>caption</em> ...</p>` with sibling text nodes are never removed.
  - Strips interactive button chrome and explicit toggle classes: `.toggle-caption`, `.hide-caption`, `.caption-toggle`, `.caption-control`, `.caption-btn`, `figure button`, `figcaption button`, and `[role="button"]`.
- **Pre-Readability & Fallback Integration**:
  - Wired `stripCaptionUI(doc)` into `src/offscreen.js` immediately before Mozilla Readability parses the document.
  - Because Readability operates on the mutated live DOM tree and the fallback path reads directly from `doc.body?.textContent`, both extraction pipelines inherit clean caption text with zero toggle or button artifacts.
  - Added defensive call in `cleanArticleText()` on parsed Readability HTML.
- **Drop-Cap Regex Repair**:
  - Refined drop-cap regex in `src/articleCleaner.js` from `^([A-Z])` to `^([B-HJ-Z])`, preventing the English indefinite article `"A"` (e.g., `"A panoramic view"`) and pronoun `"I"` from being erroneously concatenated to subsequent lowercase words.
- **Line Filter Safety**:
  - Added standalone line filtering (`toggleCaptionLineRegex`) and credit trailing token stripping in `applyLineFilters` in `src/articleCleaner.js`.
- **Automated Test Suite & Regression Fixtures**:
  - Created `scripts/test-article-cleaner.mjs` asserting authentic caption text and photo credits survive, NPR-style toggle buttons (`<b>toggle caption</b>`, `<b>hide caption</b>`) are removed, and asserting two key regression fixtures:
    - Prose containing literal words (`"The interface includes a hide caption option."`) survives completely unchanged.
    - Inline formatted words (`"The photographer provided a detailed <em>caption</em> for the historical image."`) survive intact without deleting words.
  - Wired into `npm test` (`node scripts/test-preprocessor.mjs && node scripts/test-article-cleaner.mjs`).
- **Rebuilt Distribution Bundles**:
  - Recompiled `dist/offscreen.js`, `dist/sidepanel.js`, `dist/worker.js`, and `dist/background.js`.

## [1.3.10] - 2026-09-05

### NLP Date Parsing & Natural Spoken Pronunciation
- **Multi-Format Date Normalization**:
  - Implemented `expandDates` in `src/textpreprocessor.js` powered by `RE_DATE` matching ISO (`YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`), US (`MM/DD/YYYY`, `MM-DD-YYYY`), and slashed single-digit forms (`M/D/YYYY`).
  - Dates are spoken in natural English: `Month OrdinalDay, YearWords` (e.g., `2026-09-05` $\rightarrow$ *"September fifth, twenty twenty six"*, `12/25/2024` $\rightarrow$ *"December twenty fifth, twenty twenty four"*).
- **Validation Gate & Collision Prevention**:
  - Embedded `validDay(m, d, y)` checking valid months (1–12), leap-year calculations for February (e.g., 2024-02-29 is valid, 2023-02-29 is rejected), and realistic 4-digit year ranges (1000–2199).
  - Matches failing validation fall through untouched, keeping athletic scores (`10-15`) and invalid dates (`13-45-2024`) safe from corruption.
  - Bound by lookaround boundaries (`(?<![\w/-])` and `(?![\w/-])(?!\.\d)`) preventing collisions with version numbers (`v2024-05-06`), decimals (`2024.5`), or consecutive hyphens, while cleanly permitting trailing sentence periods.
- **European Date Rescue (`DD-MM-YYYY` / `DD/MM/YYYY`)**:
  - Automatically detects unambiguous European dates where the month position exceeds 12 (e.g., `25-12-2024`, `31/01/2025`) and swaps month and day so they are spoken accurately.
- **Pipeline Order Prioritization**:
  - Scheduled `expandDates` in `process()` immediately after `expandTime`, ensuring dates run before `expandFractions` (preventing `9/5` in `9/5/2026` from being spoken as "nine fifths"), `expandPhoneNumbers`, and `expandRanges`.
  - Added `expand_dates: true` to `TextPreprocessor` config defaults.
- **Ordinal Suffixes for Tens Ending in -y**:
  - Enhanced `ordinalSuffix` in `src/textpreprocessor.js` to transform numbers ending in `y` into `ieth` (e.g., 20th $\rightarrow$ *"twentieth"*, 30th $\rightarrow$ *"thirtieth"*), ensuring days like the 20th or 30th of a month are spoken properly instead of *"twentyth"*.
- **Automated Test Suite & NPM Script**:
  - Added `scripts/test-preprocessor.mjs` verifying date formats, collision avoidance, ordinal suffixes, and pipeline order.
  - Added `"test": "node scripts/test-preprocessor.mjs"` to `package.json`.
- **Rebuilt Distribution Bundles**:
  - Rebuilt `dist/worker.js`, `dist/sidepanel.js`, `dist/offscreen.js`, and `dist/background.js`.
  - Re-staged verified distribution assets to `dist-store/`.

## [1.3.9] - 2026-09-05

### Browser-Enforced Access Architecture (Pure try/catch Delegation)
- **Eliminated Client-Side URL Gatekeeping**:
  - Completely removed `BLOCKED_URL_PREFIXES`, `isBlockedUrl()`, and client-side scheme allowlisting (`isScriptableUrl`) from `background.js`.
  - Client-side filtering previously blocked legitimate user workflows when developers/power users enabled `--extensions-on-chrome-urls` (or `#extensions-on-chrome-urls` in `chrome://flags`), when users enabled "Allow access to file URLs" (`file://*`), or when reading in Edge's Immersive Reader (`read://` / `edge-reader://`).
- **Browser-Delegated Permission & Scripting Enforcement**:
  - Scripting operations (`chrome.scripting.executeScript`) and message dispatching (`chrome.tabs.sendMessage`) are now executed directly, letting the Chromium browser engine enforce security policies dynamically at runtime.
  - Wrapped injection and messaging calls in robust `try/catch` handlers. If the browser permits execution (on web pages, developer-unlocked internal pages, or file URLs), actions run seamlessly. If the browser denies execution (e.g. default restricted internal WebUI, Chrome Web Store gallery, or enterprise policy), the error is caught cleanly and falls back to desktop notifications and badge feedback without throwing unhandled exceptions.

## [1.3.8] - 2026-09-05

### Comma-Formatted Number Range Normalization & Clause Boundary Protection
- **Comma-Formatted Number Range Normalization**:
  - Resolved an issue where formatted numbers in hyphenated or dashed ranges (e.g. `69,000-76,000`) had their internal digit groups (`000-76`) mistakenly matched as an isolated range by `RE_RANGE` because commas were matched as non-word boundaries (`(?<!\w)`), turning `000-76` into `zero to seventy six` and resulting in `69,zero to seventy six,000` pronounced as *"sixty-nine zero seventy-six zero"*.
  - Redesigned `RE_RANGE` in `src/textpreprocessor.js` to match full comma-formatted integers, plain integers, and decimals (`(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`), across hyphens, en-dashes (`–`), and em-dashes (`—`) with optional surrounding whitespace (`69,000-76,000`, `69,000 - 76,000`, `69,000–76,000`).
  - Added `formatRangeNumber` helper in `src/textpreprocessor.js` to strip thousands commas, delegate decimals to `floatToWords`, 4-digit years (1800–2099) to `yearToWords`, and integers to `numberToWords`, expanding `69,000-76,000` cleanly into `sixty nine thousand to seventy six thousand`.
- **Negative Sign Disambiguation in Numbers**:
  - Updated `RE_NUMBER` from `(?<![a-zA-Z])-?` to `(?<!\w)-?` so trailing digits before a hyphen are never treated as negative signs for subsequent numbers.
- **Robust Phonemizer Range Failsafe & Numeric Comma Protection**:
  - Added a number range normalization failsafe in `robustTextToInputIds` (`src/robustPhonemizer.js`) to convert any unexpanded ranges into `X to Y` before number-to-words substitution.
  - Stripped thousands separator commas (`(?<=\d),(?=\d{3}\b)`) in `src/robustPhonemizer.js` before clause punctuation segmentation, ensuring numeric commas are never treated as clause boundaries when preprocessing is disabled.
- **Paren-Aware Sentence Chunking & Stock Ticker Protection**:
  - Identified in user debug logs that giant sentences (> 380 chars) were decomposing across colons inside parentheses (e.g. `Johnson & Johnson (J-N-J:` in Chunk 2 and `U-S) said Monday...` in Chunk 3).
  - Implemented `splitOutsideParens` in `src/worker.js` ensuring syntactic decomposition at colons, semicolons, dashes, and commas only occurs when parenthesis depth is zero, keeping parenthetical phrases whole.
  - Protected uppercase stock ticker and exchange symbols (`JNJ:US`, `BTC:USD`, `NASDAQ:AAPL`) in `fixMissingSentenceSpacing` (`src/textpreprocessor.js`) from having extraneous spaces inserted after colons.
- **Currency Range Expansion (`$100K-250K`, `$10-$20`)**:
  - Added support in `expandCurrency` (`src/textpreprocessor.js`) to parse and expand financial ranges like `$100K-250K` into `"one hundred thousand to two hundred fifty thousand dollars"`.
- **Rebuilt Distribution Bundles**:
  - Rebuilt `dist/worker.js`, `dist/sidepanel.js`, `dist/offscreen.js`, and `dist/background.js`.

## [1.3.7] - 2026-09-05

### Text Preprocessing Debug Toggle & Initialism Preservation
- **Text Preprocessing Debug Toggle**:
  - Added a `#preprocessToggle` checkbox to the Debug toolbar at the bottom of the UI in `sidepanel.html`.
  - Persisted user preference in `chrome.storage.local` under `KITTEN_PREPROCESS` (defaulting to enabled).
  - Wired toggle state through `src/sidepanel.js` $\rightarrow$ `src/offscreen.js` $\rightarrow$ `src/worker.js` $\rightarrow$ `src/robustPhonemizer.js`.
  - When unchecked, bypasses paragraph preprocessing in `TextPreprocessor.process()` as well as number/hyphen normalization failsafes in `robustTextToInputIds()`, allowing users to test raw, unmanipulated text directly against eSpeak-ng.
- **Cache Isolation for Preprocessing**:
  - Updated `generateCacheKey` in `src/db.js` to include the `preprocess` boolean flag, preventing cached audio generated with preprocessing from colliding with non-preprocessed test runs.
- **Initialism Hyphen Preservation**:
  - Refined the intra-word hyphen replacement regex in `src/robustPhonemizer.js` to only target multi-letter compound words (`(?<=[a-zA-Z]{2,})-(?=[a-zA-Z])|(?<=[a-zA-Z])-(?=[a-zA-Z]{2,})`), preventing single-letter initialisms (such as `A-I`, `A-P-I`, `U-S-A`) from having their hyphens stripped into spaces and slurring into indefinite articles.
- **Rebuilt Distribution Bundles**:
  - Recompiled `dist/worker.js`, `dist/sidepanel.js`, `dist/offscreen.js`, and `dist/background.js`.

## [1.3.6] - 2026-09-05

### Chrome Web Store Build & Packaging Pipeline
- **Dedicated Staging Directory (`dist-store/`)**:
  - Implemented `npm run build:store` (and PowerShell companion `.\scripts\build-store.ps1`) to compile bundles and stage only required runtime files into a clean `dist-store/` folder.
  - Excluded development clutter, raw source files (`src/`, `assets/`, `images/`, `scripts/`), `node_modules/`, git files, and configuration files from the distribution package.
  - Left `dist-store/` in place after build so developers can load it unpacked directly in `chrome://extensions` for verification before packaging.
- **Zero-Dependency Store Packaging**:
  - Rewrote `scripts/build-store.js` using Node.js built-ins (`fs`, `path`, `child_process`) removing the missing `archiver` dependency.
  - Implemented automated pre-flight checks validating `manifest.json`, MV3 compliance, and presence of all referenced files (`dist/background.js`, `sidepanel.html`, `sidepanel.css`, `offscreen.html`, `content.js`, icons, and local nano model weights).
  - Added `npm run zip:store` (`node scripts/build-store.js --zip`) to package `dist-store/` into `kitten-tts-webgpu-chrome-store.zip`.
  - On Windows, enforced forward slashes (`/`) in ZIP archive entries via .NET `System.IO.Compression.ZipFileExtensions::CreateEntryFromFile`, preventing extraction errors and upload rejections on the Chrome Developer Dashboard.
- **Project Configuration Updates**:
  - Added `build:store`, `zip:store`, and `package:store` scripts to `package.json`.
  - Added `dist-store/` to `.gitignore`.
  - Rewrote `scripts/README.md` with complete documentation of the 2-stage build-test-zip workflow.

### UI Layout & System Settings Navigation
- **Top Row Header & Brand Wrapping Fix**:
  - Constrained `.theme-select` width (`width: auto !important; max-width: 78px; flex-shrink: 0`) preventing the dropdown from expanding to 100% width and crushing the brand container.
  - Added `white-space: nowrap` and `flex-shrink: 0` to `.brand-name`, preventing "Kitten TTS" from wrapping vertically across multiple lines.
- **Vertical Spacing & Above-The-Fold Optimization**:
  - Compacted body padding (`10px 12px`), card padding (`9px 10px`), card margins (`8px`), toggle container spacing (`6px`), and textarea default height (`85px`).
  - Kept status card, progress bar, and WebGPU diagnostic box visible above the fold on standard side panel heights without requiring vertical scrolling.
- **Direct System Settings (`chrome://settings/system`) Navigation**:
  - Added a one-click action button (`#openSystemSettingsBtn`) and inline link (`#openSystemSettingsLink`) to open `chrome://settings/system` via `chrome.tabs.create`.
  - Enables users to immediately jump to the "Use graphics acceleration when available" toggle to resolve the primary cause of WebGPU initialization failures.
  - Rebuilt all distribution bundles (`dist/sidepanel.js`).

## [1.3.8] - 2026-09-05

### Comma-Formatted Number Range Normalization & Clause Boundary Protection
- **Comma-Formatted Number Range Normalization**:
  - Resolved an issue where formatted numbers in hyphenated or dashed ranges (e.g. `69,000-76,000`) had their internal digit groups (`000-76`) mistakenly matched as an isolated range by `RE_RANGE` because commas were matched as non-word boundaries (`(?<!\w)`), turning `000-76` into `zero to seventy six` and resulting in `69,zero to seventy six,000` pronounced as *"sixty-nine zero seventy-six zero"*.
  - Redesigned `RE_RANGE` in `src/textpreprocessor.js` to match full comma-formatted integers, plain integers, and decimals (`(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`), across hyphens, en-dashes (`–`), and em-dashes (`—`) with optional surrounding whitespace (`69,000-76,000`, `69,000 - 76,000`, `69,000–76,000`).
  - Added `formatRangeNumber` helper in `src/textpreprocessor.js` to strip thousands commas, delegate decimals to `floatToWords`, 4-digit years (1800–2099) to `yearToWords`, and integers to `numberToWords`, expanding `69,000-76,000` cleanly into `sixty nine thousand to seventy six thousand`.
- **Negative Sign Disambiguation in Numbers**:
  - Updated `RE_NUMBER` from `(?<![a-zA-Z])-?` to `(?<!\w)-?` so trailing digits before a hyphen are never treated as negative signs for subsequent numbers.
- **Robust Phonemizer Range Failsafe & Numeric Comma Protection**:
  - Added a number range normalization failsafe in `robustTextToInputIds` (`src/robustPhonemizer.js`) to convert any unexpanded ranges into `X to Y` before number-to-words substitution.
  - Stripped thousands separator commas (`(?<=\d),(?=\d{3}\b)`) in `src/robustPhonemizer.js` before clause punctuation segmentation, ensuring numeric commas are never treated as clause boundaries when preprocessing is disabled.
- **Paren-Aware Sentence Chunking & Stock Ticker Protection**:
  - Identified in user debug logs that giant sentences (> 380 chars) were decomposing across colons inside parentheses (e.g. `Johnson & Johnson (J-N-J:` in Chunk 2 and `U-S) said Monday...` in Chunk 3).
  - Implemented `splitOutsideParens` in `src/worker.js` ensuring syntactic decomposition at colons, semicolons, dashes, and commas only occurs when parenthesis depth is zero, keeping parenthetical phrases whole.
  - Protected uppercase stock ticker and exchange symbols (`JNJ:US`, `BTC:USD`, `NASDAQ:AAPL`) in `fixMissingSentenceSpacing` (`src/textpreprocessor.js`) from having extraneous spaces inserted after colons.
- **Currency Range Expansion (`$100K-250K`, `$10-$20`)**:
  - Added support in `expandCurrency` (`src/textpreprocessor.js`) to parse and expand financial ranges like `$100K-250K` into `"one hundred thousand to two hundred fifty thousand dollars"`.
- **Rebuilt Distribution Bundles**:
  - Rebuilt `dist/worker.js`, `dist/sidepanel.js`, `dist/offscreen.js`, and `dist/background.js`.

## [1.3.7] - 2026-09-05

### Text Preprocessing Debug Toggle & Initialism Preservation
- **Text Preprocessing Debug Toggle**:
  - Added a `#preprocessToggle` checkbox to the Debug toolbar at the bottom of the UI in `sidepanel.html`.
  - Persisted user preference in `chrome.storage.local` under `KITTEN_PREPROCESS` (defaulting to enabled).
  - Wired toggle state through `src/sidepanel.js` $\rightarrow$ `src/offscreen.js` $\rightarrow$ `src/worker.js` $\rightarrow$ `src/robustPhonemizer.js`.
  - When unchecked, bypasses paragraph preprocessing in `TextPreprocessor.process()` as well as number/hyphen normalization failsafes in `robustTextToInputIds()`, allowing users to test raw, unmanipulated text directly against eSpeak-ng.
- **Cache Isolation for Preprocessing**:
  - Updated `generateCacheKey` in `src/db.js` to include the `preprocess` boolean flag, preventing cached audio generated with preprocessing from colliding with non-preprocessed test runs.
- **Initialism Hyphen Preservation**:
  - Refined the intra-word hyphen replacement regex in `src/robustPhonemizer.js` to only target multi-letter compound words (`(?<=[a-zA-Z]{2,})-(?=[a-zA-Z])|(?<=[a-zA-Z])-(?=[a-zA-Z]{2,})`), preventing single-letter initialisms (such as `A-I`, `A-P-I`, `U-S-A`) from having their hyphens stripped into spaces and slurring into indefinite articles.
- **Rebuilt Distribution Bundles**:
  - Recompiled `dist/worker.js`, `dist/sidepanel.js`, `dist/offscreen.js`, and `dist/background.js`.

## [1.3.6] - 2026-09-05

### Chrome Web Store Build & Packaging Pipeline
- **Dedicated Staging Directory (`dist-store/`)**:
  - Implemented `npm run build:store` (and PowerShell companion `.\scripts\build-store.ps1`) to compile bundles and stage only required runtime files into a clean `dist-store/` folder.
  - Excluded development clutter, raw source files (`src/`, `assets/`, `images/`, `scripts/`), `node_modules/`, git files, and configuration files from the distribution package.
  - Left `dist-store/` in place after build so developers can load it unpacked directly in `chrome://extensions` for verification before packaging.
- **Zero-Dependency Store Packaging**:
  - Rewrote `scripts/build-store.js` using Node.js built-ins (`fs`, `path`, `child_process`) removing the missing `archiver` dependency.
  - Implemented automated pre-flight checks validating `manifest.json`, MV3 compliance, and presence of all referenced files (`dist/background.js`, `sidepanel.html`, `sidepanel.css`, `offscreen.html`, `content.js`, icons, and local nano model weights).
  - Added `npm run zip:store` (`node scripts/build-store.js --zip`) to package `dist-store/` into `kitten-tts-webgpu-chrome-store.zip`.
  - On Windows, enforced forward slashes (`/`) in ZIP archive entries via .NET `System.IO.Compression.ZipFileExtensions::CreateEntryFromFile`, preventing extraction errors and upload rejections on the Chrome Developer Dashboard.
- **Project Configuration Updates**:
  - Added `build:store`, `zip:store`, and `package:store` scripts to `package.json`.
  - Added `dist-store/` to `.gitignore`.
  - Rewrote `scripts/README.md` with complete documentation of the 2-stage build-test-zip workflow.

### UI Layout & System Settings Navigation
- **Top Row Header & Brand Wrapping Fix**:
  - Constrained `.theme-select` width (`width: auto !important; max-width: 78px; flex-shrink: 0`) preventing the dropdown from expanding to 100% width and crushing the brand container.
  - Added `white-space: nowrap` and `flex-shrink: 0` to `.brand-name`, preventing "Kitten TTS" from wrapping vertically across multiple lines.
- **Vertical Spacing & Above-The-Fold Optimization**:
  - Compacted body padding (`10px 12px`), card padding (`9px 10px`), card margins (`8px`), toggle container spacing (`6px`), and textarea default height (`85px`).
  - Kept status card, progress bar, and WebGPU diagnostic box visible above the fold on standard side panel heights without requiring vertical scrolling.
- **Direct System Settings (`chrome://settings/system`) Navigation**:
  - Added a one-click action button (`#openSystemSettingsBtn`) and inline link (`#openSystemSettingsLink`) to open `chrome://settings/system` via `chrome.tabs.create`.
  - Enables users to immediately jump to the "Use graphics acceleration when available" toggle to resolve the primary cause of WebGPU initialization failures.
  - Rebuilt all distribution bundles (`dist/sidepanel.js`).

## [1.3.5] - 2026-09-05

### WebGPU Fallback & Hardware Resilience
- **Two-Stage WebGPU Adapter Acquisition (`forceFallbackAdapter: true`)** — Implemented an automatic two-stage adapter acquisition strategy in `src/worker.js`:
  - **Hardware First**: The engine first attempts to acquire a dedicated or integrated hardware GPU adapter via standard WebGPU adapter options (including `powerPreference: "high-performance"` on non-Windows platforms).
  - **Software/CPU Fallback**: If the hardware adapter request returns `null` or throws (e.g. in environments lacking accessible GPU hardware or where browser hardware acceleration is disabled), the worker automatically requests a fallback adapter via `navigator.gpu.requestAdapter({ ...options, forceFallbackAdapter: true })`.
  - **Graceful Error Handling**: If neither hardware nor software fallback adapters are available, `requestAdapter()` returns `null`, enabling standard error reporting without unhandled promise rejections.
- **Initial GPU Availability Poll & Proactive Diagnostics**:
  - Added `pollGpuAvailability()` in `src/sidepanel.js` to probe WebGPU hardware/fallback status immediately upon sidepanel load and on engine reset.
  - Added `#gpuWarningBox` with red status indicator and explicit, actionable guidance when WebGPU is disabled due to hardware acceleration being turned off in Chrome.
  - Integrated one-click `chrome://gpu` diagnostics button (`#openGpuDiagnosticsBtn`) opening `chrome://gpu` in a new tab via `chrome.tabs.create`.
- **Diagnostic Logging & UI Feedback**:
  - Tracked active adapter type via `adapter.isFallbackAdapter` and exposed diagnostic metadata (`gpu.adapter: { type, isFallback }`) via `dbg()` for the in-panel debug log.
  - Updated worker initialization and synthesis progress messages to explicitly notify the user when running in CPU fallback mode (`"WebGPU running in CPU fallback mode (slower)…"`, `"Synthesizing X chunks (CPU mode)…"`).
  - Enhanced worker error throwing to provide actionable resolution steps referencing Chrome Settings (`chrome://settings/system`) and `chrome://gpu`.
- **Rebuilt Distribution Bundles** — Bundled updated worker, offscreen, and sidepanel scripts into `dist/` via esbuild.

## [1.3.4] - 2026-09-02

### TTS NLP & Acronym Pronunciation Fixes
- **Hyphen-Separated Letter Spelling** — Changed acronym and initialism expansion (`expandAcronyms`) from space-separation (`A I`, `I P O`) to hyphen-separation (`A-I`, `I-P-O`, `A-P-I`). In eSpeak-ng, standalone lowercase `"a"` surrounded by spaces is parsed as the English indefinite article `/ɐ/` ("uh"), slurring `"a i"` into `"uh-eye"`. Hyphenation forces eSpeak-ng to pronounce each character as its alphabetical letter name (`ˈeɪ`, `ˈaɪ`, `pˈiː`, `ˈoʊ`).
- **Plural Acronym Support** — Plural acronyms now append `'s` (e.g. `A-I's`, `I-P-O's`, `C-P-U's`), producing natural sibilant `/z/` endings (`ˈeɪaɪz`, `ˈaɪpˈiːˈoʊz`, `sˈiːpˈiːjˈuːz`) instead of breaking letter spelling.
- **Expanded Acronym Whitelist & Timezones** — Added `IPO`, `SEO`, `ROI`, `KPI`, `FAQ`, `ATM`, `EV`, `GPS`, `AR`, `VR`, `XR`, and standard timezone abbreviations (`EST`, `PST`, `CST`, `MST`, `GMT`, `UTC`, etc.) to `ACRONYMS_TO_SPELL`.
- **Dotted Initialism Normalization** — Updated `stripAbbreviationPeriods` to convert dotted abbreviations (`U.S.A.`, `A.I.`, `I.P.O.`, `J.K.`) into clean hyphenated letter sequences (`U-S-A`, `A-I`, `I-P-O`, `J-K`) while preserving single middle initials followed by capitalized names (`John F. Kennedy`).
- **Slang Acronym Enunciation** — Converted conversational abbreviation expansions in `expandSlang` (`L-M-A-O`, `O-M-G`, `I-D-K`, `A-S-A-P`, `F-Y-I`, `B-T-W`, etc.) to hyphenated format.
- **Preserved Contractions & Possessives** — Refactored `mergePossessives` to avoid stripping apostrophes from standard contractions (`she's`, `he's`, `there's`, `it's`, `that's`, `what's`), sibilant possessives (`James's`), and names (`O'Connor`), allowing eSpeak-ng to pronounce them with proper phonetics (`/ʃiːz/`, `/ðɛɹz/`, `/dʒeɪmzᵻz/`).
- **Safe Scale Suffix Expansion** — Restricted `expandScaleSuffixes` to multi-digit counts, floats, and explicit count context (`100k views`, `10M downloads`), preventing isolated alphanumerics like `2B`, `3B`, `4B`, `3M`, and `H-1B` from being misread as "two billion" or "three million".
- **Colloquial Slash & Fraction Safety** — Added safeguards in `expandFractions` for `24/7` ("twenty-four seven"), `9/11` ("nine eleven"), `7/11` ("seven eleven"), ratings (`5/5 stars` -> "five out of five stars"), and protected slash-formatted dates (`MM/DD/YYYY`).
- **Protected ISO Dates in Ranges** — Added lookbehind and lookahead to `RE_RANGE` (`(?<!\d-)(?<!\w)(\d+)-(\d+)(?!\w)(?!-\d)`) so ISO dates like `2026-09-02` are not mangled into ranges.
- **Natural 4-Digit Year Pronunciation** — Added `yearToWords` so 4-digit years (1998, 1776, 2024, 2026) are read naturally ("nineteen ninety-eight", "twenty twenty-four") rather than "one thousand nine hundred ninety-eight".
- **Sentence Segmentation & Chunking Pipeline Overhaul** — Completely redesigned `chunkText()` and `segmentSentences()` in `src/worker.js`:
  - **Inverted Processing Order**: Preprocessing (`TextPreprocessor.process`) now executes on text blocks *before* sentence segmentation, neutralizing abbreviation dots (`Dr.`, `Jan.`), initialisms (`U-S-A`), URLs, and decimal numbers so `Intl.Segmenter` never encounters ambiguous periods.
  - **Atomic Sentence Integrity**: Eliminated the mid-sentence comma/semicolon slicing heuristic that was severing compound sentences into isolated clause fragments and injecting robotic silences mid-sentence.
  - **Fluid Sentence Bundling**: Increased bundle threshold to `TARGET_CHUNK_LENGTH = 280` with a safe ceiling of `MAX_CHUNK_LENGTH = 380` (well under the 2-second Windows D3D12 TDR limit), grouping small sentences fluidly while keeping dispatches light and responsive for streaming.
  - **Strict Paragraph Boundaries & Soft-Wrap Flattening**: Paragraph breaks are defined strictly by true double newlines (`\n\n+`). Internal soft newlines (`\n`) are flattened into spaces within paragraphs before segmentation, preventing `Intl.Segmenter` from falsely cutting sentences at line wraps.
  - **Intelligent Dialogue & Ellipsis Stitching**: Added safety heuristics to prevent `Intl.Segmenter` from splitting after ellipses (`...`) or separating lowercase dialogue tags (`"Stop!" she said`).
- **Clause Dash Normalization & Phonemizer Desync Fix** — Resolved a critical upstream token alignment bug in `kitten-tts-webgpu`:
  - **Root Cause**: The WASM phonemizer `Bi()` extracts words using `\S+` and only recognizes `/[;:,.!?¡¿—…""«»""]/` as edge punctuation. When encountering standalone hyphens (`" - "`), double hyphens (`"--"`), en-dashes (`" – "`), or unspaced em-dashes (`"word—word"`), the phonemizer creates extra phantom word tokens in its tracking array that eSpeak-ng produces 0 words for. This desynchronizes the array index, causing every subsequent word in the sentence to be shifted and the entire trailing clause to be cut off and skipped.
  - **Resolution**: Implemented `normalizeDashes()` in `src/textpreprocessor.js` to convert parenthetical / clause-separating dashes (` - `, `--`, `—`, `–`) into commas (which eSpeak and KittenTTS handle natively with correct prosodic pauses), and stripped leading bullet point hyphens (`- Item`) while preserving genuine compound word hyphens (`state-of-the-art`, `A-I`, `twenty-four`, `U-S-A`).
- **Comprehensive Worker & Playback Debug Logging** — Enabled deep visibility into chunking and text synthesis:
  - **Worker Debug Sync**: Fixed an issue where `dbg()` in the Web Worker remained muted because workers lack direct access to `chrome.storage.local`. `offscreen.js` now relays `KITTEN_DEBUG` state to the worker upon startup and whenever toggled.
  - **Text-to-Model Tracing**: Added `synthesize.chunk` logs containing the exact string passed to `synthesizeWithTimeout()`, chunk index, character length, paragraph boundary flag, and planned inter-chunk pause duration.
  - **Segmentation Visibility**: Added `chunkText.paragraph` and `chunkText.summary` logs revealing the segmented sentences and chunk breakdown for any input text.
- **Offscreen Lifecycle & Connection Error Fix (`Receiving end does not exist`)** — Fixed an immediate startup crash in `dist/offscreen.js`:
  - **Root Cause**: Calling `chrome.storage.local.get` and `chrome.storage.onChanged.addListener` in `src/offscreen.js` caused an uncaught `TypeError` on load because Chrome offscreen documents do not have access to the `chrome.storage` API. This killed the offscreen script before `chrome.runtime.onMessage.addListener` was ever attached, causing all subsequent `PARSE_HTML`, `PREWARM_MODEL`, and `PLAY_TEXT` messages to fail with `"Could not establish connection. Receiving end does not exist."`
  - **Resolution**: Removed direct `chrome.storage` calls from `offscreen.js`. Debug flags are now passed via runtime messages (`SET_DEBUG`) from `background.js` and `sidepanel.js` (which have full storage permissions).
- **Punctuation Desynchronization & False Pauses Fix (`src/robustPhonemizer.js`)** — Resolved the critical root cause of periods being ignored and random pauses occurring mid-phrase:
  - **Upstream Root Cause Discovered**: In `kitten-tts-webgpu`'s phonemizer (`Bi()`), all punctuation marks are stripped and stored in an array `E`, while the plain words `l` are passed to eSpeak-ng. The function then iterated through `l` and assumed that eSpeak-ng's output array `Z` has a strict 1:1 index correspondence with `l`. However, eSpeak-ng naturally contracts connected function words (e.g. `"that the"` → `ðætðə`, `"in the"` → `ɪnðə`, losing an index) and expands initialisms/acronyms (e.g. `"AfD's"` → `ˈæf dˈiːz`, gaining an index). Once `Z` and `l` diverged by even 1 token, every subsequent punctuation mark in the chunk shifted: sentence-ending periods were placed onto the first word of the following sentence (e.g. `"enough In . polling ,"` instead of `"enough. In polling,"`), and periods were injected into noun phrases (e.g. `"mainstream . parties"` instead of `"mainstream parties."`), producing the exact skipped periods and phantom mid-phrase pauses observed by the user.
  - **Resolution**: Implemented [`src/robustPhonemizer.js`](file:///c:/Users/llsha/Documents/Atomic_chat/Kitten-tts-webgpu-Chrome/src/robustPhonemizer.js) to replace `kitten-tts-webgpu`'s naive alignment loop. The new phonemizer segments text along punctuation boundaries, phonemizing each clause independently and attaching the punctuation directly to its clause before converting to KittenTTS token IDs. Punctuation can never drift across word or sentence boundaries.
- **Number Normalization & Comma Protection Fix** — Solved issues where numbers with commas (e.g. `1,234 homes`, `3,401-unit`) produced unintelligible or garbled noise:
  - **Root Cause 1: Comma Splitting in Phonemizer**: In `robustPhonemizer.js`, punctuation boundary segmentation matched any `,` including commas inside numbers (`1,234`), shredding numbers into two disjointed clauses (`1` with a pause, and `234`).
  - **Root Cause 2: Trailing Comma Swallowing**: `RE_NUMBER` matched `[\d,]*`, which consumed trailing punctuation commas (e.g. `"1,234,"` swallowed the comma after the number, altering sentence cadence).
  - **Root Cause 3: Squashed Hyphenated Tokens**: Compound number words (`thirty-four`) and hyphenated suffixes (`3,401-unit` → `one-unit`) retained hyphens, causing eSpeak to merge them into run-on syllable tokens without word-space separators (`θˈɜːɾifˈoːɹ`, `wˈʌnjˈuːnɪt`), confusing KittenTTS's duration and attention predictors.
  - **Root Cause 4: Quantity vs. Year Confusion**: 4-digit numbers with commas (like `1,950` or `2,000`) were incorrectly treated as calendar years (`nineteen fifty`) rather than numeric quantities (`one thousand nine hundred fifty`).
  - **Resolutions**:
    - Updated `RE_NUMBER` in `src/textpreprocessor.js` to strictly match grouped digits (`\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b`), protecting trailing clause commas.
    - Updated `numberToWords` and `threeDigitsToWords` to generate clean spaces (`thirty four`) instead of hyphens (`thirty-four`).
    - Added `expandNumberHyphenWord` to separate constructs like `3,401-unit` → `3,401 unit`.
    - Added a failsafe number expansion and comma protector in `src/robustPhonemizer.js` before punctuation clause segmentation.
    - Updated cache versioning in `src/db.js` (`v1.3.5`) to automatically invalidate previously cached audio blobs generated with garbled numbers.
- **Article Cleaner Enhancements (`src/articleCleaner.js`)**:
  - **Drop-Cap Merging**: Added regex repair to re-merge split drop-cap initials common in news articles (e.g. `"T he"` → `"The"`, `"I n"` → `"In"`).
  - **Photo Credit Stripping**: Added filters to remove inline photo credit captions (e.g. `"Photograph: ... / ..."`).
- **Rebuilt Distribution Bundles** — Bundled updated `src/worker.js` and dependencies into `dist/worker.js`, `dist/sidepanel.js`, `dist/offscreen.js`, and `dist/background.js` via esbuild so the extension's offscreen audio worker runs the active preprocessing rules.

### Bug Fixes & Manifest Corrections
- **Manifest Commands Schema Correction** — Removed unsupported `description` field from reserved `_execute_action` command in `manifest.json` which can trigger manifest validation errors in Chrome.
- **Explicit Platform Shortcut Bindings** — Added explicit `windows`, `mac`, `linux`, and `chromeos` platform definitions to `suggested_key` for `read_article_command` (`Alt+Shift+A`) and `_execute_action` (`Alt+Shift+K`) to ensure Chrome registers default shortcuts across all operating systems upon extension install.
- **Robust Background Shortcut Handler** — Enhanced `chrome.commands.onCommand` listener in `background.js` to automatically query the active window/tab if `tab` is undefined or lacks a URL when the shortcut is triggered. Added user-visible in-page toast feedback during article scanning, extraction, and synthesis.
- **Store Listing Documentation** — Updated `CHROMEWEBSTORE.md` feature list to highlight `Alt+Shift+A` as the dedicated keyboard shortcut for scanning and listening to full web articles.

## [1.3.3] - 2026-09-01

### UI / UX Improvements
- **Voice selection reordered** — Kiki is now the default female voice (listed first), and Bella has been moved to the bottom.
- **Polished toggle switches** — Upgraded the "Pre-render full audio before playback" and newly added "Autoplay" options to use modern CSS toggle switches instead of native checkboxes.
- **Dynamic Play Button text** — The play button now polls the audio cache. If the current text, voice, speed, and model match an existing generated audio blob, the button dynamically updates from "Generate Audio" to "Listen to Audio (MM:SS)".
- **Dependent Autoplay logic** — The Autoplay toggle is now intelligently disabled and greyed out if "Pre-render" is unselected, since streaming audio implies immediate playback.

### Improvements
- **Background Generation caching** — Clicking "Stop" during playback now stops the audio output but allows the GPU model to finish synthesizing and caching the audio track in the background. This ensures that GPU work isn't discarded if a user just wanted to silence the playback.

## [1.3.2] - 2026-09-01

### Bug Fixes
- **Month abbreviation expansion** — Added rules to spell out month abbreviations and strip their periods (e.g., "Aug." → "August") before text processing to prevent premature sentence chunking on dates.
- **Improved Article Extraction** — Replaced `innerText` HTML parsing with a custom `articleCleaner.js` DOM walker that accurately interprets block-level tags (`<p>`, `<h1>`, `<div>`, etc.) as hard paragraph breaks, eliminating spacing issues in edge cases. Added heuristic line filters to automatically strip non-content text (e.g., "N MIN READ", newsletter/subscribe prompts).
- **Paragraph-aware chunking** — `worker.js` now splits text strictly by paragraphs before processing sentences. Sentence chunks now track paragraph boundaries, triggering a longer 0.45s pause at the end of paragraphs for more natural pacing and newscast-like delivery of subheaders.

## [1.3.1] - 2026-08-28

### Bug Fixes
- **Missing spaces at sentence boundaries** — When Readability strips HTML block elements (`<p>`, `<div>`), adjacent sentences can fuse without whitespace (e.g., "this.And"), causing TTS to read the period literally as "this-DOT-And". Added `fixMissingSentenceSpacing()` to the text preprocessor pipeline that detects `(word)(punctuation)(CapitalLetter)` patterns and inserts a space. URLs, emails, abbreviations (Mr., Dr., etc.), decimal numbers, and dotted identifiers (U.S.A.) are shielded from modification. Runs early in the pipeline before URL removal so URLs can be properly detected and protected.

## [1.3.0] - 2026-08-28

### Bug Fixes
- **Local model loading** — nano model now loads from the extension's bundled `models/` directory instead of downloading from HuggingFace on every use. Switched from the library's `textToSpeech()` convenience function to the direct `KittenTTSEngine` API (`engine.init()` → `engine.loadModel()` → `textToInputIds()` → `engine.generate()` → `float32ToWav()`). Micro/mini models still download from HuggingFace on first use (browser-cached after).
- **Status message spam** — the library's `onProgress` callback was firing "Phonemizing…" and "Generating speech…" for every chunk, overwriting the percentage progress in the toast/sidepanel. Now only forwards engine init/load progress (useful on first run) and sends clean `TTS_PROGRESS` with percentage for subsequent chunks.
- **Audio gaps between chunks** — added pre-buffering: the first 3 audio chunks are collected before playback starts, giving the GPU a head start. Previously, playback started immediately on the first chunk and could outrun synthesis, causing audible gaps mid-sentence when chunk boundaries fell within a sentence.

### Improvements
- **Replay cache** — pressing Play again with the same text/voice/speed/model instantly replays cached audio without re-synthesizing. The cache is invalidated when any parameter changes.
- **Chunk size increase** — `MAX_CHUNK_LENGTH` raised from 200 → 350 characters (library supports up to 500). This keeps most scientific/complex sentences intact instead of splitting them mid-clause.
- **Improved clause splitting** — long sentences are now split at semicolons/colons/dashes first, then commas, then word boundaries as a last resort (previously split on all punctuation equally).
- **Reduced yield** — inter-chunk yield reduced from 60ms → 20ms to minimize synthesis pipeline latency.

## [1.2.0] - 2026-08-28

### Bug Fixes
- **PREWARM_MODEL handler added** — sidepanel.js was sending PREWARM_MODEL to the offscreen document, but no handler existed. The model now pre-warms on panel open, eliminating the cold-start delay on first play.
- **status-dot.playing CSS rule added** — the JavaScript was setting `className = "status-dot playing"` but the CSS only defined `.status-dot.busy`. Added a green pulsing dot style for the playing state.
- **Preference persistence** — voice, model, and speed selections in the side panel are now saved to `chrome.storage.local` and restored on panel reopen. Context menu and keyboard shortcut actions now use the user's actual UI preferences instead of hardcoded defaults.
- **Chrome message channel lifecycle** — `PLAY_TEXT`, `STOP_AUDIO`, and `GET_DOWNLOAD_BLOB` handlers in offscreen.js now properly `return true` to keep the message channel open for async responses.
- **Premature "playing" state** — the offscreen worker was sending `state: "playing"` immediately before any audio was generated. Now sends `state: "busy"` during synthesis and only transitions to `state: "playing"` after the first audio chunk is scheduled for playback.
- **Race condition guard** — added a monotonic generation ID counter to prevent overlapping `PLAY_TEXT` calls from corrupting audio scheduling.
- **GET_DOWNLOAD_BLOB empty state** — now returns an explicit error response when no audio buffers are available, instead of silently closing the message channel.
- **Contraction expansion ordering** — moved `it's`, `he's`, `she's`, `who's`, `what's`, `that's`, `there's`, `here's`, `where's` before generic `'d`/`'m` patterns so they're correctly expanded.

### Improvements
- **URL blocklist expanded** — `about:blank`, `chrome-extension://` pages now blocked from toast injection and article extraction, in addition to existing `chrome://` and `edge://` checks.
- **`dispatchPlayText()` helper** — extracted the repeated setup→prefs→sendMessage pattern (was duplicated 3 times in background.js) into a single shared function.
- **Character count display** — textarea now shows character count and estimated chunk count below the input.
- **Keyboard shortcut hint** — `Alt+Shift+A` shortcut is now displayed below the Extract Article button.
- **Status dot animations** — both `.busy` (indigo) and `.playing` (green) states now have a pulsing animation for better visual feedback.
