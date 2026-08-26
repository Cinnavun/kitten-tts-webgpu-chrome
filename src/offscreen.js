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

function sanitizeText(text) {
  if (!text) return "";
  return text
    .replace(/https?:\/\/\S+/gi, " link ")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, " email ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_#`~|\[\]\(\)\{\}\<\>\\\/^]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, ", ")
    .replace(/\$(\d+)(?:\.(\d{2}))?/g, (m, d, c) => (c ? `${d} dollars and ${c} cents` : `${d} dollars`))
    .replace(/%/g, " percent ")
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/\be\.g\./gi, "for example")
    .replace(/\bi\.e\./gi, "that is")
    .replace(/\betc\./gi, "etcetera")
    .replace(/\bDr\./gi, "Doctor")
    .replace(/\bMr\./gi, "Mister")
    .replace(/\bMrs\./gi, "Missus")
    .replace(/[^\w\s.,!?'":;\-]/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text) {
  const cleaned = sanitizeText(text);
  if (!cleaned) return [];

  let rawSentences = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    rawSentences = Array.from(segmenter.segment(cleaned)).map((s) => s.segment.trim());
  } else {
    rawSentences = cleaned.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map((s) => s.trim()) || [cleaned];
  }

  const TARGET_CHUNK = 280;
  const merged = [];
  let buffer = "";

  for (const s of rawSentences) {
    if (!buffer) {
      buffer = s;
    } else if ((buffer + " " + s).length <= TARGET_CHUNK) {
      buffer = `${buffer} ${s}`;
    } else {
      merged.push(buffer);
      buffer = s;
    }
  }
  if (buffer) merged.push(buffer);

  return merged.filter((c) => /[a-zA-Z0-9]/.test(c));
}

function scheduleAudioBuffer(audioBuffer) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();

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
      chrome.runtime.sendMessage({ type: "TTS_STATUS", status: "Finished playing.", state: "idle" });
    }
  };
}

function stopPlayback() {
  isCancelled = true;
  isGenerating = false;
  nextStartTime = 0;
  for (const s of activeSources) {
    try { s.stop(); s.disconnect(); } catch (_) {}
  }
  activeSources = [];
  collectedAudioBuffers = [];
  chrome.runtime.sendMessage({ type: "TTS_STATUS", status: "Stopped.", state: "stopped" });
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
          chrome.runtime.sendMessage({ type: "TTS_STATUS", status: "No readable text found.", state: "error" });
          isGenerating = false;
          return;
        }

        const ctx = getAudioContext();
        nextStartTime = ctx.currentTime;
        collectedAudioBuffers = [];

        chrome.runtime.sendMessage({ type: "TTS_STATUS", status: "Starting synthesis...", state: "playing" });

        for (let i = 0; i < chunks.length; i++) {
          if (isCancelled) break;
          const chunk = chunks[i];
          const percent = Math.round(((i + 1) / chunks.length) * 100);

          chrome.runtime.sendMessage({ type: "TTS_PROGRESS", percent });

          const blob = await textToSpeech(chunk, {
            voice: msg.voice || "Jasper",
            speed: msg.speed || 1.0,
            model: msg.model || "nano",
            onProgress: (stage) => {
              chrome.runtime.sendMessage({ type: "TTS_STATUS", status: stage, state: "busy" });
            }
          });

          if (isCancelled || !blob) break;

          const arrayBuf = await blob.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuf);
          collectedAudioBuffers.push(audioBuffer);
          scheduleAudioBuffer(audioBuffer);
        }

        isGenerating = false;
        if (!isCancelled) chrome.runtime.sendMessage({ type: "TTS_AUDIO_READY" });
      } catch (err) {
        console.error("Offscreen Engine Error:", err);
        isGenerating = false;
        chrome.runtime.sendMessage({ type: "TTS_STATUS", status: `Error: ${err.message}`, state: "error" });
      }
    })();
  } else if (msg.type === "STOP_AUDIO") {
    stopPlayback();
  } else if (msg.type === "GET_DOWNLOAD_BLOB") {
    if (collectedAudioBuffers.length > 0) {
      const mergedBlob = exportMergedWav(collectedAudioBuffers, 24000);
      const reader = new FileReader();
      reader.onloadend = () => sendResponse({ dataUrl: reader.result });
      reader.readAsDataURL(mergedBlob);
      return true;
    }
  }
});