(() => {
  // src/db.js
  var DB_NAME = "kitten-tts-cache";
  var STORE_NAME = "audio-blobs";
  var DB_VERSION = 1;
  async function generateCacheKey(text, voice, speed, model) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ v: "v1.3.5", text, voice, speed, model }));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const target = (
          /** @type {IDBRequest} */
          e.target
        );
        const db = target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        const target = (
          /** @type {IDBRequest} */
          e.target
        );
        resolve(target.result);
      };
      request.onerror = (e) => {
        const target = (
          /** @type {IDBRequest} */
          e.target
        );
        reject(target.error);
      };
    });
  }
  async function getAudio(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // src/sidepanel.js
  var themeSelect = document.querySelector("#themeSelect");
  var extractArticleBtn = document.querySelector("#extractArticleBtn");
  var voiceSelect = document.querySelector("#voiceSelect");
  var modelSelect = document.querySelector("#modelSelect");
  var speedInput = document.querySelector("#speedInput");
  var speedValue = document.getElementById("speedValue");
  var renderBeforePlayToggle = document.querySelector("#renderBeforePlayToggle");
  var autoplayToggle = document.querySelector("#autoplayToggle");
  var textInput = document.querySelector("#textInput");
  var clearBtn = document.querySelector("#clearBtn");
  var playBtn = document.querySelector("#playBtn");
  var stopBtn = document.querySelector("#stopBtn");
  var downloadBtn = document.querySelector("#downloadBtn");
  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var progressContainer = document.getElementById("progressContainer");
  var progressFill = document.getElementById("progressFill");
  var resetGpuBtn = document.querySelector("#resetGpuBtn");
  var clearAudioCacheBtn = document.querySelector("#clearAudioCacheBtn");
  var charCount = document.getElementById("charCount");
  var gpuWarningBox = document.getElementById("gpuWarningBox");
  var gpuWarningText = document.getElementById("gpuWarningText");
  var openGpuDiagnosticsBtn = (
    /** @type {HTMLButtonElement | null} */
    document.getElementById("openGpuDiagnosticsBtn")
  );
  openGpuDiagnosticsBtn?.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://gpu" });
  });
  function showGpuWarning(customHtml) {
    if (statusDot) statusDot.className = "status-dot error";
    if (statusText) statusText.textContent = "WebGPU unavailable";
    if (gpuWarningBox) gpuWarningBox.style.display = "block";
    if (gpuWarningText && customHtml) {
      gpuWarningText.innerHTML = customHtml;
    }
  }
  function hideGpuWarning() {
    if (gpuWarningBox) gpuWarningBox.style.display = "none";
    if (statusDot && statusDot.className.includes("error")) {
      statusDot.className = "status-dot";
    }
  }
  async function pollGpuAvailability() {
    if (!navigator.gpu) {
      showGpuWarning(
        "WebGPU is not supported by your browser. Please update Chrome to v113+ or check <kbd>chrome://gpu</kbd> for details."
      );
      return false;
    }
    try {
      let adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        try {
          adapter = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true });
        } catch (_) {
        }
      }
      if (!adapter) {
        showGpuWarning(
          'WebGPU is unavailable. Hardware graphics acceleration appears to be disabled. Please enable <strong>"Use graphics acceleration when available"</strong> in Chrome Settings (<kbd>chrome://settings/system</kbd>) and relaunch Chrome.'
        );
        return false;
      }
      hideGpuWarning();
      return true;
    } catch (err) {
      showGpuWarning(
        `WebGPU adapter initialization failed: ${err.message}. Please check <kbd>chrome://gpu</kbd> for details.`
      );
      return false;
    }
  }
  var debugPanel = document.querySelector("#debugPanel");
  var debugToggle = document.querySelector("#debugToggle");
  var debugLog = (
    /** @type {HTMLTextAreaElement | null} */
    document.getElementById("debugLog")
  );
  var debugEntryCount = document.getElementById("debugEntryCount");
  var debugClearBtn = document.querySelector("#debugClearBtn");
  var debugCopyBtn = document.querySelector("#debugCopyBtn");
  var debugEntries = [];
  function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        func.apply(this, args);
      }, timeout);
    };
  }
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
    const target = (
      /** @type {HTMLSelectElement} */
      e.target
    );
    if (!target) return;
    chrome.storage.local.set({ preferredTheme: target.value });
    applyTheme(target.value);
  });
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
      checkCacheStatus();
    }
  );
  voiceSelect?.addEventListener("change", () => {
    chrome.storage.local.set({ preferredVoice: voiceSelect.value });
    checkCacheStatus();
  });
  modelSelect?.addEventListener("change", () => {
    chrome.storage.local.set({ preferredModel: modelSelect.value });
    checkCacheStatus();
  });
  var saveSpeed = debounce((value) => {
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
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  var checkCacheStatus = debounce(async () => {
    const text = (textInput?.value || "").trim();
    const voice = voiceSelect?.value || "Jasper";
    const speed = parseFloat(speedInput?.value || "1.0");
    const model = modelSelect?.value || "nano";
    if (!text) {
      if (playBtn) playBtn.textContent = "\u25B6 Generate Audio";
      return;
    }
    const cacheKey = await generateCacheKey(text, voice, speed, model);
    const cachedBlob = await getAudio(cacheKey);
    if (cachedBlob && playBtn) {
      const duration = await getBlobDuration(cachedBlob);
      playBtn.textContent = `\u25B6 Listen to Audio (${formatDuration(duration)})`;
    } else if (playBtn) {
      playBtn.textContent = "\u25B6 Generate Audio";
    }
  }, 300);
  function updateCharCount() {
    if (charCount && textInput) {
      const len = textInput.value.length;
      if (len === 0) {
        charCount.textContent = "";
      } else {
        const estimatedChunks = Math.max(1, Math.ceil(len / 200));
        charCount.textContent = `${len.toLocaleString()} chars \xB7 ~${estimatedChunks} chunk${estimatedChunks > 1 ? "s" : ""}`;
      }
    }
  }
  var debouncedUpdateCharCount = debounce(updateCharCount, 300);
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
  (async () => {
    const isGpuReady = await pollGpuAvailability();
    await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
    if (isGpuReady) {
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "PREWARM_MODEL",
        model: modelSelect?.value || "nano"
      });
    }
  })();
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
    if (!cachedBlob) {
      const isGpuReady = await pollGpuAvailability();
      if (!isGpuReady) {
        if (statusText) statusText.textContent = "Cannot synthesize: WebGPU unavailable.";
        return;
      }
    }
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
        autoplay,
        debug: debugToggle?.checked || false
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
  extractArticleBtn?.addEventListener("click", async () => {
    try {
      if (statusText)
        statusText.textContent = "Checking page access permissions...";
      const granted = await chrome.permissions.request({
        origins: ["http://*/*", "https://*/*"]
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
            const titleSnippet = response.article.title ? response.article.title.slice(0, 25) + "..." : "Article";
            if (statusText)
              statusText.textContent = `Loaded "${titleSnippet}". Reading...`;
            await startPlayback(response.article.text);
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
  playBtn?.addEventListener("click", () => startPlayback());
  stopBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_AUDIO" });
    resetControls("Stopped.");
  });
  var downloadAnchor = document.createElement("a");
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
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
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
    if (gpuWarningBox && gpuWarningBox.style.display === "block") {
      if (statusDot) statusDot.className = "status-dot error";
    } else {
      if (statusDot) statusDot.className = "status-dot";
    }
    if (statusText) statusText.textContent = statusMsg;
  }
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
          if (msg.status?.includes("WebGPU") || msg.status?.includes("chrome://gpu") || msg.status?.includes("graphics acceleration")) {
            showGpuWarning(
              'WebGPU is unavailable. Please verify <strong>"Use graphics acceleration when available"</strong> is enabled in Chrome Settings (<kbd>chrome://settings/system</kbd>) and relaunch Chrome.'
            );
          }
        } else if (msg.state === "playing") {
          hideGpuWarning();
          if (statusText) statusText.textContent = "Playing audio...";
          if (statusDot) statusDot.className = "status-dot playing";
        } else if (msg.state === "busy") {
          if (statusText) statusText.textContent = msg.status;
        }
      } else if (msg.type === "TTS_AUDIO_READY") {
        if (downloadBtn) downloadBtn.style.display = "block";
        checkCacheStatus();
      } else if (msg.type === "TTS_DEBUG_LOG") {
        if (debugPanel && debugLog) {
          if (!debugPanel.open && debugEntries.length === 0) {
            debugPanel.open = true;
          }
          debugEntries.push({ tag: msg.tag, data: msg.data, ts: msg.ts ?? Date.now() });
          if (debugEntries.length > 200) debugEntries.shift();
          renderDebugLog();
        }
      }
    });
    port.onDisconnect.addListener(() => setTimeout(connectUiPort, 200));
  })();
  resetGpuBtn?.addEventListener("click", async () => {
    if (statusText) statusText.textContent = "Resetting GPU process...";
    if (statusDot) statusDot.className = "status-dot busy";
    await pollGpuAvailability();
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
      const time = new Date(ts).toISOString().slice(11, 23);
      const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return `[${time}] ${tag}
${payload}`;
    }).join("\n\n");
    debugLog.scrollTop = debugLog.scrollHeight;
  }
  chrome.storage.local.get("KITTEN_DEBUG", (result) => {
    if (debugToggle) debugToggle.checked = result?.KITTEN_DEBUG === true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "KITTEN_DEBUG" in changes && debugToggle) {
      debugToggle.checked = changes.KITTEN_DEBUG.newValue === true;
    }
  });
  debugToggle?.addEventListener("change", () => {
    chrome.storage.local.set({ KITTEN_DEBUG: debugToggle.checked });
    chrome.runtime.sendMessage({ target: "offscreen", type: "SET_DEBUG", enabled: debugToggle.checked }).catch(() => {
    });
    if (debugToggle.checked && debugEntries.length === 0) {
      if (debugLog) debugLog.value = "-- debug enabled: trigger a Play to see events --";
    }
  });
  debugClearBtn?.addEventListener("click", () => {
    debugEntries = [];
    renderDebugLog();
  });
  debugCopyBtn?.addEventListener("click", async () => {
    const text = debugEntries.map(({ tag, data, ts }) => {
      const time = new Date(ts).toISOString().slice(11, 23);
      const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return `[${time}] ${tag}
${payload}`;
    }).join("\n\n");
    try {
      await navigator.clipboard.writeText(text || "-- empty --");
      if (debugCopyBtn) {
        debugCopyBtn.textContent = "Copied!";
        setTimeout(() => {
          if (debugCopyBtn) debugCopyBtn.textContent = "Copy";
        }, 1500);
      }
    } catch (_) {
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2RiLmpzIiwgIi4uL3NyYy9zaWRlcGFuZWwuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9kYi5qc1xuXG5jb25zdCBEQl9OQU1FID0gXCJraXR0ZW4tdHRzLWNhY2hlXCI7XG5jb25zdCBTVE9SRV9OQU1FID0gXCJhdWRpby1ibG9ic1wiO1xuY29uc3QgREJfVkVSU0lPTiA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpIHtcbiAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuICBjb25zdCBkYXRhID0gZW5jb2Rlci5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoeyB2OiBcInYxLjMuNVwiLCB0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsIH0pKTtcbiAgY29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBkYXRhKTtcbiAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gIHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKS5qb2luKFwiXCIpO1xufVxuXG5mdW5jdGlvbiBvcGVuREIoKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IGluZGV4ZWREQi5vcGVuKERCX05BTUUsIERCX1ZFUlNJT04pO1xuICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIGNvbnN0IGRiID0gdGFyZ2V0LnJlc3VsdDtcbiAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucyhTVE9SRV9OQU1FKSkge1xuICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIHJlc29sdmUodGFyZ2V0LnJlc3VsdCk7XG4gICAgfTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtJREJSZXF1ZXN0fSAqLyAoZS50YXJnZXQpO1xuICAgICAgcmVqZWN0KHRhcmdldC5lcnJvcik7XG4gICAgfTtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlQXVkaW8oa2V5LCBibG9iKSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWR3cml0ZVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5wdXQoYmxvYiwga2V5KTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUodW5kZWZpbmVkKTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QXVkaW8oa2V5KSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWRvbmx5XCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmdldChrZXkpO1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsZWFyQXVkaW9DYWNoZSgpIHtcbiAgY29uc3QgZGIgPSBhd2FpdCBvcGVuREIoKTtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsIFwicmVhZHdyaXRlXCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmNsZWFyKCk7XG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBnZW5lcmF0ZUNhY2hlS2V5LCBnZXRBdWRpbyB9IGZyb20gJy4vZGIuanMnO1xuXG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHRoZW1lU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiN0aGVtZVNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZXh0cmFjdEFydGljbGVCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2V4dHJhY3RBcnRpY2xlQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB2b2ljZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdm9pY2VTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IG1vZGVsU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNtb2RlbFNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzcGVlZElucHV0XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZFZhbHVlXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHJlbmRlckJlZm9yZVBsYXlUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3JlbmRlckJlZm9yZVBsYXlUb2dnbGVcIik7XG4vKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgYXV0b3BsYXlUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2F1dG9wbGF5VG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHRleHRJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdGV4dElucHV0XCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBjbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjY2xlYXJCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHBsYXlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3BsYXlCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0b3BCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3N0b3BCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRvd25sb2FkQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkb3dubG9hZEJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3RhdHVzRG90ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNEb3RcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0YXR1c1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXR1c1RleHRcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHByb2dyZXNzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0NvbnRhaW5lclwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcHJvZ3Jlc3NGaWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0ZpbGxcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHJlc2V0R3B1QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNyZXNldEdwdUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgY2xlYXJBdWRpb0NhY2hlQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNjbGVhckF1ZGlvQ2FjaGVCdG5cIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGNoYXJDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2hhckNvdW50XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBncHVXYXJuaW5nQm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJncHVXYXJuaW5nQm94XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBncHVXYXJuaW5nVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ3B1V2FybmluZ1RleHRcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IG9wZW5HcHVEaWFnbm9zdGljc0J0biA9IC8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqLyAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJvcGVuR3B1RGlhZ25vc3RpY3NCdG5cIikpO1xuXG5vcGVuR3B1RGlhZ25vc3RpY3NCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogXCJjaHJvbWU6Ly9ncHVcIiB9KTtcbn0pO1xuXG5mdW5jdGlvbiBzaG93R3B1V2FybmluZyhjdXN0b21IdG1sKSB7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgZXJyb3JcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIldlYkdQVSB1bmF2YWlsYWJsZVwiO1xuICBpZiAoZ3B1V2FybmluZ0JveCkgZ3B1V2FybmluZ0JveC5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICBpZiAoZ3B1V2FybmluZ1RleHQgJiYgY3VzdG9tSHRtbCkge1xuICAgIGdwdVdhcm5pbmdUZXh0LmlubmVySFRNTCA9IGN1c3RvbUh0bWw7XG4gIH1cbn1cblxuZnVuY3Rpb24gaGlkZUdwdVdhcm5pbmcoKSB7XG4gIGlmIChncHVXYXJuaW5nQm94KSBncHVXYXJuaW5nQm94LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKHN0YXR1c0RvdCAmJiBzdGF0dXNEb3QuY2xhc3NOYW1lLmluY2x1ZGVzKFwiZXJyb3JcIikpIHtcbiAgICBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbn1cblxuLyoqXG4gKiBJbml0aWFsIHBvbGwgZm9yIFdlYkdQVSBhdmFpbGFiaWxpdHkgb24gc2lkZXBhbmVsIGxhdW5jaC5cbiAqIERldGVjdHMgd2hldGhlciBoYXJkd2FyZSBncmFwaGljcyBhY2NlbGVyYXRpb24gaXMgZW5hYmxlZCBvciBkaXNhYmxlZC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcG9sbEdwdUF2YWlsYWJpbGl0eSgpIHtcbiAgaWYgKCFuYXZpZ2F0b3IuZ3B1KSB7XG4gICAgc2hvd0dwdVdhcm5pbmcoXG4gICAgICAnV2ViR1BVIGlzIG5vdCBzdXBwb3J0ZWQgYnkgeW91ciBicm93c2VyLiBQbGVhc2UgdXBkYXRlIENocm9tZSB0byB2MTEzKyBvciBjaGVjayA8a2JkPmNocm9tZTovL2dwdTwva2JkPiBmb3IgZGV0YWlscy4nXG4gICAgKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICB0cnkge1xuICAgIGxldCBhZGFwdGVyID0gYXdhaXQgbmF2aWdhdG9yLmdwdS5yZXF1ZXN0QWRhcHRlcigpO1xuICAgIGlmICghYWRhcHRlcikge1xuICAgICAgLy8gSGFyZHdhcmUgR1BVIG5vdCByZXR1cm5lZCAtPiBhdHRlbXB0IGZhbGxiYWNrIGFkYXB0ZXIgY2hlY2tcbiAgICAgIHRyeSB7XG4gICAgICAgIGFkYXB0ZXIgPSBhd2FpdCBuYXZpZ2F0b3IuZ3B1LnJlcXVlc3RBZGFwdGVyKHsgZm9yY2VGYWxsYmFja0FkYXB0ZXI6IHRydWUgfSk7XG4gICAgICB9IGNhdGNoIChfKSB7fVxuICAgIH1cblxuICAgIGlmICghYWRhcHRlcikge1xuICAgICAgc2hvd0dwdVdhcm5pbmcoXG4gICAgICAgICdXZWJHUFUgaXMgdW5hdmFpbGFibGUuIEhhcmR3YXJlIGdyYXBoaWNzIGFjY2VsZXJhdGlvbiBhcHBlYXJzIHRvIGJlIGRpc2FibGVkLiBQbGVhc2UgZW5hYmxlIDxzdHJvbmc+XCJVc2UgZ3JhcGhpY3MgYWNjZWxlcmF0aW9uIHdoZW4gYXZhaWxhYmxlXCI8L3N0cm9uZz4gaW4gQ2hyb21lIFNldHRpbmdzICg8a2JkPmNocm9tZTovL3NldHRpbmdzL3N5c3RlbTwva2JkPikgYW5kIHJlbGF1bmNoIENocm9tZS4nXG4gICAgICApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGhpZGVHcHVXYXJuaW5nKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHNob3dHcHVXYXJuaW5nKFxuICAgICAgYFdlYkdQVSBhZGFwdGVyIGluaXRpYWxpemF0aW9uIGZhaWxlZDogJHtlcnIubWVzc2FnZX0uIFBsZWFzZSBjaGVjayA8a2JkPmNocm9tZTovL2dwdTwva2JkPiBmb3IgZGV0YWlscy5gXG4gICAgKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLy8gRGVidWcgcGFuZWwgRE9NIHJlZnMgKHBvcHVsYXRlZCBpbiBzZWN0aW9uIDEwKVxuLyoqIEB0eXBlIHtIVE1MRGV0YWlsc0VsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdQYW5lbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdQYW5lbFwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z1RvZ2dsZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdUb2dnbGVcIik7XG4vKiogQHR5cGUge0hUTUxUZXh0QXJlYUVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdMb2cgPSAvKiogQHR5cGUge0hUTUxUZXh0QXJlYUVsZW1lbnQgfCBudWxsfSAqLyAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z0xvZ1wiKSk7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnRW50cnlDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdFbnRyeUNvdW50XCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0NsZWFyQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z0NsZWFyQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0NvcHlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2RlYnVnQ29weUJ0blwiKTtcbi8qKiBAdHlwZSB7QXJyYXk8eyB0YWc6IHN0cmluZywgZGF0YTogdW5rbm93biwgdHM6IG51bWJlciB9Pn0gKi9cbmxldCBkZWJ1Z0VudHJpZXMgPSBbXTtcblxuLy8gVXRpbGl0eSBmb3IgZGVib3VuY2luZ1xuZnVuY3Rpb24gZGVib3VuY2UoZnVuYywgdGltZW91dCA9IDMwMCkge1xuICBsZXQgdGltZXI7XG4gIHJldHVybiAoLi4uYXJncykgPT4ge1xuICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgZnVuYy5hcHBseSh0aGlzLCBhcmdzKTsgfSwgdGltZW91dCk7XG4gIH07XG59XG5cbi8vIDEuIFRoZW1lIE1hbmFnZW1lbnRcbmZ1bmN0aW9uIGFwcGx5VGhlbWUodGhlbWUpIHtcbiAgaWYgKHRoZW1lID09PSBcImF1dG9cIikge1xuICAgIGNvbnN0IGlzRGFyayA9IHdpbmRvdy5tYXRjaE1lZGlhKFwiKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKVwiKS5tYXRjaGVzO1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXG4gICAgICBcImRhdGEtdGhlbWVcIixcbiAgICAgIGlzRGFyayA/IFwiZGFya1wiIDogXCJsaWdodFwiLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZShcImRhdGEtdGhlbWVcIiwgdGhlbWUpO1xuICB9XG59XG5cbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcnJlZFRoZW1lXCIsIChkYXRhKSA9PiB7XG4gIGNvbnN0IHNhdmVkID0gZGF0YS5wcmVmZXJyZWRUaGVtZSB8fCBcImF1dG9cIjtcbiAgaWYgKHRoZW1lU2VsZWN0KSB0aGVtZVNlbGVjdC52YWx1ZSA9IHNhdmVkO1xuICBhcHBseVRoZW1lKHNhdmVkKTtcbn0pO1xuXG50aGVtZVNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoZSkgPT4ge1xuICBjb25zdCB0YXJnZXQgPSAvKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50fSAqLyAoZS50YXJnZXQpO1xuICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRUaGVtZTogdGFyZ2V0LnZhbHVlIH0pO1xuICBhcHBseVRoZW1lKHRhcmdldC52YWx1ZSk7XG59KTtcblxuLy8gMi4gTG9hZCBTYXZlZCBQcmVmZXJlbmNlcyAodm9pY2UsIG1vZGVsLCBzcGVlZCwgcmVuZGVyQmVmb3JlUGxheSwgYXV0b3BsYXkpXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXG4gIHsgcHJlZmVycmVkVm9pY2U6IFwiSmFzcGVyXCIsIHByZWZlcnJlZE1vZGVsOiBcIm5hbm9cIiwgcHJlZmVycmVkU3BlZWQ6IFwiMS4wXCIsIHJlbmRlckJlZm9yZVBsYXk6IGZhbHNlLCBhdXRvcGxheTogdHJ1ZSB9LFxuICAoaXRlbXMpID0+IHtcbiAgICBpZiAodm9pY2VTZWxlY3QpIHZvaWNlU2VsZWN0LnZhbHVlID0gaXRlbXMucHJlZmVycmVkVm9pY2U7XG4gICAgaWYgKG1vZGVsU2VsZWN0KSBtb2RlbFNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZE1vZGVsO1xuICAgIGlmIChzcGVlZElucHV0KSB7XG4gICAgICBzcGVlZElucHV0LnZhbHVlID0gaXRlbXMucHJlZmVycmVkU3BlZWQ7XG4gICAgICBpZiAoc3BlZWRWYWx1ZSkgc3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke2l0ZW1zLnByZWZlcnJlZFNwZWVkfXhgO1xuICAgIH1cbiAgICBpZiAocmVuZGVyQmVmb3JlUGxheVRvZ2dsZSkge1xuICAgICAgcmVuZGVyQmVmb3JlUGxheVRvZ2dsZS5jaGVja2VkID0gaXRlbXMucmVuZGVyQmVmb3JlUGxheTtcbiAgICB9XG4gICAgaWYgKGF1dG9wbGF5VG9nZ2xlKSB7XG4gICAgICBhdXRvcGxheVRvZ2dsZS5jaGVja2VkID0gaXRlbXMuYXV0b3BsYXk7XG4gICAgICBhdXRvcGxheVRvZ2dsZS5kaXNhYmxlZCA9ICFpdGVtcy5yZW5kZXJCZWZvcmVQbGF5O1xuICAgIH1cbiAgICBjaGVja0NhY2hlU3RhdHVzKCk7IC8vIEluaXRpYWwgY2hlY2tcbiAgfSxcbik7XG5cbi8vIDMuIFNhdmUgUHJlZmVyZW5jZXMgb24gQ2hhbmdlXG52b2ljZVNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFZvaWNlOiB2b2ljZVNlbGVjdC52YWx1ZSB9KTtcbiAgY2hlY2tDYWNoZVN0YXR1cygpO1xufSk7XG5cbm1vZGVsU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkTW9kZWw6IG1vZGVsU2VsZWN0LnZhbHVlIH0pO1xuICBjaGVja0NhY2hlU3RhdHVzKCk7XG59KTtcblxuY29uc3Qgc2F2ZVNwZWVkID0gZGVib3VuY2UoKHZhbHVlKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFNwZWVkOiB2YWx1ZSB9KTtcbn0sIDUwMCk7XG5cbnNwZWVkSW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7XG4gIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7c3BlZWRJbnB1dC52YWx1ZX14YDtcbiAgc2F2ZVNwZWVkKHNwZWVkSW5wdXQudmFsdWUpO1xuICBjaGVja0NhY2hlU3RhdHVzKCk7XG59KTtcblxucmVuZGVyQmVmb3JlUGxheVRvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGlmIChyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcmVuZGVyQmVmb3JlUGxheTogcmVuZGVyQmVmb3JlUGxheVRvZ2dsZS5jaGVja2VkIH0pO1xuICAgIGlmIChhdXRvcGxheVRvZ2dsZSkge1xuICAgICAgYXV0b3BsYXlUb2dnbGUuZGlzYWJsZWQgPSAhcmVuZGVyQmVmb3JlUGxheVRvZ2dsZS5jaGVja2VkO1xuICAgIH1cbiAgfVxufSk7XG5cbmF1dG9wbGF5VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgaWYgKGF1dG9wbGF5VG9nZ2xlKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgYXV0b3BsYXk6IGF1dG9wbGF5VG9nZ2xlLmNoZWNrZWQgfSk7XG4gIH1cbn0pO1xuXG4vLyBIZWxwZXJzIGZvciBjYWNoZSBjaGVja2luZ1xuYXN5bmMgZnVuY3Rpb24gZ2V0QmxvYkR1cmF0aW9uKGJsb2IpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcbiAgICBhdWRpby5zcmMgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgIGF1ZGlvLm9ubG9hZGVkbWV0YWRhdGEgPSAoKSA9PiB7XG4gICAgICByZXNvbHZlKGF1ZGlvLmR1cmF0aW9uKTtcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYXVkaW8uc3JjKTtcbiAgICB9O1xuICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XG4gICAgICByZXNvbHZlKDApO1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChhdWRpby5zcmMpO1xuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBmb3JtYXREdXJhdGlvbihzZWNvbmRzKSB7XG4gIGlmICghc2Vjb25kcyB8fCAhaXNGaW5pdGUoc2Vjb25kcykpIHJldHVybiBcIjA6MDBcIjtcbiAgY29uc3QgbSA9IE1hdGguZmxvb3Ioc2Vjb25kcyAvIDYwKTtcbiAgY29uc3QgcyA9IE1hdGguZmxvb3Ioc2Vjb25kcyAlIDYwKTtcbiAgcmV0dXJuIGAke219OiR7cy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9YDtcbn1cblxuY29uc3QgY2hlY2tDYWNoZVN0YXR1cyA9IGRlYm91bmNlKGFzeW5jICgpID0+IHtcbiAgY29uc3QgdGV4dCA9ICh0ZXh0SW5wdXQ/LnZhbHVlIHx8IFwiXCIpLnRyaW0oKTtcbiAgY29uc3Qgdm9pY2UgPSB2b2ljZVNlbGVjdD8udmFsdWUgfHwgXCJKYXNwZXJcIjtcbiAgY29uc3Qgc3BlZWQgPSBwYXJzZUZsb2F0KHNwZWVkSW5wdXQ/LnZhbHVlIHx8IFwiMS4wXCIpO1xuICBjb25zdCBtb2RlbCA9IG1vZGVsU2VsZWN0Py52YWx1ZSB8fCBcIm5hbm9cIjtcblxuICBpZiAoIXRleHQpIHtcbiAgICBpZiAocGxheUJ0bikgcGxheUJ0bi50ZXh0Q29udGVudCA9IFwiXHUyNUI2IEdlbmVyYXRlIEF1ZGlvXCI7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgY2FjaGVLZXkgPSBhd2FpdCBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpO1xuICBjb25zdCBjYWNoZWRCbG9iID0gYXdhaXQgZ2V0QXVkaW8oY2FjaGVLZXkpO1xuXG4gIGlmIChjYWNoZWRCbG9iICYmIHBsYXlCdG4pIHtcbiAgICBjb25zdCBkdXJhdGlvbiA9IGF3YWl0IGdldEJsb2JEdXJhdGlvbihjYWNoZWRCbG9iKTtcbiAgICBwbGF5QnRuLnRleHRDb250ZW50ID0gYFx1MjVCNiBMaXN0ZW4gdG8gQXVkaW8gKCR7Zm9ybWF0RHVyYXRpb24oZHVyYXRpb24pfSlgO1xuICB9IGVsc2UgaWYgKHBsYXlCdG4pIHtcbiAgICBwbGF5QnRuLnRleHRDb250ZW50ID0gXCJcdTI1QjYgR2VuZXJhdGUgQXVkaW9cIjtcbiAgfVxufSwgMzAwKTtcblxuLy8gNC4gQ2hhcmFjdGVyIENvdW50ICYgQ2xlYXIgSW5wdXRcbmZ1bmN0aW9uIHVwZGF0ZUNoYXJDb3VudCgpIHtcbiAgaWYgKGNoYXJDb3VudCAmJiB0ZXh0SW5wdXQpIHtcbiAgICBjb25zdCBsZW4gPSB0ZXh0SW5wdXQudmFsdWUubGVuZ3RoO1xuICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJvdWdoIGVzdGltYXRlOiB+MjAwIGNoYXJzIHBlciBjaHVua1xuICAgICAgY29uc3QgZXN0aW1hdGVkQ2h1bmtzID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGxlbiAvIDIwMCkpO1xuICAgICAgY2hhckNvdW50LnRleHRDb250ZW50ID0gYCR7bGVuLnRvTG9jYWxlU3RyaW5nKCl9IGNoYXJzIFx1MDBCNyB+JHtlc3RpbWF0ZWRDaHVua3N9IGNodW5rJHtlc3RpbWF0ZWRDaHVua3MgPiAxID8gXCJzXCIgOiBcIlwifWA7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGRlYm91bmNlZFVwZGF0ZUNoYXJDb3VudCA9IGRlYm91bmNlKHVwZGF0ZUNoYXJDb3VudCwgMzAwKTtcbnRleHRJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgZGVib3VuY2VkVXBkYXRlQ2hhckNvdW50KCk7XG4gIGNoZWNrQ2FjaGVTdGF0dXMoKTtcbn0pO1xuXG5jbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IFwiXCI7XG4gICAgdGV4dElucHV0LmZvY3VzKCk7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gIH1cbn0pO1xuXG4vLyA1LiBJbml0aWFsIEdQVSBQb2xsICYgU2lsZW50IFByZS1XYXJtIG9uIFBhbmVsIExvYWRcbihhc3luYyAoKSA9PiB7XG4gIGNvbnN0IGlzR3B1UmVhZHkgPSBhd2FpdCBwb2xsR3B1QXZhaWxhYmlsaXR5KCk7XG4gIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJFTlNVUkVfT0ZGU0NSRUVOXCIgfSk7XG4gIGlmIChpc0dwdVJlYWR5KSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgICAgdHlwZTogXCJQUkVXQVJNX01PREVMXCIsXG4gICAgICBtb2RlbDogbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiLFxuICAgIH0pO1xuICB9XG59KSgpO1xuXG4vLyBIZWxwZXIgdG8gc3RhcnQgcGxheWJhY2tcbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0UGxheWJhY2sodGV4dFRvUGxheSkge1xuICBjb25zdCB0ZXh0ID0gKHRleHRUb1BsYXkgfHwgdGV4dElucHV0Py52YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHZvaWNlID0gdm9pY2VTZWxlY3Q/LnZhbHVlIHx8IFwiSmFzcGVyXCI7XG4gIGNvbnN0IHNwZWVkID0gcGFyc2VGbG9hdChzcGVlZElucHV0Py52YWx1ZSB8fCBcIjEuMFwiKTtcbiAgY29uc3QgbW9kZWwgPSBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCI7XG4gIGNvbnN0IHJlbmRlckJlZm9yZVBsYXkgPSByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlPy5jaGVja2VkIHx8IGZhbHNlO1xuICBjb25zdCBhdXRvcGxheSA9IGF1dG9wbGF5VG9nZ2xlPy5jaGVja2VkID8/IHRydWU7XG5cbiAgaWYgKCF0ZXh0KSB7XG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGVhc2UgZW50ZXIgdGV4dCBvciBleHRyYWN0IGFuIGFydGljbGUuXCI7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgXG4gIGNvbnN0IGNhY2hlS2V5ID0gYXdhaXQgZ2VuZXJhdGVDYWNoZUtleSh0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsKTtcbiAgY29uc3QgY2FjaGVkQmxvYiA9IGF3YWl0IGdldEF1ZGlvKGNhY2hlS2V5KTtcblxuICBpZiAoIWNhY2hlZEJsb2IpIHtcbiAgICBjb25zdCBpc0dwdVJlYWR5ID0gYXdhaXQgcG9sbEdwdUF2YWlsYWJpbGl0eSgpO1xuICAgIGlmICghaXNHcHVSZWFkeSkge1xuICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNhbm5vdCBzeW50aGVzaXplOiBXZWJHUFUgdW5hdmFpbGFibGUuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG5cbiAgaWYgKGNhY2hlZEJsb2IpIHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgICB0eXBlOiBcIlBMQVlfQ0FDSEVEXCIsXG4gICAgICBjYWNoZUtleVxuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICAgIHR5cGU6IFwiUExBWV9URVhUXCIsXG4gICAgICB0ZXh0LFxuICAgICAgdm9pY2UsXG4gICAgICBzcGVlZCxcbiAgICAgIG1vZGVsLFxuICAgICAgY2FjaGVLZXksXG4gICAgICByZW5kZXJCZWZvcmVQbGF5LFxuICAgICAgYXV0b3BsYXksXG4gICAgICBkZWJ1ZzogZGVidWdUb2dnbGU/LmNoZWNrZWQgfHwgZmFsc2VcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgaWYgKGRvd25sb2FkQnRuKSBkb3dubG9hZEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHtcbiAgICBpZiAoY2FjaGVkQmxvYikge1xuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxheWluZyBjYWNoZWQgYXVkaW8uLi5cIjtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGF1dG9wbGF5ID8gXCJTeW50aGVzaXppbmcgYW5kIHBsYXlpbmcuLi5cIiA6IFwiR2VuZXJhdGluZyBhdWRpbyB0byBjYWNoZS4uLlwiO1xuICAgIH1cbiAgfVxufVxuXG4vLyA2LiBTY2FuICYgQXV0by1QbGF5IEFydGljbGUgQWN0aW9uXG5leHRyYWN0QXJ0aWNsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNoZWNraW5nIHBhZ2UgYWNjZXNzIHBlcm1pc3Npb25zLi4uXCI7XG5cbiAgICBjb25zdCBncmFudGVkID0gYXdhaXQgY2hyb21lLnBlcm1pc3Npb25zLnJlcXVlc3Qoe1xuICAgICAgb3JpZ2luczogW1wiaHR0cDovLyovKlwiLCBcImh0dHBzOi8vKi8qXCJdLFxuICAgIH0pO1xuXG4gICAgaWYgKCFncmFudGVkKSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGVybWlzc2lvbiBkZW5pZWQuIENhbm5vdCBzY2FuIHBhZ2UuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJTY2FubmluZyBhY3RpdmUgdGFiIGZvciBhcnRpY2xlLi4uXCI7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG5cbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShcbiAgICAgIHsgdHlwZTogXCJFWFRSQUNUX0NVUlJFTlRfVEFCX0FSVElDTEVcIiB9LFxuICAgICAgYXN5bmMgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChyZXNwb25zZT8uZXJyb3IpIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtyZXNwb25zZS5lcnJvcn1gO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzcG9uc2U/LmFydGljbGU/LnRleHQpIHtcbiAgICAgICAgICBpZiAodGV4dElucHV0KSB0ZXh0SW5wdXQudmFsdWUgPSByZXNwb25zZS5hcnRpY2xlLnRleHQ7XG4gICAgICAgICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgICAgICAgY29uc3QgdGl0bGVTbmlwcGV0ID1cbiAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUgP1xuICAgICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlLnNsaWNlKDAsIDI1KSArIFwiLi4uXCJcbiAgICAgICAgICAgIDogXCJBcnRpY2xlXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYExvYWRlZCBcIiR7dGl0bGVTbmlwcGV0fVwiLiBSZWFkaW5nLi4uYDtcblxuICAgICAgICAgIC8vIEF1dG8tcGxheSBpbW1lZGlhdGVseVxuICAgICAgICAgIGF3YWl0IHN0YXJ0UGxheWJhY2socmVzcG9uc2UuYXJ0aWNsZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPVxuICAgICAgICAgICAgICBcIkNvdWxkIG5vdCBmaW5kIGEgc3RydWN0dXJlZCBhcnRpY2xlIG9uIHRoaXMgcGFnZS5cIjtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkV4dHJhY3Rpb24gZXJyb3I6XCIsIGVycik7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbn0pO1xuXG4vLyBTdG9yYWdlIExpc3RlbmVyc1xuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwidHRzVGV4dFwiLCAoZGF0YSkgPT4ge1xuICBpZiAoZGF0YS50dHNUZXh0ICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudHRzVGV4dDtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgY2hhbmdlcy50dHNUZXh0Py5uZXdWYWx1ZSAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBjaGFuZ2VzLnR0c1RleHQubmV3VmFsdWU7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbi8vIDcuIFBsYXkgJiBTdG9wIExpc3RlbmVyc1xucGxheUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHN0YXJ0UGxheWJhY2soKSk7XG5cbnN0b3BCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNUT1BfQVVESU9cIiB9KTtcbiAgcmVzZXRDb250cm9scyhcIlN0b3BwZWQuXCIpO1xufSk7XG5cbmNvbnN0IGRvd25sb2FkQW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG5kb3dubG9hZEFuY2hvci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRvd25sb2FkQW5jaG9yKTtcblxuZG93bmxvYWRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSAodGV4dElucHV0Py52YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHZvaWNlID0gdm9pY2VTZWxlY3Q/LnZhbHVlIHx8IFwiSmFzcGVyXCI7XG4gIGNvbnN0IHNwZWVkID0gcGFyc2VGbG9hdChzcGVlZElucHV0Py52YWx1ZSB8fCBcIjEuMFwiKTtcbiAgY29uc3QgbW9kZWwgPSBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCI7XG5cbiAgaWYgKCF0ZXh0KSByZXR1cm47XG5cbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUHJlcGFyaW5nIGRvd25sb2FkLi4uXCI7XG4gICAgY29uc3QgY2FjaGVLZXkgPSBhd2FpdCBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpO1xuICAgIGNvbnN0IGJsb2IgPSBhd2FpdCBnZXRBdWRpbyhjYWNoZUtleSk7XG5cbiAgICBpZiAoYmxvYikge1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmhyZWYgPSB1cmw7XG4gICAgICBkb3dubG9hZEFuY2hvci5kb3dubG9hZCA9IFwia2l0dGVuLXR0cy1hdWRpby53YXZcIjtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmNsaWNrKCk7XG4gICAgICBcbiAgICAgIC8vIENsZWFuIHVwIHRoZSBvYmplY3QgVVJMIGFmdGVyIGEgc2hvcnQgZGVsYXlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAxMDAwKTtcbiAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJEb3dubG9hZCBzdGFydGVkLlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiRXJyb3I6IEF1ZGlvIG5vdCBmb3VuZCBpbiBjYWNoZS5cIjtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYERvd25sb2FkIEVycm9yOiAke2Vyci5tZXNzYWdlfWA7XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiByZXNldENvbnRyb2xzKHN0YXR1c01zZykge1xuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChncHVXYXJuaW5nQm94ICYmIGdwdVdhcm5pbmdCb3guc3R5bGUuZGlzcGxheSA9PT0gXCJibG9ja1wiKSB7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBlcnJvclwiO1xuICB9IGVsc2Uge1xuICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgfVxuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IHN0YXR1c01zZztcbn1cblxuLy8gOC4gUHJvZ3Jlc3MgTGlzdGVuZXIgXHUyMDE0IGNvbm5lY3RlZCB2aWEgUG9ydCBmb3IgemVyby1vdmVyaGVhZCByZWxheSBmcm9tIGJhY2tncm91bmRcbihmdW5jdGlvbiBjb25uZWN0VWlQb3J0KCkge1xuICBjb25zdCBwb3J0ID0gY2hyb21lLnJ1bnRpbWUuY29ubmVjdCh7IG5hbWU6IFwidHRzLXVpXCIgfSk7XG4gIHBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKChtc2cpID0+IHtcbiAgICBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1BST0dSRVNTXCIpIHtcbiAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICAgICAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gYCR7bXNnLnBlcmNlbnR9JWA7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYFN5bnRoZXNpemluZyBhdWRpby4uLiAke21zZy5wZXJjZW50fSVgO1xuICAgICAgfSk7XG4gICAgICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1NUQVRVU1wiKSB7XG4gICAgICBpZiAobXNnLnN0YXRlID09PSBcImlkbGVcIikge1xuICAgICAgICByZXNldENvbnRyb2xzKG1zZy5zdGF0dXMgfHwgXCJGaW5pc2hlZCBwbGF5aW5nLlwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcInN0b3BwZWRcIikge1xuICAgICAgICByZXNldENvbnRyb2xzKG1zZy5zdGF0dXMgfHwgXCJTdG9wcGVkLlwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImVycm9yXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiRXJyb3Igb2NjdXJyZWRcIik7XG4gICAgICAgIGlmIChtc2cuc3RhdHVzPy5pbmNsdWRlcyhcIldlYkdQVVwiKSB8fCBtc2cuc3RhdHVzPy5pbmNsdWRlcyhcImNocm9tZTovL2dwdVwiKSB8fCBtc2cuc3RhdHVzPy5pbmNsdWRlcyhcImdyYXBoaWNzIGFjY2VsZXJhdGlvblwiKSkge1xuICAgICAgICAgIHNob3dHcHVXYXJuaW5nKFxuICAgICAgICAgICAgJ1dlYkdQVSBpcyB1bmF2YWlsYWJsZS4gUGxlYXNlIHZlcmlmeSA8c3Ryb25nPlwiVXNlIGdyYXBoaWNzIGFjY2VsZXJhdGlvbiB3aGVuIGF2YWlsYWJsZVwiPC9zdHJvbmc+IGlzIGVuYWJsZWQgaW4gQ2hyb21lIFNldHRpbmdzICg8a2JkPmNocm9tZTovL3NldHRpbmdzL3N5c3RlbTwva2JkPikgYW5kIHJlbGF1bmNoIENocm9tZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwicGxheWluZ1wiKSB7XG4gICAgICAgIGhpZGVHcHVXYXJuaW5nKCk7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGF5aW5nIGF1ZGlvLi4uXCI7XG4gICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgcGxheWluZ1wiO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwiYnVzeVwiKSB7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gbXNnLnN0YXR1cztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19BVURJT19SRUFEWVwiKSB7XG4gICAgICBpZiAoZG93bmxvYWRCdG4pIGRvd25sb2FkQnRuLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBjaGVja0NhY2hlU3RhdHVzKCk7XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfREVCVUdfTE9HXCIpIHtcbiAgICAgIC8vIEFwcGVuZCB0byBpbi1wYW5lbCBkZWJ1ZyBsb2cgaWYgdGhlIHBhbmVsIGV4aXN0c1xuICAgICAgaWYgKGRlYnVnUGFuZWwgJiYgZGVidWdMb2cpIHtcbiAgICAgICAgLy8gQXV0by1vcGVuIHRoZSBwYW5lbCBvbiBmaXJzdCBldmVudCByZWNlaXZlZFxuICAgICAgICBpZiAoIWRlYnVnUGFuZWwub3BlbiAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgZGVidWdQYW5lbC5vcGVuID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBkZWJ1Z0VudHJpZXMucHVzaCh7IHRhZzogbXNnLnRhZywgZGF0YTogbXNnLmRhdGEsIHRzOiBtc2cudHMgPz8gRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgLy8gS2VlcCBidWZmZXIgYm91bmRlZCB0byAyMDAgZW50cmllc1xuICAgICAgICBpZiAoZGVidWdFbnRyaWVzLmxlbmd0aCA+IDIwMCkgZGVidWdFbnRyaWVzLnNoaWZ0KCk7XG4gICAgICAgIHJlbmRlckRlYnVnTG9nKCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgLy8gUmVjb25uZWN0IGlmIHRoZSBzZXJ2aWNlIHdvcmtlciByZXN0YXJ0cyBhbmQgZHJvcHMgdGhlIHBvcnRcbiAgcG9ydC5vbkRpc2Nvbm5lY3QuYWRkTGlzdGVuZXIoKCkgPT4gc2V0VGltZW91dChjb25uZWN0VWlQb3J0LCAyMDApKTtcbn0pKCk7XG5cblxuLy8gOS4gUmVzZXQgRW5naW5lIEFjdGlvblxucmVzZXRHcHVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJSZXNldHRpbmcgR1BVIHByb2Nlc3MuLi5cIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGF3YWl0IHBvbGxHcHVBdmFpbGFiaWxpdHkoKTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIlJFU0VUX0dQVV9PRkZTQ1JFRU5cIiB9LCAocmVzKSA9PiB7XG4gICAgcmVzZXRDb250cm9scyhyZXM/Lm1lc3NhZ2UgfHwgXCJFbmdpbmUgcmVzZXQuXCIpO1xuICB9KTtcbn0pO1xuXG5jbGVhckF1ZGlvQ2FjaGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJDbGVhcmluZyBhdWRpbyBjYWNoZS4uLlwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkNMRUFSX0FVRElPX0NBQ0hFXCIgfSwgKHJlcykgPT4ge1xuICAgIHJlc2V0Q29udHJvbHMocmVzPy5tZXNzYWdlIHx8IFwiQXVkaW8gY2FjaGUgY2xlYXJlZC5cIik7XG4gIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCAxMC4gRGVidWcgUGFuZWwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblxuLyoqIFJlbmRlciBhbGwgZGVidWcgZW50cmllcyBpbnRvIHRoZSBsb2cgcHJlIGVsZW1lbnQgKi9cbmZ1bmN0aW9uIHJlbmRlckRlYnVnTG9nKCkge1xuICBpZiAoIWRlYnVnTG9nKSByZXR1cm47XG4gIGlmIChkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgZGVidWdMb2cudmFsdWUgPSBcIi0tIG5vIGxvZyBlbnRyaWVzIHlldCAtLVwiO1xuICAgIGlmIChkZWJ1Z0VudHJ5Q291bnQpIGRlYnVnRW50cnlDb3VudC50ZXh0Q29udGVudCA9IFwiMCBlbnRyaWVzXCI7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChkZWJ1Z0VudHJ5Q291bnQpIHtcbiAgICBkZWJ1Z0VudHJ5Q291bnQudGV4dENvbnRlbnQgPSBgJHtkZWJ1Z0VudHJpZXMubGVuZ3RofSBlbnRyJHtkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAxID8gXCJ5XCIgOiBcImllc1wifWA7XG4gIH1cbiAgZGVidWdMb2cudmFsdWUgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpOyAvLyBISDptbTpzcy5tbW1cbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIC8vIEF1dG8tc2Nyb2xsIHRvIGJvdHRvbVxuICBkZWJ1Z0xvZy5zY3JvbGxUb3AgPSBkZWJ1Z0xvZy5zY3JvbGxIZWlnaHQ7XG59XG5cbi8vIFJlYWQgaW5pdGlhbCBkZWJ1ZyBmbGFnIHN0YXRlXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJLSVRURU5fREVCVUdcIiwgKHJlc3VsdCkgPT4ge1xuICBpZiAoZGVidWdUb2dnbGUpIGRlYnVnVG9nZ2xlLmNoZWNrZWQgPSByZXN1bHQ/LktJVFRFTl9ERUJVRyA9PT0gdHJ1ZTtcbn0pO1xuXG4vLyBLZWVwIHRvZ2dsZSBpbiBzeW5jIGlmIGNoYW5nZWQgZWxzZXdoZXJlXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgaWYgKGFyZWEgPT09IFwibG9jYWxcIiAmJiBcIktJVFRFTl9ERUJVR1wiIGluIGNoYW5nZXMgJiYgZGVidWdUb2dnbGUpIHtcbiAgICBkZWJ1Z1RvZ2dsZS5jaGVja2VkID0gY2hhbmdlcy5LSVRURU5fREVCVUcubmV3VmFsdWUgPT09IHRydWU7XG4gIH1cbn0pO1xuXG4vLyBUb2dnbGUgaGFuZGxlciBcdTIwMTQgcGVyc2lzdCB0byBzdG9yYWdlIChwaWNrZWQgdXAgYnkgYWxsIGNvbnRleHRzIHZpYSBvbkNoYW5nZWQpXG5kZWJ1Z1RvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IEtJVFRFTl9ERUJVRzogZGVidWdUb2dnbGUuY2hlY2tlZCB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsIHR5cGU6IFwiU0VUX0RFQlVHXCIsIGVuYWJsZWQ6IGRlYnVnVG9nZ2xlLmNoZWNrZWQgfSkuY2F0Y2goKCkgPT4ge30pO1xuICBpZiAoZGVidWdUb2dnbGUuY2hlY2tlZCAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGRlYnVnTG9nKSBkZWJ1Z0xvZy52YWx1ZSA9IFwiLS0gZGVidWcgZW5hYmxlZDogdHJpZ2dlciBhIFBsYXkgdG8gc2VlIGV2ZW50cyAtLVwiO1xuICB9XG59KTtcblxuLy8gQ2xlYXIgYnV0dG9uXG5kZWJ1Z0NsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBkZWJ1Z0VudHJpZXMgPSBbXTtcbiAgcmVuZGVyRGVidWdMb2coKTtcbn0pO1xuXG4vLyBDb3B5IGJ1dHRvbiBcdTIwMTQgY29waWVzIHBsYWluIHRleHQgdG8gY2xpcGJvYXJkXG5kZWJ1Z0NvcHlCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpO1xuICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICByZXR1cm4gYFske3RpbWV9XSAke3RhZ31cXG4ke3BheWxvYWR9YDtcbiAgfSkuam9pbihcIlxcblxcblwiKTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0IHx8IFwiLS0gZW1wdHkgLS1cIik7XG4gICAgaWYgKGRlYnVnQ29weUJ0bikge1xuICAgICAgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3BpZWQhXCI7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKGRlYnVnQ29weUJ0bikgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3B5XCI7IH0sIDE1MDApO1xuICAgIH1cbiAgfSBjYXRjaCAoXykge1xuICAgIC8qIGNsaXBib2FyZCBub3QgYXZhaWxhYmxlICovXG4gIH1cbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUVBLE1BQU0sVUFBVTtBQUNoQixNQUFNLGFBQWE7QUFDbkIsTUFBTSxhQUFhO0FBRW5CLGlCQUFzQixpQkFBaUIsTUFBTSxPQUFPLE9BQU8sT0FBTztBQUNoRSxVQUFNLFVBQVUsSUFBSSxZQUFZO0FBQ2hDLFVBQU0sT0FBTyxRQUFRLE9BQU8sS0FBSyxVQUFVLEVBQUUsR0FBRyxVQUFVLE1BQU0sT0FBTyxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQ3RGLFVBQU0sYUFBYSxNQUFNLE9BQU8sT0FBTyxPQUFPLFdBQVcsSUFBSTtBQUM3RCxVQUFNLFlBQVksTUFBTSxLQUFLLElBQUksV0FBVyxVQUFVLENBQUM7QUFDdkQsV0FBTyxVQUFVLElBQUksT0FBSyxFQUFFLFNBQVMsRUFBRSxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUU7QUFBQSxFQUNwRTtBQUVBLFdBQVMsU0FB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
