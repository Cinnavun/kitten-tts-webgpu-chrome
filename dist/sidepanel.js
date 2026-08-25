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
var resetGpuBtn = document.getElementById("resetGpuBtn");
(async () => {
  await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PREWARM_MODEL",
    model: modelSelect?.value || "nano"
  });
})();
function applyTheme(theme) {
  if (theme === "auto") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light"
    );
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
chrome.storage.local.get("preferredTheme", (data) => {
  const saved = data.preferredTheme || "auto";
  if (themeSelect) themeSelect.value = saved;
  applyTheme(saved);
});
themeSelect?.addEventListener("change", (e) => {
  chrome.storage.local.set({ preferredTheme: e.target.value });
  applyTheme(e.target.value);
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (themeSelect?.value === "auto") applyTheme("auto");
});
speedInput?.addEventListener("input", () => {
  if (speedValue) speedValue.textContent = `${speedInput.value}x`;
});
clearBtn?.addEventListener("click", () => {
  if (textInput) {
    textInput.value = "";
    textInput.focus();
  }
});
extractArticleBtn?.addEventListener("click", async () => {
  try {
    if (statusText)
      statusText.textContent = "Scanning active tab for article...";
    if (statusDot) statusDot.className = "status-dot busy";
    const hasPermission = await chrome.permissions.contains({
      origins: ["http://*/*", "https://*/*"]
    });
    if (!hasPermission) {
      const granted = await chrome.permissions.request({
        origins: ["http://*/*", "https://*/*"]
      });
      if (!granted) {
        if (statusText)
          statusText.textContent = "Permission denied. Cannot scan page.";
        if (statusDot) statusDot.className = "status-dot";
        return;
      }
    }
    chrome.runtime.sendMessage(
      { type: "EXTRACT_CURRENT_TAB_ARTICLE" },
      async (response) => {
        if (response?.error) {
          if (statusText) statusText.textContent = `Error: ${response.error}`;
          if (statusDot) statusDot.className = "status-dot";
          return;
        }
        if (response?.article?.text) {
          if (textInput) textInput.value = response.article.text;
          const titleSnippet = response.article.title ? response.article.title.slice(0, 25) + "..." : "Article";
          if (statusText)
            statusText.textContent = `Article loaded: "${titleSnippet}". Synthesizing...`;
          await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
          chrome.runtime.sendMessage({
            target: "offscreen",
            type: "PLAY_TEXT",
            text: response.article.text,
            voice: voiceSelect?.value || "Jasper",
            speed: parseFloat(speedInput?.value || "1.0"),
            model: modelSelect?.value || "nano"
          });
          if (playBtn) playBtn.disabled = true;
          if (stopBtn) stopBtn.disabled = false;
          if (downloadBtn) downloadBtn.style.display = "none";
          if (progressContainer) progressContainer.style.display = "block";
          if (progressFill) progressFill.style.width = "0%";
        } else {
          if (statusText)
            statusText.textContent = "Could not find a structured article on this page.";
          if (statusDot) statusDot.className = "status-dot";
        }
      }
    );
  } catch (err) {
    console.error("Extraction error:", err);
    if (statusText) statusText.textContent = `Error: ${err.message}`;
    if (statusDot) statusDot.className = "status-dot";
  }
});
chrome.storage.local.get("ttsText", (data) => {
  if (data.ttsText && textInput) {
    textInput.value = data.ttsText;
    chrome.storage.local.remove("ttsText");
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ttsText?.newValue && textInput) {
    textInput.value = changes.ttsText.newValue;
    chrome.storage.local.remove("ttsText");
  }
});
playBtn?.addEventListener("click", async () => {
  const text = textInput?.value.trim();
  if (!text) {
    if (statusText)
      statusText.textContent = "Please enter text or extract an article.";
    return;
  }
  await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PLAY_TEXT",
    text,
    voice: voiceSelect?.value || "Jasper",
    speed: parseFloat(speedInput?.value || "1.0"),
    model: modelSelect?.value || "nano"
  });
  if (playBtn) playBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  if (downloadBtn) downloadBtn.style.display = "none";
  if (progressContainer) progressContainer.style.display = "block";
  if (progressFill) progressFill.style.width = "0%";
  if (statusDot) statusDot.className = "status-dot busy";
  if (statusText) statusText.textContent = "Synthesizing with WebGPU...";
});
stopBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_AUDIO" });
  resetControls("Stopped.");
});
downloadBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { target: "offscreen", type: "GET_DOWNLOAD_BLOB" },
    (res) => {
      if (res?.dataUrl) {
        const a = document.createElement("a");
        a.href = res.dataUrl;
        a.download = "kitten-tts-audio.wav";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  );
});
function resetControls(statusMsg, isError = false) {
  if (playBtn) playBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  if (progressContainer) progressContainer.style.display = "none";
  if (progressFill) progressFill.style.width = "0%";
  if (statusDot) statusDot.className = "status-dot";
  if (statusText) statusText.textContent = statusMsg;
}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TTS_PROGRESS") {
    if (statusDot) statusDot.className = "status-dot busy";
    if (progressContainer) progressContainer.style.display = "block";
    if (progressFill) progressFill.style.width = `${msg.percent}%`;
    if (statusText)
      statusText.textContent = `Synthesizing audio... ${msg.percent}%`;
    if (stopBtn) stopBtn.disabled = false;
  } else if (msg.type === "TTS_STATUS") {
    if (msg.state === "idle") {
      resetControls("Finished playing.");
    } else if (msg.state === "stopped") {
      resetControls("Stopped.");
    } else if (msg.state === "error") {
      resetControls(msg.status || "Error occurred", true);
    } else if (msg.state === "playing") {
      if (statusText) statusText.textContent = "Playing audio...";
      if (statusDot) statusDot.className = "status-dot playing";
    } else if (msg.state === "busy") {
      if (statusText) statusText.textContent = msg.status;
    }
  } else if (msg.type === "TTS_AUDIO_READY") {
    if (downloadBtn) downloadBtn.style.display = "block";
  }
});
resetGpuBtn?.addEventListener("click", () => {
  if (statusText)
    statusText.textContent = "Resetting GPU process and clearing cache...";
  if (statusDot) statusDot.className = "status-dot busy";
  chrome.runtime.sendMessage({ type: "RESET_GPU_OFFSCREEN" }, (res) => {
    resetControls(res?.message || "WebGPU engine reset.");
  });
});
