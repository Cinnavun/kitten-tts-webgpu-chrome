# Changelog

All notable changes to this project will be documented in this file.

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
