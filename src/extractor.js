// src/extractor.js
import { Readability } from "@mozilla/readability";

window.__kittenArticleExtractor = function () {
  // 1. If text is highlighted, prioritize selection
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 10) {
    return {
      title: document.title || "Selected Text",
      text: selection
    };
  }

  // 2. Standard Mozilla Readability parsing
  try {
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone);
    const parsed = reader.parse();

    if (parsed && parsed.textContent) {
      const cleanText = parsed.textContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n\n");

      return {
        title: parsed.title || document.title || "",
        byline: parsed.byline || "",
        text: parsed.title && cleanText ? `${parsed.title}.\n\n${cleanText}` : cleanText
      };
    }
  } catch (err) {
    console.warn("[KittenTTS] Readability parse error:", err);
  }

  // 3. Fallback to visible body text
  const bodyText = document.body?.innerText?.trim() || "";
  return {
    title: document.title || "",
    text: bodyText
  };
};