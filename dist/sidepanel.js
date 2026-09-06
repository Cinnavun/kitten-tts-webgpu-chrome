(() => {
  // src/db.js
  var DB_NAME = "kitten-tts-cache";
  var STORE_NAME = "audio-blobs";
  var DB_VERSION = 1;
  async function generateCacheKey(text, voice, speed, model, preprocess = true) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ v: "v1.3.5", text, voice, speed, model, preprocess }));
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
  var openSystemSettingsBtn = (
    /** @type {HTMLButtonElement | null} */
    document.getElementById("openSystemSettingsBtn")
  );
  function openSystemSettings(e) {
    e?.preventDefault();
    chrome.tabs.create({ url: "chrome://settings/system" });
  }
  openGpuDiagnosticsBtn?.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://gpu" });
  });
  openSystemSettingsBtn?.addEventListener("click", openSystemSettings);
  document.getElementById("openSystemSettingsLink")?.addEventListener("click", openSystemSettings);
  function showGpuWarning(customHtml) {
    if (statusDot) statusDot.className = "status-dot error";
    if (statusText) statusText.textContent = "WebGPU unavailable";
    if (gpuWarningBox) gpuWarningBox.style.display = "block";
    if (gpuWarningText && customHtml) {
      gpuWarningText.innerHTML = customHtml;
      const inlineLink = gpuWarningBox?.querySelector("#openSystemSettingsLink");
      inlineLink?.addEventListener("click", openSystemSettings);
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
          'WebGPU is unavailable. Hardware graphics acceleration appears to be disabled. Enable <strong>"Use graphics acceleration when available"</strong> in <a href="#" id="openSystemSettingsLink" class="gpu-inline-link">chrome://settings/system \u2197</a> and relaunch Chrome.'
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
  var preprocessToggle = document.querySelector("#preprocessToggle");
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
    const enablePreprocessing = preprocessToggle?.checked ?? true;
    if (!text) {
      if (statusText)
        statusText.textContent = "Please enter text or extract an article.";
      return;
    }
    await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
    const cacheKey = await generateCacheKey(text, voice, speed, model, enablePreprocessing);
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
        debug: debugToggle?.checked || false,
        preprocess: enablePreprocessing
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
              'WebGPU is unavailable. Please verify <strong>"Use graphics acceleration when available"</strong> is enabled in <a href="#" id="openSystemSettingsLink" class="gpu-inline-link">chrome://settings/system \u2197</a> and relaunch Chrome.'
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
  chrome.storage.local.get(["KITTEN_DEBUG", "KITTEN_PREPROCESS"], (result) => {
    if (debugToggle) debugToggle.checked = result?.KITTEN_DEBUG === true;
    if (preprocessToggle) preprocessToggle.checked = result?.KITTEN_PREPROCESS !== false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if ("KITTEN_DEBUG" in changes && debugToggle) {
        debugToggle.checked = changes.KITTEN_DEBUG.newValue === true;
      }
      if ("KITTEN_PREPROCESS" in changes && preprocessToggle) {
        preprocessToggle.checked = changes.KITTEN_PREPROCESS.newValue !== false;
      }
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
  preprocessToggle?.addEventListener("change", () => {
    chrome.storage.local.set({ KITTEN_PREPROCESS: preprocessToggle.checked });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2RiLmpzIiwgIi4uL3NyYy9zaWRlcGFuZWwuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9kYi5qc1xuXG5jb25zdCBEQl9OQU1FID0gXCJraXR0ZW4tdHRzLWNhY2hlXCI7XG5jb25zdCBTVE9SRV9OQU1FID0gXCJhdWRpby1ibG9ic1wiO1xuY29uc3QgREJfVkVSU0lPTiA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwsIHByZXByb2Nlc3MgPSB0cnVlKSB7XG4gIGNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcbiAgY29uc3QgZGF0YSA9IGVuY29kZXIuZW5jb2RlKEpTT04uc3RyaW5naWZ5KHsgdjogXCJ2MS4zLjVcIiwgdGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCwgcHJlcHJvY2VzcyB9KSk7XG4gIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0yNTZcIiwgZGF0YSk7XG4gIGNvbnN0IGhhc2hBcnJheSA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcikpO1xuICByZXR1cm4gaGFzaEFycmF5Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSkuam9pbihcIlwiKTtcbn1cblxuZnVuY3Rpb24gb3BlbkRCKCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlcXVlc3QgPSBpbmRleGVkREIub3BlbihEQl9OQU1FLCBEQl9WRVJTSU9OKTtcbiAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9IChlKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSAvKiogQHR5cGUge0lEQlJlcXVlc3R9ICovIChlLnRhcmdldCk7XG4gICAgICBjb25zdCBkYiA9IHRhcmdldC5yZXN1bHQ7XG4gICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoU1RPUkVfTkFNRSkpIHtcbiAgICAgICAgZGIuY3JlYXRlT2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IChlKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSAvKiogQHR5cGUge0lEQlJlcXVlc3R9ICovIChlLnRhcmdldCk7XG4gICAgICByZXNvbHZlKHRhcmdldC5yZXN1bHQpO1xuICAgIH07XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIHJlamVjdCh0YXJnZXQuZXJyb3IpO1xuICAgIH07XG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZUF1ZGlvKGtleSwgYmxvYikge1xuICBjb25zdCBkYiA9IGF3YWl0IG9wZW5EQigpO1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oU1RPUkVfTkFNRSwgXCJyZWFkd3JpdGVcIik7XG4gICAgY29uc3Qgc3RvcmUgPSB0eC5vYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICBjb25zdCByZXF1ZXN0ID0gc3RvcmUucHV0KGJsb2IsIGtleSk7XG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEF1ZGlvKGtleSkge1xuICBjb25zdCBkYiA9IGF3YWl0IG9wZW5EQigpO1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oU1RPUkVfTkFNRSwgXCJyZWFkb25seVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5nZXQoa2V5KTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUocmVxdWVzdC5yZXN1bHQpO1xuICAgIHJlcXVlc3Qub25lcnJvciA9ICgpID0+IHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGVhckF1ZGlvQ2FjaGUoKSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWR3cml0ZVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5jbGVhcigpO1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpO1xuICAgIHJlcXVlc3Qub25lcnJvciA9ICgpID0+IHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgZ2VuZXJhdGVDYWNoZUtleSwgZ2V0QXVkaW8gfSBmcm9tICcuL2RiLmpzJztcblxuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB0aGVtZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdGhlbWVTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGV4dHJhY3RBcnRpY2xlQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNleHRyYWN0QXJ0aWNsZUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgdm9pY2VTZWxlY3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3ZvaWNlU2VsZWN0XCIpO1xuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBtb2RlbFNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjbW9kZWxTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3BlZWRJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc3BlZWRJbnB1dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWRWYWx1ZVwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGF1dG9wbGF5VG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNhdXRvcGxheVRvZ2dsZVwiKTtcbi8qKiBAdHlwZSB7SFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB0ZXh0SW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3RleHRJbnB1dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgY2xlYXJCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2NsZWFyQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwbGF5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNwbGF5QnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdG9wQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzdG9wQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkb3dubG9hZEJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZG93bmxvYWRCdG5cIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0YXR1c0RvdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdHVzRG90XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdGF0dXNUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNUZXh0XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwcm9ncmVzc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NDb250YWluZXJcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHByb2dyZXNzRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NGaWxsXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCByZXNldEdwdUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcmVzZXRHcHVCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGNsZWFyQXVkaW9DYWNoZUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjY2xlYXJBdWRpb0NhY2hlQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBjaGFyQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXJDb3VudFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZ3B1V2FybmluZ0JveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ3B1V2FybmluZ0JveFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZ3B1V2FybmluZ1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImdwdVdhcm5pbmdUZXh0XCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBvcGVuR3B1RGlhZ25vc3RpY3NCdG4gPSAvKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi8gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3BlbkdwdURpYWdub3N0aWNzQnRuXCIpKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgb3BlblN5c3RlbVNldHRpbmdzQnRuID0gLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm9wZW5TeXN0ZW1TZXR0aW5nc0J0blwiKSk7XG5cbmZ1bmN0aW9uIG9wZW5TeXN0ZW1TZXR0aW5ncyhlKSB7XG4gIGU/LnByZXZlbnREZWZhdWx0KCk7XG4gIGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogXCJjaHJvbWU6Ly9zZXR0aW5ncy9zeXN0ZW1cIiB9KTtcbn1cblxub3BlbkdwdURpYWdub3N0aWNzQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IFwiY2hyb21lOi8vZ3B1XCIgfSk7XG59KTtcbm9wZW5TeXN0ZW1TZXR0aW5nc0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIG9wZW5TeXN0ZW1TZXR0aW5ncyk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm9wZW5TeXN0ZW1TZXR0aW5nc0xpbmtcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBvcGVuU3lzdGVtU2V0dGluZ3MpO1xuXG5mdW5jdGlvbiBzaG93R3B1V2FybmluZyhjdXN0b21IdG1sKSB7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgZXJyb3JcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIldlYkdQVSB1bmF2YWlsYWJsZVwiO1xuICBpZiAoZ3B1V2FybmluZ0JveCkgZ3B1V2FybmluZ0JveC5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICBpZiAoZ3B1V2FybmluZ1RleHQgJiYgY3VzdG9tSHRtbCkge1xuICAgIGdwdVdhcm5pbmdUZXh0LmlubmVySFRNTCA9IGN1c3RvbUh0bWw7XG4gICAgLy8gUmUtYmluZCBhbnkgaW5saW5lIGxpbmsgY3JlYXRlZCBpbnNpZGUgZHluYW1pYyBIVE1MXG4gICAgY29uc3QgaW5saW5lTGluayA9IGdwdVdhcm5pbmdCb3g/LnF1ZXJ5U2VsZWN0b3IoXCIjb3BlblN5c3RlbVNldHRpbmdzTGlua1wiKTtcbiAgICBpbmxpbmVMaW5rPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgb3BlblN5c3RlbVNldHRpbmdzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoaWRlR3B1V2FybmluZygpIHtcbiAgaWYgKGdwdVdhcm5pbmdCb3gpIGdwdVdhcm5pbmdCb3guc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAoc3RhdHVzRG90ICYmIHN0YXR1c0RvdC5jbGFzc05hbWUuaW5jbHVkZXMoXCJlcnJvclwiKSkge1xuICAgIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgfVxufVxuXG4vKipcbiAqIEluaXRpYWwgcG9sbCBmb3IgV2ViR1BVIGF2YWlsYWJpbGl0eSBvbiBzaWRlcGFuZWwgbGF1bmNoLlxuICogRGV0ZWN0cyB3aGV0aGVyIGhhcmR3YXJlIGdyYXBoaWNzIGFjY2VsZXJhdGlvbiBpcyBlbmFibGVkIG9yIGRpc2FibGVkLlxuICovXG5hc3luYyBmdW5jdGlvbiBwb2xsR3B1QXZhaWxhYmlsaXR5KCkge1xuICBpZiAoIW5hdmlnYXRvci5ncHUpIHtcbiAgICBzaG93R3B1V2FybmluZyhcbiAgICAgICdXZWJHUFUgaXMgbm90IHN1cHBvcnRlZCBieSB5b3VyIGJyb3dzZXIuIFBsZWFzZSB1cGRhdGUgQ2hyb21lIHRvIHYxMTMrIG9yIGNoZWNrIDxrYmQ+Y2hyb21lOi8vZ3B1PC9rYmQ+IGZvciBkZXRhaWxzLidcbiAgICApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgbGV0IGFkYXB0ZXIgPSBhd2FpdCBuYXZpZ2F0b3IuZ3B1LnJlcXVlc3RBZGFwdGVyKCk7XG4gICAgaWYgKCFhZGFwdGVyKSB7XG4gICAgICAvLyBIYXJkd2FyZSBHUFUgbm90IHJldHVybmVkIC0+IGF0dGVtcHQgZmFsbGJhY2sgYWRhcHRlciBjaGVja1xuICAgICAgdHJ5IHtcbiAgICAgICAgYWRhcHRlciA9IGF3YWl0IG5hdmlnYXRvci5ncHUucmVxdWVzdEFkYXB0ZXIoeyBmb3JjZUZhbGxiYWNrQWRhcHRlcjogdHJ1ZSB9KTtcbiAgICAgIH0gY2F0Y2ggKF8pIHt9XG4gICAgfVxuXG4gICAgaWYgKCFhZGFwdGVyKSB7XG4gICAgICBzaG93R3B1V2FybmluZyhcbiAgICAgICAgJ1dlYkdQVSBpcyB1bmF2YWlsYWJsZS4gSGFyZHdhcmUgZ3JhcGhpY3MgYWNjZWxlcmF0aW9uIGFwcGVhcnMgdG8gYmUgZGlzYWJsZWQuIEVuYWJsZSA8c3Ryb25nPlwiVXNlIGdyYXBoaWNzIGFjY2VsZXJhdGlvbiB3aGVuIGF2YWlsYWJsZVwiPC9zdHJvbmc+IGluIDxhIGhyZWY9XCIjXCIgaWQ9XCJvcGVuU3lzdGVtU2V0dGluZ3NMaW5rXCIgY2xhc3M9XCJncHUtaW5saW5lLWxpbmtcIj5jaHJvbWU6Ly9zZXR0aW5ncy9zeXN0ZW0gXHUyMTk3PC9hPiBhbmQgcmVsYXVuY2ggQ2hyb21lLidcbiAgICAgICk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaGlkZUdwdVdhcm5pbmcoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgc2hvd0dwdVdhcm5pbmcoXG4gICAgICBgV2ViR1BVIGFkYXB0ZXIgaW5pdGlhbGl6YXRpb24gZmFpbGVkOiAke2Vyci5tZXNzYWdlfS4gUGxlYXNlIGNoZWNrIDxrYmQ+Y2hyb21lOi8vZ3B1PC9rYmQ+IGZvciBkZXRhaWxzLmBcbiAgICApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vLyBEZWJ1ZyBwYW5lbCBET00gcmVmcyAocG9wdWxhdGVkIGluIHNlY3Rpb24gMTApXG4vKiogQHR5cGUge0hUTUxEZXRhaWxzRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z1BhbmVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1BhbmVsXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1RvZ2dsZVwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwcmVwcm9jZXNzVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNwcmVwcm9jZXNzVG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnTG9nID0gLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi8gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdMb2dcIikpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0VudHJ5Q291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnRW50cnlDb3VudFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdDbGVhckJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDb3B5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z0NvcHlCdG5cIik7XG4vKiogQHR5cGUge0FycmF5PHsgdGFnOiBzdHJpbmcsIGRhdGE6IHVua25vd24sIHRzOiBudW1iZXIgfT59ICovXG5sZXQgZGVidWdFbnRyaWVzID0gW107XG5cbi8vIFV0aWxpdHkgZm9yIGRlYm91bmNpbmdcbmZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHRpbWVvdXQgPSAzMDApIHtcbiAgbGV0IHRpbWVyO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGZ1bmMuYXBwbHkodGhpcywgYXJncyk7IH0sIHRpbWVvdXQpO1xuICB9O1xufVxuXG4vLyAxLiBUaGVtZSBNYW5hZ2VtZW50XG5mdW5jdGlvbiBhcHBseVRoZW1lKHRoZW1lKSB7XG4gIGlmICh0aGVtZSA9PT0gXCJhdXRvXCIpIHtcbiAgICBjb25zdCBpc0RhcmsgPSB3aW5kb3cubWF0Y2hNZWRpYShcIihwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyaylcIikubWF0Y2hlcztcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFxuICAgICAgXCJkYXRhLXRoZW1lXCIsXG4gICAgICBpc0RhcmsgPyBcImRhcmtcIiA6IFwibGlnaHRcIixcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXRoZW1lXCIsIHRoZW1lKTtcbiAgfVxufVxuXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJyZWRUaGVtZVwiLCAoZGF0YSkgPT4ge1xuICBjb25zdCBzYXZlZCA9IGRhdGEucHJlZmVycmVkVGhlbWUgfHwgXCJhdXRvXCI7XG4gIGlmICh0aGVtZVNlbGVjdCkgdGhlbWVTZWxlY3QudmFsdWUgPSBzYXZlZDtcbiAgYXBwbHlUaGVtZShzYXZlZCk7XG59KTtcblxudGhlbWVTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudH0gKi8gKGUudGFyZ2V0KTtcbiAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkVGhlbWU6IHRhcmdldC52YWx1ZSB9KTtcbiAgYXBwbHlUaGVtZSh0YXJnZXQudmFsdWUpO1xufSk7XG5cbi8vIDIuIExvYWQgU2F2ZWQgUHJlZmVyZW5jZXMgKHZvaWNlLCBtb2RlbCwgc3BlZWQsIHJlbmRlckJlZm9yZVBsYXksIGF1dG9wbGF5KVxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFxuICB7IHByZWZlcnJlZFZvaWNlOiBcIkphc3BlclwiLCBwcmVmZXJyZWRNb2RlbDogXCJuYW5vXCIsIHByZWZlcnJlZFNwZWVkOiBcIjEuMFwiLCByZW5kZXJCZWZvcmVQbGF5OiBmYWxzZSwgYXV0b3BsYXk6IHRydWUgfSxcbiAgKGl0ZW1zKSA9PiB7XG4gICAgaWYgKHZvaWNlU2VsZWN0KSB2b2ljZVNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFZvaWNlO1xuICAgIGlmIChtb2RlbFNlbGVjdCkgbW9kZWxTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRNb2RlbDtcbiAgICBpZiAoc3BlZWRJbnB1dCkge1xuICAgICAgc3BlZWRJbnB1dC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFNwZWVkO1xuICAgICAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtpdGVtcy5wcmVmZXJyZWRTcGVlZH14YDtcbiAgICB9XG4gICAgaWYgKHJlbmRlckJlZm9yZVBsYXlUb2dnbGUpIHtcbiAgICAgIHJlbmRlckJlZm9yZVBsYXlUb2dnbGUuY2hlY2tlZCA9IGl0ZW1zLnJlbmRlckJlZm9yZVBsYXk7XG4gICAgfVxuICAgIGlmIChhdXRvcGxheVRvZ2dsZSkge1xuICAgICAgYXV0b3BsYXlUb2dnbGUuY2hlY2tlZCA9IGl0ZW1zLmF1dG9wbGF5O1xuICAgICAgYXV0b3BsYXlUb2dnbGUuZGlzYWJsZWQgPSAhaXRlbXMucmVuZGVyQmVmb3JlUGxheTtcbiAgICB9XG4gICAgY2hlY2tDYWNoZVN0YXR1cygpOyAvLyBJbml0aWFsIGNoZWNrXG4gIH0sXG4pO1xuXG4vLyAzLiBTYXZlIFByZWZlcmVuY2VzIG9uIENoYW5nZVxudm9pY2VTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRWb2ljZTogdm9pY2VTZWxlY3QudmFsdWUgfSk7XG4gIGNoZWNrQ2FjaGVTdGF0dXMoKTtcbn0pO1xuXG5tb2RlbFNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZE1vZGVsOiBtb2RlbFNlbGVjdC52YWx1ZSB9KTtcbiAgY2hlY2tDYWNoZVN0YXR1cygpO1xufSk7XG5cbmNvbnN0IHNhdmVTcGVlZCA9IGRlYm91bmNlKCh2YWx1ZSkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRTcGVlZDogdmFsdWUgfSk7XG59LCA1MDApO1xuXG5zcGVlZElucHV0Py5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4ge1xuICBpZiAoc3BlZWRWYWx1ZSkgc3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke3NwZWVkSW5wdXQudmFsdWV9eGA7XG4gIHNhdmVTcGVlZChzcGVlZElucHV0LnZhbHVlKTtcbiAgY2hlY2tDYWNoZVN0YXR1cygpO1xufSk7XG5cbnJlbmRlckJlZm9yZVBsYXlUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBpZiAocmVuZGVyQmVmb3JlUGxheVRvZ2dsZSkge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHJlbmRlckJlZm9yZVBsYXk6IHJlbmRlckJlZm9yZVBsYXlUb2dnbGUuY2hlY2tlZCB9KTtcbiAgICBpZiAoYXV0b3BsYXlUb2dnbGUpIHtcbiAgICAgIGF1dG9wbGF5VG9nZ2xlLmRpc2FibGVkID0gIXJlbmRlckJlZm9yZVBsYXlUb2dnbGUuY2hlY2tlZDtcbiAgICB9XG4gIH1cbn0pO1xuXG5hdXRvcGxheVRvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGlmIChhdXRvcGxheVRvZ2dsZSkge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IGF1dG9wbGF5OiBhdXRvcGxheVRvZ2dsZS5jaGVja2VkIH0pO1xuICB9XG59KTtcblxuLy8gSGVscGVycyBmb3IgY2FjaGUgY2hlY2tpbmdcbmFzeW5jIGZ1bmN0aW9uIGdldEJsb2JEdXJhdGlvbihibG9iKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XG4gICAgYXVkaW8uc3JjID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICBhdWRpby5vbmxvYWRlZG1ldGFkYXRhID0gKCkgPT4ge1xuICAgICAgcmVzb2x2ZShhdWRpby5kdXJhdGlvbik7XG4gICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGF1ZGlvLnNyYyk7XG4gICAgfTtcbiAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgcmVzb2x2ZSgwKTtcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYXVkaW8uc3JjKTtcbiAgICB9O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0RHVyYXRpb24oc2Vjb25kcykge1xuICBpZiAoIXNlY29uZHMgfHwgIWlzRmluaXRlKHNlY29uZHMpKSByZXR1cm4gXCIwOjAwXCI7XG4gIGNvbnN0IG0gPSBNYXRoLmZsb29yKHNlY29uZHMgLyA2MCk7XG4gIGNvbnN0IHMgPSBNYXRoLmZsb29yKHNlY29uZHMgJSA2MCk7XG4gIHJldHVybiBgJHttfToke3MudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfWA7XG59XG5cbmNvbnN0IGNoZWNrQ2FjaGVTdGF0dXMgPSBkZWJvdW5jZShhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSAodGV4dElucHV0Py52YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHZvaWNlID0gdm9pY2VTZWxlY3Q/LnZhbHVlIHx8IFwiSmFzcGVyXCI7XG4gIGNvbnN0IHNwZWVkID0gcGFyc2VGbG9hdChzcGVlZElucHV0Py52YWx1ZSB8fCBcIjEuMFwiKTtcbiAgY29uc3QgbW9kZWwgPSBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCI7XG5cbiAgaWYgKCF0ZXh0KSB7XG4gICAgaWYgKHBsYXlCdG4pIHBsYXlCdG4udGV4dENvbnRlbnQgPSBcIlx1MjVCNiBHZW5lcmF0ZSBBdWRpb1wiO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGNhY2hlS2V5ID0gYXdhaXQgZ2VuZXJhdGVDYWNoZUtleSh0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsKTtcbiAgY29uc3QgY2FjaGVkQmxvYiA9IGF3YWl0IGdldEF1ZGlvKGNhY2hlS2V5KTtcblxuICBpZiAoY2FjaGVkQmxvYiAmJiBwbGF5QnRuKSB7XG4gICAgY29uc3QgZHVyYXRpb24gPSBhd2FpdCBnZXRCbG9iRHVyYXRpb24oY2FjaGVkQmxvYik7XG4gICAgcGxheUJ0bi50ZXh0Q29udGVudCA9IGBcdTI1QjYgTGlzdGVuIHRvIEF1ZGlvICgke2Zvcm1hdER1cmF0aW9uKGR1cmF0aW9uKX0pYDtcbiAgfSBlbHNlIGlmIChwbGF5QnRuKSB7XG4gICAgcGxheUJ0bi50ZXh0Q29udGVudCA9IFwiXHUyNUI2IEdlbmVyYXRlIEF1ZGlvXCI7XG4gIH1cbn0sIDMwMCk7XG5cbi8vIDQuIENoYXJhY3RlciBDb3VudCAmIENsZWFyIElucHV0XG5mdW5jdGlvbiB1cGRhdGVDaGFyQ291bnQoKSB7XG4gIGlmIChjaGFyQ291bnQgJiYgdGV4dElucHV0KSB7XG4gICAgY29uc3QgbGVuID0gdGV4dElucHV0LnZhbHVlLmxlbmd0aDtcbiAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSb3VnaCBlc3RpbWF0ZTogfjIwMCBjaGFycyBwZXIgY2h1bmtcbiAgICAgIGNvbnN0IGVzdGltYXRlZENodW5rcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChsZW4gLyAyMDApKTtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IGAke2xlbi50b0xvY2FsZVN0cmluZygpfSBjaGFycyBcdTAwQjcgfiR7ZXN0aW1hdGVkQ2h1bmtzfSBjaHVuayR7ZXN0aW1hdGVkQ2h1bmtzID4gMSA/IFwic1wiIDogXCJcIn1gO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQgPSBkZWJvdW5jZSh1cGRhdGVDaGFyQ291bnQsIDMwMCk7XG50ZXh0SW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7XG4gIGRlYm91bmNlZFVwZGF0ZUNoYXJDb3VudCgpO1xuICBjaGVja0NhY2hlU3RhdHVzKCk7XG59KTtcblxuY2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGlmICh0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBcIlwiO1xuICAgIHRleHRJbnB1dC5mb2N1cygpO1xuICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICB9XG59KTtcblxuLy8gNS4gSW5pdGlhbCBHUFUgUG9sbCAmIFNpbGVudCBQcmUtV2FybSBvbiBQYW5lbCBMb2FkXG4oYXN5bmMgKCkgPT4ge1xuICBjb25zdCBpc0dwdVJlYWR5ID0gYXdhaXQgcG9sbEdwdUF2YWlsYWJpbGl0eSgpO1xuICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiRU5TVVJFX09GRlNDUkVFTlwiIH0pO1xuICBpZiAoaXNHcHVSZWFkeSkge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICAgIHR5cGU6IFwiUFJFV0FSTV9NT0RFTFwiLFxuICAgICAgbW9kZWw6IG1vZGVsU2VsZWN0Py52YWx1ZSB8fCBcIm5hbm9cIixcbiAgICB9KTtcbiAgfVxufSkoKTtcblxuLy8gSGVscGVyIHRvIHN0YXJ0IHBsYXliYWNrXG5hc3luYyBmdW5jdGlvbiBzdGFydFBsYXliYWNrKHRleHRUb1BsYXkpIHtcbiAgY29uc3QgdGV4dCA9ICh0ZXh0VG9QbGF5IHx8IHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCB2b2ljZSA9IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiO1xuICBjb25zdCBzcGVlZCA9IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIik7XG4gIGNvbnN0IG1vZGVsID0gbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiO1xuICBjb25zdCByZW5kZXJCZWZvcmVQbGF5ID0gcmVuZGVyQmVmb3JlUGxheVRvZ2dsZT8uY2hlY2tlZCB8fCBmYWxzZTtcbiAgY29uc3QgYXV0b3BsYXkgPSBhdXRvcGxheVRvZ2dsZT8uY2hlY2tlZCA/PyB0cnVlO1xuICBjb25zdCBlbmFibGVQcmVwcm9jZXNzaW5nID0gcHJlcHJvY2Vzc1RvZ2dsZT8uY2hlY2tlZCA/PyB0cnVlO1xuXG4gIGlmICghdGV4dCkge1xuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxlYXNlIGVudGVyIHRleHQgb3IgZXh0cmFjdCBhbiBhcnRpY2xlLlwiO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJFTlNVUkVfT0ZGU0NSRUVOXCIgfSk7XG4gIFxuICBjb25zdCBjYWNoZUtleSA9IGF3YWl0IGdlbmVyYXRlQ2FjaGVLZXkodGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCwgZW5hYmxlUHJlcHJvY2Vzc2luZyk7XG4gIGNvbnN0IGNhY2hlZEJsb2IgPSBhd2FpdCBnZXRBdWRpbyhjYWNoZUtleSk7XG5cbiAgaWYgKCFjYWNoZWRCbG9iKSB7XG4gICAgY29uc3QgaXNHcHVSZWFkeSA9IGF3YWl0IHBvbGxHcHVBdmFpbGFiaWxpdHkoKTtcbiAgICBpZiAoIWlzR3B1UmVhZHkpIHtcbiAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJDYW5ub3Qgc3ludGhlc2l6ZTogV2ViR1BVIHVuYXZhaWxhYmxlLlwiO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIGlmIChjYWNoZWRCbG9iKSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgICAgdHlwZTogXCJQTEFZX0NBQ0hFRFwiLFxuICAgICAgY2FjaGVLZXlcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgICB0eXBlOiBcIlBMQVlfVEVYVFwiLFxuICAgICAgdGV4dCxcbiAgICAgIHZvaWNlLFxuICAgICAgc3BlZWQsXG4gICAgICBtb2RlbCxcbiAgICAgIGNhY2hlS2V5LFxuICAgICAgcmVuZGVyQmVmb3JlUGxheSxcbiAgICAgIGF1dG9wbGF5LFxuICAgICAgZGVidWc6IGRlYnVnVG9nZ2xlPy5jaGVja2VkIHx8IGZhbHNlLFxuICAgICAgcHJlcHJvY2VzczogZW5hYmxlUHJlcHJvY2Vzc2luZ1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKHBsYXlCdG4pIHBsYXlCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoZG93bmxvYWRCdG4pIGRvd25sb2FkQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICBpZiAoc3RhdHVzVGV4dCkge1xuICAgIGlmIChjYWNoZWRCbG9iKSB7XG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGF5aW5nIGNhY2hlZCBhdWRpby4uLlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYXV0b3BsYXkgPyBcIlN5bnRoZXNpemluZyBhbmQgcGxheWluZy4uLlwiIDogXCJHZW5lcmF0aW5nIGF1ZGlvIHRvIGNhY2hlLi4uXCI7XG4gICAgfVxuICB9XG59XG5cbi8vIDYuIFNjYW4gJiBBdXRvLVBsYXkgQXJ0aWNsZSBBY3Rpb25cbmV4dHJhY3RBcnRpY2xlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiQ2hlY2tpbmcgcGFnZSBhY2Nlc3MgcGVybWlzc2lvbnMuLi5cIjtcblxuICAgIGNvbnN0IGdyYW50ZWQgPSBhd2FpdCBjaHJvbWUucGVybWlzc2lvbnMucmVxdWVzdCh7XG4gICAgICBvcmlnaW5zOiBbXCJodHRwOi8vKi8qXCIsIFwiaHR0cHM6Ly8qLypcIl0sXG4gICAgfSk7XG5cbiAgICBpZiAoIWdyYW50ZWQpIHtcbiAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQZXJtaXNzaW9uIGRlbmllZC4gQ2Fubm90IHNjYW4gcGFnZS5cIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlNjYW5uaW5nIGFjdGl2ZSB0YWIgZm9yIGFydGljbGUuLi5cIjtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcblxuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKFxuICAgICAgeyB0eXBlOiBcIkVYVFJBQ1RfQ1VSUkVOVF9UQUJfQVJUSUNMRVwiIH0sXG4gICAgICBhc3luYyAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKHJlc3BvbnNlPy5lcnJvcikge1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYEVycm9yOiAke3Jlc3BvbnNlLmVycm9yfWA7XG4gICAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXNwb25zZT8uYXJ0aWNsZT8udGV4dCkge1xuICAgICAgICAgIGlmICh0ZXh0SW5wdXQpIHRleHRJbnB1dC52YWx1ZSA9IHJlc3BvbnNlLmFydGljbGUudGV4dDtcbiAgICAgICAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICAgICAgICBjb25zdCB0aXRsZVNuaXBwZXQgPVxuICAgICAgICAgICAgcmVzcG9uc2UuYXJ0aWNsZS50aXRsZSA/XG4gICAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUuc2xpY2UoMCwgMjUpICsgXCIuLi5cIlxuICAgICAgICAgICAgOiBcIkFydGljbGVcIjtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgTG9hZGVkIFwiJHt0aXRsZVNuaXBwZXR9XCIuIFJlYWRpbmcuLi5gO1xuXG4gICAgICAgICAgLy8gQXV0by1wbGF5IGltbWVkaWF0ZWx5XG4gICAgICAgICAgYXdhaXQgc3RhcnRQbGF5YmFjayhyZXNwb25zZS5hcnRpY2xlLnRleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9XG4gICAgICAgICAgICAgIFwiQ291bGQgbm90IGZpbmQgYSBzdHJ1Y3R1cmVkIGFydGljbGUgb24gdGhpcyBwYWdlLlwiO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICApO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiRXh0cmFjdGlvbiBlcnJvcjpcIiwgZXJyKTtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtlcnIubWVzc2FnZX1gO1xuICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgfVxufSk7XG5cbi8vIFN0b3JhZ2UgTGlzdGVuZXJzXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJ0dHNUZXh0XCIsIChkYXRhKSA9PiB7XG4gIGlmIChkYXRhLnR0c1RleHQgJiYgdGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gZGF0YS50dHNUZXh0O1xuICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShcInR0c1RleHRcIik7XG4gIH1cbn0pO1xuXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgaWYgKGFyZWEgPT09IFwibG9jYWxcIiAmJiBjaGFuZ2VzLnR0c1RleHQ/Lm5ld1ZhbHVlICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGNoYW5nZXMudHRzVGV4dC5uZXdWYWx1ZTtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuLy8gNy4gUGxheSAmIFN0b3AgTGlzdGVuZXJzXG5wbGF5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gc3RhcnRQbGF5YmFjaygpKTtcblxuc3RvcEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsIHR5cGU6IFwiU1RPUF9BVURJT1wiIH0pO1xuICByZXNldENvbnRyb2xzKFwiU3RvcHBlZC5cIik7XG59KTtcblxuY29uc3QgZG93bmxvYWRBbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbmRvd25sb2FkQW5jaG9yLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZG93bmxvYWRBbmNob3IpO1xuXG5kb3dubG9hZEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgdGV4dCA9ICh0ZXh0SW5wdXQ/LnZhbHVlIHx8IFwiXCIpLnRyaW0oKTtcbiAgY29uc3Qgdm9pY2UgPSB2b2ljZVNlbGVjdD8udmFsdWUgfHwgXCJKYXNwZXJcIjtcbiAgY29uc3Qgc3BlZWQgPSBwYXJzZUZsb2F0KHNwZWVkSW5wdXQ/LnZhbHVlIHx8IFwiMS4wXCIpO1xuICBjb25zdCBtb2RlbCA9IG1vZGVsU2VsZWN0Py52YWx1ZSB8fCBcIm5hbm9cIjtcblxuICBpZiAoIXRleHQpIHJldHVybjtcblxuICB0cnkge1xuICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQcmVwYXJpbmcgZG93bmxvYWQuLi5cIjtcbiAgICBjb25zdCBjYWNoZUtleSA9IGF3YWl0IGdlbmVyYXRlQ2FjaGVLZXkodGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCk7XG4gICAgY29uc3QgYmxvYiA9IGF3YWl0IGdldEF1ZGlvKGNhY2hlS2V5KTtcblxuICAgIGlmIChibG9iKSB7XG4gICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgZG93bmxvYWRBbmNob3IuaHJlZiA9IHVybDtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmRvd25sb2FkID0gXCJraXR0ZW4tdHRzLWF1ZGlvLndhdlwiO1xuICAgICAgZG93bmxvYWRBbmNob3IuY2xpY2soKTtcbiAgICAgIFxuICAgICAgLy8gQ2xlYW4gdXAgdGhlIG9iamVjdCBVUkwgYWZ0ZXIgYSBzaG9ydCBkZWxheVxuICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkRvd25sb2FkIHN0YXJ0ZWQuXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJFcnJvcjogQXVkaW8gbm90IGZvdW5kIGluIGNhY2hlLlwiO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRG93bmxvYWQgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHJlc2V0Q29udHJvbHMoc3RhdHVzTXNnKSB7XG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gZmFsc2U7XG4gIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IFwiMCVcIjtcbiAgaWYgKGdwdVdhcm5pbmdCb3ggJiYgZ3B1V2FybmluZ0JveC5zdHlsZS5kaXNwbGF5ID09PSBcImJsb2NrXCIpIHtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGVycm9yXCI7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICB9XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gc3RhdHVzTXNnO1xufVxuXG4vLyA4LiBQcm9ncmVzcyBMaXN0ZW5lciBcdTIwMTQgY29ubmVjdGVkIHZpYSBQb3J0IGZvciB6ZXJvLW92ZXJoZWFkIHJlbGF5IGZyb20gYmFja2dyb3VuZFxuKGZ1bmN0aW9uIGNvbm5lY3RVaVBvcnQoKSB7XG4gIGNvbnN0IHBvcnQgPSBjaHJvbWUucnVudGltZS5jb25uZWN0KHsgbmFtZTogXCJ0dHMtdWlcIiB9KTtcbiAgcG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1zZykgPT4ge1xuICAgIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfUFJPR1JFU1NcIikge1xuICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gICAgICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBgJHttc2cucGVyY2VudH0lYDtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgU3ludGhlc2l6aW5nIGF1ZGlvLi4uICR7bXNnLnBlcmNlbnR9JWA7XG4gICAgICB9KTtcbiAgICAgIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfU1RBVFVTXCIpIHtcbiAgICAgIGlmIChtc2cuc3RhdGUgPT09IFwiaWRsZVwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMobXNnLnN0YXR1cyB8fCBcIkZpbmlzaGVkIHBsYXlpbmcuXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwic3RvcHBlZFwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMobXNnLnN0YXR1cyB8fCBcIlN0b3BwZWQuXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwiZXJyb3JcIikge1xuICAgICAgICByZXNldENvbnRyb2xzKG1zZy5zdGF0dXMgfHwgXCJFcnJvciBvY2N1cnJlZFwiKTtcbiAgICAgICAgaWYgKG1zZy5zdGF0dXM/LmluY2x1ZGVzKFwiV2ViR1BVXCIpIHx8IG1zZy5zdGF0dXM/LmluY2x1ZGVzKFwiY2hyb21lOi8vZ3B1XCIpIHx8IG1zZy5zdGF0dXM/LmluY2x1ZGVzKFwiZ3JhcGhpY3MgYWNjZWxlcmF0aW9uXCIpKSB7XG4gICAgICAgICAgc2hvd0dwdVdhcm5pbmcoXG4gICAgICAgICAgICAnV2ViR1BVIGlzIHVuYXZhaWxhYmxlLiBQbGVhc2UgdmVyaWZ5IDxzdHJvbmc+XCJVc2UgZ3JhcGhpY3MgYWNjZWxlcmF0aW9uIHdoZW4gYXZhaWxhYmxlXCI8L3N0cm9uZz4gaXMgZW5hYmxlZCBpbiA8YSBocmVmPVwiI1wiIGlkPVwib3BlblN5c3RlbVNldHRpbmdzTGlua1wiIGNsYXNzPVwiZ3B1LWlubGluZS1saW5rXCI+Y2hyb21lOi8vc2V0dGluZ3Mvc3lzdGVtIFx1MjE5NzwvYT4gYW5kIHJlbGF1bmNoIENocm9tZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwicGxheWluZ1wiKSB7XG4gICAgICAgIGhpZGVHcHVXYXJuaW5nKCk7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGF5aW5nIGF1ZGlvLi4uXCI7XG4gICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgcGxheWluZ1wiO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwiYnVzeVwiKSB7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gbXNnLnN0YXR1cztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19BVURJT19SRUFEWVwiKSB7XG4gICAgICBpZiAoZG93bmxvYWRCdG4pIGRvd25sb2FkQnRuLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBjaGVja0NhY2hlU3RhdHVzKCk7XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfREVCVUdfTE9HXCIpIHtcbiAgICAgIC8vIEFwcGVuZCB0byBpbi1wYW5lbCBkZWJ1ZyBsb2cgaWYgdGhlIHBhbmVsIGV4aXN0c1xuICAgICAgaWYgKGRlYnVnUGFuZWwgJiYgZGVidWdMb2cpIHtcbiAgICAgICAgLy8gQXV0by1vcGVuIHRoZSBwYW5lbCBvbiBmaXJzdCBldmVudCByZWNlaXZlZFxuICAgICAgICBpZiAoIWRlYnVnUGFuZWwub3BlbiAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgZGVidWdQYW5lbC5vcGVuID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBkZWJ1Z0VudHJpZXMucHVzaCh7IHRhZzogbXNnLnRhZywgZGF0YTogbXNnLmRhdGEsIHRzOiBtc2cudHMgPz8gRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgLy8gS2VlcCBidWZmZXIgYm91bmRlZCB0byAyMDAgZW50cmllc1xuICAgICAgICBpZiAoZGVidWdFbnRyaWVzLmxlbmd0aCA+IDIwMCkgZGVidWdFbnRyaWVzLnNoaWZ0KCk7XG4gICAgICAgIHJlbmRlckRlYnVnTG9nKCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgLy8gUmVjb25uZWN0IGlmIHRoZSBzZXJ2aWNlIHdvcmtlciByZXN0YXJ0cyBhbmQgZHJvcHMgdGhlIHBvcnRcbiAgcG9ydC5vbkRpc2Nvbm5lY3QuYWRkTGlzdGVuZXIoKCkgPT4gc2V0VGltZW91dChjb25uZWN0VWlQb3J0LCAyMDApKTtcbn0pKCk7XG5cblxuLy8gOS4gUmVzZXQgRW5naW5lIEFjdGlvblxucmVzZXRHcHVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJSZXNldHRpbmcgR1BVIHByb2Nlc3MuLi5cIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGF3YWl0IHBvbGxHcHVBdmFpbGFiaWxpdHkoKTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIlJFU0VUX0dQVV9PRkZTQ1JFRU5cIiB9LCAocmVzKSA9PiB7XG4gICAgcmVzZXRDb250cm9scyhyZXM/Lm1lc3NhZ2UgfHwgXCJFbmdpbmUgcmVzZXQuXCIpO1xuICB9KTtcbn0pO1xuXG5jbGVhckF1ZGlvQ2FjaGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJDbGVhcmluZyBhdWRpbyBjYWNoZS4uLlwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkNMRUFSX0FVRElPX0NBQ0hFXCIgfSwgKHJlcykgPT4ge1xuICAgIHJlc2V0Q29udHJvbHMocmVzPy5tZXNzYWdlIHx8IFwiQXVkaW8gY2FjaGUgY2xlYXJlZC5cIik7XG4gIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCAxMC4gRGVidWcgUGFuZWwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblxuLyoqIFJlbmRlciBhbGwgZGVidWcgZW50cmllcyBpbnRvIHRoZSBsb2cgcHJlIGVsZW1lbnQgKi9cbmZ1bmN0aW9uIHJlbmRlckRlYnVnTG9nKCkge1xuICBpZiAoIWRlYnVnTG9nKSByZXR1cm47XG4gIGlmIChkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgZGVidWdMb2cudmFsdWUgPSBcIi0tIG5vIGxvZyBlbnRyaWVzIHlldCAtLVwiO1xuICAgIGlmIChkZWJ1Z0VudHJ5Q291bnQpIGRlYnVnRW50cnlDb3VudC50ZXh0Q29udGVudCA9IFwiMCBlbnRyaWVzXCI7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChkZWJ1Z0VudHJ5Q291bnQpIHtcbiAgICBkZWJ1Z0VudHJ5Q291bnQudGV4dENvbnRlbnQgPSBgJHtkZWJ1Z0VudHJpZXMubGVuZ3RofSBlbnRyJHtkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAxID8gXCJ5XCIgOiBcImllc1wifWA7XG4gIH1cbiAgZGVidWdMb2cudmFsdWUgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpOyAvLyBISDptbTpzcy5tbW1cbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIC8vIEF1dG8tc2Nyb2xsIHRvIGJvdHRvbVxuICBkZWJ1Z0xvZy5zY3JvbGxUb3AgPSBkZWJ1Z0xvZy5zY3JvbGxIZWlnaHQ7XG59XG5cbi8vIFJlYWQgaW5pdGlhbCBkZWJ1ZyBmbGFnIGFuZCBwcmVwcm9jZXNzaW5nIHN0YXRlXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1wiS0lUVEVOX0RFQlVHXCIsIFwiS0lUVEVOX1BSRVBST0NFU1NcIl0sIChyZXN1bHQpID0+IHtcbiAgaWYgKGRlYnVnVG9nZ2xlKSBkZWJ1Z1RvZ2dsZS5jaGVja2VkID0gcmVzdWx0Py5LSVRURU5fREVCVUcgPT09IHRydWU7XG4gIGlmIChwcmVwcm9jZXNzVG9nZ2xlKSBwcmVwcm9jZXNzVG9nZ2xlLmNoZWNrZWQgPSByZXN1bHQ/LktJVFRFTl9QUkVQUk9DRVNTICE9PSBmYWxzZTtcbn0pO1xuXG4vLyBLZWVwIHRvZ2dsZXMgaW4gc3luYyBpZiBjaGFuZ2VkIGVsc2V3aGVyZVxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIpIHtcbiAgICBpZiAoXCJLSVRURU5fREVCVUdcIiBpbiBjaGFuZ2VzICYmIGRlYnVnVG9nZ2xlKSB7XG4gICAgICBkZWJ1Z1RvZ2dsZS5jaGVja2VkID0gY2hhbmdlcy5LSVRURU5fREVCVUcubmV3VmFsdWUgPT09IHRydWU7XG4gICAgfVxuICAgIGlmIChcIktJVFRFTl9QUkVQUk9DRVNTXCIgaW4gY2hhbmdlcyAmJiBwcmVwcm9jZXNzVG9nZ2xlKSB7XG4gICAgICBwcmVwcm9jZXNzVG9nZ2xlLmNoZWNrZWQgPSBjaGFuZ2VzLktJVFRFTl9QUkVQUk9DRVNTLm5ld1ZhbHVlICE9PSBmYWxzZTtcbiAgICB9XG4gIH1cbn0pO1xuXG4vLyBUb2dnbGUgaGFuZGxlcnMgXHUyMDE0IHBlcnNpc3QgdG8gc3RvcmFnZSAocGlja2VkIHVwIGJ5IGFsbCBjb250ZXh0cyB2aWEgb25DaGFuZ2VkKVxuZGVidWdUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBLSVRURU5fREVCVUc6IGRlYnVnVG9nZ2xlLmNoZWNrZWQgfSk7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNFVF9ERUJVR1wiLCBlbmFibGVkOiBkZWJ1Z1RvZ2dsZS5jaGVja2VkIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgaWYgKGRlYnVnVG9nZ2xlLmNoZWNrZWQgJiYgZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChkZWJ1Z0xvZykgZGVidWdMb2cudmFsdWUgPSBcIi0tIGRlYnVnIGVuYWJsZWQ6IHRyaWdnZXIgYSBQbGF5IHRvIHNlZSBldmVudHMgLS1cIjtcbiAgfVxufSk7XG5cbnByZXByb2Nlc3NUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBLSVRURU5fUFJFUFJPQ0VTUzogcHJlcHJvY2Vzc1RvZ2dsZS5jaGVja2VkIH0pO1xufSk7XG5cbi8vIENsZWFyIGJ1dHRvblxuZGVidWdDbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgZGVidWdFbnRyaWVzID0gW107XG4gIHJlbmRlckRlYnVnTG9nKCk7XG59KTtcblxuLy8gQ29weSBidXR0b24gXHUyMDE0IGNvcGllcyBwbGFpbiB0ZXh0IHRvIGNsaXBib2FyZFxuZGVidWdDb3B5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gZGVidWdFbnRyaWVzLm1hcCgoeyB0YWcsIGRhdGEsIHRzIH0pID0+IHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUodHMpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMTEsIDIzKTtcbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIHRyeSB7XG4gICAgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGV4dCB8fCBcIi0tIGVtcHR5IC0tXCIpO1xuICAgIGlmIChkZWJ1Z0NvcHlCdG4pIHtcbiAgICAgIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29waWVkIVwiO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGlmIChkZWJ1Z0NvcHlCdG4pIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29weVwiOyB9LCAxNTAwKTtcbiAgICB9XG4gIH0gY2F0Y2ggKF8pIHtcbiAgICAvKiBjbGlwYm9hcmQgbm90IGF2YWlsYWJsZSAqL1xuICB9XG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFFQSxNQUFNLFVBQVU7QUFDaEIsTUFBTSxhQUFhO0FBQ25CLE1BQU0sYUFBYTtBQUVuQixpQkFBc0IsaUJBQWlCLE1BQU0sT0FBTyxPQUFPLE9BQU8sYUFBYSxNQUFNO0FBQ25GLFVBQU0sVUFBVSxJQUFJLFlBQVk7QUFDaEMsVUFBTSxPQUFPLFFBQVEsT0FBTyxLQUFLLFVBQVUsRUFBRSxHQUFHLFVBQVUsTUFBTSxPQUFPLE9BQU8sT0FBTyxXQUFXLENBQUMsQ0FBQztBQUNsRyxVQUFNLGFBQWEsTUFBTSxPQUFPLE9BQU8sT0FBTyxXQUFXLElBQUk7QUFDN0QsVUFBTSxZQUFZLE1BQU0sS0FBSyxJQUFJLFdBQVcsVUFBVSxDQUFDO0FBQ3ZELFdBQU8sVUFBVSxJQUFJLE9BQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxTQUFTLEdBQUcsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFO0FBQUEsRUFDcEU7QUFFQSxXQUFTLFNBQVM7QUFDaEIsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdEMsWUFBTSxVQUFVLFVBQVUsS0FBSyxTQUFTLFVBQVU7QUFDbEQsY0FBUSxrQkFBa0IsQ0FBQyxNQUFNO0FBQy9CLGNBQU07QUFBQTtBQUFBLFVBQW9DLEVBQUU7QUFBQTtBQUM1QyxjQUFNLEtBQUssT0FBTztBQUNsQixZQUFJLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxVQUFVLEdBQUc7QUFDN0MsYUFBRyxrQkFBa0IsVUFBVTtBQUFBLFFBQ2pDO0FBQUEsTUFDRjtBQUNBLGNBQVEsWUFBWSxDQUFDLE1BQU07QUFDekIsY0FBTTtBQUFBO0FBQUEsVUFB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
