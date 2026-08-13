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
let currentAudio = null;
let currentAbortController = null;

// --- 1. Load Configurations & Initial Text on Startup ---
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

// --- 2. Save Config Preferences ---
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

// --- 3. Storage Change Listener ---
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ttsText && changes.ttsText.newValue) {
    textInput.value = changes.ttsText.newValue;
    chrome.storage.local.remove('ttsText');
    generateAndPlay(changes.ttsText.newValue);
  }
});

// --- 4. Controls & Playback Handlers ---
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

  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const segments = Array.from(segmenter.segment(text))
    .map(s => s.segment.trim())
    .filter(s => s.length > 0);

  const voice = voiceSelect.value || 'Jasper';
  const model = modelSelect.value || 'nano';
  const speed = parseFloat(speedInput.value) || 1.0;

  try {
    for (let i = 0; i < segments.length; i++) {
      if (abortController.signal.aborted) break;

      let sentence = segments[i];
      if (sentence.length > 500) {
        sentence = sentence.substring(0, 500);
      }

      status.innerText = `Chunk ${i + 1}/${segments.length}: Initializing...`;

      const blob = await textToSpeech(sentence, {
        voice: voice,
        model: model,
        speed: speed,
        onProgress: (stage) => {
          if (!abortController.signal.aborted) {
            status.innerText = `Chunk ${i + 1}/${segments.length}: ${stage}`;
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

    if (!abortController.signal.aborted) {
      status.innerText = "Generation complete. Playing...";
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.error("TTS Error:", error);
      status.innerText = "Error: " + error.message;
      playBtn.disabled = false;
      stopBtn.style.display = 'none';
    }
  } finally {
    currentAbortController = null;
  }
}

function playNextInQueue() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    currentAudio = null;
    status.innerText = "";
    playBtn.disabled = false;
    stopBtn.style.display = 'none';
    return;
  }

  isPlaying = true;
  const nextAudioUrl = audioQueue.shift();
  currentAudio = new Audio(nextAudioUrl);

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