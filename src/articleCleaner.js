const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'DIV', 'LI', 'BLOCKQUOTE', 'TD', 'TH',
  'ARTICLE', 'SECTION', 'FIGURE', 'FIGCAPTION', 'UL', 'OL'
]);

/**
 * Explicit selectors targeting interactive controls, buttons, and caption toggle chrome.
 */
export const CAPTION_UI_SELECTORS = [
  'figure button',
  'figcaption button',
  'figure [role="button"]',
  'figcaption [role="button"]',
  'figure [role="toolbar"]',
  'figcaption [role="toolbar"]',
  '[class*="toggle-caption" i]',
  '[class*="caption-toggle" i]',
  '[class*="hide-caption" i]',
  '[class*="show-caption" i]',
  '[class*="caption-control" i]',
  '[class*="caption-btn" i]',
  '[class*="caption-button" i]',
  '[aria-controls*="caption" i]',
  '[data-action*="caption" i]',
  '[data-toggle*="caption" i]'
];

/**
 * Exact toggle command phrases that should be stripped when encountered inside figure/figcaption.
 */
export const CAPTION_TOGGLE_COMMANDS = new Set([
  'toggle caption',
  'hide caption',
  'show caption',
  'close caption',
  'expand caption',
  'collapse caption',
  'view caption'
]);

/**
 * Removes caption toggle buttons, UI chrome, and label badges from a live DOM document.
 * Scopes all text-matched removals strictly to figure/figcaption ancestors, ensuring
 * body prose and inline formatting remain completely untouched.
 *
 * @param {Document} doc
 */
export function stripCaptionUI(doc) {
  if (!doc) return;

  // 1. Remove elements matching explicit caption UI and button selectors
  try {
    const selectorStr = CAPTION_UI_SELECTORS.join(', ');
    doc.querySelectorAll(selectorStr).forEach(el => el.remove());
  } catch (err) {
    console.warn('[stripCaptionUI] Selector query error:', err);
  }

  // 2. Strip credit chrome (e.g. span.credit, [class*="credit" i], [aria-label="Image credit" i])
  try {
    doc.querySelectorAll(
      'span.credit, [class*="credit" i], [aria-label="Image credit" i]'
    ).forEach(el => el.remove());
  } catch (err) {
    console.warn('[stripCaptionUI] Credit selector query error:', err);
  }

  // 3. Scoped text-matched removal: strictly within figure/figcaption contexts
  try {
    const candidates = doc.querySelectorAll('figure *, figcaption *');
    for (const el of candidates) {
      if (!el.isConnected) continue;
      if (!el.closest('figure, figcaption')) continue;

      const rawText = el.textContent.trim().toLowerCase();
      if (!rawText) continue;

      // Multi-word toggle commands (e.g. "toggle caption", "hide caption")
      if (CAPTION_TOGGLE_COMMANDS.has(rawText)) {
        el.remove();
        continue;
      }

      // Standalone "caption" or "caption:" label/badge inside figure/figcaption
      if (rawText === 'caption' || rawText === 'caption:') {
        // Protect inline words: if the element has sibling non-empty text nodes in its parent,
        // it is an inline word within a sentence (e.g. <p>An interesting <em>caption</em> here.</p>).
        const hasSiblingText = Array.from(el.parentNode?.childNodes || []).some(
          node => node !== el && node.nodeType === 3 && ((node.textContent || '').trim().length > 0)
        );
        if (!hasSiblingText) {
          el.remove();
        }
      }
    }
  } catch (err) {
    console.warn('[stripCaptionUI] Scoped text query error:', err);
  }
}

export function cleanArticleText(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  stripCaptionUI(doc);
  const targetNode = (doc.body && doc.body.childNodes.length > 0) ? doc.body : (doc.documentElement || doc);
  return extractAndClean(targetNode);
}

export function cleanPlainText(text) {
  return applyLineFilters(text.split('\n')).join('\n\n');
}

const TEXT_NODE = typeof Node !== 'undefined' ? Node.TEXT_NODE : 3;
const ELEMENT_NODE = typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1;

function extractAndClean(node) {
  let paragraphs = [];
  let currentBlock = [];

  function flushBlock() {
    let text = currentBlock.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      // Repair drop-caps (e.g. "T he" -> "The", "O nce" -> "Once")
      // Exclude "A" (indefinite article) and "I" (pronoun) to prevent corrupting phrases like "A panoramic view"
      text = text.replace(/^([B-HJ-Z])\s+([a-z]{2,})\b/, '$1$2');
      paragraphs.push(text);
    }
    currentBlock = [];
  }

  function walk(n) {
    if (n.nodeType === TEXT_NODE) {
      const text = n.textContent.replace(/\s+/g, ' ');
      if (text.trim()) {
        currentBlock.push(text);
      }
    } else if (n.nodeType === ELEMENT_NODE) {
      const tag = n.tagName.toUpperCase();
      if (BLOCK_TAGS.has(tag)) {
        flushBlock();
        for (const child of n.childNodes) {
          walk(child);
        }
        flushBlock();
      } else {
        for (const child of n.childNodes) {
          walk(child);
        }
      }
    }
  }

  walk(node);
  flushBlock();

  return applyLineFilters(paragraphs).join('\n\n');
}

function applyLineFilters(lines) {
  let cleanedLines = [];
  let skipNext = false;

  const newsletterRegex = /newsletter|subscribe|sign up|sign-up/i;
  const shareRegex = /^share( this)?( article)?$/i;
  const followRegex = /^follow (us|me)/i;
  const relatedRegex = /^related( stories)?:/i;
  const captionRegex = /^(caption|photo|photograph|image|credit):/i;
  const photoCreditRegex = /\b(photograph|photo):\s*[^/]+(\/|\s+news\s+agency)/i;
  const nMinReadRegex = /\b\d+\s+min(ute)?s?\s+read\b/gi;
  const apSeparatorRegex = /_{3,}/g;
  const toggleCaptionLineRegex = /^(toggle\s+caption|hide\s+caption|show\s+caption|close\s+caption|expand\s+caption|collapse\s+caption)$/i;

  for (let i = 0; i < lines.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    let line = lines[i];

    // Inline token stripping
    line = line.replace(nMinReadRegex, '').trim();
    line = line.replace(apSeparatorRegex, '').trim();

    if (!line) continue;

    // Remove standalone toggle/hide caption lines
    if (toggleCaptionLineRegex.test(line)) continue;

    // Strip trailing UI toggle tokens if line ends with "hide caption" or "toggle caption" preceded by photographer/credit format
    // e.g. "Julia Demaree Nikhinson/AP hide caption" -> "Julia Demaree Nikhinson/AP"
    if (/\b(?:AP|Reuters|AFP|Getty(?:\s+Images)?|\/AP|\/Reuters|\/AFP)\s+(?:hide|toggle)\s+caption$/i.test(line)) {
      line = line.replace(/\s+(?:hide|toggle)\s+caption$/i, '').trim();
    }

    // Line-level chrome filters
    if (newsletterRegex.test(line) && line.length < 60) continue;
    if (shareRegex.test(line) && line.length < 50) continue;
    if (followRegex.test(line) && line.length < 50) continue;
    if (relatedRegex.test(line) && line.length < 100) continue;
    if (captionRegex.test(line) && line.length < 150) continue;
    if (photoCreditRegex.test(line) && line.length < 150) continue;

    if (/your guide to the biggest stories/i.test(line)) continue;

    // dedupe pass: drop exact duplicates or suffix duplicates (e.g. repeated photographer/outlet line)
    if (cleanedLines.length > 0) {
      const prev = cleanedLines[cleanedLines.length - 1];
      if (prev === line) continue;
      if (line.length >= 16 && prev.endsWith(line)) continue;
    }

    cleanedLines.push(line);
  }

  return cleanedLines;
}
