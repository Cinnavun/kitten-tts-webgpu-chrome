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

// Split into single-sentence chunks under ~180 chars to stay well below the 2s Windows TDR threshold
function chunkText(text) {
  if (!text || typeof text !== "string") return [];

  const trimmed = text.trim();
  if (!trimmed) return [];

  let sentences = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    sentences = Array.from(segmenter.segment(trimmed))
      .map((s) => s.segment.trim())
      .filter((s) => s.length > 0);
  } else {
    sentences = trimmed.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map((s) => s.trim()) || [trimmed];
  }

  const MAX_CHUNK_LENGTH = 180;
  const finalChunks = [];

  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHUNK_LENGTH) {
      finalChunks.push(sentence);
    } else {
      // Split overly long sentences on punctuation/clauses
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

// Timeout wrapper so the UI never stalls indefinitely if a shader crashes
function synthesizeWithTimeout(text, options, timeoutMs = 12000) {
  return Promise.race([
    textToSpeech(text, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GPU generation timed out or device hung.")), timeoutMs)
    )
  ]);
}

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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING_OFFSCREEN") {
    sendResponse({ ready: true });
    return true;
  }

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
            status: "No text provided.",
            state: "error"
          });
          isGenerating = false;
          return;
        }

        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
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
            percent,
            current: i + 1,
            total: chunks.length
          });

          const blob = await synthesizeWithTimeout(chunk, {
            voice: msg.voice || "Jasper",
            speed: msg.speed || 1.0,
            model: msg.model || "nano",
            onProgress: (stage) => {
              if (typeof stage === "string") {
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

          // Yield to give D3D12 command queue time to flush and avoid TDR reset
          await new Promise((r) => setTimeout(r, 60));
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