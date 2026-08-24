// background.js
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

async function hasOffscreenDocument() {
  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return contexts.length > 0;
  }
  const matchedClients = await clients.matchAll();
  return matchedClients.some((c) => c.url.includes(OFFSCREEN_DOCUMENT_PATH));
}

async function setupOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Synthesizing text with KittenTTS WebGPU"
  });
}

async function runArticleExtractor(tab) {
  if (!tab || !tab.id) {
    throw new Error("No active tab found.");
  }
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:") ||
    tab.url.includes("chromewebstore.google.com")
  ) {
    throw new Error("Cannot extract articles from browser internal pages.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["dist/extractor.js"]
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__kittenArticleExtractor?.()
  });

  return results?.[0]?.result;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "read-aloud-panel",
    title: "Read Selected Text with Kitten TTS",
    contexts: ["selection"]
  });
  if (chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "read-aloud-panel" && info.selectionText) {
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    await chrome.storage.local.set({ ttsText: info.selectionText });
    await setupOffscreenDocument();
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PLAY_TEXT",
      text: info.selectionText
    }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "read_article_command" && tab?.id) {
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    try {
      const article = await runArticleExtractor(tab);
      if (article?.text) {
        await chrome.storage.local.set({ ttsText: article.text });
        await setupOffscreenDocument();
        chrome.runtime.sendMessage({
          target: "offscreen",
          type: "PLAY_TEXT",
          text: article.text
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[KittenTTS] Command error:", err);
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
        await setupOffscreenDocument();
        sendResponse({ success: true, message: "GPU engine reset & cache cleared." });
      } catch (err) {
        console.error("[KittenTTS] Reset error:", err);
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
        console.error("[KittenTTS] Extract message error:", err);
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});