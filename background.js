// background.js
import { generateCacheKey, getAudio, clearAudioCache } from './src/db.js';
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

// Access control is delegated directly to the browser runtime: API operations
// (chrome.scripting.executeScript, chrome.tabs.sendMessage) are executed and handled
// via try/catch, respecting user flags (e.g. --extensions-on-chrome-urls, file:// access,
// and custom reader schemes like Edge reader mode) without client-side gatekeeping.

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
  if (area === "local" && "KITTEN_DEBUG" in changes) {
    chrome.runtime.sendMessage({ target: "offscreen", type: "SET_DEBUG", enabled: changes.KITTEN_DEBUG.newValue === true }).catch(() => {});
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
    chrome.action.setTitle({ title: tooltip || `Mews Reader: Synthesizing (${text})` });
  } else if (state === "playing") {
    chrome.action.setBadgeText({ text: "▶" });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Green
    chrome.action.setTitle({ title: tooltip || "Mews Reader: Playing audio" });
  } else if (state === "error") {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }); // Red
    chrome.action.setTitle({ title: `Mews Reader Error: ${tooltip}` });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: "Mews Reader: Private Full-Page TTS" });
    }, 4500);
  } else if (state === "idle") {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Mews Reader: Private Full-Page TTS" });
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
// Only populated when the user explicitly triggers an in-page background reading session.
let activeToastTabId = null;

async function sendToastToActiveTab(payload, targetTabId = activeToastTabId) {
  if (!targetTabId) return; // Never show in-page toasts when not in an active toast session

  try {
    try {
      await chrome.tabs.sendMessage(targetTabId, {
        type: "SHOW_TOAST",
        payload
      });
    } catch (err) {
      if (err.message && err.message.includes("Receiving end does not exist")) {
        try {
          await ensureContentScriptsInjected(targetTabId);
          await chrome.tabs.sendMessage(targetTabId, {
            type: "SHOW_TOAST",
            payload
          });
        } catch (_) {
          // If script injection is denied by browser/policy, fallback to notification
          if (payload.text && (payload.text.toLowerCase().includes("error") || payload.text.includes("Cannot extract"))) {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icons/icon48.png",
              title: "Mews Reader",
              message: payload.text
            });
          }
        }
      } else {
        // Any other message dispatch error (e.g. tab closed or unscriptable context)
        if (payload.text && (payload.text.toLowerCase().includes("error") || payload.text.includes("Cannot extract"))) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon48.png",
            title: "Mews Reader",
            message: payload.text
          });
        }
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

  try {
    await ensureContentScriptsInjected(tab.id);
  } catch (err) {
    throw new Error(err?.message || "Cannot access or script this page.");
  }

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
      title: "🐾 Open Mews Reader Side Panel",
      contexts: ["page"]
    });
  });

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
  }
  if (chrome.commands?.getAll) {
    chrome.commands.getAll((commands) => {
      console.log("[KittenTTS] Registered keyboard commands:", commands);
    });
  }
});

// 4. Handle Context Menu Actions
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "selection-read-bg" && info.selectionText) {
    activeToastTabId = tab?.id || null;
    updateActionBadge("loading", "0%", "Starting WebGPU...");
    if (activeToastTabId) {
      await sendToastToActiveTab({ text: "Initializing WebGPU..." }, activeToastTabId);
    }
    await dispatchPlayText(info.selectionText);
  } else if (info.menuItemId === "selection-read-panel" && info.selectionText) {
    // Reading in side panel: clear activeToastTabId so no floating toasts appear in webpage
    activeToastTabId = null;
    await openSidePanel(tab);
    await chrome.storage.local.set({ ttsText: info.selectionText });
    await dispatchPlayText(info.selectionText);
  } else if (info.menuItemId === "page-read-article-bg" && tab?.id) {
    activeToastTabId = tab.id;
    try {
      updateActionBadge("loading", "...", "Extracting article...");
      await sendToastToActiveTab({ text: "Extracting article..." }, activeToastTabId);
      const article = await runArticleExtractor(tab);
      if (article?.text) {
        await sendToastToActiveTab({ text: "Article extracted, starting GPU..." }, activeToastTabId);
        await dispatchPlayText(article.text);
      } else {
        updateActionBadge("error", "!", "No readable article found.");
        await sendToastToActiveTab({ text: "No readable article found on this page." }, activeToastTabId);
        setTimeout(() => {
          sendToastToActiveTab({ action: "remove" }, activeToastTabId);
          activeToastTabId = null;
        }, 3000);
      }
    } catch (err) {
      updateActionBadge("error", "!", err.message);
      await sendToastToActiveTab({ text: `Error: ${err.message}` }, activeToastTabId);
      setTimeout(() => {
        sendToastToActiveTab({ action: "remove" }, activeToastTabId);
        activeToastTabId = null;
      }, 3000);
    }
  } else if (info.menuItemId === "page-open-panel-only") {
    await openSidePanel(tab);
  }
});

// 5. Shortcut Handler
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "read_article_command") {
    let targetTab = tab;
    if (!targetTab?.id) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTab = activeTab;
    }
    if (!targetTab?.id) return;

    activeToastTabId = targetTab.id;
    try {
      updateActionBadge("loading", "...", "Extracting article...");
      await sendToastToActiveTab({ text: "Extracting article..." }, activeToastTabId);
      const article = await runArticleExtractor(targetTab);
      if (article?.text) {
        await sendToastToActiveTab({ text: "Article extracted, starting GPU..." }, activeToastTabId);
        await dispatchPlayText(article.text);
      } else {
        updateActionBadge("error", "!", "No readable article found.");
        await sendToastToActiveTab({ text: "No readable article found on this page." }, activeToastTabId);
        setTimeout(() => {
          sendToastToActiveTab({ action: "remove" }, activeToastTabId);
          activeToastTabId = null;
        }, 3000);
      }
    } catch (err) {
      updateActionBadge("error", "!", err.message);
      await sendToastToActiveTab({ text: `Error: ${err.message}` }, activeToastTabId);
      setTimeout(() => {
        sendToastToActiveTab({ action: "remove" }, activeToastTabId);
        activeToastTabId = null;
      }, 3000);
    }
  }
});

// ─── Port-based relay ─────────────────────────────────────────────────────────
// tts-stream: connected by the offscreen document for progress/status messages.
// tts-ui:     connected by the side panel to receive those relayed messages.
// An open Port is a native MV3 keep-alive — no heartbeat interval needed.

let offscreenPort = null;   // the tts-stream port from offscreen.js
let uiPort = null;          // the tts-ui port from sidepanel.js

let currentPlaybackState = {
  state: "idle",
  status: "Ready",
  percent: 0,
  current: 0,
  total: 0
};

function stopPlayback() {
  // Do NOT destroy/close the offscreen document on normal playback stop or idle!
  // Closing the document wipes the prewarmed WebGPU pipelines and cache.
  // The offscreen document is only closed during explicit RESET_GPU_OFFSCREEN.
  currentPlaybackState.state = "idle";
  currentPlaybackState.status = "Ready";
  updateActionBadge("idle");
}

/**
 * Handle a progress/status message arriving over the tts-stream port.
 * Updates the action badge, the in-page toast, and relays to the side panel.
 */
function handleStreamMessage(msg) {
  if (msg.type === "TTS_PROGRESS") {
    currentPlaybackState.state = "busy";
    currentPlaybackState.percent = msg.percent;
    currentPlaybackState.current = msg.current;
    currentPlaybackState.total = msg.total;
    currentPlaybackState.status = `Synthesizing audio... ${msg.percent}%`;

    updateActionBadge("loading", `${msg.percent}%`, `Synthesizing audio: ${msg.percent}%`);
    if (activeToastTabId) {
      sendToastToActiveTab({ text: `Synthesizing: ${msg.percent}% (${msg.current}/${msg.total})` }, activeToastTabId);
    }
  } else if (msg.type === "TTS_STATUS") {
    currentPlaybackState.state = msg.state;
    if (msg.status) currentPlaybackState.status = msg.status;

    if (msg.state === "playing") {
      updateActionBadge("playing", "▶", "Playing audio");
      if (activeToastTabId) {
        sendToastToActiveTab({ text: "Playing audio" }, activeToastTabId);
      }
    } else if (msg.state === "idle" || msg.state === "stopped") {
      stopPlayback();
      if (activeToastTabId) {
        sendToastToActiveTab({ action: "remove" }, activeToastTabId);
        activeToastTabId = null;
      }
    } else if (msg.state === "error") {
      updateActionBadge("error", "!", msg.status);
      if (activeToastTabId) {
        sendToastToActiveTab({ text: `Error: ${msg.status}` }, activeToastTabId);
        setTimeout(() => {
          sendToastToActiveTab({ action: "remove" }, activeToastTabId);
          activeToastTabId = null;
        }, 4000);
      }
      stopPlayback();
    } else if (msg.state === "busy") {
      updateActionBadge("loading", "...", msg.status);
      if (activeToastTabId) {
        sendToastToActiveTab({ text: msg.status }, activeToastTabId);
      }
    }
  }

  // Relay to side panel if it's connected
  try { uiPort?.postMessage(msg); } catch (_) { uiPort = null; }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "tts-stream") {
    offscreenPort = port;
    port.onMessage.addListener(handleStreamMessage);
    port.onDisconnect.addListener(() => { offscreenPort = null; });
  } else if (port.name === "tts-ui") {
    uiPort = port;
    // Immediately synchronize the newly connected side panel with current state
    if (currentPlaybackState.state !== "idle") {
      try {
        uiPort.postMessage({
          type: "TTS_STATE_SYNC",
          ...currentPlaybackState
        });
      } catch (_) { }
    }
    port.onDisconnect.addListener(() => { uiPort = null; });
  }
});

// 6. Global Message Router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "ENSURE_OFFSCREEN") {
    (async () => {
      try {
        await setupOffscreenDocument();
        sendResponse({ ready: true });
      } catch (err) {
        sendResponse({ ready: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "CLEAR_AUDIO_CACHE") {
    (async () => {
      try {
        await clearAudioCache();
        sendResponse({ success: true, message: "Audio cache cleared." });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
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
        if (activeToastTabId) {
          sendToastToActiveTab({ action: "remove" }, activeToastTabId);
          activeToastTabId = null;
        }
        await setupOffscreenDocument();
        sendResponse({ success: true, message: "GPU engine reset & model cache cleared." });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "GET_CURRENT_PLAYBACK_STATE") {
    sendResponse({ ...currentPlaybackState });
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
