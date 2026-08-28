import { KittenTTSEngine, textToInputIds, float32ToWav } from "kitten-tts-webgpu";
import { TextPreprocessor } from "./textpreprocessor.js";

const preprocessor = new TextPreprocessor();

// ─── Model Management ─────────────────────────────────────────────

// Models shipped locally with the extension (loaded from models/ directory)
const LOCAL_MODELS = {
  nano: { onnx: "kitten_tts_nano_v0_8.onnx", voices: "voices.npz" }
};

// Models that must be downloaded from HuggingFace on first use (browser-cached after)
const REMOTE_MODELS = {
  mini: {
    url: "https://huggingface.co/KittenML/kitten-tts-mini-0.8/resolve/main/kitten_tts_mini_v0_8.onnx",
    voicesUrl: "https://huggingface.co/KittenML/kitten-tts-mini-0.8/resolve/main/voices.npz",
    size: "78 MB"
  },
  micro: {
    url: "https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/main/kitten_tts_micro_v0_8.onnx",
    voicesUrl: "https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/main/voices.npz",
    size: "41 MB"
  }
};

/** Cached engine instances keyed by model name — survives across generations */
const engineCache = new Map();
/** In-flight engine loading promises to prevent duplicate initialization */
const engineLoading = new Map();

/** Extension base URL for constructing local model paths (set by offscreen document) */
let extensionBaseUrl = "";

/**
 * Get or create a KittenTTSEngine for the requested model.
 * Local models (nano) are loaded from the extension's models/ directory.
 * Remote models (micro, mini) are fetched from HuggingFace and browser-cached.
 */
async function getEngine(model = "nano", onProgress) {
  const cached = engineCache.get(model);
  if (cached) return cached;

  const loading = engineLoading.get(model);
  if (loading) return loading;

  const loadPromise = (async () => {
    const engine = new KittenTTSEngine();

    onProgress?.("Initializing WebGPU…");
    await engine.init();

    let onnxUrl, voicesUrl;

    if (LOCAL_MODELS[model]) {
      const local = LOCAL_MODELS[model];
      onnxUrl = `${extensionBaseUrl}models/${local.onnx}`;
      voicesUrl = `${extensionBaseUrl}models/${local.voices}`;
      onProgress?.(`Loading local ${model} model…`);
    } else if (REMOTE_MODELS[model]) {
      const remote = REMOTE_MODELS[model];
      onnxUrl = remote.url;
      voicesUrl = remote.voicesUrl;
      onProgress?.(`Downloading ${model} model (${remote.size})…`);
    } else {
      throw new Error(`Unknown model: ${model}`);
    }

    await engine.loadModel(onnxUrl, voicesUrl);
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
 * Preprocess and split text into natural sentence-level chunks for TTS.
 * Uses Intl.Segmenter for sentence detection, falls back to regex.
 * Long sentences are split at clause boundaries (semicolons/colons first, then commas).
 */
function chunkText(text) {
  if (!text || typeof text !== "string") return [];

  // Sentence segmentation on raw text first
  let rawSentences = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    rawSentences = Array.from(segmenter.segment(text))
      .map((s) => s.segment.trim())
      .filter((s) => s.length > 0);
  } else {
    rawSentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map((s) => s.trim()) || [text];
  }

  // Preprocess each sentence individually to avoid regex catastrophic backtracking on huge strings
  const sentences = rawSentences
    .map(s => preprocessor.process(s))
    .filter(s => s && /[a-zA-Z0-9]/.test(s));

  // Library supports up to ~500 chars, but >250 can freeze some WebGPU implementations
  const MAX_CHUNK_LENGTH = 200;
  const finalChunks = [];

  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHUNK_LENGTH) {
      finalChunks.push(sentence);
    } else {
      // Split long sentences: prefer stronger clause boundaries first
      const clauses = sentence.split(/(?<=[;:—–\n])\s+/);
      let current = "";

      for (const clause of clauses) {
        if (clause.length > MAX_CHUNK_LENGTH) {
          // Sub-split on commas for very long clauses
          const subClauses = clause.split(/(?<=[,])\s+/);
          for (const sub of subClauses) {
            if (sub.length > MAX_CHUNK_LENGTH) {
              // Last resort: word-level splitting
              if (current) { finalChunks.push(current.trim()); current = ""; }
              const words = sub.split(/\s+/);
              let wordBuf = "";
              for (const w of words) {
                // Hard limit: if a single word is insanely long, force split it
                let currentWord = w;
                while (currentWord.length > MAX_CHUNK_LENGTH) {
                  const part = currentWord.substring(0, MAX_CHUNK_LENGTH);
                  if (wordBuf) { finalChunks.push(wordBuf.trim()); wordBuf = ""; }
                  finalChunks.push(part.trim());
                  currentWord = currentWord.substring(MAX_CHUNK_LENGTH);
                }
                
                if (!currentWord) continue;

                if ((wordBuf + " " + currentWord).trim().length > MAX_CHUNK_LENGTH) {
                  if (wordBuf) finalChunks.push(wordBuf.trim());
                  wordBuf = currentWord;
                } else {
                  wordBuf = wordBuf ? `${wordBuf} ${currentWord}` : currentWord;
                }
              }
              if (wordBuf) current = wordBuf;
            } else if ((current + " " + sub).trim().length > MAX_CHUNK_LENGTH) {
              if (current) finalChunks.push(current.trim());
              current = sub;
            } else {
              current = current ? `${current} ${sub}` : sub;
            }
          }
        } else if ((current + " " + clause).trim().length > MAX_CHUNK_LENGTH) {
          if (current) finalChunks.push(current.trim());
          current = clause;
        } else {
          current = current ? `${current} ${clause}` : clause;
        }
      }
      if (current) finalChunks.push(current.trim());
    }
  }

  return finalChunks.filter((c) => c && /[a-zA-Z0-9]/.test(c));
}

// ─── Synthesis ─────────────────────────────────────────────────────

let isCancelled = false;

/**
 * Synthesize a single text chunk to a WAV blob using the engine directly.
 * Bypasses the library's textToSpeech() convenience function (which hardcodes HuggingFace URLs).
 */
async function synthesizeChunk(engine, text, voice, speed) {
  const { ids } = await textToInputIds(text);
  const { waveform } = await engine.generate(ids, voice, speed, text.length);
  return float32ToWav(waveform, 24000);
}

function synthesizeWithTimeout(engine, text, voice, speed, timeoutMs = 60000) {
  return Promise.race([
    synthesizeChunk(engine, text, voice, speed),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GPU generation timed out.")), timeoutMs)
    )
  ]);
}

// ─── Message Handler ───────────────────────────────────────────────

self.onmessage = async (e) => {
  const msg = e.data;

  // Store extension base URL for constructing local model paths
  if (msg.extensionBaseUrl) {
    extensionBaseUrl = msg.extensionBaseUrl;
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
    }
  }

  if (msg.type === "STOP_AUDIO") {
    isCancelled = true;
  }

  if (msg.type === "PLAY_TEXT") {
    isCancelled = false;
    const { text, voice, speed, model, generationId } = msg;

    try {
      const chunks = chunkText(text);
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
        status: `Synthesizing ${chunks.length} chunk${chunks.length > 1 ? "s" : ""}…`,
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
          const blob = await synthesizeWithTimeout(
            engine, chunk, voice || "Jasper", speed || 1.0
          );

          if (isCancelled) break;

          if (blob) {
            const arrayBuf = await blob.arrayBuffer();
            self.postMessage(
              { type: "TTS_CHUNK_READY", arrayBuf, chunkIndex: i, isFirst: (i === 0), generationId },
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
      self.postMessage({ type: "TTS_ERROR", error: err.message, generationId });
    }
  }
};
