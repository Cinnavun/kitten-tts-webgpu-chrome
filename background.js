// background.js
import { generateCacheKey, getAudio, clearAudioCache } from './src/db.js';
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

/** URLs that cannot be injected into or extracted from. */
const BLOCKED_URL_PREFIXES = [
  "chrome://", "chrome-extension://", "edge://",
  "about:", "chromewebstore.google.com"
];

function isBlockedUrl(url) {
  if (!url) return true;
  return BLOCKED_URL_PREFIXES.some((prefix) => url.startsWith(prefix) || url.includes(prefix));
}

async function hasOffscreenDocument() {
  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return contexts.length > 0;
  }
  if (typeof self !== "undefined" && /** @type {any} */ (self).clients) {
    const matchedClients = await /** @type {any} */ (self).clients.matchAll();
    return matchedClients.some((c) => c.url.includes(OFFSCREEN_DOCUMENT_PATH));
  }
  return false;
}

let creatingOffscreenPromise = null;

async function setupOffscreenDocument() {
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  if (await hasOffscreenDocument()) return;

  creatingOffscreenPromise = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.WORKERS || chrome.offscreen.Reason.DOM_PARSER],
        justification: "Runs a WebGPU synthesis worker and renders audio"
      });

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          resolve(undefined);
        }, 5000);

        const listener = (msg) => {
          if (msg.type === "OFFSCREEN_READY") {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            resolve(undefined);
          }
        };
        chrome.runtime.onMessage.addListener(listener);
      });
    } finally {
      creatingOffscreenPromise = null;
    }
  })();
  
  return creatingOffscreenPromise;
}

let cachedPrefs = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && cachedPrefs) {
    if (changes.preferredVoice) cachedPrefs.voice = changes.preferredVoice.newValue;
    if (changes.preferredModel) cachedPrefs.model = changes.preferredModel.newValue;
    if (changes.preferredSpeed) cachedPrefs.speed = parseFloat(changes.preferredSpeed.newValue || "1.0");
    if (changes.renderBeforePlay) cachedPrefs.renderBeforePlay = changes.renderBeforePlay.newValue;
  }
});

async function getStoredPreferences() {
  if (cachedPrefs) return cachedPrefs;
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { preferredVoice: "Jasper", preferredModel: "nano", preferredSpeed: "1.0", renderBeforePlay: false },
      (items) => {
        cachedPrefs = {
          voice: items.preferredVoice,
          model: items.preferredModel,
          speed: parseFloat(items.preferredSpeed || "1.0"),
          renderBeforePlay: items.renderBeforePlay
        };
        resolve(cachedPrefs);
      }
    );
  });
}

/**
 * Shared helper: set up offscreen document, load preferences, and dispatch PLAY_TEXT.
 * Eliminates the repeated setup → prefs → sendMessage pattern that was duplicated 3 times.
 */
async function dispatchPlayText(text) {
  const [_, prefs] = await Promise.all([
    setupOffscreenDocument(),
    getStoredPreferences()
  ]);
  
  const cacheKey = await generateCacheKey(text, prefs.voice, prefs.speed, prefs.model);
  const cachedBlob = await getAudio(cacheKey);

  if (cachedBlob) {
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PLAY_CACHED",
      cacheKey
    }).catch(() => { });
  } else {
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PLAY_TEXT",
      text,
      ...prefs,
      cacheKey
    }).catch(() => { });
  }
}

// 1. Toolbar Badge & Tooltip Manager
function updateActionBadge(state, text = "", tooltip = "") {
  if (state === "loading") {
    chrome.action.setBadgeText({ text: text || "..." });
    chrome.action.setBadgeBackgroundColor({ color: "#6366f1" }); // Indigo
    chrome.action.setTitle({ title: tooltip || `Kitten TTS: Synthesizing (${text})` });
  } else if (state === "playing") {
    chrome.action.setBadgeText({ text: "▶" });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Green
    chrome.action.setTitle({ title: tooltip || "Kitten TTS: Playing audio" });
  } else if (state === "error") {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }); // Red
    chrome.action.setTitle({ title: `Kitten TTS Error: ${tooltip}` });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: "Kitten TTS WebGPU Chrome" });
    }, 4500);
  } else if (state === "idle") {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Kitten TTS WebGPU Chrome" });
  }
}

async function ensureContentScriptsInjected(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window["__kittenTTSInjected"] === true
  }).catch(() => null);

  if (results && results[0] && results[0].result === true) {
    return; // Already injected
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["dist/extractor.js", "content.js"]
  });
}

// 2. In-Page Floating Toast UI (via content script)
async function sendToastToActiveTab(payload) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    
    if (isBlockedUrl(tab.url)) {
      if (payload.text && (payload.text.toLowerCase().includes("error") || payload.text.includes("Cannot extract"))) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Kitten TTS Error",
          message: payload.text
        });
      }
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_TOAST",
        payload
      });
    } catch (err) {
      if (err.message && err.message.includes("Receiving end does not exist")) {
        await ensureContentScriptsInjected(tab.id);
        await chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_TOAST",
          payload
        });
      }
    }
  } catch (_) { }
}

async function openSidePanel(tab) {
  if (!tab) return;
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(async () => {
      if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => { });
    });
  } else if (tab.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => { });
  }
}

async function runArticleExtractor(tab) {
  if (!tab?.id) throw new Error("No active tab found.");
  if (isBlockedUrl(tab.url)) {
    throw new Error("Cannot extract from browser internal pages.");
  }

  await ensureContentScriptsInjected(tab.id);

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (typeof window["__kittenArticleExtractor"] === "function") {
        return window["__kittenArticleExtractor"]();
      }
      return { error: "Extractor not found in page context." };
    }
  });

  const response = results && results[0] ? results[0].result : { error: "Execution failed" };

  if (response?.error) {
    throw new Error(response.error);
  }

  let article = response;

  if (article?.html) {
    await setupOffscreenDocument();
    article = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PARSE_HTML",
      html: article.html,
      url: article.url
    });
  }

  return article;
}

// 3. Register Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "selection-read-bg",
      title: "▶ Read Selected Text in Background",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "selection-read-panel",
      title: "📋 Read Selected Text in Side Panel",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "page-read-article-bg",
      title: "📰 Listen to Full Article in Background",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "page-open-panel-only",
      title: "🐾 Open Kitten TTS Side Panel",
      contexts: ["page"]
    });
  });

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
  }
});

// 4. Handle Context Menu Actions
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "selection-read-bg" && info.selectionText) {
    updateActionBadge("loading", "0%", "Starting WebGPU...");
    await sendToastToActiveTab({ text: "Initializing WebGPU..." });
    await dispatchPlayText(info.selectionText);
  } else if (info.menuItemId === "selection-read-panel" && info.selectionText) {
    await openSidePanel(tab);
    await chrome.storage.local.set({ ttsText: info.selectionText });
    await dispatchPlayText(info.selectionText);
  } else if (info.menuItemId === "page-read-article-bg" && tab?.id) {
    try {
      updateActionBadge("loading", "...", "Extracting article...");
      const article = await runArticleExtractor(tab);
      if (article?.text) {
        await sendToastToActiveTab({ text: "Article extracted, starting GPU..." });
        await dispatchPlayText(article.text);
      } else {
        updateActionBadge("error", "!", "No readable article found.");
        await sendToastToActiveTab({ action: "remove" });
      }
    } catch (err) {
      updateActionBadge("error", "!", err.message);
      await sendToastToActiveTab({ text: `Error: ${err.message}` });
    }
  } else if (info.menuItemId === "page-open-panel-only") {
    await openSidePanel(tab);
  }
});

// 5. Shortcut Handler
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "read_article_command" && tab?.id) {
    try {
      updateActionBadge("loading", "...", "Extracting article...");
      const article = await runArticleExtractor(tab);
      if (article?.text) {
        await dispatchPlayText(article.text);
      }
    } catch (err) {
      updateActionBadge("error", "!", err.message);
      await sendToastToActiveTab({ text: `Error: ${err.message}` });
    }
  }
});

// ─── Port-based relay ─────────────────────────────────────────────────────────
// tts-stream: connected by the offscreen document for progress/status messages.
// tts-ui:     connected by the side panel to receive those relayed messages.
// An open Port is a native MV3 keep-alive — no heartbeat interval needed.

let offscreenPort = null;   // the tts-stream port from offscreen.js
let uiPort = null;          // the tts-ui port from sidepanel.js

async function stopPlayback() {
  const hasDoc = await hasOffscreenDocument();
  if (hasDoc) {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
  updateActionBadge("idle");
}

/**
 * Handle a progress/status message arriving over the tts-stream port.
 * Updates the action badge, the in-page toast, and relays to the side panel.
 */
function handleStreamMessage(msg) {
  // Relay to side panel if it's connected
  try { uiPort?.postMessage(msg); } catch (_) { uiPort = null; }

  if (msg.type === "TTS_PROGRESS") {
    updateActionBadge("loading", `${msg.percent}%`, `Synthesizing audio: ${msg.percent}%`);
    sendToastToActiveTab({ text: `Synthesizing: ${msg.percent}% (${msg.current}/${msg.total})` });
  } else if (msg.type === "TTS_STATUS") {
    if (msg.state === "playing") {
      updateActionBadge("playing", "▶", "Playing audio");
      sendToastToActiveTab({ text: "Playing audio" });
    } else if (msg.state === "idle" || msg.state === "stopped") {
      stopPlayback();
      sendToastToActiveTab({ action: "remove" });
    } else if (msg.state === "error") {
      updateActionBadge("error", "!", msg.status);
      sendToastToActiveTab({ text: `Error: ${msg.status}` });
      setTimeout(() => sendToastToActiveTab({ action: "remove" }), 4000);
      stopPlayback();
    } else if (msg.state === "busy") {
      updateActionBadge("loading", "...", msg.status);
      sendToastToActiveTab({ text: msg.status });
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "tts-stream") {
    offscreenPort = port;
    port.onMessage.addListener(handleStreamMessage);
    port.onDisconnect.addListener(() => { offscreenPort = null; });
  } else if (port.name === "tts-ui") {
    uiPort = port;
    port.onDisconnect.addListener(() => { uiPort = null; });
  }
});

// 6. Global Message Router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "ENSURE_OFFSCREEN") {
    setupOffscreenDocument().then(() => sendResponse({ ready: true }));
    return true;
  }

  if (msg.type === "CLEAR_AUDIO_CACHE") {
    clearAudioCache()
      .then(() => sendResponse({ success: true, message: "Audio cache cleared." }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === "RESET_GPU_OFFSCREEN") {
    (async () => {
      try {
        if (await hasOffscreenDocument()) {
          // Tell offscreen to explicitly terminate the worker to force immediate WebGPU GC
          await chrome.runtime.sendMessage({ target: "offscreen", type: "RESET_WORKER" }).catch(() => {});
          // Then completely close the offscreen document
          await chrome.offscreen.closeDocument().catch(() => { });
        }
        if ("caches" in self) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        await chrome.storage.local.remove(["ttsText"]).catch(() => { });
        updateActionBadge("idle");
        sendToastToActiveTab({ action: "remove" });
        await setupOffscreenDocument();
        sendResponse({ success: true, message: "GPU engine reset & model cache cleared." });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "EXTRACT_CURRENT_TAB_ARTICLE") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          sendResponse({ error: "No active tab found." });
          return;
        }
        const article = await runArticleExtractor(tab);
        sendResponse({ article });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});
