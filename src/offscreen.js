// src/offscreen.js
import { Readability } from "@mozilla/readability";
import { dbg } from "./debugLogger.js";
import { saveAudio, getAudio } from "./db.js";

/**
 * Debug helper for the offscreen context.
 * Calls dbg() (→ DevTools console) AND portSend()s the event so it
 * appears in the sidepanel debug panel alongside worker events.
 * @param {string} tag
 * @param {unknown} [data]
 */
function offscreenDbg(tag, data) {
  dbg(tag, data);
  try {
    const serialised = JSON.parse(JSON.stringify(data ?? null));
    portSend({ type: "TTS_DEBUG_LOG", tag, data: serialised, ts: Date.now() });
  } catch (_) {
    portSend({ type: "TTS_DEBUG_LOG", tag, data: String(data), ts: Date.now() });
  }
}

let audioCtx = null;
let nextStartTime = 0;
let activeSources = [];
let collectedAudioBuffers = [];
let isCancelled = false;
let isGenerating = false;
let generationId = 0;

/** Last synthesis parameters — used to detect cache hits for instant replay */
let lastSynthParams = null;

// Persistent port to background for progress/status — native MV3 keep-alive.
// Reconnects automatically if the service worker was restarted.
let port = null;

function connectPort() {
  port = chrome.runtime.connect({ name: "tts-stream" });
  port.onDisconnect.addListener(() => {
    port = null;
    // The service worker restarts automatically; reconnect so UI receives progress
    setTimeout(connectPort, 200);
  });
}
connectPort();

/** Send a message over the persistent port, with a fallback reconnect. */
function portSend(msg) {
  if (!port) connectPort();
  try {
    port.postMessage(msg);
  } catch (e) {
    console.warn("Port send failed, reconnecting...", e);
    connectPort();
    try { port.postMessage(msg); } catch (_) { }
  }
}

/** Pre-buffering: collect first N chunks before scheduling playback to prevent audio gaps */
const PRE_BUFFER_THRESHOLD = 1;
let chunksReceived = 0;
let pendingSchedule = [];

let ttsWorker = new Worker("dist/worker.js", { type: "module" });

let keepAliveOsc = null;
let audioUnlockPromise = null;

function getAudioContext() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext({ sampleRate: 24000 });

    // Play a continuous silent oscillator to keep the AudioContext "active".
    keepAliveOsc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.0001; // nearly silent
    keepAliveOsc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    keepAliveOsc.start();

    // Attempt to unlock AudioContext Autoplay Policy in Chrome
    audioUnlockPromise = (async () => {
      try {
        const audioEl = new Audio();
        // 1 sample of silence (WAV)
        audioEl.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        await audioEl.play();
        if (audioCtx.state === "suspended") {
          audioCtx.resume();
        }
      } catch (e) {
        console.warn("Audio unlock failed:", e);
      }
    })();
  }
  return audioCtx;
}

function scheduleAudioBuffer(chunkObj) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  const source = ctx.createBufferSource();
  source.buffer = chunkObj.buffer;
  source.connect(ctx.destination);

  const startTime = Math.max(ctx.currentTime + 0.05, nextStartTime);
  source.start(startTime);
  nextStartTime = startTime + chunkObj.buffer.duration + (chunkObj.pauseAfter || 0);
  activeSources.push(source);

  source.onended = () => {
    activeSources = activeSources.filter((s) => s !== source);
    if (activeSources.length === 0 && !isGenerating && !isCancelled) {
      portSend({
        type: "TTS_STATUS",
        status: "Finished playing.",
        state: "idle"
      });
    }
  };
}

/**
 * Stop current audio playback. Does NOT clear the audio buffer cache
 * so that replay can re-use previously generated audio.
 */
function stopPlayback(broadcast = true) {
  isCancelled = true;
  isGenerating = false;
  nextStartTime = 0;
  for (const source of activeSources) {
    try {
      source.stop();
      source.disconnect();
    } catch (_) { }
  }
  activeSources = [];
  pendingSchedule = [];

  // DO NOT destroy keepAliveOsc here! It needs to run continuously
  // for the lifetime of the AudioContext.

  if (audioCtx && audioCtx.state !== "closed") {
    // We intentionally don't close the audioCtx so we can reuse it
  }

  ttsWorker.postMessage({ type: "STOP_AUDIO" });

  if (broadcast) {
    portSend({
      type: "TTS_STATUS",
      status: "Stopped.",
      state: "stopped"
    });
  }
}

/**
 * Flush any pending pre-buffer chunks and start playback.
 * Called when the pre-buffer threshold is reached or when synthesis completes for short texts.
 */
function flushPendingSchedule() {
  if (pendingSchedule.length === 0) return;

  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();
  nextStartTime = ctx.currentTime;

  for (const buf of pendingSchedule) {
    scheduleAudioBuffer(buf);
  }
  pendingSchedule = [];

  portSend({
    type: "TTS_STATUS",
    status: "Playing audio",
    state: "playing"
  });
}

async function exportMergedWav(chunks, sampleRate = 24000) {
  const totalSamples = chunks.reduce((sum, chunk) => {
    const pauseSamples = Math.floor((chunk.pauseAfter || 0) * sampleRate);
    return sum + chunk.buffer.length + pauseSamples;
  }, 0);
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

  // Use Int16Array for ultra-fast PCM writes
  const pcm16 = new Int16Array(wavBuffer, 44, totalSamples);
  let pcmOffset = 0;
  let chunkIndex = 0;

  for (const chunk of chunks) {
    const channelData = chunk.buffer.getChannelData(0);
    const len = channelData.length;
    for (let i = 0; i < len; i++) {
      const s = channelData[i];
      // Faster clamp and scale
      pcm16[pcmOffset++] = (s < -1 ? -1 : s > 1 ? 1 : s) * 0x7fff;
    }
    const pauseSamples = Math.floor((chunk.pauseAfter || 0) * sampleRate);
    for (let i = 0; i < pauseSamples; i++) {
      pcm16[pcmOffset++] = 0;
    }

    // Yield to the event loop every 20 chunks to prevent freezing the extension process
    if (++chunkIndex % 20 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
  return new Blob([wavBuffer], { type: "audio/wav" });
}

ttsWorker.onmessage = async (e) => {
  const msg = e.data;

  // Forward debug log events from the worker to the sidepanel port
  if (msg.type === "TTS_DEBUG_LOG") {
    portSend(msg);
    return;
  }

  // Forward status updates to background/UI over the persistent port
  if (msg.type === "TTS_STATUS" || msg.type === "TTS_PROGRESS") {
    if (!isCancelled && msg.generationId === generationId) {
      portSend(msg);
    }
  }

  if (msg.type === "TTS_ERROR") {
    if (!isCancelled && msg.generationId === generationId) {
      isGenerating = false;
      portSend({
        type: "TTS_STATUS",
        status: `GPU Error: ${msg.error}`,
        state: "error"
      });
    }
  }

  if (msg.type === "TTS_CHUNK_READY") {
    if (!isCancelled && msg.generationId === generationId) {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const audioBuffer = await ctx.decodeAudioData(msg.arrayBuf);
      const chunkData = { buffer: audioBuffer, pauseAfter: msg.pauseAfter || 0 };
      collectedAudioBuffers.push(chunkData);
      chunksReceived++;

      if (!lastSynthParams?.renderBeforePlay) {
        if (chunksReceived <= PRE_BUFFER_THRESHOLD) {
          // Collect chunks until we have enough for a smooth start
          pendingSchedule.push(chunkData);
          if (chunksReceived === PRE_BUFFER_THRESHOLD) {
            flushPendingSchedule();
          }
        } else {
          // Past threshold — schedule immediately (GPU has a head start)
          scheduleAudioBuffer(chunkData);
        }
      }
    }
  }

  if (msg.type === "TTS_COMPLETE") {
    if (!isCancelled && msg.generationId === generationId) {
      isGenerating = false;

      // Flush remaining pre-buffer for short texts (fewer chunks than threshold)
      if (!lastSynthParams?.renderBeforePlay && pendingSchedule.length > 0) {
        flushPendingSchedule();
      }

      if (collectedAudioBuffers.length > 0) {
        if (lastSynthParams && lastSynthParams.cacheKey) {
          const mergedBlob = await exportMergedWav(collectedAudioBuffers, 24000);
          await saveAudio(lastSynthParams.cacheKey, mergedBlob).catch(err => {
            console.warn("Failed to save audio to cache:", err);
          });
        }

        if (lastSynthParams?.renderBeforePlay) {
          const ctx = getAudioContext();
          if (ctx.state === "suspended") await ctx.resume();
          nextStartTime = ctx.currentTime;

          for (const chunkObj of collectedAudioBuffers) {
            scheduleAudioBuffer(chunkObj);
          }

          portSend({
            type: "TTS_STATUS",
            status: "Playing audio",
            state: "playing"
          });
        }

        portSend({ type: "TTS_AUDIO_READY" });
      } else {
        portSend({
          type: "TTS_STATUS",
          status: "Finished (no audio generated)",
          state: "idle"
        });
      }
    }
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING_OFFSCREEN") {
    sendResponse({ ready: true });
    return true;
  }

  if (msg.target !== "offscreen") return;

  if (msg.type === "PARSE_HTML") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(msg.html, "text/html");
      const reader = new Readability(doc, { maxElemsToParse: 15000 });
      const parsed = reader.parse();

      if (parsed && parsed.textContent) {
        const cleanText = parsed.textContent
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join("\n\n");

        offscreenDbg("readability.parsed", {
          title: parsed.title,
          byline: parsed.byline,
          rawLength: parsed.textContent.length,
          cleanLength: cleanText.length,
          fullText: cleanText
        });

        sendResponse({
          title: parsed.title || msg.title || "",
          byline: parsed.byline || "",
          text: parsed.title && cleanText ? `${parsed.title}.\n\n${cleanText}` : cleanText
        });
      } else {
        // Fallback to body text
        doc.querySelectorAll("script, style, noscript, template, iframe, svg").forEach(el => el.remove());
        const fallbackText = doc.body?.textContent?.trim() || "";
        offscreenDbg("readability.fallback", { length: fallbackText.length, preview: fallbackText.slice(0, 200) });
        sendResponse({
          title: msg.title || "",
          text: fallbackText
        });
      }
    } catch (err) {
      console.warn("[KittenTTS Offscreen] Parse error:", err);
      sendResponse({ error: err.message });
    }
    return true; // async
  }

  if (msg.type === "PREWARM_MODEL") {
    ttsWorker.postMessage({
      type: "PREWARM_MODEL",
      model: msg.model || "nano",
      extensionBaseUrl: chrome.runtime.getURL("")
    });
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === "PLAY_CACHED") {
    const thisGenId = ++generationId;
    stopPlayback(false);
    isCancelled = false;
    isGenerating = false;
    collectedAudioBuffers = [];
    chunksReceived = 0;
    pendingSchedule = [];

    (async () => {
      try {
        const blob = await getAudio(msg.cacheKey);
        if (blob) {
          const arrayBuf = await blob.arrayBuffer();
          const ctx = getAudioContext();
          if (ctx.state === "suspended") ctx.resume();
          nextStartTime = ctx.currentTime;
          const audioBuffer = await ctx.decodeAudioData(arrayBuf);
          scheduleAudioBuffer({ buffer: audioBuffer, pauseAfter: 0 });

          portSend({ type: "TTS_STATUS", status: "Playing audio", state: "playing" });
          portSend({ type: "TTS_AUDIO_READY" });
        } else {
          portSend({ type: "TTS_STATUS", status: "Cache miss.", state: "error" });
        }
      } catch (err) {
        console.error("Cache play error:", err);
        portSend({ type: "TTS_STATUS", status: "Error playing cache.", state: "error" });
      }
    })();

    sendResponse({ success: true, replayed: true });
    return true;
  }

  if (msg.type === "PLAY_TEXT") {
    const incomingParams = {
      text: msg.text,
      voice: msg.voice,
      speed: msg.speed,
      model: msg.model,
      cacheKey: msg.cacheKey,
      renderBeforePlay: msg.renderBeforePlay
    };

    // ── New Synthesis ───────────────────────────────────────────
    const thisGenId = ++generationId;
    stopPlayback(false);

    isCancelled = false;
    isGenerating = true;
    collectedAudioBuffers = [];  // Clear cache for new synthesis
    chunksReceived = 0;
    pendingSchedule = [];

    lastSynthParams = incomingParams;

    (async () => {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (audioUnlockPromise) {
        await audioUnlockPromise;
      }
      nextStartTime = ctx.currentTime;

      // Kick off worker with extension base URL for local model resolution
      ttsWorker.postMessage({
        type: "PLAY_TEXT",
        text: msg.text,
        voice: msg.voice,
        speed: msg.speed,
        model: msg.model,
        generationId: thisGenId,
        extensionBaseUrl: chrome.runtime.getURL("")
      });

      sendResponse({ success: true });
    })();

    return true;
  }

  if (msg.type === "STOP_AUDIO") {
    stopPlayback();
    sendResponse({ stopped: true });
    return true;
  }

  if (msg.type === "RESET_WORKER") {
    ttsWorker.postMessage({ type: "RESET_ENGINE" });
    // Give it a tiny moment to process the free/destroy before forced termination
    setTimeout(() => {
      ttsWorker.terminate();
      sendResponse({ success: true });
    }, 50);
    return true;
  }
});