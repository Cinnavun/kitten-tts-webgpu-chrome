// src/offscreen.js
import { textToSpeech } from "kitten-tts-webgpu";

let audioCtx = null;
let nextStartTime = 0;
let activeSources = [];
let collectedAudioBuffers = [];
let isCancelled = false;
let isGenerating = false;

function getAudioContext() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext({ sampleRate: 24000 });
  }
  return audioCtx;
}

// 1. Text Sanitization (Expands abbreviations & protects numbers/punctuation)
function sanitizeText(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—|–/g, ", ")
    .replace(/\$(\d+)(?:\.(\d{2}))?/g, (m, d, c) => (c ? `${d} dollars and ${c} cents` : `${d} dollars`))
    .replace(/%/g, " percent")
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

// 2. Natural Sentence Chunking (Prevents awkward micro-pauses by merging short sentences)
function chunkText(text) {
  const cleaned = sanitizeText(text);
  if (!cleaned) return [];

  // Step A: Parse sentence boundaries
  let rawSentences = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    rawSentences = Array.from(segmenter.segment(cleaned)).map((s) => s.segment.trim());
  } else {
    rawSentences = cleaned
      .replace(/(?<=\b(?:Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|vs|e\.g|i\.e))\./gi, "@DOT@")
      .replace(/(?<=\d)\.(?=\d)/g, "@DOT@")
      .match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)
      ?.map((s) => s.replace(/@DOT@/g, ".").trim()) || [cleaned];
  }

  rawSentences = rawSentences.filter((s) => /[a-zA-Z0-9]/.test(s));

  // Step B: Break down any single sentence that exceeds 350 chars by clause punctuation
  const MAX_CHUNK = 350;
  const splitSentences = [];

  for (const s of rawSentences) {
    if (s.length <= MAX_CHUNK) {
      splitSentences.push(s);
    } else {
      const clauses = s.split(/(?<=[;,—–:])\s+/);
      let currentClause = "";
      for (const clause of clauses) {
        if (clause.length > MAX_CHUNK) {
          const words = clause.split(/\s+/);
          let subChunk = "";
          for (const word of words) {
            if ((subChunk + " " + word).trim().length > MAX_CHUNK) {
              if (subChunk) splitSentences.push(subChunk.trim());
              subChunk = word;
            } else {
              subChunk = subChunk ? `${subChunk} ${word}` : word;
            }
          }
          if (subChunk) splitSentences.push(subChunk.trim());
        } else if ((currentClause + " " + clause).trim().length > MAX_CHUNK) {
          if (currentClause) splitSentences.push(currentClause.trim());
          currentClause = clause;
        } else {
          currentClause = currentClause ? `${currentClause} ${clause}` : clause;
        }
      }
      if (currentClause) splitSentences.push(currentClause.trim());
    }
  }

  // Step C: Merge adjacent short sentences up to ~250-300 chars for smooth speech flow
  const TARGET_CHUNK = 280;
  const mergedChunks = [];
  let buffer = "";

  for (const item of splitSentences) {
    if (!buffer) {
      buffer = item;
    } else if ((buffer + " " + item).length <= TARGET_CHUNK) {
      buffer = `${buffer} ${item}`;
    } else {
      mergedChunks.push(buffer);
      buffer = item;
    }
  }
  if (buffer) {
    mergedChunks.push(buffer);
  }

  return mergedChunks.filter((c) => /[a-zA-Z0-9]/.test(c));
}

// 3. Audio Scheduling
function scheduleAudioBuffer(audioBuffer) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  const startTime = Math.max(ctx.currentTime + 0.05, nextStartTime);
  source.start(startTime);
  nextStartTime = startTime + audioBuffer.duration;
  activeSources.push(source);

  source.onended = () => {
    activeSources = activeSources.filter((s) => s !== source);
    if (activeSources.length === 0 && !isGenerating && !isCancelled) {
      chrome.runtime.sendMessage({
        type: "TTS_STATUS",
        status: "Finished playing.",
        state: "idle"
      });
    }
  };
}

function stopPlayback() {
  isCancelled = true;
  isGenerating = false;
  nextStartTime = 0;
  for (const source of activeSources) {
    try {
      source.stop();
      source.disconnect();
    } catch (_) {}
  }
  activeSources = [];
  collectedAudioBuffers = [];
  chrome.runtime.sendMessage({
    type: "TTS_STATUS",
    status: "Stopped.",
    state: "stopped"
  });
}

function exportMergedWav(buffers, sampleRate = 24000) {
  const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0);
  const wavBuffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(wavBuffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, totalSamples * 2, true);
  let offset = 44;
  for (const buf of buffers) {
    const channelData = buf.getChannelData(0);
    for (let i = 0; i < channelData.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return new Blob([wavBuffer], { type: "audio/wav" });
}

// 4. Runtime Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;

  if (msg.type === "PLAY_TEXT") {
    (async () => {
      try {
        stopPlayback();
        isCancelled = false;
        isGenerating = true;

        const chunks = chunkText(msg.text);
        if (chunks.length === 0) {
          chrome.runtime.sendMessage({
            type: "TTS_STATUS",
            status: "No readable alphanumeric text found.",
            state: "error"
          });
          isGenerating = false;
          return;
        }

        const ctx = getAudioContext();
        nextStartTime = ctx.currentTime;
        collectedAudioBuffers = [];

        chrome.runtime.sendMessage({
          type: "TTS_STATUS",
          status: "Initializing WebGPU...",
          state: "playing"
        });

        for (let i = 0; i < chunks.length; i++) {
          if (isCancelled) break;
          const chunk = chunks[i];
          const percent = Math.round(((i + 1) / chunks.length) * 100);

          chrome.runtime.sendMessage({
            type: "TTS_PROGRESS",
            percent: percent,
            current: i + 1,
            total: chunks.length
          });

          const blob = await textToSpeech(chunk, {
            voice: msg.voice || "Jasper",
            speed: msg.speed || 1.0,
            model: msg.model || "nano",
            onProgress: (stage) => {
              if (stage.includes("Downloading")) {
                chrome.runtime.sendMessage({
                  type: "TTS_STATUS",
                  status: stage,
                  state: "busy"
                });
              }
            }
          });

          if (isCancelled || !blob) break;

          const arrayBuf = await blob.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuf);
          collectedAudioBuffers.push(audioBuffer);
          scheduleAudioBuffer(audioBuffer);
        }

        isGenerating = false;
        if (!isCancelled) {
          chrome.runtime.sendMessage({ type: "TTS_AUDIO_READY" });
        }
      } catch (err) {
        console.error("Offscreen Engine Error:", err);
        isGenerating = false;
        chrome.runtime.sendMessage({
          type: "TTS_STATUS",
          status: `GPU Error: ${err.message}`,
          state: "error"
        });
      }
    })();
  } else if (msg.type === "STOP_AUDIO") {
    stopPlayback();
  } else if (msg.type === "GET_DOWNLOAD_BLOB") {
    if (collectedAudioBuffers.length > 0) {
      const mergedBlob = exportMergedWav(collectedAudioBuffers, 24000);
      const reader = new FileReader();
      reader.onloadend = () => {
        sendResponse({ dataUrl: reader.result });
      };
      reader.readAsDataURL(mergedBlob);
      return true;
    }
  } else if (msg.type === "FLUSH_ENGINE_CACHE") {
    (async () => {
      try {
        stopPlayback();
        if (audioCtx && audioCtx.state !== "closed") {
          await audioCtx.close();
          audioCtx = null;
        }
        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((k) => caches.delete(k)));
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});