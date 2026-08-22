const themeSelect = document.getElementById("themeSelect");
const extractArticleBtn = document.getElementById("extractArticleBtn");
const voiceSelect = document.getElementById("voiceSelect");
const modelSelect = document.getElementById("modelSelect");
const speedInput = document.getElementById("speedInput");
const speedValue = document.getElementById("speedValue");
const textInput = document.getElementById("textInput");
const clearBtn = document.getElementById("clearBtn");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const downloadBtn = document.getElementById("downloadBtn");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const snippetText = document.getElementById("snippetText");

// 1. Theme Manager
function applyTheme(theme) {
  if (theme === "auto") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

chrome.storage.local.get("preferredTheme", (data) => {
  const saved = data.preferredTheme || "auto";
  themeSelect.value = saved;
  applyTheme(saved);
});

themeSelect.addEventListener("change", (e) => {
  chrome.storage.local.set({ preferredTheme: e.target.value });
  applyTheme(e.target.value);
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (themeSelect.value === "auto") applyTheme("auto");
});

// 2. Speed Slider & Clear Input
speedInput.addEventListener("input", () => {
  speedValue.textContent = `${speedInput.value}x`;
});

clearBtn.addEventListener("click", () => {
  textInput.value = "";
  textInput.focus();
});

// 3. Article Extractor Action
extractArticleBtn.addEventListener("click", async () => {
  statusText.textContent = "Scanning active tab for article...";
  chrome.runtime.sendMessage({ type: "EXTRACT_CURRENT_TAB_ARTICLE" }, (response) => {
    if (response?.article?.text) {
      textInput.value = response.article.text;
      statusText.textContent = `Article loaded: "${response.article.title.slice(0, 35)}..."`;
    } else {
      statusText.textContent = "Could not find a structured article on this page.";
    }
  });
});

// Load highlighted/article text from storage
chrome.storage.local.get("ttsText", (data) => {
  if (data.ttsText) {
    textInput.value = data.ttsText;
    chrome.storage.local.remove("ttsText");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ttsText?.newValue) {
    textInput.value = changes.ttsText.newValue;
    chrome.storage.local.remove("ttsText");
  }
});

// 4. Play & Stop Actions
playBtn.addEventListener("click", async () => {
  const text = textInput.value.trim();
  if (!text) {
    statusText.textContent = "Please enter text or extract an article.";
    return;
  }

  await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });

  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PLAY_TEXT",
    text: text,
    voice: voiceSelect.value,
    speed: parseFloat(speedInput.value),
    model: modelSelect.value
  });

  playBtn.disabled = true;
  stopBtn.disabled = false;
  downloadBtn.style.display = "none";
  progressContainer.style.display = "block";
  progressFill.style.width = "0%";
  statusDot.className = "status-dot busy";
  statusText.textContent = "Synthesizing with WebGPU...";
  snippetText.textContent = "";
});

stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_AUDIO" });
  resetControls("Stopped.");
});

downloadBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ target: "offscreen", type: "GET_DOWNLOAD_BLOB" }, (res) => {
    if (res?.dataUrl) {
      const a = document.createElement("a");
      a.href = res.dataUrl;
      a.download = "kitten-tts-audio.wav";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  });
});

function resetControls(statusMsg, isError = false) {
  playBtn.disabled = false;
  stopBtn.disabled = true;
  progressContainer.style.display = "none";
  progressFill.style.width = "0%";
  statusDot.className = "status-dot";
  statusText.textContent = statusMsg;
  snippetText.textContent = "";
}

// 5. Progress Listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TTS_PROGRESS") {
    statusDot.className = "status-dot busy";
    progressContainer.style.display = "block";
    progressFill.style.width = `${msg.percent}%`;
    statusText.textContent = `Chunk ${msg.current} of ${msg.total} (${msg.percent}%)`;
    snippetText.textContent = msg.snippet ? `“${msg.snippet}”` : "";
    stopBtn.disabled = false;
  } else if (msg.type === "TTS_STATUS") {
    if (msg.state === "idle") {
      resetControls("Finished playing.");
    } else if (msg.state === "stopped") {
      resetControls("Stopped.");
    } else if (msg.state === "error") {
      resetControls(msg.status || "Error occurred", true);
    }
  } else if (msg.type === "TTS_AUDIO_READY") {
    downloadBtn.style.display = "block";
  }
});