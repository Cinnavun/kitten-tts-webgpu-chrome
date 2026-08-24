// src/sidepanel.js
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
const resetGpuBtn = document.getElementById("resetGpuBtn");

// 1. Theme Management
function applyTheme(theme) {
  if (theme === "auto") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light",
    );
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

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
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
  try {
    statusText.textContent = "Checking page access permissions...";

    // 1. Check if permission is already granted
    const hasPermission = await chrome.permissions.contains({
      origins: ["http://*/*", "https://*/*"]
    });

    // 2. If not granted, prompt the user for permission
    if (!hasPermission) {
      const granted = await chrome.permissions.request({
        origins: ["http://*/*", "https://*/*"]
      });

      if (!granted) {
        statusText.textContent = "Permission denied. Cannot scan page.";
        return;
      }
    }

    // 3. Request article extraction from the background script
    statusText.textContent = "Scanning active tab for article...";

    chrome.runtime.sendMessage({ type: "EXTRACT_CURRENT_TAB_ARTICLE" }, (response) => {
      if (response?.error) {
        statusText.textContent = `Error: ${response.error}`;
        return;
      }

      if (response?.article?.text) {
        textInput.value = response.article.text;
        const titleSnippet = response.article.title
          ? response.article.title.slice(0, 30) + "..."
          : "Article";
        statusText.textContent = `Loaded: "${titleSnippet}"`;
      } else {
        statusText.textContent = "Could not find a structured article on this page.";
      }
    });
  } catch (err) {
    console.error("Permission / Extraction error:", err);
    statusText.textContent = `Error: ${err.message}`;
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
    model: modelSelect.value,
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
    },
  );
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

// Progress Listener: Clean Percentage Display
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TTS_PROGRESS") {
    statusDot.className = "status-dot busy";
    progressContainer.style.display = "block";
    progressFill.style.width = `${msg.percent}%`;
    statusText.textContent = `Synthesizing audio... ${msg.percent}%`;
    stopBtn.disabled = false;
  } else if (msg.type === "TTS_STATUS") {
    if (msg.state === "idle") {
      resetControls("Finished playing.");
    } else if (msg.state === "stopped") {
      resetControls("Stopped.");
    } else if (msg.state === "error") {
      resetControls(msg.status || "Error occurred", true);
    } else if (msg.state === "playing") {
      statusText.textContent = "Playing audio...";
      statusDot.className = "status-dot playing";
    } else if (msg.state === "busy") {
      statusText.textContent = msg.status;
    }
  } else if (msg.type === "TTS_AUDIO_READY") {
    downloadBtn.style.display = "block";
  }
});

// Reset Engine / Cache Action
resetGpuBtn.addEventListener("click", () => {
  statusText.textContent = "Resetting GPU process and clearing cache...";
  statusDot.className = "status-dot busy";
  chrome.runtime.sendMessage({ type: "RESET_GPU_OFFSCREEN" }, (res) => {
    resetControls(res?.message || "WebGPU engine reset.");
  });
});