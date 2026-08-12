chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "read-aloud-panel",
    title: "Read Aloud in Side Panel",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "read-aloud-panel" && info.selectionText) {
    // Save text to storage so the side panel can pick it up
    await chrome.storage.local.set({ ttsText: info.selectionText });
    
    // Open the side panel for the current window
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
})