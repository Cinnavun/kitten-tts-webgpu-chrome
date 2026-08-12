import { textToSpeech } from 'kitten-tts-webgpu';

const textInput = document.getElementById('textInput');
const voiceSelect = document.getElementById('voiceSelect');
const playBtn = document.getElementById('playBtn');
const status = document.getElementById('status');

let audioQueue = [];
let isPlaying = false;

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
  playBtn.disabled = true;
  audioQueue = []; // Reset queue
  isPlaying = false;
  
  // Use browser's native Intl.Segmenter to safely split text into sentences
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const segments = Array.from(segmenter.segment(text))
    .map(s => s.segment.trim())
    .filter(s => s.length > 0);

  try {
    for (let i = 0; i < segments.length; i++) {
      let sentence = segments[i];
      
      // Failsafe for abnormally long run-on sentences without punctuation
      if (sentence.length > 500) {
        sentence = sentence.substring(0, 500); 
      }

      status.innerText = `Generating audio (${i + 1}/${segments.length})...`;

      const blob = await textToSpeech(sentence, { 
        voice: voiceSelect.value, 
        model: 'nano'
      });

      const audioUrl = URL.createObjectURL(blob);
      audioQueue.push(audioUrl);

      // Start playing immediately if this is the first chunk
      if (!isPlaying) {
        playNextInQueue();
      }
    }
    
    status.innerText = "Generation complete. Playing...";
  } catch (error) {
    console.error(error);
    status.innerText = "Error: " + error.message;
    playBtn.disabled = false;
  }
}

function playNextInQueue() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    status.innerText = "";
    playBtn.disabled = false;
    return;
  }

  isPlaying = true;
  const nextAudioUrl = audioQueue.shift();
  const audio = new Audio(nextAudioUrl);
  
  audio.onended = () => {
    URL.revokeObjectURL(nextAudioUrl);
    playNextInQueue(); // Play the next sentence when this one finishes
  };
  
  audio.play();
}