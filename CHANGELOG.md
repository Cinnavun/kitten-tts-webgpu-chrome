# Changelog

All notable changes to this project will be documented in this file.

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
