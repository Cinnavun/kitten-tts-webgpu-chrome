// src/sidepanel.js
var themeSelect = document.getElementById("themeSelect");
var voiceSelect = document.getElementById("voiceSelect");
var modelSelect = document.getElementById("modelSelect");
var speedInput = document.getElementById("speedInput");
var speedValue = document.getElementById("speedValue");
var textInput = document.getElementById("textInput");
var playBtn = document.getElementById("playBtn");
var stopBtn = document.getElementById("stopBtn");
var downloadBtn = document.getElementById("downloadBtn");
var statusDiv = document.getElementById("status");
function applyTheme(theme) {
  if (theme === "auto") {
    const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", isSystemDark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
chrome.storage.local.get("preferredTheme", (data) => {
  const savedTheme = data.preferredTheme || "auto";
  themeSelect.value = savedTheme;
  applyTheme(savedTheme);
});
themeSelect.addEventListener("change", (e) => {
  const chosenTheme = e.target.value;
  chrome.storage.local.set({ preferredTheme: chosenTheme });
  applyTheme(chosenTheme);
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (themeSelect.value === "auto") {
    applyTheme("auto");
  }
});
speedInput.addEventListener("input", () => {
  speedValue.textContent = `${speedInput.value}x`;
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
    statusDiv.textContent = "Please enter some text.";
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
  statusDiv.innerHTML = "<em>Preparing WebGPU and splitting sentences...</em>";
});
stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_AUDIO" });
  playBtn.disabled = false;
  stopBtn.disabled = true;
  statusDiv.textContent = "Stopped.";
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
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TTS_PROGRESS") {
    statusDiv.innerHTML = `
      <div style="font-weight:600; color:var(--primary-btn);">
        Chunk ${msg.current} of ${msg.total} (${msg.percent}%)
      </div>
      <div style="font-size:11px; opacity:0.8; margin-top:2px;">
        &ldquo;${msg.snippet}&rdquo;
      </div>
    `;
    stopBtn.disabled = false;
  } else if (msg.type === "TTS_STATUS") {
    statusDiv.textContent = msg.status;
    if (msg.state === "idle" || msg.state === "stopped") {
      playBtn.disabled = false;
      stopBtn.disabled = true;
    } else if (msg.state === "error") {
      playBtn.disabled = false;
      stopBtn.disabled = true;
    }
  } else if (msg.type === "TTS_AUDIO_READY") {
    downloadBtn.style.display = "block";
  }
});
