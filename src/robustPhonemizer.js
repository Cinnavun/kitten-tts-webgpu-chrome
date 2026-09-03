// src/robustPhonemizer.js
import { phonemize } from "phonemizer";

// KittenTTS 163-symbol vocabulary
const SYMBOLS = Array.from(
  "$;:,.!?¡¿—…“«»”„ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
  "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"
);

const SYMBOL_TO_ID = new Map();
SYMBOLS.forEach((sym, id) => SYMBOL_TO_ID.set(sym, id));

/**
 * Converts a phoneme string (with punctuation) into KittenTTS token IDs.
 * Matches words/symbols, wraps with start/end token 0 ($).
 * @param {string} phonemeStr
 * @returns {number[]}
 */
export function phonemesToInputIds(phonemeStr) {
  const tokens = (phonemeStr.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu) || []).join(" ");
  const ids = [0];
  for (const ch of tokens) {
    const id = SYMBOL_TO_ID.get(ch);
    if (id !== undefined) {
      ids.push(id);
    }
  }
  ids.push(0);
  return ids;
}

import { numberToWords } from "./textpreprocessor.js";

/**
 * Robustly phonemizes text by splitting into punctuation-bounded clauses,
 * ensuring punctuation marks NEVER desynchronize or migrate to adjacent words.
 *
 * @param {string} text
 * @returns {Promise<{ ids: number[], method: string, phonemes: string }>}
 */
export async function robustTextToInputIds(text) {
  let cleaned = text.trim();
  if (!cleaned) {
    return { ids: [0, 0], method: "wasm", phonemes: "" };
  }

  // 1. Failsafe: separate number-hyphen-word constructs (e.g. "3,401-unit" -> "3,401 unit")
  cleaned = cleaned.replace(/\b(\d[\d,]*)-([a-zA-Z]+)\b/g, "$1 $2");

  // 2. Failsafe: convert any comma-formatted numbers or standalone digits to words
  // so commas inside numbers (e.g. 1,234) are NEVER treated as clause punctuation boundaries
  const RE_NUM = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\b/g;
  cleaned = cleaned.replace(RE_NUM, (m) => {
    let raw = m.replace(/,/g, "");
    if (raw.includes(".")) {
      const [intPart, decPart] = raw.split(".");
      const intWords = numberToWords(parseInt(intPart, 10));
      const digitMap = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
      const decWords = decPart.split("").map(d => digitMap[parseInt(d, 10)] || "zero").join(" ");
      return `${intWords} point ${decWords}`;
    }
    return numberToWords(parseInt(raw, 10));
  });

  // 3. Failsafe: convert remaining intra-word hyphens (e.g. "thirty-four", "twenty-one")
  // to spaces so eSpeak generates distinct, space-separated phoneme words rather than squashed tokens
  cleaned = cleaned.replace(/(?<=[a-zA-Z])-(?=[a-zA-Z])/g, " ");

  // Segment by punctuation boundaries, keeping trailing punctuation attached
  // e.g. "Hello, world!" -> [{ text: "Hello", punct: "," }, { text: "world", punct: "!" }]
  const regex = /([^;:,.!?¡¿—…«»"”]+)(?:([;:,.!?¡¿—…«»"”]+)|$)/gu;
  let match;
  const segments = [];

  while ((match = regex.exec(cleaned)) !== null) {
    const segText = match[1].trim();
    const punct = match[2] ? match[2].trim() : "";
    if (segText) {
      segments.push({ text: segText, punct });
    } else if (punct && segments.length > 0) {
      // Consecutive punctuation (e.g. "..."), attach to previous segment
      segments[segments.length - 1].punct += punct;
    }
  }

  if (segments.length === 0) {
    return { ids: [0, 0], method: "wasm", phonemes: "" };
  }

  const fullPhonemes = [];

  for (const seg of segments) {
    try {
      const raw = (await phonemize(seg.text, "en-us"))[0] || "";
      if (raw) {
        fullPhonemes.push(raw.trim());
        if (seg.punct) {
          fullPhonemes.push(seg.punct);
        }
      }
    } catch (err) {
      console.warn("[robustPhonemizer] WASM phonemize failed for segment:", seg.text, err);
      // Fallback: keep the segment text directly
      fullPhonemes.push(seg.text);
      if (seg.punct) fullPhonemes.push(seg.punct);
    }
  }

  const phonemeStr = fullPhonemes.join(" ");
  const ids = phonemesToInputIds(phonemeStr);

  return {
    ids,
    method: "wasm",
    phonemes: phonemeStr
  };
}
