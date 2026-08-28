// src/extractor.js

window.__kittenArticleExtractor = function () {
  // 1. If text is highlighted, prioritize selection
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 10) {
    return {
      title: document.title || "Selected Text",
      text: selection
    };
  }

  // 2. Instead of running Readability in the active tab (which clones DOM and blocks UI),
  // we just return the HTML string. The offscreen document will parse it.
  return {
    html: document.documentElement.outerHTML,
    url: window.location.href,
    title: document.title || ""
  };
};