import { KittenTTSEngine, float32ToWav } from "kitten-tts-webgpu";
import { robustTextToInputIds } from "./robustPhonemizer.js";
import { TextPreprocessor, ABBREVIATIONS, fixMissingSentenceSpacing } from "./textpreprocessor.js";
import { dbg, setDebugEnabled, isDebugEnabled } from "./debugLogger.js";

const preprocessor = new TextPreprocessor();

/** Tracks whether the active WebGPU adapter is a software/CPU fallback adapter (SwiftShader) */
let isUsingFallbackAdapter = false;

// Intercept navigator.gpu.requestAdapter to:
// 1. Request high-performance hardware GPU when available
// 2. Automatically fall back to software/CPU adapter (forceFallbackAdapter: true) if hardware GPU is unavailable
if (navigator.gpu) {
  const origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
  navigator.gpu.requestAdapter = async (options = {}) => {
    const isWindows = navigator.userAgent?.includes("Windows");
    const primaryOptions = isWindows
      ? { ...options }
      : { ...options, powerPreference: "high-performance" };

    let adapter = null;
    try {
      adapter = await origRequestAdapter(primaryOptions);
    } catch (err) {
      console.warn("[KittenTTS Worker] Primary hardware GPU adapter request threw:", err);
    }

    if (adapter) {
      isUsingFallbackAdapter = Boolean(adapter.isFallbackAdapter);
      dbg("gpu.adapter", {
        type: isUsingFallbackAdapter ? "fallback" : "hardware",
        isFallback: isUsingFallbackAdapter
      });
      return adapter;
    }

    // Hardware GPU not available -> Attempt CPU/software fallback adapter (e.g. SwiftShader)
    console.warn("[KittenTTS Worker] No hardware GPU adapter found. Attempting forceFallbackAdapter: true...");
    try {
      adapter = await origRequestAdapter({
        ...options,
        forceFallbackAdapter: true
      });
      if (adapter) {
        isUsingFallbackAdapter = true;
        console.warn("[KittenTTS Worker] Acquired fallback adapter (software/CPU). Warning: Synthesis may be slower than hardware GPU.");
        dbg("gpu.adapter", {
          type: "fallback",
          isFallback: true
        });
        return adapter;
      }
    } catch (fallbackErr) {
      console.error("[KittenTTS Worker] Fallback adapter request failed:", fallbackErr);
    }

    // Neither hardware nor fallback adapter available
    isUsingFallbackAdapter = false;
    return null;
  };
}

// ─── Model Management ─────────────────────────────────────────────

// Models shipped locally with the extension (loaded from models/ directory)
const LOCAL_MODELS = {
  nano: { onnx: "kitten_tts_nano_v0_8.onnx", voices: "voices.npz" },
  micro: { onnx: "kitten_tts_micro_v0_8.onnx", voices: "voices.npz" },
  mini: { onnx: "kitten_tts_mini_v0_8.onnx", voices: "voices.npz" }
};

/** Cached engine instances keyed by model name — survives across generations */
const engineCache = new Map();
/** In-flight engine loading promises to prevent duplicate initialization */
const engineLoading = new Map();

/** Extension base URL for constructing local model paths (set by offscreen document) */
let extensionBaseUrl = "";

/**
 * Get or create a KittenTTSEngine for the requested model.
 * All models (nano, micro, mini) are shipped locally in the extension's models/ directory
 * to ensure 100% offline security, privacy, and zero external network requests.
 */
async function getEngine(model = "nano", onProgress) {
  const cached = engineCache.get(model);
  if (cached) return cached;

  const loading = engineLoading.get(model);
  if (loading) return loading;

  const loadPromise = (async () => {
    const engine = new KittenTTSEngine();

    onProgress?.("Initializing WebGPU…");
    try {
      await engine.init();
    } catch (initErr) {
      const initErrMsg = initErr.message || String(initErr);
      if (initErrMsg.includes("WebGPU not available") || initErrMsg.includes("WebGPU")) {
        throw new Error(
          "WebGPU not available. Ensure 'Use graphics acceleration when available' is enabled in Chrome Settings > System and relaunch Chrome (see chrome://gpu for details)."
        );
      }
      throw initErr;
    }

    if (isUsingFallbackAdapter) {
      onProgress?.("WebGPU running in CPU fallback mode (slower)…");
    }

    let onnxUrl, voicesUrl;

    if (LOCAL_MODELS[model]) {
      const local = LOCAL_MODELS[model];
      onnxUrl = `${extensionBaseUrl}models/${local.onnx}`;
      voicesUrl = `${extensionBaseUrl}models/${local.voices}`;
      onProgress?.(`Loading local ${model} model…`);
    } else {
      throw new Error(`Unknown model: ${model}`);
    }

    await engine.loadModel(onnxUrl, voicesUrl);

    // PATCH: kitten-tts-webgpu's generate() unconditionally calls
    // this.destroyPool() at the end of every call, wiping the GPU buffer
    // pool it just built. That forces full buffer reallocation on every
    // chunk instead of reusing pooled buffers, which is almost certainly
    // why synthesis degrades chunk over chunk on Chrome/Edge (Dawn/D3D12
    // buffer allocator churn). No-op it here so the pool persists for the
    // life of the engine instance. Remove this once fixed upstream in
    // svenflow/kitten-tts-webgpu.
    engine['destroyPool'] = () => { };

    engineCache.set(model, engine);
    console.log(`[KittenTTS Worker] Engine ready for model: ${model}`);
    return engine;
  })();

  engineLoading.set(model, loadPromise);
  try {
    return await loadPromise;
  } finally {
    engineLoading.delete(model);
  }
}

// ─── Text Chunking ─────────────────────────────────────────────────

/**
 * Segment a preprocessed text block into individual sentences.
 * Because preprocessing has ALREADY run, abbreviations (Dr., Jan., etc.)
 * and initialisms (U-S-A) have no ambiguous periods.
 */
function segmentSentences(textBlock) {
  let rawSentences = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const segments = Array.from(segmenter.segment(textBlock))
      .map((s) => s.segment.trim())
      .filter((s) => s.length > 0);

    // Safety stitcher: stitch back segments if previous segment ended with ellipsis (...),
    // an orphan initial (e.g. "A."), or lowercase dialogue tags (e.g. '"Wait!" said Tom')
    let stitched = [];
    for (let i = 0; i < segments.length; i++) {
      let seg = segments[i];
      if (stitched.length > 0) {
        let prev = stitched[stitched.length - 1];
        const endsWithEllipsis = /\.{2,}["')\]]*$/.test(prev);
        const endsWithInitial = /(?:^|\s)[A-Za-z]\.["')\]]*$/.test(prev);
        const startsWithLower = /^[a-z]/.test(seg);
        const startsWithPunct = /^[,;:—–\-]/.test(seg);

        if (endsWithEllipsis || endsWithInitial || startsWithLower || startsWithPunct) {
          stitched[stitched.length - 1] = prev + " " + seg;
          continue;
        }
      }
      stitched.push(seg);
    }
    rawSentences = stitched;
  } else {
    rawSentences = textBlock.match(/[^.!?]+[.!?]+(?:["'’”\]})])?|[^.!?]+$/g)?.map((s) => s.trim()) || [textBlock];
  }
  return rawSentences.filter(s => s && /[a-zA-Z0-9]/.test(s));
}

/**
 * Splits a long sentence at punctuation boundaries only when NOT inside open parentheses/brackets.
 * Prevents severed clauses like "Johnson & Johnson (J-N-J:" / "U-S) said Monday...".
 */
function splitOutsideParens(text, regex) {
  const parts = [];
  let lastIdx = 0;
  let parenDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{") parenDepth++;
    else if (ch === ")" || ch === "]" || ch === "}") parenDepth = Math.max(0, parenDepth - 1);

    if (parenDepth === 0) {
      const slice = text.slice(i);
      const m = slice.match(regex);
      if (m && m.index === 0) {
        parts.push(text.slice(lastIdx, i + m[1].length));
        i += m[0].length - 1;
        lastIdx = i + 1;
      }
    }
  }
  if (lastIdx < text.length) {
    const remaining = text.slice(lastIdx);
    if (remaining.trim()) parts.push(remaining);
  }
  return parts.length > 0 ? parts : [text];
}

/**
 * Preprocess and split text into natural sentence-level chunks for TTS.
 * 
 * Design Principles:
 * 1. Preprocess FIRST so abbreviations, initialisms, and numbers don't trigger false sentence breaks.
 * 2. Sentences are ATOMIC units. Never split a sentence at commas unless the single sentence
 *    by itself exceeds the Windows WebGPU TDR threshold (MAX_CHUNK_LENGTH = 380 chars).
 * 3. Group short sentences together up to TARGET_CHUNK_LENGTH (280 chars) so speech flows
 *    fluidly without awkward robotic silences between tiny phrases.
 * 4. Paragraph breaks are defined strictly by true double-newlines (\n\n+). Internal soft
 *    newlines (\n) are flattened into spaces to prevent premature sentence cutting.
 */
function chunkText(text, enablePreprocessing = true) {
  if (!text || typeof text !== "string") return [];

  const MAX_CHUNK_LENGTH = 380;     // Safe upper limit for Windows WebGPU 2s TDR watchdog
  const TARGET_CHUNK_LENGTH = 280;  // Target chunk size to bundle short sentences fluidly

  const finalChunks = [];
  const paragraphEnds = new Set();

  // Split strictly on true paragraph breaks (two or more newlines)
  const rawParagraphs = text
    .split(/\r?\n\s*\r?\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const rawPara = rawParagraphs[pIdx];
    // Flatten any internal soft line-wraps within the paragraph into spaces
    // so Intl.Segmenter does not treat them as sentence breaks (UAX #29 Sep rule).
    const normalizedPara = rawPara.replace(/\r?\n+/g, " ");

    // Step 1: Preprocess the entire paragraph FIRST (if enabled)
    const processedPara = enablePreprocessing
      ? preprocessor.process(normalizedPara).trim()
      : normalizedPara.trim();
    if (!processedPara || !/[a-zA-Z0-9]/.test(processedPara)) continue;

    // Step 2: Segment the preprocessed paragraph into clean, whole sentences
    const sentences = segmentSentences(processedPara);
    if (!sentences.length) continue;

    dbg("chunkText.paragraph", {
      paragraphIndex: pIdx + 1,
      totalParagraphs: rawParagraphs.length,
      sentenceCount: sentences.length,
      sentences
    });

    let currentChunk = "";

    const pushChunk = () => {
      const t = currentChunk.trim();
      currentChunk = "";
      if (t && /[a-zA-Z0-9]/.test(t)) {
        finalChunks.push(t);
      }
    };

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      // Case A: The single sentence itself is giant (> MAX_CHUNK_LENGTH)
      // Only now do we decompose it into sub-clauses at major punctuation marks
      if (trimmedSentence.length > MAX_CHUNK_LENGTH) {
        if (currentChunk) pushChunk();

        // Try major syntactic breaks first (semicolon, colon, em-dash) outside parentheses
        let subParts = splitOutsideParens(trimmedSentence, /^([;:—–])\s+/);
        if (subParts.length === 1 && subParts[0].length > MAX_CHUNK_LENGTH) {
          // Fallback: split at clause boundaries (commas) outside parentheses
          subParts = splitOutsideParens(trimmedSentence, /^([,])\s+/);
        }

        for (const part of subParts) {
          if (!part.trim()) continue;
          if (part.length > MAX_CHUNK_LENGTH) {
            // Extreme edge-case fallback: word-level grouping
            const words = part.split(/\s+/);
            for (const word of words) {
              if ((currentChunk + " " + word).trim().length > MAX_CHUNK_LENGTH) {
                pushChunk();
              }
              currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
            }
          } else {
            if ((currentChunk + " " + part).trim().length > MAX_CHUNK_LENGTH) {
              pushChunk();
            }
            currentChunk = currentChunk ? `${currentChunk} ${part}` : part;
            if (currentChunk.length >= TARGET_CHUNK_LENGTH) {
              pushChunk();
            }
          }
        }
        continue;
      }

      // Case B: Normal sentence (fits within MAX_CHUNK_LENGTH)
      // If adding this sentence would exceed MAX_CHUNK_LENGTH, push previous chunk first
      if (currentChunk && (currentChunk + " " + trimmedSentence).length > MAX_CHUNK_LENGTH) {
        pushChunk();
      }

      currentChunk = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence;

      // If we reached our target bundle length, push the chunk
      if (currentChunk.length >= TARGET_CHUNK_LENGTH) {
        pushChunk();
      }
    }

    // Flush any remaining text for this paragraph
    if (currentChunk) {
      pushChunk();
    }

    // Mark the last chunk of this paragraph for a natural paragraph pause
    if (finalChunks.length > 0) {
      paragraphEnds.add(finalChunks.length - 1);
    }
  }

  const result = finalChunks.map((t, i) => ({
    text: t,
    paraEnd: paragraphEnds.has(i)
  }));

  dbg("chunkText.summary", {
    totalChunks: result.length,
    chunks: result.map((c, i) => ({
      chunkIndex: i + 1,
      charLength: c.text.length,
      paraEnd: c.paraEnd,
      text: c.text
    }))
  });
  return result;
}

// ─── Synthesis ─────────────────────────────────────────────────────

let isCancelled = false;

/**
 * Synthesize a single text chunk to a WAV blob using the engine directly.
 * Bypasses the library's textToSpeech() convenience function (which hardcodes HuggingFace URLs).
 */
async function synthesizeChunk(engine, text, voice, speed, enablePreprocessing = true) {
  let idsData = await robustTextToInputIds(text, enablePreprocessing);
  let generateResult = await engine.generate(idsData.ids, voice, speed, text.length);
  const blob = float32ToWav(generateResult.waveform, 24000);

  // Explicitly clear references to large Float32Arrays to aid Garbage Collection
  // @ts-ignore: Intentionally assigning null to aid Garbage Collection
  idsData.ids = null;
  // @ts-ignore
  idsData = null;
  // @ts-ignore
  generateResult.waveform = null;
  // @ts-ignore
  generateResult = null;

  return blob;
}

function synthesizeWithTimeout(engine, text, voice, speed, enablePreprocessing = true, timeoutMs = 60000) {
  return Promise.race([
    synthesizeChunk(engine, text, voice, speed, enablePreprocessing),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GPU generation timed out.")), timeoutMs)
    )
  ]);
}

// ─── Message Handler ───────────────────────────────────────────────

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "RESET_ENGINE") {
    isCancelled = true;
    isUsingFallbackAdapter = false;
    for (const [model, engine] of engineCache.entries()) {
      try {
        if (typeof engine.free === 'function') engine.free();
        if (typeof engine.destroy === 'function') engine.destroy();
        // WebGPU devices can be explicitly destroyed
        if (engine.device && typeof engine.device.destroy === 'function') {
          engine.device.destroy();
        }
      } catch (err) {
        console.warn("[KittenTTS Worker] Error during explicit engine destruction:", err);
      }
    }
    engineCache.clear();
    engineLoading.clear();
    return;
  }

  // Store extension base URL for constructing local model paths
  if (msg.extensionBaseUrl) {
    extensionBaseUrl = msg.extensionBaseUrl;
  }

  if (msg.type === "SET_DEBUG") {
    setDebugEnabled(msg.enabled);
    return;
  }

  if (msg.type === "PREWARM_MODEL") {
    try {
      await getEngine(msg.model || "nano", (stage) => {
        self.postMessage({ type: "TTS_STATUS", status: stage, state: "busy" });
      });
      self.postMessage({ type: "PREWARM_DONE", success: true });
    } catch (err) {
      console.warn("[KittenTTS Worker] Pre-warm failed:", err.message);
      self.postMessage({ type: "PREWARM_DONE", success: false, error: err.message });
      // Notify UI immediately via TTS_STATUS so side panel displays the diagnostic error
      self.postMessage({ type: "TTS_STATUS", status: err.message, state: "error" });
    }
  }

  if (msg.type === "STOP_AUDIO") {
    isCancelled = true;
  }

  if (msg.type === "PLAY_TEXT") {
    isCancelled = false;
    if (typeof msg.debug === "boolean") {
      setDebugEnabled(msg.debug);
    }
    const { text, voice, speed, model, generationId, preprocess = true } = msg;
    const enablePreprocessing = preprocess !== false;

    dbg("PLAY_TEXT.received", { charCount: text.length, voice, speed, model, enablePreprocessing, fullText: text });

    try {
      const chunks = chunkText(text, enablePreprocessing);
      if (chunks.length === 0) {
        self.postMessage({ type: "TTS_ERROR", error: "No readable text found.", generationId });
        return;
      }

      // Get or initialize the engine — progress callbacks only fire during initial load
      const engine = await getEngine(model || "nano", (stage) => {
        self.postMessage({ type: "TTS_STATUS", status: stage, state: "busy", generationId });
      });

      self.postMessage({
        type: "TTS_STATUS",
        status: isUsingFallbackAdapter
          ? `Synthesizing ${chunks.length} chunk${chunks.length > 1 ? "s" : ""} (CPU mode)…`
          : `Synthesizing ${chunks.length} chunk${chunks.length > 1 ? "s" : ""}…`,
        state: "busy",
        generationId
      });

      for (let i = 0; i < chunks.length; i++) {
        if (isCancelled) break;
        const chunk = chunks[i];
        const percent = Math.round(((i + 1) / chunks.length) * 100);

        // Send clean progress — no per-chunk "Phonemizing…" / "Generating speech…" spam
        self.postMessage({
          type: "TTS_PROGRESS",
          percent,
          current: i + 1,
          total: chunks.length,
          generationId
        });

        try {
          const pauseAfter = (i < chunks.length - 1)
            ? (chunk.paraEnd ? 0.45 : (/[.!?]["')\]]*$/.test(chunk.text.trim()) ? 0.2 : 0.05))
            : 0;

          dbg("synthesize.chunk", {
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            charCount: chunk.text.length,
            paraEnd: chunk.paraEnd,
            pauseAfterSec: pauseAfter,
            text: chunk.text
          });

          const blob = await synthesizeWithTimeout(
            engine, chunk.text, voice || "Jasper", speed || 1.0, enablePreprocessing
          );

          if (isCancelled) break;

          if (blob) {
            const arrayBuf = await blob.arrayBuffer();
            dbg("synthesize.chunkDone", {
              chunkIndex: i + 1,
              totalChunks: chunks.length,
              byteLength: arrayBuf.byteLength,
              pauseAfterSeconds: pauseAfter
            });

            self.postMessage(
              {
                type: "TTS_CHUNK_READY",
                arrayBuf,
                chunkIndex: i,
                isFirst: (i === 0),
                pauseAfter,
                generationId,
                text: chunk.text
              },
              [arrayBuf]
            );
          }
        } catch (chunkErr) {
          console.warn(`[KittenTTS Worker] Skipping problematic chunk ${i + 1}/${chunks.length}:`, chunkErr);

          const errMsg = chunkErr.message || String(chunkErr);
          if (errMsg.includes("WebGPU") || errMsg.includes("GPU") || errMsg.includes("device lost")) {
            self.postMessage({ type: "TTS_ERROR", error: errMsg, generationId });
            isCancelled = true;
            break;
          }
        }

        // Small yield to avoid starving the event loop
        await new Promise((r) => setTimeout(r, 20));
      }

      if (!isCancelled) {
        self.postMessage({ type: "TTS_COMPLETE", generationId });
      }

    } catch (err) {
      console.error("Worker Engine Error:", err);
      let errorMsg = err.message || String(err);
      if (errorMsg.includes("WebGPU not available") && !errorMsg.includes("chrome://gpu")) {
        errorMsg = "WebGPU not available. Ensure 'Use graphics acceleration when available' is enabled in Chrome Settings > System and relaunch Chrome (see chrome://gpu for details).";
      }
      self.postMessage({ type: "TTS_ERROR", error: errorMsg, generationId });
    }
  }
};
