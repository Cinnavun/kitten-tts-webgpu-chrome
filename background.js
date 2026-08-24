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

// In-Page Reader Engine: Accurate article extraction for CNN, BBC, NYT, Medium, Substack, etc.
function extractArticleContent() {
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 10) {
    return { title: "", text: selection };
  }

  // 1. Title detection
  const title = (
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("h1")?.innerText ||
    document.title || ""
  ).trim();

  // 2. Extract visible body paragraphs excluding boilerplate
  const allParagraphs = Array.from(document.querySelectorAll("p, [data-component='paragraph'], .article__content p"));
  const validText = [];

  for (const el of allParagraphs) {
    if (el.closest("nav, header, footer, aside, form, .ad, .advertisement, .comment, .sidebar, .menu, .cnn-footer, [role='navigation']")) {
      continue;
    }
    const txt = el.innerText.trim();
    if (txt.length >= 25 && !txt.startsWith("©") && !txt.toLowerCase().includes("all rights reserved")) {
      validText.push(txt);
    }
  }

  const bodyText = validText.join("\n\n");
  return {
    title,
    text: title && bodyText ? `${title}.\n\n${bodyText}` : bodyText
  };
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

// Toolbar click or Keyboard Shortcut handler
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "read_article_command") {
    if (tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractArticleContent
      });

      if (results?.[0]?.result?.text) {
        const article = results[0].result;
        await chrome.storage.local.set({ ttsText: article.text });
        await setupOffscreenDocument();
        chrome.runtime.sendMessage({
          target: "offscreen",
          type: "PLAY_TEXT",
          text: article.text
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Article extraction error:", err);
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ENSURE_OFFSCREEN") {
    setupOffscreenDocument().then(() => sendResponse({ ready: true }));
    return true;
  }
});