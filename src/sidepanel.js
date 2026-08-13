import { textToSpeech } from 'kitten-tts-webgpu';

const textInput = document.getElementById('textInput');
const voiceSelect = document.getElementById('voiceSelect');
const modelSelect = document.getElementById('modelSelect');
const speedInput = document.getElementById('speedInput');
const speedValue = document.getElementById('speedValue');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');

let audioQueue = [];
let isPlaying = false;
let isGenerating = false;
let currentAudio = null;
let currentAbortController = null;

// --- 1. Load Stored Settings & Text ---
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.local.get([
    'selectedVoice',
    'selectedModel',
    'selectedSpeed',
    'ttsText'
  ]);

  voiceSelect.value = settings.selectedVoice || 'Jasper';

  if (settings.selectedModel) {
    modelSelect.value = settings.selectedModel;
  }

  if (settings.selectedSpeed) {
    speedInput.value = settings.selectedSpeed;
    speedValue.innerText = `${parseFloat(settings.selectedSpeed).toFixed(1)}x`;
  }

  if (settings.ttsText) {
    textInput.value = settings.ttsText;
    await chrome.storage.local.remove('ttsText');
    generateAndPlay(settings.ttsText);
  }
});

// --- 2. Persist Preferences ---
voiceSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedVoice: voiceSelect.value });
});

modelSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedModel: modelSelect.value });
});

speedInput.addEventListener('input', () => {
  const speed = parseFloat(speedInput.value).toFixed(1);
  speedValue.innerText = `${speed}x`;
  chrome.storage.local.set({ selectedSpeed: speedInput.value });
});

// --- 3. Storage Listener ---
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ttsText && changes.ttsText.newValue) {
    textInput.value = changes.ttsText.newValue;
    chrome.storage.local.remove('ttsText');
    generateAndPlay(changes.ttsText.newValue);
  }
});

// --- 4. Smart Text Chunking (Prevents Awkward Mid-Sentence Pauses) ---
function chunkText(text) {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];

  // Common abbreviations to avoid splitting on
  const abbrRegex = /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|Inc|Ltd|St|Co|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|e\.g|i\.e)\.$/i;

  // Split by main sentence punctuation (. ! ?)
  const rawSegments = cleanText.split(/(?<=[.!?])\s+/);

  const chunks = [];
  let currentChunk = '';

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i].trim();
    if (!seg) continue;

    if (currentChunk) {
      currentChunk += ' ' + seg;
    } else {
      currentChunk = seg;
    }

    const isAbbrev = abbrRegex.test(currentChunk);

    // Merge short segments into 200–300 char chunks unless forced by a true boundary
    if ((!isAbbrev && currentChunk.length >= 200) || currentChunk.length >= 400) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// --- 5. Playback Handlers ---
playBtn.addEventListener('click', () => {
  if (textInput.value.trim()) {
    generateAndPlay(textInput.value);
  }
});

stopBtn.addEventListener('click', () => {
  stopAudio();
});

function stopAudio() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  audioQueue.forEach(url => URL.revokeObjectURL(url));
  audioQueue = [];
  isPlaying = false;
  isGenerating = false;

  status.innerText = "Stopped.";
  playBtn.disabled = false;
  stopBtn.style.display = 'none';
}

async function generateAndPlay(text) {
  stopAudio();

  playBtn.disabled = true;
  stopBtn.style.display = 'block';

  const abortController = new AbortController();
  currentAbortController = abortController;

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    stopAudio();
    return;
  }

  const voice = voiceSelect.value || 'Jasper';
  const model = modelSelect.value || 'nano';
  const speed = parseFloat(speedInput.value) || 1.0;

  isGenerating = true;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (abortController.signal.aborted) break;

      const chunk = chunks[i];
      if (!isPlaying) {
        status.innerText = `Generating chunk ${i + 1}/${chunks.length}...`;
      }

      const blob = await textToSpeech(chunk, {
        voice: voice,
        model: model,
        speed: speed,
        onProgress: (stage) => {
          if (!abortController.signal.aborted && !isPlaying) {
            status.innerText = `Chunk ${i + 1}/${chunks.length}: ${stage}`;
          }
        }
      });

      if (abortController.signal.aborted) break;

      const audioUrl = URL.createObjectURL(blob);
      audioQueue.push(audioUrl);

      if (!isPlaying) {
        playNextInQueue();
      }
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.error("TTS Error:", error);
      status.innerText = "Error: " + error.message;
      playBtn.disabled = false;
      stopBtn.style.display = 'none';
    }
  } finally {
    isGenerating = false;
    currentAbortController = null;
  }
}

function playNextInQueue() {
  if (audioQueue.length === 0) {
    if (isGenerating) {
      status.innerText = "Buffering audio...";
      isPlaying = false;
      return;
    }

    isPlaying = false;
    currentAudio = null;
    status.innerText = "Finished playing.";
    playBtn.disabled = false;
    stopBtn.style.display = 'none';
    return;
  }

  isPlaying = true;
  status.innerText = "Playing audio...";

  const nextAudioUrl = audioQueue.shift();
  currentAudio = new Audio(nextAudioUrl);
  currentAudio.preload = 'auto';

  currentAudio.onended = () => {
    URL.revokeObjectURL(nextAudioUrl);
    currentAudio = null;
    playNextInQueue();
  };

  currentAudio.onerror = () => {
    URL.revokeObjectURL(nextAudioUrl);
    currentAudio = null;
    playNextInQueue();
  };

  currentAudio.play().catch(err => {
    console.error("Playback error:", err);
    playNextInQueue();
  });
}