const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
  'DIV', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 
  'ARTICLE', 'SECTION', 'FIGURE', 'FIGCAPTION', 'UL', 'OL'
]);

export function cleanArticleText(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  return extractAndClean(doc.body);
}

export function cleanPlainText(text) {
  return applyLineFilters(text.split('\n')).join('\n\n');
}

function extractAndClean(node) {
  let paragraphs = [];
  let currentBlock = [];

  function flushBlock() {
    const text = currentBlock.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      paragraphs.push(text);
    }
    currentBlock = [];
  }

  function walk(n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent.replace(/\s+/g, ' ');
      if (text.trim()) {
        currentBlock.push(text);
      }
    } else if (n.nodeType === Node.ELEMENT_NODE) {
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
  const captionRegex = /^(caption|photo|image):/i;
  const nMinReadRegex = /\b\d+\s+min(ute)?s?\s+read\b/gi;
  const apSeparatorRegex = /_{3,}/g;

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

    // Line-level chrome filters
    if (newsletterRegex.test(line) && line.length < 60) continue;
    if (shareRegex.test(line) && line.length < 50) continue;
    if (followRegex.test(line) && line.length < 50) continue;
    if (relatedRegex.test(line) && line.length < 100) continue;
    if (captionRegex.test(line) && line.length < 150) continue;

    if (/your guide to the biggest stories/i.test(line)) continue;

    // dedupe pass
    if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === line) {
      continue;
    }

    cleanedLines.push(line);
  }

  return cleanedLines;
}
