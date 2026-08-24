// src/sidepanel.js
var themeSelect = document.getElementById("themeSelect");
var extractArticleBtn = document.getElementById("extractArticleBtn");
var voiceSelect = document.getElementById("voiceSelect");
var modelSelect = document.getElementById("modelSelect");
var speedInput = document.getElementById("speedInput");
var speedValue = document.getElementById("speedValue");
var textInput = document.getElementById("textInput");
var clearBtn = document.getElementById("clearBtn");
var playBtn = document.getElementById("playBtn");
var stopBtn = document.getElementById("stopBtn");
var downloadBtn = document.getElementById("downloadBtn");
var statusDot = document.getElementById("statusDot");
var statusText = document.getElementById("statusText");
var progressContainer = document.getElementById("progressContainer");
var progressFill = document.getElementById("progressFill");
var snippetText = document.getElementById("snippetText");
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
speedInput.addEventListener("input", () => {
  speedValue.textContent = `${speedInput.value}x`;
});
clearBtn.addEventListener("click", () => {
  textInput.value = "";
  textInput.focus();
});
extractArticleBtn.addEventListener("click", async () => {
  statusText.textContent = "Scanning active tab for article...";
  chrome.runtime.sendMessage({ type: "EXTRACT_CURRENT_TAB_ARTICLE" }, (response) => {
    if (response?.article?.text) {
      textInput.value = response.article.text;
      const titleSnippet = response.article.title ? response.article.title.slice(0, 30) + "..." : "Text extracted";
      statusText.textContent = `Article loaded: "${titleSnippet}"`;
    } else {
      statusText.textContent = "Could not find a structured article on this page.";
    }
  });
});
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
    text,
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
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TTS_PROGRESS") {
    statusDot.className = "status-dot busy";
    progressContainer.style.display = "block";
    progressFill.style.width = `${msg.percent}%`;
    statusText.textContent = `Chunk ${msg.current} of ${msg.total} (${msg.percent}%)`;
    snippetText.textContent = msg.snippet ? `\u201C${msg.snippet}\u201D` : "";
    stopBtn.disabled = false;
  } else if (msg.type === "TTS_STATUS") {
    if (msg.state === "idle") {
      resetControls("Finished playing.");
    } else if (msg.state === "stopped") {
      resetControls("Stopped.");
    } else if (msg.state === "error") {
      resetControls(msg.status || "Error occurred", true);
    } else if (msg.state === "busy") {
      statusText.textContent = msg.status;
    }
  } else if (msg.type === "TTS_AUDIO_READY") {
    downloadBtn.style.display = "block";
  }
});
