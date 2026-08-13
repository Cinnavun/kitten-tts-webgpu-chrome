chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "read-aloud-panel",
    title: "Read Aloud in Side Panel",
    contexts: ["selection"]
  });

  // Enable opening the side panel by clicking the extension toolbar icon
  if (chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read-aloud-panel" && info.selectionText) {
    // 1. Open side panel IMMEDIATELY to preserve the user gesture context
    if (tab && tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
        console.error("Failed to open side panel:", err);
      });
    }

    // 2. Store text for the side panel to pick up
    chrome.storage.local.set({ ttsText: info.selectionText });
  }
});