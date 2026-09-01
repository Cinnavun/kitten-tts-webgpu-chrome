import { generateCacheKey, getAudio } from './db.js';

/** @type {HTMLSelectElement | null} */
const themeSelect = document.querySelector("#themeSelect");
/** @type {HTMLButtonElement | null} */
const extractArticleBtn = document.querySelector("#extractArticleBtn");
/** @type {HTMLSelectElement | null} */
const voiceSelect = document.querySelector("#voiceSelect");
/** @type {HTMLSelectElement | null} */
const modelSelect = document.querySelector("#modelSelect");
/** @type {HTMLInputElement | null} */
const speedInput = document.querySelector("#speedInput");
/** @type {HTMLElement | null} */
const speedValue = document.getElementById("speedValue");
/** @type {HTMLInputElement | null} */
const renderBeforePlayToggle = document.querySelector("#renderBeforePlayToggle");
/** @type {HTMLInputElement | null} */
const autoplayToggle = document.querySelector("#autoplayToggle");
/** @type {HTMLTextAreaElement | null} */
const textInput = document.querySelector("#textInput");
/** @type {HTMLButtonElement | null} */
const clearBtn = document.querySelector("#clearBtn");
/** @type {HTMLButtonElement | null} */
const playBtn = document.querySelector("#playBtn");
/** @type {HTMLButtonElement | null} */
const stopBtn = document.querySelector("#stopBtn");
/** @type {HTMLButtonElement | null} */
const downloadBtn = document.querySelector("#downloadBtn");
/** @type {HTMLElement | null} */
const statusDot = document.getElementById("statusDot");
/** @type {HTMLElement | null} */
const statusText = document.getElementById("statusText");
/** @type {HTMLElement | null} */
const progressContainer = document.getElementById("progressContainer");
/** @type {HTMLElement | null} */
const progressFill = document.getElementById("progressFill");
/** @type {HTMLButtonElement | null} */
const resetGpuBtn = document.querySelector("#resetGpuBtn");
/** @type {HTMLButtonElement | null} */
const clearAudioCacheBtn = document.querySelector("#clearAudioCacheBtn");
/** @type {HTMLElement | null} */
const charCount = document.getElementById("charCount");

// Debug panel DOM refs (populated in section 10)
/** @type {HTMLDetailsElement | null} */
const debugPanel = document.querySelector("#debugPanel");
/** @type {HTMLInputElement | null} */
const debugToggle = document.querySelector("#debugToggle");
/** @type {HTMLTextAreaElement | null} */
const debugLog = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("debugLog"));
/** @type {HTMLElement | null} */
const debugEntryCount = document.getElementById("debugEntryCount");
/** @type {HTMLButtonElement | null} */
const debugClearBtn = document.querySelector("#debugClearBtn");
/** @type {HTMLButtonElement | null} */
const debugCopyBtn = document.querySelector("#debugCopyBtn");
/** @type {Array<{ tag: string, data: unknown, ts: number }>} */
let debugEntries = [];

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
  const target = /** @type {HTMLSelectElement} */ (e.target);
  if (!target) return;
  chrome.storage.local.set({ preferredTheme: target.value });
  applyTheme(target.value);
});

// 2. Load Saved Preferences (voice, model, speed, renderBeforePlay, autoplay)
chrome.storage.local.get(
  { preferredVoice: "Jasper", preferredModel: "nano", preferredSpeed: "1.0", renderBeforePlay: false, autoplay: true },
  (items) => {
    if (voiceSelect) voiceSelect.value = items.preferredVoice;
    if (modelSelect) modelSelect.value = items.preferredModel;
    if (speedInput) {
      speedInput.value = items.preferredSpeed;
      if (speedValue) speedValue.textContent = `${items.preferredSpeed}x`;
    }
    if (renderBeforePlayToggle) {
      renderBeforePlayToggle.checked = items.renderBeforePlay;
    }
    if (autoplayToggle) {
      autoplayToggle.checked = items.autoplay;
      autoplayToggle.disabled = !items.renderBeforePlay;
    }
    checkCacheStatus(); // Initial check
  },
);

// 3. Save Preferences on Change
voiceSelect?.addEventListener("change", () => {
  chrome.storage.local.set({ preferredVoice: voiceSelect.value });
  checkCacheStatus();
});

modelSelect?.addEventListener("change", () => {
  chrome.storage.local.set({ preferredModel: modelSelect.value });
  checkCacheStatus();
});

const saveSpeed = debounce((value) => {
  chrome.storage.local.set({ preferredSpeed: value });
}, 500);

speedInput?.addEventListener("input", () => {
  if (speedValue) speedValue.textContent = `${speedInput.value}x`;
  saveSpeed(speedInput.value);
  checkCacheStatus();
});

renderBeforePlayToggle?.addEventListener("change", () => {
  if (renderBeforePlayToggle) {
    chrome.storage.local.set({ renderBeforePlay: renderBeforePlayToggle.checked });
    if (autoplayToggle) {
      autoplayToggle.disabled = !renderBeforePlayToggle.checked;
    }
  }
});

autoplayToggle?.addEventListener("change", () => {
  if (autoplayToggle) {
    chrome.storage.local.set({ autoplay: autoplayToggle.checked });
  }
});

// Helpers for cache checking
async function getBlobDuration(blob) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(audio.src);
    };
  });
}

function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const checkCacheStatus = debounce(async () => {
  const text = (textInput?.value || "").trim();
  const voice = voiceSelect?.value || "Jasper";
  const speed = parseFloat(speedInput?.value || "1.0");
  const model = modelSelect?.value || "nano";

  if (!text) {
    if (playBtn) playBtn.textContent = "▶ Generate Audio";
    return;
  }

  const cacheKey = await generateCacheKey(text, voice, speed, model);
  const cachedBlob = await getAudio(cacheKey);

  if (cachedBlob && playBtn) {
    const duration = await getBlobDuration(cachedBlob);
    playBtn.textContent = `▶ Listen to Audio (${formatDuration(duration)})`;
  } else if (playBtn) {
    playBtn.textContent = "▶ Generate Audio";
  }
}, 300);

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
textInput?.addEventListener("input", () => {
  debouncedUpdateCharCount();
  checkCacheStatus();
});

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
  const voice = voiceSelect?.value || "Jasper";
  const speed = parseFloat(speedInput?.value || "1.0");
  const model = modelSelect?.value || "nano";
  const renderBeforePlay = renderBeforePlayToggle?.checked || false;
  const autoplay = autoplayToggle?.checked ?? true;

  if (!text) {
    if (statusText)
      statusText.textContent = "Please enter text or extract an article.";
    return;
  }

  await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
  
  const cacheKey = await generateCacheKey(text, voice, speed, model);
  const cachedBlob = await getAudio(cacheKey);

  if (cachedBlob) {
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PLAY_CACHED",
      cacheKey
    });
  } else {
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PLAY_TEXT",
      text,
      voice,
      speed,
      model,
      cacheKey,
      renderBeforePlay,
      autoplay
    });
  }

  if (playBtn) playBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  if (downloadBtn) downloadBtn.style.display = "none";
  if (progressContainer) progressContainer.style.display = "block";
  if (progressFill) progressFill.style.width = "0%";
  if (statusDot) statusDot.className = "status-dot busy";
  if (statusText) {
    if (cachedBlob) {
      statusText.textContent = "Playing cached audio...";
    } else {
      statusText.textContent = autoplay ? "Synthesizing and playing..." : "Generating audio to cache...";
    }
  }
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

downloadBtn?.addEventListener("click", async () => {
  const text = (textInput?.value || "").trim();
  const voice = voiceSelect?.value || "Jasper";
  const speed = parseFloat(speedInput?.value || "1.0");
  const model = modelSelect?.value || "nano";

  if (!text) return;

  try {
    if (statusText) statusText.textContent = "Preparing download...";
    const cacheKey = await generateCacheKey(text, voice, speed, model);
    const blob = await getAudio(cacheKey);

    if (blob) {
      const url = URL.createObjectURL(blob);
      downloadAnchor.href = url;
      downloadAnchor.download = "kitten-tts-audio.wav";
      downloadAnchor.click();
      
      // Clean up the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (statusText) statusText.textContent = "Download started.";
    } else {
      if (statusText) statusText.textContent = "Error: Audio not found in cache.";
    }
  } catch (err) {
    if (statusText) statusText.textContent = `Download Error: ${err.message}`;
  }
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
      if (statusDot) statusDot.className = "status-dot busy";
      if (progressContainer) progressContainer.style.display = "block";
      requestAnimationFrame(() => {
        if (progressFill) progressFill.style.width = `${msg.percent}%`;
        if (statusText) statusText.textContent = `Synthesizing audio... ${msg.percent}%`;
      });
      if (stopBtn) stopBtn.disabled = false;
    } else if (msg.type === "TTS_STATUS") {
      if (msg.state === "idle") {
        resetControls(msg.status || "Finished playing.");
      } else if (msg.state === "stopped") {
        resetControls(msg.status || "Stopped.");
      } else if (msg.state === "error") {
        resetControls(msg.status || "Error occurred");
      } else if (msg.state === "playing") {
        if (statusText) statusText.textContent = "Playing audio...";
        if (statusDot) statusDot.className = "status-dot playing";
      } else if (msg.state === "busy") {
        if (statusText) statusText.textContent = msg.status;
      }
    } else if (msg.type === "TTS_AUDIO_READY") {
      if (downloadBtn) downloadBtn.style.display = "block";
      checkCacheStatus();
    } else if (msg.type === "TTS_DEBUG_LOG") {
      // Append to in-panel debug log if the panel exists
      if (debugPanel && debugLog) {
        // Auto-open the panel on first event received
        if (!debugPanel.open && debugEntries.length === 0) {
          debugPanel.open = true;
        }
        debugEntries.push({ tag: msg.tag, data: msg.data, ts: msg.ts ?? Date.now() });
        // Keep buffer bounded to 200 entries
        if (debugEntries.length > 200) debugEntries.shift();
        renderDebugLog();
      }
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

clearAudioCacheBtn?.addEventListener("click", () => {
  if (statusText) statusText.textContent = "Clearing audio cache...";
  if (statusDot) statusDot.className = "status-dot busy";
  chrome.runtime.sendMessage({ type: "CLEAR_AUDIO_CACHE" }, (res) => {
    resetControls(res?.message || "Audio cache cleared.");
  });
});

// ── 10. Debug Panel ────────────────────────────────────────────────────────


/** Render all debug entries into the log pre element */
function renderDebugLog() {
  if (!debugLog) return;
  if (debugEntries.length === 0) {
    debugLog.value = "-- no log entries yet --";
    if (debugEntryCount) debugEntryCount.textContent = "0 entries";
    return;
  }
  if (debugEntryCount) {
    debugEntryCount.textContent = `${debugEntries.length} entr${debugEntries.length === 1 ? "y" : "ies"}`;
  }
  debugLog.value = debugEntries.map(({ tag, data, ts }) => {
    const time = new Date(ts).toISOString().slice(11, 23); // HH:mm:ss.mmm
    const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return `[${time}] ${tag}\n${payload}`;
  }).join("\n\n");
  // Auto-scroll to bottom
  debugLog.scrollTop = debugLog.scrollHeight;
}

// Read initial debug flag state
chrome.storage.local.get("KITTEN_DEBUG", (result) => {
  if (debugToggle) debugToggle.checked = result?.KITTEN_DEBUG === true;
});

// Keep toggle in sync if changed elsewhere
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "KITTEN_DEBUG" in changes && debugToggle) {
    debugToggle.checked = changes.KITTEN_DEBUG.newValue === true;
  }
});

// Toggle handler — persist to storage (picked up by all contexts via onChanged)
debugToggle?.addEventListener("change", () => {
  chrome.storage.local.set({ KITTEN_DEBUG: debugToggle.checked });
  if (debugToggle.checked && debugEntries.length === 0) {
    if (debugLog) debugLog.value = "-- debug enabled: trigger a Play to see events --";
  }
});

// Clear button
debugClearBtn?.addEventListener("click", () => {
  debugEntries = [];
  renderDebugLog();
});

// Copy button — copies plain text to clipboard
debugCopyBtn?.addEventListener("click", async () => {
  const text = debugEntries.map(({ tag, data, ts }) => {
    const time = new Date(ts).toISOString().slice(11, 23);
    const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return `[${time}] ${tag}\n${payload}`;
  }).join("\n\n");
  try {
    await navigator.clipboard.writeText(text || "-- empty --");
    if (debugCopyBtn) {
      debugCopyBtn.textContent = "Copied!";
      setTimeout(() => { if (debugCopyBtn) debugCopyBtn.textContent = "Copy"; }, 1500);
    }
  } catch (_) {
    /* clipboard not available */
  }
});

