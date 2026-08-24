import { KittenTTSEngine } from "kitten-tts-webgpu";

let engine = null;
let currentLoadedModel = null;
let audioCtx = null;
let nextStartTime = 0;
let activeSources = [];
let collectedAudioBuffers = [];
let isCancelled = false;
let isGenerating = false;

// 1. Initialize WebGPU Engine Once and Cache in VRAM
async function getEngine(modelName = "nano") {
  if (!engine || currentLoadedModel !== modelName) {
    chrome.runtime.sendMessage({
      type: "TTS_STATUS",
      status: `Loading ${modelName} model into WebGPU...`,
      state: "busy",
    });

    engine = new KittenTTSEngine();
    await engine.init();

    const urls = MODEL_URLS[modelName] || MODEL_URLS.nano;
    await engine.loadModel(urls.onnx, urls.voices);
    currentLoadedModel = modelName;
  }
  return engine;
}

// Recover automatically if Windows resets the GPU device
window.addEventListener("webgpu-device-lost", () => {
  console.warn("[KittenTTS] WebGPU device lost. Resetting engine instance...");
  engine = null;
  currentLoadedModel = null;
});

function getAudioContext() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext({ sampleRate: 24000 });
  }
  return audioCtx;
}

// 2. Text Sanitization (Prevents Tensor Mismatches & Pronunciation Glitches)
function sanitizeText(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—|–/g, ", ")
    .replace(/\$(\d+)(?:\.(\d{2}))?/g, (m, d, c) =>
      c ? `${d} dollars and ${c} cents` : `${d} dollars`,
    )
    .replace(/%/g, " percent")
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/[^\x20-\x7E\n]/g, " ") // Strip non-ASCII/emojis that crash phonemizer
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

// 3. Sentence Chunking (~150-250 chars per chunk to stay well below 2s GPU TDR limit)
function chunkText(text) {
  const cleaned = sanitizeText(text);
  let sentences = [];

  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    sentences = Array.from(segmenter.segment(cleaned)).map((s) =>
      s.segment.trim(),
    );
  } else {
    sentences = cleaned
      .replace(/(?<=\b(?:Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|vs|e\.g|i\.e))\./gi, "@DOT@")
      .replace(/(?<=\d)\.(?=\d)/g, "@DOT@")
      .match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)
      ?.map((s) => s.replace(/@DOT@/g, ".").trim()) || [cleaned];
  }

  // Filter out empty or whitespace-only chunks
  return sentences.filter((s) => /[a-zA-Z0-9]/.test(s));
}

// 4. Gapless Audio Scheduling on Web Audio Timeline
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
        state: "idle",
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
    state: "stopped",
  });
}

function exportMergedWav(buffers, sampleRate = 24000) {
  const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0);
  const wavBuffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(wavBuffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
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

// 5. Message Listener
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
            state: "error",
          });
          isGenerating = false;
          return;
        }

        const ttsEngine = await getEngine(msg.model || "nano");
        const ctx = getAudioContext();
        nextStartTime = ctx.currentTime;
        collectedAudioBuffers = [];

        chrome.runtime.sendMessage({
          type: "TTS_STATUS",
          status: "Playing audio...",
          state: "playing",
        });

        for (let i = 0; i < chunks.length; i++) {
          if (isCancelled) break;

          const chunk = chunks[i];

          // Generate audio chunk on warm WebGPU engine (~50ms per chunk)
          const result = await ttsEngine.generate(chunk, {
            voice: msg.voice || "Jasper",
            speed: msg.speed || 1.0,
          });

          if (isCancelled || !result) break;

          // Convert Float32Array PCM samples directly to AudioBuffer
          const samples = result.audioData || result;
          const audioBuffer = ctx.createBuffer(1, samples.length, 24000);
          audioBuffer.copyToChannel(samples, 0);

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
          status: `Error: ${err.message}`,
          state: "error",
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
