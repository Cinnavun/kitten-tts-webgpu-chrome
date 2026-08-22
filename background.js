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
    justification: "Synthesizing text with KittenTTS WebGPU and playing audio in background"
  });
}

// In-page Article Extractor function (runs in active tab)
function extractArticleFromDOM() {
  const title = document.querySelector("h1")?.innerText || document.title || "";
  
  // Try <article> tag first, then <main>, then fall back to largest paragraph block
  let container = document.querySelector("article") || document.querySelector("main");

  if (!container) {
    // Score containers by paragraph density
    const candidates = Array.from(document.querySelectorAll("div, section"));
    let bestScore = 0;
    candidates.forEach((el) => {
      const pCount = el.querySelectorAll("p").length;
      const textLen = el.innerText.length;
      if (pCount > 2 && textLen > bestScore) {
        bestScore = textLen;
        container = el;
      }
    });
  }

  const target = container || document.body;
  const clone = target.cloneNode(true);

  // Strip boilerplate, navigation, ads, and scripts
  clone.querySelectorAll("nav, header, footer, aside, script, style, noscript, .ad, .advertisement, .sidebar, .comments").forEach((n) => n.remove());

  const paragraphs = Array.from(clone.querySelectorAll("p, h2, h3, h4, li"))
    .map((p) => p.innerText.trim())
    .filter((t) => t.length > 20);

  const bodyText = paragraphs.join("\n\n");
  return { title, text: title ? `${title}.\n\n${bodyText}` : bodyText };
}

// Toolbar Action Click Behavior
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

// Context Menu Click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read-aloud-panel" && info.selectionText) {
    if (tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }

    (async () => {
      await chrome.storage.local.set({ ttsText: info.selectionText });
      await setupOffscreenDocument();
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "PLAY_TEXT",
        text: info.selectionText
      }).catch(() => {});
    })();
  }
});

// Keyboard Shortcut Command Listener
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "read_article_command") {
    if (tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractArticleFromDOM
      });

      if (results?.[0]?.result?.text) {
        const article = results[0].result;
        await chrome.storage.local.set({ ttsText: article.text, articleTitle: article.title });
        await setupOffscreenDocument();
        chrome.runtime.sendMessage({
          target: "offscreen",
          type: "PLAY_TEXT",
          text: article.text
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to extract article:", err);
    }
  }
});

// Message listener for sidepanel article extraction
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ENSURE_OFFSCREEN") {
    setupOffscreenDocument().then(() => sendResponse({ ready: true }));
    return true;
  } else if (msg.type === "EXTRACT_CURRENT_TAB_ARTICLE") {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          sendResponse({ error: "No active tab found" });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: extractArticleFromDOM
        });
        sendResponse({ article: results?.[0]?.result });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});