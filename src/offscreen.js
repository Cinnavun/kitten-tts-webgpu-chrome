// src/offscreen.js
import { Readability } from "@mozilla/readability";

let audioCtx = null;
let nextStartTime = 0;
let activeSources = [];
let collectedAudioBuffers = [];
let isCancelled = false;
let isGenerating = false;
let generationId = 0;

const ttsWorker = new Worker("dist/worker.js");

function getAudioContext() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext({ sampleRate: 24000 });
  }
  return audioCtx;
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

function stopPlayback(broadcast = true) {
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
  
  ttsWorker.postMessage({ type: "STOP_AUDIO" });

  if (broadcast) {
    chrome.runtime.sendMessage({
      type: "TTS_STATUS",
      status: "Stopped.",
      state: "stopped"
    });
  }
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

ttsWorker.onmessage = async (e) => {
  const msg = e.data;
  
  // Forward status updates to background/UI
  if (msg.type === "TTS_STATUS" || msg.type === "TTS_PROGRESS") {
    if (!isCancelled && msg.generationId === generationId) {
      chrome.runtime.sendMessage(msg);
    }
  }
  
  if (msg.type === "TTS_ERROR") {
    if (!isCancelled && msg.generationId === generationId) {
      isGenerating = false;
      chrome.runtime.sendMessage({
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
        await ctx.resume();
      }
      
      const audioBuffer = await ctx.decodeAudioData(msg.arrayBuf);
      collectedAudioBuffers.push(audioBuffer);
      scheduleAudioBuffer(audioBuffer);
      
      if (msg.isFirst) {
        chrome.runtime.sendMessage({
          type: "TTS_STATUS",
          status: "Playing audio",
          state: "playing"
        });
      }
    }
  }
  
  if (msg.type === "TTS_COMPLETE") {
    if (!isCancelled && msg.generationId === generationId) {
      isGenerating = false;
      if (collectedAudioBuffers.length > 0) {
        chrome.runtime.sendMessage({ type: "TTS_AUDIO_READY" });
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
      const reader = new Readability(doc, { maxElemsToParse: 5000 });
      const parsed = reader.parse();
      
      if (parsed && parsed.textContent) {
        const cleanText = parsed.textContent
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join("\n\n");
          
        sendResponse({
          title: parsed.title || msg.title || "",
          byline: parsed.byline || "",
          text: parsed.title && cleanText ? `${parsed.title}.\n\n${cleanText}` : cleanText
        });
      } else {
        // Fallback to body text
        sendResponse({
          title: msg.title || "",
          text: doc.body?.innerText?.trim() || ""
        });
      }
    } catch (err) {
      console.warn("[KittenTTS Offscreen] Parse error:", err);
      sendResponse({ error: err.message });
    }
    return true; // async
  }

  if (msg.type === "PREWARM_MODEL") {
    ttsWorker.postMessage({ type: "PREWARM_MODEL", model: msg.model || "nano" });
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === "PLAY_TEXT") {
    const thisGenId = ++generationId;
    stopPlayback(false); // cancels previous
    
    isCancelled = false;
    isGenerating = true;
    
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    nextStartTime = ctx.currentTime;
    collectedAudioBuffers = [];
    
    // Kick off worker
    ttsWorker.postMessage({
      type: "PLAY_TEXT",
      text: msg.text,
      voice: msg.voice,
      speed: msg.speed,
      model: msg.model,
      generationId: thisGenId
    });
    
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === "STOP_AUDIO") {
    stopPlayback();
    sendResponse({ stopped: true });
    return true;
  }

  if (msg.type === "GET_DOWNLOAD_BLOB") {
    if (collectedAudioBuffers.length > 0) {
      const mergedBlob = exportMergedWav(collectedAudioBuffers, 24000);
      const reader = new FileReader();
      reader.onloadend = () => {
        sendResponse({ dataUrl: reader.result });
      };
      reader.readAsDataURL(mergedBlob);
      return true;
    }
    sendResponse({ error: "No audio buffers available." });
    return true;
  }
});