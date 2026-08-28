import { textToSpeech } from "kitten-tts-webgpu";
import { TextPreprocessor } from "./textpreprocessor.js";

const preprocessor = new TextPreprocessor();

// Preprocess and group into natural sentence chunks
function chunkText(text) {
  if (!text || typeof text !== "string") return [];

  // 1. Run TextPreprocessor (expands currency, numbers, time, units, strips URLs)
  const normalized = preprocessor.process(text);
  if (!normalized) return [];

  // 2. Sentence segmentation
  let sentences = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    sentences = Array.from(segmenter.segment(normalized))
      .map((s) => s.segment.trim())
      .filter((s) => s.length > 0);
  } else {
    sentences = normalized.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map((s) => s.trim()) || [normalized];
  }

  const MAX_CHUNK_LENGTH = 200;
  const finalChunks = [];

  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHUNK_LENGTH) {
      finalChunks.push(sentence);
    } else {
      const clauses = sentence.split(/(?<=[,;:—–\n])\s+/);
      let current = "";
      for (const clause of clauses) {
        if (clause.length > MAX_CHUNK_LENGTH) {
          const words = clause.split(/\s+/);
          let sub = "";
          for (const w of words) {
            if ((sub + " " + w).trim().length > MAX_CHUNK_LENGTH) {
              if (sub) finalChunks.push(sub.trim());
              sub = w;
            } else {
              sub = sub ? `${sub} ${w}` : w;
            }
          }
          if (sub) finalChunks.push(sub.trim());
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

function synthesizeWithTimeout(text, options, timeoutMs = 12000) {
  return Promise.race([
    textToSpeech(text, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GPU generation timed out.")), timeoutMs)
    )
  ]);
}

let isCancelled = false;
let isPrewarmed = false;
let prewarmPromise = null;

async function prewarmModel(model = "nano") {
  if (isPrewarmed) return;
  if (prewarmPromise) return prewarmPromise;

  prewarmPromise = (async () => {
    try {
      console.log("[KittenTTS Worker] Pre-warming model:", model);
      await textToSpeech(".", {
        model,
        voice: "Jasper",
        speed: 1.0,
        onProgress: (stage) => {
          self.postMessage({ type: "TTS_STATUS", status: stage, state: "busy" });
        }
      });
      isPrewarmed = true;
      console.log("[KittenTTS Worker] Model pre-warmed successfully.");
    } catch (err) {
      console.warn("[KittenTTS Worker] Pre-warm failed (non-fatal):", err.message);
    } finally {
      prewarmPromise = null;
    }
  })();

  return prewarmPromise;
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "PREWARM_MODEL") {
    prewarmModel(msg.model || "nano").then(() => {
      self.postMessage({ type: "PREWARM_DONE", success: true });
    });
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

      self.postMessage({ type: "TTS_STATUS", status: `Synthesizing ${chunks.length} chunk${chunks.length > 1 ? "s" : ""}...`, state: "busy", generationId });

      for (let i = 0; i < chunks.length; i++) {
        if (isCancelled) break;
        const chunk = chunks[i];
        const percent = Math.round(((i + 1) / chunks.length) * 100);

        self.postMessage({ type: "TTS_PROGRESS", percent, current: i + 1, total: chunks.length, generationId });

        try {
          const blob = await synthesizeWithTimeout(chunk, {
            voice: voice || "Jasper",
            speed: speed || 1.0,
            model: model || "nano",
            onProgress: (stage) => {
              if (typeof stage === "string") {
                self.postMessage({ type: "TTS_STATUS", status: stage, state: "busy", generationId });
              }
            }
          });

          if (isCancelled) break;

          if (blob) {
            const arrayBuf = await blob.arrayBuffer();
            // Send back the array buffer. We transfer ownership of the ArrayBuffer for performance
            self.postMessage({ type: "TTS_CHUNK_READY", arrayBuf, chunkIndex: i, isFirst: (i === 0), generationId }, [arrayBuf]);
          }
        } catch (chunkErr) {
          console.warn(`[KittenTTS Worker] Skipping problematic chunk ${i + 1}/${chunks.length}:`, chunkErr);
        }

        // Small yield
        await new Promise((r) => setTimeout(r, 60));
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
