// background.js
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
  if (typeof self !== "undefined" && self.clients) {
    const matchedClients = await self.clients.matchAll();
    return matchedClients.some((c) => c.url.includes(OFFSCREEN_DOCUMENT_PATH));
  }
  return false;
}

async function setupOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Synthesizing text with KittenTTS WebGPU"
  });

  for (let i = 0; i < 10; i++) {
    try {
      const res = await chrome.runtime.sendMessage({ type: "PING_OFFSCREEN" });
      if (res?.ready) break;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function getStoredPreferences() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { preferredVoice: "Jasper", preferredModel: "nano", preferredSpeed: "1.0" },
      (items) => {
        resolve({
          voice: items.preferredVoice,
          model: items.preferredModel,
          speed: parseFloat(items.preferredSpeed || "1.0")
        });
      }
    );
  });
}

/**
 * Shared helper: set up offscreen document, load preferences, and dispatch PLAY_TEXT.
 * Eliminates the repeated setup → prefs → sendMessage pattern that was duplicated 3 times.
 */
async function dispatchPlayText(text) {
  await setupOffscreenDocument();
  const prefs = await getStoredPreferences();
  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PLAY_TEXT",
    text,
    ...prefs
  }).catch(() => {});
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
      chrome.action.setTitle({ title: "Kitten TTS WebGPU" });
    }, 4500);
  } else if (state === "idle") {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Kitten TTS WebGPU" });
  }
}

// 2. In-Page Floating Toast UI (Injectable helper)
async function sendToastToActiveTab(payload) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || isBlockedUrl(tab.url)) return;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (data) => {
        let toast = document.getElementById("__kitten_tts_toast");
        if (data.action === "remove") {
          if (toast) {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
          }
          return;
        }

        if (!toast) {
          toast = document.createElement("div");
          toast.id = "__kitten_tts_toast";
          toast.style.cssText = `
            position: fixed; top: 16px; right: 16px; z-index: 2147483647;
            background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif;
            font-size: 12px; font-weight: 500; padding: 8px 14px; border-radius: 20px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 10px;
            border: 1px solid rgba(255,255,255,0.1); transition: opacity 0.2s ease, transform 0.2s ease;
          `;
          document.body.appendChild(toast);
        }

        toast.style.opacity = "1";
        toast.innerHTML = `
          <span>🐾 <strong>Kitten TTS:</strong> ${data.text}</span>
          <button id="__kitten_stop_btn" style="
            background: #ef4444; border: none; color: white; padding: 2px 8px;
            border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 600;
          ">⏹ Stop</button>
        `;

        document.getElementById("__kitten_stop_btn")?.addEventListener("click", () => {
          chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_AUDIO" });
          toast.remove();
        });
      },
      args: [payload]
    });
  } catch (_) {}
}

async function openSidePanel(tab) {
  if (!tab) return;
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(async () => {
      if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    });
  } else if (tab.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
}

async function runArticleExtractor(tab) {
  if (!tab?.id) throw new Error("No active tab found.");
  if (isBlockedUrl(tab.url)) {
    throw new Error("Cannot extract from browser internal pages.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["dist/extractor.js"]
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__kittenArticleExtractor?.()
  });

  let article = results?.[0]?.result;
  
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
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
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
      await sendToastToActiveTab({ action: "remove" });
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
    }
  }
});

// 6. Global Message Router (Updates Badge & In-Page Toast from Offscreen progress)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TTS_PROGRESS") {
    updateActionBadge("loading", `${msg.percent}%`, `Synthesizing audio: ${msg.percent}%`);
    sendToastToActiveTab({ text: `Synthesizing: ${msg.percent}% (${msg.current}/${msg.total})` });
  } else if (msg.type === "TTS_STATUS") {
    if (msg.state === "playing") {
      updateActionBadge("playing", "▶", "Playing audio");
      sendToastToActiveTab({ text: "Playing audio" });
    } else if (msg.state === "idle" || msg.state === "stopped") {
      updateActionBadge("idle");
      sendToastToActiveTab({ action: "remove" });
    } else if (msg.state === "error") {
      updateActionBadge("error", "!", msg.status);
      sendToastToActiveTab({ text: `Error: ${msg.status}` });
      setTimeout(() => sendToastToActiveTab({ action: "remove" }), 4000);
    } else if (msg.state === "busy") {
      updateActionBadge("loading", "...", msg.status);
      sendToastToActiveTab({ text: msg.status });
    }
  }

  if (msg.type === "ENSURE_OFFSCREEN") {
    setupOffscreenDocument().then(() => sendResponse({ ready: true }));
    return true;
  }

  if (msg.type === "RESET_GPU_OFFSCREEN") {
    (async () => {
      try {
        if (await hasOffscreenDocument()) {
          await chrome.offscreen.closeDocument().catch(() => {});
        }
        if ("caches" in self) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        await chrome.storage.local.remove(["ttsText"]).catch(() => {});
        updateActionBadge("idle");
        sendToastToActiveTab({ action: "remove" });
        await setupOffscreenDocument();
        sendResponse({ success: true, message: "GPU engine reset & cache cleared." });
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