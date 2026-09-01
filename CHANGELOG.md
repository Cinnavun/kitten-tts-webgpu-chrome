# Changelog

All notable changes to this project will be documented in this file.

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
