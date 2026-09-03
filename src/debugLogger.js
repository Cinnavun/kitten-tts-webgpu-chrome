// src/debugLogger.js
//
// Lightweight debug logger for KittenTTS.
//
// Usage (any context: worker, offscreen, sidepanel, background):
//   import { dbg } from "./debugLogger.js";
//   dbg("chunkText", { input, chunks });
//
// Enable via the extension's Debug panel, or in any DevTools console:
//   chrome.storage.local.set({ KITTEN_DEBUG: true });
//
// Disable:
//   chrome.storage.local.set({ KITTEN_DEBUG: false });
//
// Context detection:
//   - Web Worker: posts { type: "TTS_DEBUG_LOG", tag, data, ts } via self.postMessage
//     which offscreen.js receives and relays to the background port → sidepanel
//   - Extension pages (offscreen, sidepanel, background): uses console.debug
//     and chrome.storage for the flag
//   - No-extension environments (unit tests): silent

/** @type {boolean} */
let _enabled = false;

// ── Context detection ────────────────────────────────────────────────────────

/** True when running inside a Web Worker (no `window`, has `self.postMessage`) */
const IS_WORKER = typeof window === "undefined" && typeof self !== "undefined" && typeof self.postMessage === "function";

/** True when chrome storage API is available */
const HAS_STORAGE = typeof chrome !== "undefined" && Boolean(chrome?.storage?.local);

if (HAS_STORAGE) {
  try {
    // Read persisted flag on startup
    chrome.storage.local.get("KITTEN_DEBUG", (result) => {
      _enabled = result?.KITTEN_DEBUG === true;
    });

    // Keep in sync while the panel is open
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && "KITTEN_DEBUG" in changes) {
          const prev = _enabled;
          _enabled = changes.KITTEN_DEBUG.newValue === true;
          if (!IS_WORKER) {
            if (_enabled && !prev) {
              console.info("[KittenTTS] 🐾 Debug logging ENABLED.");
            } else if (!_enabled && prev) {
              console.info("[KittenTTS] Debug logging DISABLED.");
            }
          }
        }
      });
    }
  } catch (_) {
    // Gracefully handle contexts where storage access is restricted
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a named debug event with arbitrary data.
 *
 * In a Web Worker: posts { type: "TTS_DEBUG_LOG", tag, data, ts } so offscreen.js
 * can relay it to the sidepanel via the persistent port.
 *
 * In extension pages: writes to console.debug only.
 *
 * @param {string} tag - Short identifier (e.g. "chunkText", "readability.parsed")
 * @param {unknown} [data] - Any JSON-serialisable value
 */
export function dbg(tag, data) {
  if (!_enabled) return;

  const ts = Date.now();

  if (IS_WORKER) {
    // Relay via worker message so offscreen.js can forward to sidepanel port
    try {
      const serialised = JSON.parse(JSON.stringify(data ?? null));
      self.postMessage({ type: "TTS_DEBUG_LOG", tag, data: serialised, ts });
    } catch (_) {
      self.postMessage({ type: "TTS_DEBUG_LOG", tag, data: String(data), ts });
    }
  }

  // Always write to DevTools console in the current context (console.log is visible by default)
  if (typeof data === "string") {
    console.log(`[KittenTTS:${tag}]`, data);
  } else {
    try {
      console.log(`[KittenTTS:${tag}]`, JSON.parse(JSON.stringify(data ?? null)));
    } catch (_) {
      console.log(`[KittenTTS:${tag}]`, data);
    }
  }
}

/**
 * Whether debug logging is currently enabled.
 * @returns {boolean}
 */
export function isDebugEnabled() {
  return _enabled;
}

/**
 * Manually enable or disable debug logging (essential for Web Workers without chrome.storage).
 * @param {boolean} val
 */
export function setDebugEnabled(val) {
  _enabled = Boolean(val);
}
