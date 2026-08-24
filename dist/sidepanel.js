// src/sidepanel.js
var themeSelect = document.getElementById("themeSelect");
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
    statusText.textContent = "Please enter some text to read.";
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
  statusDot.className = "status-dot busy";
  statusText.textContent = "Initializing WebGPU...";
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
function resetControls(statusMsg) {
  playBtn.disabled = false;
  stopBtn.disabled = true;
  statusDot.className = "status-dot";
  statusText.textContent = statusMsg;
}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TTS_STATUS") {
    statusText.textContent = msg.status;
    if (msg.state === "playing") {
      statusDot.className = "status-dot playing";
      stopBtn.disabled = false;
      playBtn.disabled = true;
    } else if (msg.state === "busy") {
      statusDot.className = "status-dot busy";
      stopBtn.disabled = false;
      playBtn.disabled = true;
    } else if (msg.state === "idle") {
      resetControls("Finished playing.");
    } else if (msg.state === "stopped") {
      resetControls("Stopped.");
    } else if (msg.state === "error") {
      resetControls(`Error: ${msg.status || "Failed"}`);
    }
  } else if (msg.type === "TTS_AUDIO_READY") {
    downloadBtn.style.display = "block";
  }
});
