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

// 1. Comprehensive Text Sanitization (Strips symbols, expands abbreviations & currency)
function sanitizeTextForTTS(text) {
  if (!text) return "";
  let cleaned = text;

  // Replace URLs and emails
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, " link ");
  cleaned = cleaned.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, " email ");

  // Strip HTML tags and markdown symbols
  cleaned = cleaned.replace(/<[^>]*>/g, " ");
  cleaned = cleaned.replace(/[*_#`~|\[\]\(\)\{\}\<\>\\\/^]/g, " ");

  // Normalize quotes and dashes
  cleaned = cleaned.replace(/[“”„«»]/g, '"');
  cleaned = cleaned.replace(/[‘’‚‹›`]/g, "'");
  cleaned = cleaned.replace(/[—–―−]/g, ", ");

  // Currency conversions
  cleaned = cleaned.replace(/\$(\d+)(?:\.(\d{2}))?/g, (m, d, c) => (c ? `${d} dollars and ${c} cents` : `${d} dollars`));
  cleaned = cleaned.replace(/£(\d+)(?:\.(\d{2}))?/g, (m, d, c) => (c ? `${d} pounds and ${c} cents` : `${d} pounds`));
  cleaned = cleaned.replace(/€(\d+)(?:\.(\d{2}))?/g, (m, d, c) => (c ? `${d} euros and ${c} cents` : `${d} euros`));
  cleaned = cleaned.replace(/¥(\d+)/g, "$1 yen");

  // Symbols to spoken English
  cleaned = cleaned.replace(/%/g, " percent ");
  cleaned = cleaned.replace(/&/g, " and ");
  cleaned = cleaned.replace(/@/g, " at ");
  cleaned = cleaned.replace(/\+/g, " plus ");
  cleaned = cleaned.replace(/=/g, " equals ");
  cleaned = cleaned.replace(/°/g, " degrees ");
  cleaned = cleaned.replace(/#/g, " number ");

  // Common abbreviation expansions
  cleaned = cleaned.replace(/\be\.g\./gi, "for example");
  cleaned = cleaned.replace(/\bi\.e\./gi, "that is");
  cleaned = cleaned.replace(/\betc\./gi, "etcetera");
  cleaned = cleaned.replace(/\bvs\./gi, "versus");
  cleaned = cleaned.replace(/\bDr\./gi, "Doctor");
  cleaned = cleaned.replace(/\bMr\./gi, "Mister");
  cleaned = cleaned.replace(/\bMrs\./gi, "Missus");
  cleaned = cleaned.replace(/\bMs\./gi, "Mizz");
  cleaned = cleaned.replace(/\bProf\./gi, "Professor");
  cleaned = cleaned.replace(/\bInc\./gi, "Incorporated");
  cleaned = cleaned.replace(/\bLtd\./gi, "Limited");

  // Filter out emojis, math operators, and foreign symbols that crash phonemizer
  cleaned = cleaned.replace(/[^\w\s.,!?'":;\-]/g, " ");

  // Collapse repeated punctuation and whitespace
  cleaned = cleaned.replace(/\.{2,}/g, ".");
  cleaned = cleaned.replace(/!{2,}/g, "!");
  cleaned = cleaned.replace(/\?{2,}/g, "?");
  cleaned = cleaned.replace(/,{2,}/g, ",");
  cleaned = cleaned.replace(/-{2,}/g, "-");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

// 2. Cohesive Sentence Chunking
function chunkText(text) {
  const cleaned = sanitizeTextForTTS(text);
  if (!cleaned) return [];

  let rawSentences = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    rawSentences = Array.from(segmenter.segment(cleaned)).map((s) => s.segment.trim());
  } else {
    rawSentences = cleaned.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map((s) => s.trim()) || [cleaned];
  }

  rawSentences = rawSentences.filter((s) => /[a-zA-Z0-9]/.test(s));

  // Split any sentence exceeding 350 characters
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

  // Merge short adjacent sentences up to ~280 characters for smooth speech flow
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

// 3. Audio Scheduling & Merging
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
              chrome.runtime.sendMessage({
                type: "TTS_STATUS",
                status: stage,
                state: "busy"
              });
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
  }
});