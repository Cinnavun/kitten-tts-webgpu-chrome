import { textToSpeech } from 'kitten-tts-webgpu';

const textInput = document.getElementById('textInput');
const voiceSelect = document.getElementById('voiceSelect');
const playBtn = document.getElementById('playBtn');
const status = document.getElementById('status');

// 1. Listen for right-click text sent from the background script
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ttsText && changes.ttsText.newValue) {
    textInput.value = changes.ttsText.newValue;
    generateAndPlay(changes.ttsText.newValue);
  }
});

// 2. Handle manual play button clicks
playBtn.addEventListener('click', () => {
  if (textInput.value.trim()) {
    generateAndPlay(textInput.value);
  }
});

async function generateAndPlay(text) {
  try {
    status.innerText = "Generating audio (WebGPU)...";
    playBtn.disabled = true;

    // Run inference using the cached 24MB Nano model
    const blob = await textToSpeech(text, { 
      voice: voiceSelect.value, 
      model: 'nano', 
      onProgress: (stage) => {
        // This will display the download progress on the first run
        status.innerText = stage; 
  }
});

    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.play();

    status.innerText = "Playing...";
  } catch (error) {
    console.error(error);
    status.innerText = "Error: " + error.message;
  } finally {
    playBtn.disabled = false;
    // Clear status after a few seconds
    setTimeout(() => { if(status.innerText === "Playing...") status.innerText = ""; }, 3000);
  }
}