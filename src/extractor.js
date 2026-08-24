// src/extractor.js
import { Readability } from "@mozilla/readability";

window.__kittenArticleExtractor = function () {
  // If the user has explicitly selected text, prioritize the selection
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 10) {
    return {
      title: document.title || "Selected Text",
      text: selection
    };
  }

  try {
    // Clone document so Readability doesn't modify the active webpage
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone, {
      charThreshold: 40,
      nbTopCandidates: 5
    });
    const parsed = reader.parse();

    if (parsed && parsed.textContent) {
      // Normalize whitespace into clean paragraph breaks
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
    console.warn("[KittenTTS] Readability parse failed, falling back to visible text:", err);
  }

  // Fallback if no article container is detected
  const bodyText = document.body?.innerText?.trim() || "";
  return {
    title: document.title || "",
    text: bodyText.slice(0, 5000)
  };
};