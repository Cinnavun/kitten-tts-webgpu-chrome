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
const resetGpuBtn = document.getElementById("resetGpuBtn");
const charCount = document.getElementById("charCount");

// Utility for debouncing
function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

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
  if (themeSelect) themeSelect.value = saved;
  applyTheme(saved);
});

themeSelect?.addEventListener("change", (e) => {
  chrome.storage.local.set({ preferredTheme: e.target.value });
  applyTheme(e.target.value);
});

// 2. Load Saved Preferences (voice, model, speed)
chrome.storage.local.get(
  { preferredVoice: "Jasper", preferredModel: "nano", preferredSpeed: "1.0" },
  (items) => {
    if (voiceSelect) voiceSelect.value = items.preferredVoice;
    if (modelSelect) modelSelect.value = items.preferredModel;
    if (speedInput) {
      speedInput.value = items.preferredSpeed;
      if (speedValue) speedValue.textContent = `${items.preferredSpeed}x`;
    }
  },
);

// 3. Save Preferences on Change
voiceSelect?.addEventListener("change", () => {
  chrome.storage.local.set({ preferredVoice: voiceSelect.value });
});

modelSelect?.addEventListener("change", () => {
  chrome.storage.local.set({ preferredModel: modelSelect.value });
});

const saveSpeed = debounce((value) => {
  chrome.storage.local.set({ preferredSpeed: value });
}, 500);

speedInput?.addEventListener("input", () => {
  if (speedValue) speedValue.textContent = `${speedInput.value}x`;
  saveSpeed(speedInput.value);
});

// 4. Character Count & Clear Input
function updateCharCount() {
  if (charCount && textInput) {
    const len = textInput.value.length;
    if (len === 0) {
      charCount.textContent = "";
    } else {
      // Rough estimate: ~200 chars per chunk
      const estimatedChunks = Math.max(1, Math.ceil(len / 200));
      charCount.textContent = `${len.toLocaleString()} chars · ~${estimatedChunks} chunk${estimatedChunks > 1 ? "s" : ""}`;
    }
  }
}

const debouncedUpdateCharCount = debounce(updateCharCount, 300);
textInput?.addEventListener("input", debouncedUpdateCharCount);

clearBtn?.addEventListener("click", () => {
  if (textInput) {
    textInput.value = "";
    textInput.focus();
    updateCharCount();
  }
});

// 5. Silent Pre-Warm on Panel Load
(async () => {
  await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PREWARM_MODEL",
    model: modelSelect?.value || "nano",
  });
})();

// Helper to start playback
async function startPlayback(textToPlay) {
  const text = (textToPlay || textInput?.value || "").trim();
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
    model: modelSelect?.value || "nano",
  });

  if (playBtn) playBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  if (downloadBtn) downloadBtn.style.display = "none";
  if (progressContainer) progressContainer.style.display = "block";
  if (progressFill) progressFill.style.width = "0%";
  if (statusDot) statusDot.className = "status-dot busy";
  if (statusText) statusText.textContent = "Synthesizing with WebGPU...";
}

// 6. Scan & Auto-Play Article Action
extractArticleBtn?.addEventListener("click", async () => {
  try {
    if (statusText)
      statusText.textContent = "Checking page access permissions...";

    const granted = await chrome.permissions.request({
      origins: ["http://*/*", "https://*/*"],
    });

    if (!granted) {
      if (statusText)
        statusText.textContent = "Permission denied. Cannot scan page.";
      return;
    }

    if (statusText)
      statusText.textContent = "Scanning active tab for article...";
    if (statusDot) statusDot.className = "status-dot busy";

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
          updateCharCount();
          const titleSnippet =
            response.article.title ?
              response.article.title.slice(0, 25) + "..."
            : "Article";
          if (statusText)
            statusText.textContent = `Loaded "${titleSnippet}". Reading...`;

          // Auto-play immediately
          await startPlayback(response.article.text);
        } else {
          if (statusText)
            statusText.textContent =
              "Could not find a structured article on this page.";
          if (statusDot) statusDot.className = "status-dot";
        }
      },
    );
  } catch (err) {
    console.error("Extraction error:", err);
    if (statusText) statusText.textContent = `Error: ${err.message}`;
    if (statusDot) statusDot.className = "status-dot";
  }
});

// Storage Listeners
chrome.storage.local.get("ttsText", (data) => {
  if (data.ttsText && textInput) {
    textInput.value = data.ttsText;
    updateCharCount();
    chrome.storage.local.remove("ttsText");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ttsText?.newValue && textInput) {
    textInput.value = changes.ttsText.newValue;
    updateCharCount();
    chrome.storage.local.remove("ttsText");
  }
});

// 7. Play & Stop Listeners
playBtn?.addEventListener("click", () => startPlayback());

stopBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_AUDIO" });
  resetControls("Stopped.");
});

const downloadAnchor = document.createElement("a");
downloadAnchor.style.display = "none";
document.body.appendChild(downloadAnchor);

downloadBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { target: "offscreen", type: "GET_DOWNLOAD_BLOB" },
    (res) => {
      if (res?.dataUrl) {
        downloadAnchor.href = res.dataUrl;
        downloadAnchor.download = "kitten-tts-audio.wav";
        downloadAnchor.click();
      }
    },
  );
});

function resetControls(statusMsg) {
  if (playBtn) playBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  if (progressContainer) progressContainer.style.display = "none";
  if (progressFill) progressFill.style.width = "0%";
  if (statusDot) statusDot.className = "status-dot";
  if (statusText) statusText.textContent = statusMsg;
}

// 8. Progress Listener — connected via Port for zero-overhead relay from background
(function connectUiPort() {
  const port = chrome.runtime.connect({ name: "tts-ui" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "TTS_PROGRESS") {
      statusDot.className = "status-dot busy";
      if (progressContainer) progressContainer.style.display = "block";
      requestAnimationFrame(() => {
        if (progressFill) progressFill.style.width = `${msg.percent}%`;
        statusText.textContent = `Synthesizing audio... ${msg.percent}%`;
      });
      stopBtn.disabled = false;
    } else if (msg.type === "TTS_STATUS") {
      if (msg.state === "idle") {
        resetControls("Finished playing.");
      } else if (msg.state === "stopped") {
        resetControls("Stopped.");
      } else if (msg.state === "error") {
        resetControls(msg.status || "Error occurred");
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
  // Reconnect if the service worker restarts and drops the port
  port.onDisconnect.addListener(() => setTimeout(connectUiPort, 200));
})();


// 9. Reset Engine Action
resetGpuBtn?.addEventListener("click", () => {
  if (statusText) statusText.textContent = "Resetting GPU process...";
  if (statusDot) statusDot.className = "status-dot busy";
  chrome.runtime.sendMessage({ type: "RESET_GPU_OFFSCREEN" }, (res) => {
    resetControls(res?.message || "Engine reset.");
  });
});
