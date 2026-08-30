/**
 * textpreprocessor.js
 * A comprehensive text preprocessing library for TTS NLP pipelines.
 */

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen"
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALE = ["", "thousand", "million", "billion", "trillion"];

const ORDINAL_EXCEPTIONS = {
  "one": "first", "two": "second", "three": "third", "four": "fourth",
  "five": "fifth", "six": "sixth", "seven": "seventh", "eight": "eighth",
  "nine": "ninth", "twelve": "twelfth"
};

const CURRENCY_SYMBOLS = {
  "$": "dollar", "€": "euro", "£": "pound", "¥": "yen",
  "₹": "rupee", "₩": "won", "₿": "bitcoin"
};

const RE_ROMAN = /\b(M{0,4})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})\b/g;

function threeDigitsToWords(n) {
  if (n === 0) return "";
  let parts = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);

  if (remainder < 20) {
    if (remainder) parts.push(ONES[remainder]);
  } else {
    const tensWord = TENS[Math.floor(remainder / 10)];
    const onesWord = ONES[remainder % 10];
    parts.push(onesWord ? `${tensWord}-${onesWord}` : tensWord);
  }
  return parts.join(" ");
}

export function numberToWords(n) {
  let num = typeof n === 'string' ? parseInt(n, 10) : Math.trunc(n);
  if (isNaN(num)) return n.toString();
  if (num === 0) return "zero";
  if (num < 0) return `negative ${numberToWords(-num)}`;

  if (num >= 100 && num <= 9999 && num % 100 === 0 && num % 1000 !== 0) {
    const hundreds = Math.floor(num / 100);
    if (hundreds < 20) return `${ONES[hundreds]} hundred`;
  }

  let parts = [];
  let scaleIdx = 0;
  while (num > 0 && scaleIdx < SCALE.length) {
    const chunk = num % 1000;
    if (chunk) {
      const chunkWords = threeDigitsToWords(chunk);
      const scaleWord = SCALE[scaleIdx];
      parts.push(scaleWord ? `${chunkWords} ${scaleWord}`.trim() : chunkWords);
    }
    num = Math.floor(num / 1000);
    scaleIdx++;
  }
  return parts.reverse().join(" ");
}

export function floatToWords(value, decimalSep = "point") {
  let text = String(value);
  const negative = text.startsWith("-");
  if (negative) text = text.substring(1);

  let result = "";
  if (text.includes(".")) {
    const [intPart, decPart] = text.split(/\.(.+)/); // split on first dot
    const intWords = intPart ? numberToWords(parseInt(intPart, 10)) : "zero";
    const digitMap = ["zero", ...ONES.slice(1, 10)];
    const decWords = decPart.split("").map(d => digitMap[parseInt(d, 10)]).join(" ");
    result = `${intWords} ${decimalSep} ${decWords}`;
  } else {
    result = numberToWords(parseInt(text, 10));
  }
  return negative ? `negative ${result}` : result;
}

export function romanToInt(s) {
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0, prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const curr = val[s[i].toUpperCase()];
    if (!curr) return 0;
    result += curr >= prev ? curr : -curr;
    prev = curr;
  }
  return result;
}

// ─────────────────────────────────────────────
// Regex patterns (Note: `g` flag added for JS global replace)
// ─────────────────────────────────────────────

const RE_URL = /https?:\/\/\S+|www\.\S+/g;
const RE_EMAIL = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi;
const RE_HASHTAG = /#\w+/g;
const RE_MENTION = /@\w+/g;
const RE_HTML = /<[^>]+>/g;
const RE_PUNCT = /[^\w\s.,?!;:\-\u2014\u2013\u2026]/g;
const RE_SPACES = /\s+/g;
const RE_NUMBER = /(?<![a-zA-Z])-?[\d,]+(?:\.\d+)?/g;
const RE_ORDINAL = /\b(\d+)(st|nd|rd|th)\b/gi;
const RE_PERCENT = /(-?[\d,]+(?:\.\d+)?)\s*%/g;
const RE_CURRENCY = /([$€£¥₹₩₿])\s*([\d,]+(?:\.\d+)?)\s*([KMBT])?(?![a-zA-Z\d])/g;
const RE_TIME = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
const RE_RANGE = /(?<!\w)(\d+)-(\d+)(?!\w)/g;
const RE_MODEL_VER = /\b([a-zA-Z][a-zA-Z0-9]*)-(\d[\d.]*)(?=[^\d.]|$)/g;
const RE_UNIT = /(\d+(?:\.\d+)?)\s*(km|kg|mg|ml|gb|mb|kb|tb|hz|khz|mhz|ghz|mph|kph|°[cCfF]|[cCfF]°|ms|ns|µs)\b/gi;
const RE_SCALE = /(?<![a-zA-Z])(\d+(?:\.\d+)?)\s*([KMBT])(?![a-zA-Z\d])/g;
const RE_SCI = /(?<![a-zA-Z\d])(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)(?![a-zA-Z\d])/g;
const RE_FRACTION = /\b(\d+)\s*\/\s*(\d+)\b/g;
const RE_DECADE = /\b(\d{1,3})0s\b/gi;
const RE_LEAD_DEC = /(?<!\d)\.([\d])/g;

// Common abbreviations that use periods — must not get spaces inserted after them
export const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "inc",
  "ltd", "co", "corp", "dept", "univ", "est", "approx", "govt", "assn",
  "gen", "sgt", "cpl", "pvt", "capt", "lt", "col", "maj", "cmdr", "adm",
  "rev", "hon", "pres", "gov", "atty", "supt", "det", "msgr", "fr",
  "no", "op", "ft", "mt", "ave", "blvd", "cl", "ct", "sq", "pl"
]);

// ─────────────────────────────────────────────
// Expansion helpers
// ─────────────────────────────────────────────

function ordinalSuffix(n) {
  let word = numberToWords(n);
  let prefix = "", last = word, joiner = "";

  const hyphenIdx = word.lastIndexOf("-");
  const spaceIdx = word.lastIndexOf(" ");

  if (hyphenIdx > spaceIdx) {
    prefix = word.substring(0, hyphenIdx);
    last = word.substring(hyphenIdx + 1);
    joiner = "-";
  } else if (spaceIdx !== -1) {
    prefix = word.substring(0, spaceIdx);
    last = word.substring(spaceIdx + 1);
    joiner = " ";
  }

  let lastOrd = ORDINAL_EXCEPTIONS[last];
  if (!lastOrd) {
    if (last.endsWith("t")) lastOrd = last + "h";
    else if (last.endsWith("e")) lastOrd = last.slice(0, -1) + "th";
    else lastOrd = last + "th";
  }
  return prefix ? `${prefix}${joiner}${lastOrd}` : lastOrd;
}

function expandOrdinals(text) {
  return text.replace(RE_ORDINAL, (m, g1) => ordinalSuffix(parseInt(g1, 10)));
}

function expandPercentages(text) {
  return text.replace(RE_PERCENT, (m, g1) => {
    let raw = g1.replace(/,/g, "");
    return (raw.includes(".") ? floatToWords(raw) : numberToWords(parseInt(raw, 10))) + " percent";
  });
}

function expandCurrency(text) {
  const scaleMap = { K: "thousand", M: "million", B: "billion", T: "trillion" };
  return text.replace(RE_CURRENCY, (m, symbol, rawNum, scaleSuffix) => {
    let raw = rawNum.replace(/,/g, "");
    let unit = CURRENCY_SYMBOLS[symbol] || "";

    if (scaleSuffix) {
      let scaleWord = scaleMap[scaleSuffix.toUpperCase()];
      let num = raw.includes(".") ? floatToWords(raw) : numberToWords(parseInt(raw, 10));
      return `${num} ${scaleWord} ${unit}${unit ? 's' : ''}`.trim();
    }

    if (raw.includes(".")) {
      let [intPart, decPart] = raw.split(/\.(.+)/);
      let decVal = parseInt(decPart.padEnd(2, "0").substring(0, 2), 10);
      let intWords = numberToWords(parseInt(intPart || "0", 10));
      let result = unit ? `${intWords} ${unit}s` : intWords;

      if (decVal) {
        let cents = numberToWords(decVal);
        result += ` and ${cents} cent${decVal !== 1 ? 's' : ''}`;
      }
      return result;
    } else {
      let val = parseInt(raw, 10);
      let words = numberToWords(val);
      return unit ? `${words} ${unit}${val !== 1 ? 's' : ''}` : words;
    }
  });
}

function expandTime(text) {
  return text.replace(RE_TIME, (m, h, mins, secs, suffixRaw) => {
    let suffix = suffixRaw ? " " + suffixRaw.toLowerCase() : "";
    let hWords = numberToWords(parseInt(h, 10));
    let mNum = parseInt(mins, 10);

    if (mNum === 0) return !suffixRaw ? `${hWords} hundred` : `${hWords}${suffix}`;
    else if (mNum < 10) return `${hWords} oh ${numberToWords(mNum)}${suffix}`;
    else return `${hWords} ${numberToWords(mNum)}${suffix}`;
  });
}

function expandRanges(text) {
  return text.replace(RE_RANGE, (m, g1, g2) => `${numberToWords(parseInt(g1, 10))} to ${numberToWords(parseInt(g2, 10))}`);
}

function expandModelNames(text) {
  return text.replace(RE_MODEL_VER, (m, g1, g2) => `${g1} ${g2}`);
}

function expandUnits(text) {
  const unitMap = {
    "km": "kilometers", "kg": "kilograms", "mg": "milligrams",
    "ml": "milliliters", "gb": "gigabytes", "mb": "megabytes",
    "kb": "kilobytes", "tb": "terabytes",
    "hz": "hertz", "khz": "kilohertz", "mhz": "megahertz", "ghz": "gigahertz",
    "mph": "miles per hour", "kph": "kilometers per hour",
    "ms": "milliseconds", "ns": "nanoseconds", "µs": "microseconds",
    "°c": "degrees Celsius", "c°": "degrees Celsius",
    "°f": "degrees Fahrenheit", "f°": "degrees Fahrenheit"
  };
  return text.replace(RE_UNIT, (m, raw, unit) => {
    let expanded = unitMap[unit.toLowerCase()] || unit;
    let num = raw.includes(".") ? floatToWords(raw) : numberToWords(parseInt(raw, 10));
    return `${num} ${expanded}`;
  });
}

function expandRomanNumerals(text) {
  const TITLE_WORDS = /\b(war|chapter|part|volume|act|scene|book|section|article|king|queen|pope|louis|henry|edward|george|william|james|phase|round|level|stage|class|type|version|episode|season)\b/i;

  return text.replace(RE_ROMAN, (match, ...args) => {
    let roman = match.trim();
    if (!roman) return match;

    const offset = args[args.length - 2];

    if (roman.length === 1 && "IVX".includes(roman)) {
      let preceding = text.substring(Math.max(0, offset - 30), offset);
      if (!TITLE_WORDS.test(preceding)) return roman;
    }

    let val = romanToInt(roman);
    return val === 0 ? roman : numberToWords(val);
  });
}

function normalizeLeadingDecimals(text) {
  text = text.replace(/(?<!\d)(-)\.([\d])/g, "$10.$2");
  return text.replace(RE_LEAD_DEC, "0.$1");
}

function expandScientificNotation(text) {
  return text.replace(RE_SCI, (m, coeffRaw, expRaw) => {
    let coeffWords = coeffRaw.includes(".") ? floatToWords(coeffRaw) : numberToWords(parseInt(coeffRaw, 10));
    let exp = parseInt(expRaw, 10);
    let expWords = numberToWords(Math.abs(exp));
    let sign = exp < 0 ? "negative " : "";
    return `${coeffWords} times ten to the ${sign}${expWords}`;
  });
}

function expandScaleSuffixes(text) {
  const map = { K: "thousand", M: "million", B: "billion", T: "trillion" };
  return text.replace(RE_SCALE, (m, raw, suffix) => {
    let scaleWord = map[suffix.toUpperCase()] || suffix;
    let num = raw.includes(".") ? floatToWords(raw) : numberToWords(parseInt(raw, 10));
    return `${num} ${scaleWord}`;
  });
}

function expandFractions(text) {
  return text.replace(RE_FRACTION, (m, nRaw, dRaw) => {
    let num = parseInt(nRaw, 10), den = parseInt(dRaw, 10);
    if (den === 0) return m;
    let numWords = numberToWords(num);
    let denomWord = "";
    if (den === 2) denomWord = num === 1 ? "half" : "halves";
    else if (den === 4) denomWord = num === 1 ? "quarter" : "quarters";
    else {
      denomWord = ordinalSuffix(den);
      if (num !== 1) denomWord += "s";
    }
    return `${numWords} ${denomWord}`;
  });
}

function expandDecades(text) {
  const decadeMap = ["hundreds", "tens", "twenties", "thirties", "forties", "fifties", "sixties", "seventies", "eighties", "nineties"];
  return text.replace(RE_DECADE, (m, baseRaw) => {
    let base = parseInt(baseRaw, 10);
    let decadeWord = decadeMap[base % 10] || "";
    if (base < 10) return decadeWord;
    return `${numberToWords(Math.floor(base / 10))} ${decadeWord}`;
  });
}

function expandIpAddresses(text) {
  const d = { "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine" };
  const octet = (s) => s.split("").map(c => d[c]).join(" ");
  return text.replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, (m, g1, g2, g3, g4) => {
    return [g1, g2, g3, g4].map(octet).join(" dot ");
  });
}

function expandPhoneNumbers(text) {
  const d = { "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine" };
  const digits = (s) => s.split("").map(c => d[c]).join(" ");
  const join = (...groups) => groups.map(digits).join(" ");

  text = text.replace(/(?<!\d-)(?<!\d)\b(\d{1,2})-(\d{3})-(\d{3})-(\d{4})\b(?!-\d)/g, (m, g1, g2, g3, g4) => join(g1, g2, g3, g4));
  text = text.replace(/(?<!\d-)(?<!\d)\b(\d{3})-(\d{3})-(\d{4})\b(?!-\d)/g, (m, g1, g2, g3) => join(g1, g2, g3));
  text = text.replace(/(?<!\d-)\b(\d{3})-(\d{4})\b(?!-\d)/g, (m, g1, g2) => join(g1, g2));
  return text;
}

// ─────────────────────────────────────────────
// Sentence boundary repair
// ─────────────────────────────────────────────

/**
 * Fix missing spaces at sentence boundaries caused by HTML block elements
 * (e.g., <p>, <div>) being stripped without inserting whitespace.
 *
 * Targets patterns like "word.Capital" or "word!Next" where sentence-ending
 * punctuation is immediately followed by a capital letter with no space.
 *
 * Preserves:
 *   - URLs (https://example.com)
 *   - Email addresses (user@domain.com)
 *   - Decimal numbers (3.14)
 *   - Common abbreviations (Mr.Smith → Mr. Smith, but not "Mr .Smith")
 *   - Dotted identifiers (U.S.A, i.e., e.g.)
 *   - File extensions (.pdf, .html)
 */
function fixMissingSentenceSpacing(text) {
  // Protect URLs and emails by replacing with placeholders
  const urlPlaceholders = [];
  let shielded = text.replace(RE_URL, (match) => {
    urlPlaceholders.push(match);
    return `\x00URL${urlPlaceholders.length - 1}\x00`;
  });
  const emailPlaceholders = [];
  shielded = shielded.replace(RE_EMAIL, (match) => {
    emailPlaceholders.push(match);
    return `\x00EMAIL${emailPlaceholders.length - 1}\x00`;
  });

  // Insert space after sentence-ending punctuation followed by a capital letter
  // Pattern: (letter)(. or ! or ? or ; or :)(CapitalLetter)
  // Negative cases handled:
  //   - digit.Digit (decimals like 3.14) — requires letter before the period
  //   - single-letter abbreviations (U.S.A) — single char before dot
  shielded = shielded.replace(
    /([a-zA-Z]{2,})([.!?;:])([A-Z])/g,
    (match, before, punct, after) => {
      // Check if 'before' is a known abbreviation (case-insensitive)
      if (punct === "." && ABBREVIATIONS.has(before.toLowerCase())) {
        return `${before}${punct} ${after}`;
      }
      return `${before}${punct} ${after}`;
    }
  );

  // Also handle: closing quote/paren then capital (e.g., '"Hello."The next')
  shielded = shielded.replace(
    /([.!?])(["'"'\)\]])([A-Z])/g,
    "$1$2 $3"
  );

  // Restore URL and email placeholders
  shielded = shielded.replace(/\x00URL(\d+)\x00/g, (_, idx) => urlPlaceholders[parseInt(idx, 10)]);
  shielded = shielded.replace(/\x00EMAIL(\d+)\x00/g, (_, idx) => emailPlaceholders[parseInt(idx, 10)]);

  return shielded;
}

// ─────────────────────────────────────────────
// Basic mutators
// ─────────────────────────────────────────────

function replaceNumbers(text, replaceFloats = true) {
  return text.replace(RE_NUMBER, (m) => {
    let raw = m.replace(/,/g, "");
    try {
      if (raw.includes(".") && replaceFloats) return floatToWords(raw);
      return numberToWords(parseInt(raw, 10));
    } catch (e) {
      return m;
    }
  });
}

/**
 * Normalize smart/curly quotes and apostrophes to straight ASCII equivalents.
 * Websites often use typographic quotes (‘ ’ “ ”) which break contraction matching.
 */
function normalizeQuotes(text) {
  return text
    .replace(/[\u2018\u2019\u02BC]/g, "'")  // curly single quotes + modifier apostrophe → '
    .replace(/[\u201C\u201D]/g, '"');         // curly double quotes → "
}

function expandContractions(text) {
  const contractions = [
    // Specific contractions first (before generic patterns can match)
    [/\bcan't\b/gi, "cannot"], [/\bwon't\b/gi, "will not"], [/\bshan't\b/gi, "shall not"],
    [/\bain't\b/gi, "is not"], [/\blet's\b/gi, "let us"],
    [/\bit's\b/gi, "it is"], [/\bhe's\b/gi, "he is"], [/\bshe's\b/gi, "she is"],
    [/\bwho's\b/gi, "who is"], [/\bwhat's\b/gi, "what is"], [/\bthat's\b/gi, "that is"],
    [/\bthere's\b/gi, "there is"], [/\bhere's\b/gi, "here is"], [/\bwhere's\b/gi, "where is"],
    // Generic patterns (after specific ones)
    [/\b(\w+)n't\b/gi, "$1 not"],
    [/\b(\w+)'re\b/gi, "$1 are"], [/\b(\w+)'ve\b/gi, "$1 have"], [/\b(\w+)'ll\b/gi, "$1 will"],
    [/\b(\w+)'d\b/gi, "$1 would"], [/\b(\w+)'m\b/gi, "$1 am"]
  ];
  let out = text;
  for (const [pattern, replacement] of contractions) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Merge remaining possessives into the base word so the TTS model
 * pronounces them naturally instead of splitting into "word" + "S".
 *
 * Runs AFTER contraction expansion (so "it's" → "it is" is already handled)
 * and BEFORE punctuation removal (which would strip the apostrophe leaving a stray "s").
 *
 * Examples:
 *   "Jared's"    → "Jareds"     (TTS says "Jaredz" naturally)
 *   "audience's" → "audiences"  (TTS says "audiencez" naturally)
 *   "kids'"      → "kids"       (trailing apostrophe stripped)
 *   "James's"    → "Jamess"     (TTS handles sibilant naturally)
 */
function mergePossessives(text) {
  // Possessive 's → merge: "Jared's house" → "Jareds house"
  text = text.replace(/\b(\w+)'s\b/g, "$1s");
  // Plural possessive s' → just drop the apostrophe: "the kids' toys" → "the kids toys"
  text = text.replace(/\b(\w+s)'\b/g, "$1");
  // Any remaining stray apostrophes (e.g. from nested quotes) → remove
  text = text.replace(/'/g, " ");
  return text;
}

const DEFAULT_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from",
  "is", "was", "are", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "this", "that", "these", "those",
  "it", "its", "i", "me", "my", "we", "our", "you", "your", "he", "she", "him", "her", "they", "them", "their"
]);


// ─────────────────────────────────────────────
// Pipeline class
// ─────────────────────────────────────────────

export class TextPreprocessor {
  constructor(options = {}) {
    this.config = {
      lowercase: true,
      replace_numbers: true,
      replace_floats: true,
      expand_contractions: true,
      expand_model_names: true,
      expand_ordinals: true,
      expand_percentages: true,
      expand_currency: true,
      expand_time: true,
      expand_ranges: true,
      expand_units: true,
      expand_scale_suffixes: true,
      expand_scientific_notation: true,
      expand_fractions: true,
      expand_decades: true,
      expand_phone_numbers: true,
      expand_ip_addresses: true,
      normalize_leading_decimals: true,
      expand_roman_numerals: false,
      remove_urls: true,
      remove_emails: true,
      remove_html: true,
      remove_hashtags: false,
      remove_mentions: false,
      remove_punctuation: false,
      remove_stopwords: false,
      normalize_unicode: true,
      remove_accents: false,
      remove_extra_whitespace: true,
      ...options
    };
    this.stopwords = options.stopwords || DEFAULT_STOPWORDS;
  }

  process(text) {
    const cfg = this.config;

    if (cfg.normalize_unicode) text = text.normalize("NFC");
    if (cfg.remove_html) text = text.replace(RE_HTML, " ");

    // Fix missing sentence spacing BEFORE URLs are removed — the function
    // shields URLs/emails internally so their dots are never modified.
    text = fixMissingSentenceSpacing(text);

    if (cfg.remove_urls) text = text.replace(RE_URL, "").trim();
    if (cfg.remove_emails) text = text.replace(RE_EMAIL, "").trim();
    if (cfg.remove_hashtags) text = text.replace(RE_HASHTAG, "");
    if (cfg.remove_mentions) text = text.replace(RE_MENTION, "");
    text = normalizeQuotes(text);
    if (cfg.expand_contractions) text = expandContractions(text);
    text = mergePossessives(text);
    if (cfg.expand_ip_addresses) text = expandIpAddresses(text);
    if (cfg.normalize_leading_decimals) text = normalizeLeadingDecimals(text);
    if (cfg.expand_currency) text = expandCurrency(text);
    if (cfg.expand_percentages) text = expandPercentages(text);
    if (cfg.expand_scientific_notation) text = expandScientificNotation(text);
    if (cfg.expand_time) text = expandTime(text);
    if (cfg.expand_ordinals) text = expandOrdinals(text);
    if (cfg.expand_units) text = expandUnits(text);
    if (cfg.expand_scale_suffixes) text = expandScaleSuffixes(text);
    if (cfg.expand_fractions) text = expandFractions(text);
    if (cfg.expand_decades) text = expandDecades(text);
    if (cfg.expand_phone_numbers) text = expandPhoneNumbers(text);
    if (cfg.expand_ranges) text = expandRanges(text);
    if (cfg.expand_model_names) text = expandModelNames(text);
    if (cfg.expand_roman_numerals) text = expandRomanNumerals(text);
    if (cfg.replace_numbers) text = replaceNumbers(text, cfg.replace_floats);

    if (cfg.remove_accents) {
      text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    if (cfg.remove_punctuation) text = text.replace(RE_PUNCT, " ");
    if (cfg.lowercase) text = text.toLowerCase();

    if (cfg.remove_stopwords) {
      text = text.split(/\s+/).filter(t => !this.stopwords.has(t.toLowerCase())).join(" ");
    }

    if (cfg.remove_extra_whitespace) text = text.replace(RE_SPACES, " ").trim();

    return text;
  }
}