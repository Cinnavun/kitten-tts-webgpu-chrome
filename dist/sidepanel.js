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
    async (items) => {
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
      const isGpuReady = await pollGpuAvailability();
      await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
      if (isGpuReady) {
        const activeState = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "GET_CURRENT_PLAYBACK_STATE" }, (res) => {
            resolve(res);
          });
        }).catch(() => null);
        if (!activeState || activeState.state === "idle") {
          chrome.runtime.sendMessage({
            target: "offscreen",
            type: "PREWARM_MODEL",
            model: items.preferredModel || "nano"
          });
        }
      }
    }
  );
  voiceSelect?.addEventListener("change", () => {
    chrome.storage.local.set({ preferredVoice: voiceSelect.value });
    checkCacheStatus();
  });
  modelSelect?.addEventListener("change", async () => {
    const chosenModel = modelSelect.value;
    chrome.storage.local.set({ preferredModel: chosenModel });
    checkCacheStatus();
    const isGpuReady = await pollGpuAvailability();
    if (isGpuReady) {
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "PREWARM_MODEL",
        model: chosenModel
      });
    }
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
    if (playBtn) {
      playBtn.disabled = true;
      playBtn.textContent = cachedBlob ? "\u25B6 Playing Audio" : "\u23F3 Generating...";
    }
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
    checkCacheStatus();
  }
  (function connectUiPort() {
    const port = chrome.runtime.connect({ name: "tts-ui" });
    port.onMessage.addListener((msg) => {
      if (msg.type === "TTS_STATE_SYNC") {
        if (msg.state === "busy") {
          if (playBtn) {
            playBtn.disabled = true;
            playBtn.textContent = "\u23F3 Generating...";
          }
          if (stopBtn) stopBtn.disabled = false;
          if (progressContainer) progressContainer.style.display = "block";
          if (progressFill) progressFill.style.width = `${msg.percent || 0}%`;
          if (statusDot) statusDot.className = "status-dot busy";
          const chunkInfo = msg.current && msg.total ? ` (chunk ${msg.current}/${msg.total})` : "";
          if (statusText) statusText.textContent = msg.status || `Synthesizing audio... ${msg.percent || 0}%${chunkInfo}`;
        } else if (msg.state === "playing") {
          hideGpuWarning();
          if (playBtn) {
            playBtn.disabled = true;
            playBtn.textContent = "\u25B6 Playing Audio";
          }
          if (stopBtn) stopBtn.disabled = false;
          if (progressContainer) progressContainer.style.display = "none";
          if (statusDot) statusDot.className = "status-dot playing";
          if (statusText) statusText.textContent = "Playing audio...";
        }
      } else if (msg.type === "TTS_PROGRESS") {
        if (statusDot) statusDot.className = "status-dot busy";
        if (progressContainer) progressContainer.style.display = "block";
        if (playBtn) {
          playBtn.disabled = true;
          playBtn.textContent = "\u23F3 Generating...";
        }
        if (stopBtn) stopBtn.disabled = false;
        requestAnimationFrame(() => {
          if (progressFill) progressFill.style.width = `${msg.percent}%`;
          const chunkInfo = msg.current && msg.total ? ` (chunk ${msg.current}/${msg.total})` : "";
          if (statusText) statusText.textContent = `Synthesizing audio... ${msg.percent}%${chunkInfo}`;
        });
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
          if (playBtn) {
            playBtn.disabled = true;
            playBtn.textContent = "\u25B6 Playing Audio";
          }
          if (stopBtn) stopBtn.disabled = false;
          if (progressContainer) progressContainer.style.display = "none";
          if (statusText) statusText.textContent = "Playing audio...";
          if (statusDot) statusDot.className = "status-dot playing";
        } else if (msg.state === "busy") {
          if (playBtn) {
            playBtn.disabled = true;
            playBtn.textContent = "\u23F3 Generating...";
          }
          if (stopBtn) stopBtn.disabled = false;
          if (progressContainer) progressContainer.style.display = "block";
          if (statusDot) statusDot.className = "status-dot busy";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2RiLmpzIiwgIi4uL3NyYy9zaWRlcGFuZWwuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9kYi5qc1xuXG5jb25zdCBEQl9OQU1FID0gXCJraXR0ZW4tdHRzLWNhY2hlXCI7XG5jb25zdCBTVE9SRV9OQU1FID0gXCJhdWRpby1ibG9ic1wiO1xuY29uc3QgREJfVkVSU0lPTiA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwsIHByZXByb2Nlc3MgPSB0cnVlKSB7XG4gIGNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcbiAgY29uc3QgZGF0YSA9IGVuY29kZXIuZW5jb2RlKEpTT04uc3RyaW5naWZ5KHsgdjogXCJ2MS4zLjVcIiwgdGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCwgcHJlcHJvY2VzcyB9KSk7XG4gIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0yNTZcIiwgZGF0YSk7XG4gIGNvbnN0IGhhc2hBcnJheSA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcikpO1xuICByZXR1cm4gaGFzaEFycmF5Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSkuam9pbihcIlwiKTtcbn1cblxuZnVuY3Rpb24gb3BlbkRCKCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlcXVlc3QgPSBpbmRleGVkREIub3BlbihEQl9OQU1FLCBEQl9WRVJTSU9OKTtcbiAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9IChlKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSAvKiogQHR5cGUge0lEQlJlcXVlc3R9ICovIChlLnRhcmdldCk7XG4gICAgICBjb25zdCBkYiA9IHRhcmdldC5yZXN1bHQ7XG4gICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoU1RPUkVfTkFNRSkpIHtcbiAgICAgICAgZGIuY3JlYXRlT2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IChlKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSAvKiogQHR5cGUge0lEQlJlcXVlc3R9ICovIChlLnRhcmdldCk7XG4gICAgICByZXNvbHZlKHRhcmdldC5yZXN1bHQpO1xuICAgIH07XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIHJlamVjdCh0YXJnZXQuZXJyb3IpO1xuICAgIH07XG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZUF1ZGlvKGtleSwgYmxvYikge1xuICBjb25zdCBkYiA9IGF3YWl0IG9wZW5EQigpO1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oU1RPUkVfTkFNRSwgXCJyZWFkd3JpdGVcIik7XG4gICAgY29uc3Qgc3RvcmUgPSB0eC5vYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICBjb25zdCByZXF1ZXN0ID0gc3RvcmUucHV0KGJsb2IsIGtleSk7XG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEF1ZGlvKGtleSkge1xuICBjb25zdCBkYiA9IGF3YWl0IG9wZW5EQigpO1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oU1RPUkVfTkFNRSwgXCJyZWFkb25seVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5nZXQoa2V5KTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUocmVxdWVzdC5yZXN1bHQpO1xuICAgIHJlcXVlc3Qub25lcnJvciA9ICgpID0+IHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGVhckF1ZGlvQ2FjaGUoKSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWR3cml0ZVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5jbGVhcigpO1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpO1xuICAgIHJlcXVlc3Qub25lcnJvciA9ICgpID0+IHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgZ2VuZXJhdGVDYWNoZUtleSwgZ2V0QXVkaW8gfSBmcm9tICcuL2RiLmpzJztcblxuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB0aGVtZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdGhlbWVTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGV4dHJhY3RBcnRpY2xlQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNleHRyYWN0QXJ0aWNsZUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgdm9pY2VTZWxlY3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3ZvaWNlU2VsZWN0XCIpO1xuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBtb2RlbFNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjbW9kZWxTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3BlZWRJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc3BlZWRJbnB1dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWRWYWx1ZVwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGF1dG9wbGF5VG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNhdXRvcGxheVRvZ2dsZVwiKTtcbi8qKiBAdHlwZSB7SFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB0ZXh0SW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3RleHRJbnB1dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgY2xlYXJCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2NsZWFyQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwbGF5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNwbGF5QnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdG9wQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzdG9wQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkb3dubG9hZEJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZG93bmxvYWRCdG5cIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0YXR1c0RvdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdHVzRG90XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdGF0dXNUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNUZXh0XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwcm9ncmVzc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NDb250YWluZXJcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHByb2dyZXNzRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NGaWxsXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCByZXNldEdwdUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcmVzZXRHcHVCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGNsZWFyQXVkaW9DYWNoZUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjY2xlYXJBdWRpb0NhY2hlQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBjaGFyQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXJDb3VudFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZ3B1V2FybmluZ0JveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ3B1V2FybmluZ0JveFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZ3B1V2FybmluZ1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImdwdVdhcm5pbmdUZXh0XCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBvcGVuR3B1RGlhZ25vc3RpY3NCdG4gPSAvKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi8gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3BlbkdwdURpYWdub3N0aWNzQnRuXCIpKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgb3BlblN5c3RlbVNldHRpbmdzQnRuID0gLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm9wZW5TeXN0ZW1TZXR0aW5nc0J0blwiKSk7XG5cbmZ1bmN0aW9uIG9wZW5TeXN0ZW1TZXR0aW5ncyhlKSB7XG4gIGU/LnByZXZlbnREZWZhdWx0KCk7XG4gIGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogXCJjaHJvbWU6Ly9zZXR0aW5ncy9zeXN0ZW1cIiB9KTtcbn1cblxub3BlbkdwdURpYWdub3N0aWNzQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IFwiY2hyb21lOi8vZ3B1XCIgfSk7XG59KTtcbm9wZW5TeXN0ZW1TZXR0aW5nc0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIG9wZW5TeXN0ZW1TZXR0aW5ncyk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm9wZW5TeXN0ZW1TZXR0aW5nc0xpbmtcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBvcGVuU3lzdGVtU2V0dGluZ3MpO1xuXG5mdW5jdGlvbiBzaG93R3B1V2FybmluZyhjdXN0b21IdG1sKSB7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgZXJyb3JcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIldlYkdQVSB1bmF2YWlsYWJsZVwiO1xuICBpZiAoZ3B1V2FybmluZ0JveCkgZ3B1V2FybmluZ0JveC5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICBpZiAoZ3B1V2FybmluZ1RleHQgJiYgY3VzdG9tSHRtbCkge1xuICAgIGdwdVdhcm5pbmdUZXh0LmlubmVySFRNTCA9IGN1c3RvbUh0bWw7XG4gICAgLy8gUmUtYmluZCBhbnkgaW5saW5lIGxpbmsgY3JlYXRlZCBpbnNpZGUgZHluYW1pYyBIVE1MXG4gICAgY29uc3QgaW5saW5lTGluayA9IGdwdVdhcm5pbmdCb3g/LnF1ZXJ5U2VsZWN0b3IoXCIjb3BlblN5c3RlbVNldHRpbmdzTGlua1wiKTtcbiAgICBpbmxpbmVMaW5rPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgb3BlblN5c3RlbVNldHRpbmdzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoaWRlR3B1V2FybmluZygpIHtcbiAgaWYgKGdwdVdhcm5pbmdCb3gpIGdwdVdhcm5pbmdCb3guc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAoc3RhdHVzRG90ICYmIHN0YXR1c0RvdC5jbGFzc05hbWUuaW5jbHVkZXMoXCJlcnJvclwiKSkge1xuICAgIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgfVxufVxuXG4vKipcbiAqIEluaXRpYWwgcG9sbCBmb3IgV2ViR1BVIGF2YWlsYWJpbGl0eSBvbiBzaWRlcGFuZWwgbGF1bmNoLlxuICogRGV0ZWN0cyB3aGV0aGVyIGhhcmR3YXJlIGdyYXBoaWNzIGFjY2VsZXJhdGlvbiBpcyBlbmFibGVkIG9yIGRpc2FibGVkLlxuICovXG5hc3luYyBmdW5jdGlvbiBwb2xsR3B1QXZhaWxhYmlsaXR5KCkge1xuICBpZiAoIW5hdmlnYXRvci5ncHUpIHtcbiAgICBzaG93R3B1V2FybmluZyhcbiAgICAgICdXZWJHUFUgaXMgbm90IHN1cHBvcnRlZCBieSB5b3VyIGJyb3dzZXIuIFBsZWFzZSB1cGRhdGUgQ2hyb21lIHRvIHYxMTMrIG9yIGNoZWNrIDxrYmQ+Y2hyb21lOi8vZ3B1PC9rYmQ+IGZvciBkZXRhaWxzLidcbiAgICApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgbGV0IGFkYXB0ZXIgPSBhd2FpdCBuYXZpZ2F0b3IuZ3B1LnJlcXVlc3RBZGFwdGVyKCk7XG4gICAgaWYgKCFhZGFwdGVyKSB7XG4gICAgICAvLyBIYXJkd2FyZSBHUFUgbm90IHJldHVybmVkIC0+IGF0dGVtcHQgZmFsbGJhY2sgYWRhcHRlciBjaGVja1xuICAgICAgdHJ5IHtcbiAgICAgICAgYWRhcHRlciA9IGF3YWl0IG5hdmlnYXRvci5ncHUucmVxdWVzdEFkYXB0ZXIoeyBmb3JjZUZhbGxiYWNrQWRhcHRlcjogdHJ1ZSB9KTtcbiAgICAgIH0gY2F0Y2ggKF8pIHt9XG4gICAgfVxuXG4gICAgaWYgKCFhZGFwdGVyKSB7XG4gICAgICBzaG93R3B1V2FybmluZyhcbiAgICAgICAgJ1dlYkdQVSBpcyB1bmF2YWlsYWJsZS4gSGFyZHdhcmUgZ3JhcGhpY3MgYWNjZWxlcmF0aW9uIGFwcGVhcnMgdG8gYmUgZGlzYWJsZWQuIEVuYWJsZSA8c3Ryb25nPlwiVXNlIGdyYXBoaWNzIGFjY2VsZXJhdGlvbiB3aGVuIGF2YWlsYWJsZVwiPC9zdHJvbmc+IGluIDxhIGhyZWY9XCIjXCIgaWQ9XCJvcGVuU3lzdGVtU2V0dGluZ3NMaW5rXCIgY2xhc3M9XCJncHUtaW5saW5lLWxpbmtcIj5jaHJvbWU6Ly9zZXR0aW5ncy9zeXN0ZW0gXHUyMTk3PC9hPiBhbmQgcmVsYXVuY2ggQ2hyb21lLidcbiAgICAgICk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaGlkZUdwdVdhcm5pbmcoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgc2hvd0dwdVdhcm5pbmcoXG4gICAgICBgV2ViR1BVIGFkYXB0ZXIgaW5pdGlhbGl6YXRpb24gZmFpbGVkOiAke2Vyci5tZXNzYWdlfS4gUGxlYXNlIGNoZWNrIDxrYmQ+Y2hyb21lOi8vZ3B1PC9rYmQ+IGZvciBkZXRhaWxzLmBcbiAgICApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vLyBEZWJ1ZyBwYW5lbCBET00gcmVmcyAocG9wdWxhdGVkIGluIHNlY3Rpb24gMTApXG4vKiogQHR5cGUge0hUTUxEZXRhaWxzRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z1BhbmVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1BhbmVsXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1RvZ2dsZVwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwcmVwcm9jZXNzVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNwcmVwcm9jZXNzVG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnTG9nID0gLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi8gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdMb2dcIikpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0VudHJ5Q291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnRW50cnlDb3VudFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdDbGVhckJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDb3B5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z0NvcHlCdG5cIik7XG4vKiogQHR5cGUge0FycmF5PHsgdGFnOiBzdHJpbmcsIGRhdGE6IHVua25vd24sIHRzOiBudW1iZXIgfT59ICovXG5sZXQgZGVidWdFbnRyaWVzID0gW107XG5cbi8vIFV0aWxpdHkgZm9yIGRlYm91bmNpbmdcbmZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHRpbWVvdXQgPSAzMDApIHtcbiAgbGV0IHRpbWVyO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGZ1bmMuYXBwbHkodGhpcywgYXJncyk7IH0sIHRpbWVvdXQpO1xuICB9O1xufVxuXG4vLyAxLiBUaGVtZSBNYW5hZ2VtZW50XG5mdW5jdGlvbiBhcHBseVRoZW1lKHRoZW1lKSB7XG4gIGlmICh0aGVtZSA9PT0gXCJhdXRvXCIpIHtcbiAgICBjb25zdCBpc0RhcmsgPSB3aW5kb3cubWF0Y2hNZWRpYShcIihwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyaylcIikubWF0Y2hlcztcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFxuICAgICAgXCJkYXRhLXRoZW1lXCIsXG4gICAgICBpc0RhcmsgPyBcImRhcmtcIiA6IFwibGlnaHRcIixcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXRoZW1lXCIsIHRoZW1lKTtcbiAgfVxufVxuXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJyZWRUaGVtZVwiLCAoZGF0YSkgPT4ge1xuICBjb25zdCBzYXZlZCA9IGRhdGEucHJlZmVycmVkVGhlbWUgfHwgXCJhdXRvXCI7XG4gIGlmICh0aGVtZVNlbGVjdCkgdGhlbWVTZWxlY3QudmFsdWUgPSBzYXZlZDtcbiAgYXBwbHlUaGVtZShzYXZlZCk7XG59KTtcblxudGhlbWVTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudH0gKi8gKGUudGFyZ2V0KTtcbiAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkVGhlbWU6IHRhcmdldC52YWx1ZSB9KTtcbiAgYXBwbHlUaGVtZSh0YXJnZXQudmFsdWUpO1xufSk7XG5cbi8vIDIuIExvYWQgU2F2ZWQgUHJlZmVyZW5jZXMgKHZvaWNlLCBtb2RlbCwgc3BlZWQsIHJlbmRlckJlZm9yZVBsYXksIGF1dG9wbGF5KVxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFxuICB7IHByZWZlcnJlZFZvaWNlOiBcIkphc3BlclwiLCBwcmVmZXJyZWRNb2RlbDogXCJuYW5vXCIsIHByZWZlcnJlZFNwZWVkOiBcIjEuMFwiLCByZW5kZXJCZWZvcmVQbGF5OiBmYWxzZSwgYXV0b3BsYXk6IHRydWUgfSxcbiAgYXN5bmMgKGl0ZW1zKSA9PiB7XG4gICAgaWYgKHZvaWNlU2VsZWN0KSB2b2ljZVNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFZvaWNlO1xuICAgIGlmIChtb2RlbFNlbGVjdCkgbW9kZWxTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRNb2RlbDtcbiAgICBpZiAoc3BlZWRJbnB1dCkge1xuICAgICAgc3BlZWRJbnB1dC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFNwZWVkO1xuICAgICAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtpdGVtcy5wcmVmZXJyZWRTcGVlZH14YDtcbiAgICB9XG4gICAgaWYgKHJlbmRlckJlZm9yZVBsYXlUb2dnbGUpIHtcbiAgICAgIHJlbmRlckJlZm9yZVBsYXlUb2dnbGUuY2hlY2tlZCA9IGl0ZW1zLnJlbmRlckJlZm9yZVBsYXk7XG4gICAgfVxuICAgIGlmIChhdXRvcGxheVRvZ2dsZSkge1xuICAgICAgYXV0b3BsYXlUb2dnbGUuY2hlY2tlZCA9IGl0ZW1zLmF1dG9wbGF5O1xuICAgICAgYXV0b3BsYXlUb2dnbGUuZGlzYWJsZWQgPSAhaXRlbXMucmVuZGVyQmVmb3JlUGxheTtcbiAgICB9XG4gICAgY2hlY2tDYWNoZVN0YXR1cygpOyAvLyBJbml0aWFsIGNoZWNrXG5cbiAgICAvLyBUcmlnZ2VyIHByZS13YXJtIHdpdGggdGhlIGNvbmZpcm1lZCBwcmVmZXJyZWRNb2RlbCBPTkxZIGlmIG5vIGFjdGl2ZSBzeW50aGVzaXMvcGxheWJhY2tcbiAgICBjb25zdCBpc0dwdVJlYWR5ID0gYXdhaXQgcG9sbEdwdUF2YWlsYWJpbGl0eSgpO1xuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJFTlNVUkVfT0ZGU0NSRUVOXCIgfSk7XG4gICAgaWYgKGlzR3B1UmVhZHkpIHtcbiAgICAgIGNvbnN0IGFjdGl2ZVN0YXRlID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkdFVF9DVVJSRU5UX1BMQVlCQUNLX1NUQVRFXCIgfSwgKHJlcykgPT4ge1xuICAgICAgICAgIHJlc29sdmUocmVzKTtcbiAgICAgICAgfSk7XG4gICAgICB9KS5jYXRjaCgoKSA9PiBudWxsKTtcblxuICAgICAgaWYgKCFhY3RpdmVTdGF0ZSB8fCBhY3RpdmVTdGF0ZS5zdGF0ZSA9PT0gXCJpZGxlXCIpIHtcbiAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICAgICAgICB0eXBlOiBcIlBSRVdBUk1fTU9ERUxcIixcbiAgICAgICAgICBtb2RlbDogaXRlbXMucHJlZmVycmVkTW9kZWwgfHwgXCJuYW5vXCIsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfSxcbik7XG5cbi8vIDMuIFNhdmUgUHJlZmVyZW5jZXMgb24gQ2hhbmdlXG52b2ljZVNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFZvaWNlOiB2b2ljZVNlbGVjdC52YWx1ZSB9KTtcbiAgY2hlY2tDYWNoZVN0YXR1cygpO1xufSk7XG5cbm1vZGVsU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgY2hvc2VuTW9kZWwgPSBtb2RlbFNlbGVjdC52YWx1ZTtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkTW9kZWw6IGNob3Nlbk1vZGVsIH0pO1xuICBjaGVja0NhY2hlU3RhdHVzKCk7XG4gIGNvbnN0IGlzR3B1UmVhZHkgPSBhd2FpdCBwb2xsR3B1QXZhaWxhYmlsaXR5KCk7XG4gIGlmIChpc0dwdVJlYWR5KSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgICAgdHlwZTogXCJQUkVXQVJNX01PREVMXCIsXG4gICAgICBtb2RlbDogY2hvc2VuTW9kZWwsXG4gICAgfSk7XG4gIH1cbn0pO1xuXG5jb25zdCBzYXZlU3BlZWQgPSBkZWJvdW5jZSgodmFsdWUpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkU3BlZWQ6IHZhbHVlIH0pO1xufSwgNTAwKTtcblxuc3BlZWRJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtzcGVlZElucHV0LnZhbHVlfXhgO1xuICBzYXZlU3BlZWQoc3BlZWRJbnB1dC52YWx1ZSk7XG4gIGNoZWNrQ2FjaGVTdGF0dXMoKTtcbn0pO1xuXG5yZW5kZXJCZWZvcmVQbGF5VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgaWYgKHJlbmRlckJlZm9yZVBsYXlUb2dnbGUpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyByZW5kZXJCZWZvcmVQbGF5OiByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlLmNoZWNrZWQgfSk7XG4gICAgaWYgKGF1dG9wbGF5VG9nZ2xlKSB7XG4gICAgICBhdXRvcGxheVRvZ2dsZS5kaXNhYmxlZCA9ICFyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlLmNoZWNrZWQ7XG4gICAgfVxuICB9XG59KTtcblxuYXV0b3BsYXlUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBpZiAoYXV0b3BsYXlUb2dnbGUpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBhdXRvcGxheTogYXV0b3BsYXlUb2dnbGUuY2hlY2tlZCB9KTtcbiAgfVxufSk7XG5cbi8vIEhlbHBlcnMgZm9yIGNhY2hlIGNoZWNraW5nXG5hc3luYyBmdW5jdGlvbiBnZXRCbG9iRHVyYXRpb24oYmxvYikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xuICAgIGF1ZGlvLnNyYyA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgYXVkaW8ub25sb2FkZWRtZXRhZGF0YSA9ICgpID0+IHtcbiAgICAgIHJlc29sdmUoYXVkaW8uZHVyYXRpb24pO1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChhdWRpby5zcmMpO1xuICAgIH07XG4gICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcbiAgICAgIHJlc29sdmUoMCk7XG4gICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGF1ZGlvLnNyYyk7XG4gICAgfTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdER1cmF0aW9uKHNlY29uZHMpIHtcbiAgaWYgKCFzZWNvbmRzIHx8ICFpc0Zpbml0ZShzZWNvbmRzKSkgcmV0dXJuIFwiMDowMFwiO1xuICBjb25zdCBtID0gTWF0aC5mbG9vcihzZWNvbmRzIC8gNjApO1xuICBjb25zdCBzID0gTWF0aC5mbG9vcihzZWNvbmRzICUgNjApO1xuICByZXR1cm4gYCR7bX06JHtzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX1gO1xufVxuXG5jb25zdCBjaGVja0NhY2hlU3RhdHVzID0gZGVib3VuY2UoYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gKHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCB2b2ljZSA9IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiO1xuICBjb25zdCBzcGVlZCA9IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIik7XG4gIGNvbnN0IG1vZGVsID0gbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiO1xuXG4gIGlmICghdGV4dCkge1xuICAgIGlmIChwbGF5QnRuKSBwbGF5QnRuLnRleHRDb250ZW50ID0gXCJcdTI1QjYgR2VuZXJhdGUgQXVkaW9cIjtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBjYWNoZUtleSA9IGF3YWl0IGdlbmVyYXRlQ2FjaGVLZXkodGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCk7XG4gIGNvbnN0IGNhY2hlZEJsb2IgPSBhd2FpdCBnZXRBdWRpbyhjYWNoZUtleSk7XG5cbiAgaWYgKGNhY2hlZEJsb2IgJiYgcGxheUJ0bikge1xuICAgIGNvbnN0IGR1cmF0aW9uID0gYXdhaXQgZ2V0QmxvYkR1cmF0aW9uKGNhY2hlZEJsb2IpO1xuICAgIHBsYXlCdG4udGV4dENvbnRlbnQgPSBgXHUyNUI2IExpc3RlbiB0byBBdWRpbyAoJHtmb3JtYXREdXJhdGlvbihkdXJhdGlvbil9KWA7XG4gIH0gZWxzZSBpZiAocGxheUJ0bikge1xuICAgIHBsYXlCdG4udGV4dENvbnRlbnQgPSBcIlx1MjVCNiBHZW5lcmF0ZSBBdWRpb1wiO1xuICB9XG59LCAzMDApO1xuXG4vLyA0LiBDaGFyYWN0ZXIgQ291bnQgJiBDbGVhciBJbnB1dFxuZnVuY3Rpb24gdXBkYXRlQ2hhckNvdW50KCkge1xuICBpZiAoY2hhckNvdW50ICYmIHRleHRJbnB1dCkge1xuICAgIGNvbnN0IGxlbiA9IHRleHRJbnB1dC52YWx1ZS5sZW5ndGg7XG4gICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgY2hhckNvdW50LnRleHRDb250ZW50ID0gXCJcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUm91Z2ggZXN0aW1hdGU6IH4yMDAgY2hhcnMgcGVyIGNodW5rXG4gICAgICBjb25zdCBlc3RpbWF0ZWRDaHVua3MgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwobGVuIC8gMjAwKSk7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBgJHtsZW4udG9Mb2NhbGVTdHJpbmcoKX0gY2hhcnMgXHUwMEI3IH4ke2VzdGltYXRlZENodW5rc30gY2h1bmske2VzdGltYXRlZENodW5rcyA+IDEgPyBcInNcIiA6IFwiXCJ9YDtcbiAgICB9XG4gIH1cbn1cblxuY29uc3QgZGVib3VuY2VkVXBkYXRlQ2hhckNvdW50ID0gZGVib3VuY2UodXBkYXRlQ2hhckNvdW50LCAzMDApO1xudGV4dElucHV0Py5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4ge1xuICBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQoKTtcbiAgY2hlY2tDYWNoZVN0YXR1cygpO1xufSk7XG5cbmNsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAodGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gXCJcIjtcbiAgICB0ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgfVxufSk7XG5cbi8vIDUuIE1vZGVsIHByZS13YXJtaW5nIGlzIGNvb3JkaW5hdGVkIGFib3ZlIG9uIHByZWZlcmVuY2UgbG9hZCAmIGRyb3Bkb3duIGNoYW5nZVxuXG4vLyBIZWxwZXIgdG8gc3RhcnQgcGxheWJhY2tcbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0UGxheWJhY2sodGV4dFRvUGxheSkge1xuICBjb25zdCB0ZXh0ID0gKHRleHRUb1BsYXkgfHwgdGV4dElucHV0Py52YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHZvaWNlID0gdm9pY2VTZWxlY3Q/LnZhbHVlIHx8IFwiSmFzcGVyXCI7XG4gIGNvbnN0IHNwZWVkID0gcGFyc2VGbG9hdChzcGVlZElucHV0Py52YWx1ZSB8fCBcIjEuMFwiKTtcbiAgY29uc3QgbW9kZWwgPSBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCI7XG4gIGNvbnN0IHJlbmRlckJlZm9yZVBsYXkgPSByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlPy5jaGVja2VkIHx8IGZhbHNlO1xuICBjb25zdCBhdXRvcGxheSA9IGF1dG9wbGF5VG9nZ2xlPy5jaGVja2VkID8/IHRydWU7XG4gIGNvbnN0IGVuYWJsZVByZXByb2Nlc3NpbmcgPSBwcmVwcm9jZXNzVG9nZ2xlPy5jaGVja2VkID8/IHRydWU7XG5cbiAgaWYgKCF0ZXh0KSB7XG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGVhc2UgZW50ZXIgdGV4dCBvciBleHRyYWN0IGFuIGFydGljbGUuXCI7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgXG4gIGNvbnN0IGNhY2hlS2V5ID0gYXdhaXQgZ2VuZXJhdGVDYWNoZUtleSh0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsLCBlbmFibGVQcmVwcm9jZXNzaW5nKTtcbiAgY29uc3QgY2FjaGVkQmxvYiA9IGF3YWl0IGdldEF1ZGlvKGNhY2hlS2V5KTtcblxuICBpZiAoIWNhY2hlZEJsb2IpIHtcbiAgICBjb25zdCBpc0dwdVJlYWR5ID0gYXdhaXQgcG9sbEdwdUF2YWlsYWJpbGl0eSgpO1xuICAgIGlmICghaXNHcHVSZWFkeSkge1xuICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNhbm5vdCBzeW50aGVzaXplOiBXZWJHUFUgdW5hdmFpbGFibGUuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG5cbiAgaWYgKGNhY2hlZEJsb2IpIHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgICB0eXBlOiBcIlBMQVlfQ0FDSEVEXCIsXG4gICAgICBjYWNoZUtleVxuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICAgIHR5cGU6IFwiUExBWV9URVhUXCIsXG4gICAgICB0ZXh0LFxuICAgICAgdm9pY2UsXG4gICAgICBzcGVlZCxcbiAgICAgIG1vZGVsLFxuICAgICAgY2FjaGVLZXksXG4gICAgICByZW5kZXJCZWZvcmVQbGF5LFxuICAgICAgYXV0b3BsYXksXG4gICAgICBkZWJ1ZzogZGVidWdUb2dnbGU/LmNoZWNrZWQgfHwgZmFsc2UsXG4gICAgICBwcmVwcm9jZXNzOiBlbmFibGVQcmVwcm9jZXNzaW5nXG4gICAgfSk7XG4gIH1cblxuICBpZiAocGxheUJ0bikge1xuICAgIHBsYXlCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIHBsYXlCdG4udGV4dENvbnRlbnQgPSBjYWNoZWRCbG9iID8gXCJcdTI1QjYgUGxheWluZyBBdWRpb1wiIDogXCJcdTIzRjMgR2VuZXJhdGluZy4uLlwiO1xuICB9XG4gIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gIGlmIChkb3dubG9hZEJ0bikgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IFwiMCVcIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGlmIChzdGF0dXNUZXh0KSB7XG4gICAgaWYgKGNhY2hlZEJsb2IpIHtcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsYXlpbmcgY2FjaGVkIGF1ZGlvLi4uXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBhdXRvcGxheSA/IFwiU3ludGhlc2l6aW5nIGFuZCBwbGF5aW5nLi4uXCIgOiBcIkdlbmVyYXRpbmcgYXVkaW8gdG8gY2FjaGUuLi5cIjtcbiAgICB9XG4gIH1cbn1cblxuLy8gNi4gU2NhbiAmIEF1dG8tUGxheSBBcnRpY2xlIEFjdGlvblxuZXh0cmFjdEFydGljbGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJDaGVja2luZyBwYWdlIGFjY2VzcyBwZXJtaXNzaW9ucy4uLlwiO1xuXG4gICAgY29uc3QgZ3JhbnRlZCA9IGF3YWl0IGNocm9tZS5wZXJtaXNzaW9ucy5yZXF1ZXN0KHtcbiAgICAgIG9yaWdpbnM6IFtcImh0dHA6Ly8qLypcIiwgXCJodHRwczovLyovKlwiXSxcbiAgICB9KTtcblxuICAgIGlmICghZ3JhbnRlZCkge1xuICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBlcm1pc3Npb24gZGVuaWVkLiBDYW5ub3Qgc2NhbiBwYWdlLlwiO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiU2Nhbm5pbmcgYWN0aXZlIHRhYiBmb3IgYXJ0aWNsZS4uLlwiO1xuICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuXG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoXG4gICAgICB7IHR5cGU6IFwiRVhUUkFDVF9DVVJSRU5UX1RBQl9BUlRJQ0xFXCIgfSxcbiAgICAgIGFzeW5jIChyZXNwb25zZSkgPT4ge1xuICAgICAgICBpZiAocmVzcG9uc2U/LmVycm9yKSB7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7cmVzcG9uc2UuZXJyb3J9YDtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlPy5hcnRpY2xlPy50ZXh0KSB7XG4gICAgICAgICAgaWYgKHRleHRJbnB1dCkgdGV4dElucHV0LnZhbHVlID0gcmVzcG9uc2UuYXJ0aWNsZS50ZXh0O1xuICAgICAgICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICAgICAgICAgIGNvbnN0IHRpdGxlU25pcHBldCA9XG4gICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlID9cbiAgICAgICAgICAgICAgcmVzcG9uc2UuYXJ0aWNsZS50aXRsZS5zbGljZSgwLCAyNSkgKyBcIi4uLlwiXG4gICAgICAgICAgICA6IFwiQXJ0aWNsZVwiO1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBMb2FkZWQgXCIke3RpdGxlU25pcHBldH1cIi4gUmVhZGluZy4uLmA7XG5cbiAgICAgICAgICAvLyBBdXRvLXBsYXkgaW1tZWRpYXRlbHlcbiAgICAgICAgICBhd2FpdCBzdGFydFBsYXliYWNrKHJlc3BvbnNlLmFydGljbGUudGV4dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID1cbiAgICAgICAgICAgICAgXCJDb3VsZCBub3QgZmluZCBhIHN0cnVjdHVyZWQgYXJ0aWNsZSBvbiB0aGlzIHBhZ2UuXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJFeHRyYWN0aW9uIGVycm9yOlwiLCBlcnIpO1xuICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYEVycm9yOiAke2Vyci5tZXNzYWdlfWA7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICB9XG59KTtcblxuLy8gU3RvcmFnZSBMaXN0ZW5lcnNcbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInR0c1RleHRcIiwgKGRhdGEpID0+IHtcbiAgaWYgKGRhdGEudHRzVGV4dCAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBkYXRhLnR0c1RleHQ7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbmNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgYXJlYSkgPT4ge1xuICBpZiAoYXJlYSA9PT0gXCJsb2NhbFwiICYmIGNoYW5nZXMudHRzVGV4dD8ubmV3VmFsdWUgJiYgdGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gY2hhbmdlcy50dHNUZXh0Lm5ld1ZhbHVlO1xuICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShcInR0c1RleHRcIik7XG4gIH1cbn0pO1xuXG4vLyA3LiBQbGF5ICYgU3RvcCBMaXN0ZW5lcnNcbnBsYXlCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBzdGFydFBsYXliYWNrKCkpO1xuXG5zdG9wQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHRhcmdldDogXCJvZmZzY3JlZW5cIiwgdHlwZTogXCJTVE9QX0FVRElPXCIgfSk7XG4gIHJlc2V0Q29udHJvbHMoXCJTdG9wcGVkLlwiKTtcbn0pO1xuXG5jb25zdCBkb3dubG9hZEFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuZG93bmxvYWRBbmNob3Iuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkb3dubG9hZEFuY2hvcik7XG5cbmRvd25sb2FkQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gKHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCB2b2ljZSA9IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiO1xuICBjb25zdCBzcGVlZCA9IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIik7XG4gIGNvbnN0IG1vZGVsID0gbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiO1xuXG4gIGlmICghdGV4dCkgcmV0dXJuO1xuXG4gIHRyeSB7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlByZXBhcmluZyBkb3dubG9hZC4uLlwiO1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gYXdhaXQgZ2VuZXJhdGVDYWNoZUtleSh0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsKTtcbiAgICBjb25zdCBibG9iID0gYXdhaXQgZ2V0QXVkaW8oY2FjaGVLZXkpO1xuXG4gICAgaWYgKGJsb2IpIHtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBkb3dubG9hZEFuY2hvci5ocmVmID0gdXJsO1xuICAgICAgZG93bmxvYWRBbmNob3IuZG93bmxvYWQgPSBcImtpdHRlbi10dHMtYXVkaW8ud2F2XCI7XG4gICAgICBkb3dubG9hZEFuY2hvci5jbGljaygpO1xuICAgICAgXG4gICAgICAvLyBDbGVhbiB1cCB0aGUgb2JqZWN0IFVSTCBhZnRlciBhIHNob3J0IGRlbGF5XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiRG93bmxvYWQgc3RhcnRlZC5cIjtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkVycm9yOiBBdWRpbyBub3QgZm91bmQgaW4gY2FjaGUuXCI7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBEb3dubG9hZCBFcnJvcjogJHtlcnIubWVzc2FnZX1gO1xuICB9XG59KTtcblxuZnVuY3Rpb24gcmVzZXRDb250cm9scyhzdGF0dXNNc2cpIHtcbiAgaWYgKHBsYXlCdG4pIHBsYXlCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICBpZiAoZ3B1V2FybmluZ0JveCAmJiBncHVXYXJuaW5nQm94LnN0eWxlLmRpc3BsYXkgPT09IFwiYmxvY2tcIikge1xuICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgZXJyb3JcIjtcbiAgfSBlbHNlIHtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBzdGF0dXNNc2c7XG4gIGNoZWNrQ2FjaGVTdGF0dXMoKTtcbn1cblxuLy8gOC4gUHJvZ3Jlc3MgTGlzdGVuZXIgXHUyMDE0IGNvbm5lY3RlZCB2aWEgUG9ydCBmb3IgemVyby1vdmVyaGVhZCByZWxheSBmcm9tIGJhY2tncm91bmRcbihmdW5jdGlvbiBjb25uZWN0VWlQb3J0KCkge1xuICBjb25zdCBwb3J0ID0gY2hyb21lLnJ1bnRpbWUuY29ubmVjdCh7IG5hbWU6IFwidHRzLXVpXCIgfSk7XG4gIHBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKChtc2cpID0+IHtcbiAgICBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1NUQVRFX1NZTkNcIikge1xuICAgICAgaWYgKG1zZy5zdGF0ZSA9PT0gXCJidXN5XCIpIHtcbiAgICAgICAgaWYgKHBsYXlCdG4pIHtcbiAgICAgICAgICBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICBwbGF5QnRuLnRleHRDb250ZW50ID0gXCJcdTIzRjMgR2VuZXJhdGluZy4uLlwiO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gYCR7bXNnLnBlcmNlbnQgfHwgMH0lYDtcbiAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gICAgICAgIGNvbnN0IGNodW5rSW5mbyA9IChtc2cuY3VycmVudCAmJiBtc2cudG90YWwpID8gYCAoY2h1bmsgJHttc2cuY3VycmVudH0vJHttc2cudG90YWx9KWAgOiBcIlwiO1xuICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IG1zZy5zdGF0dXMgfHwgYFN5bnRoZXNpemluZyBhdWRpby4uLiAke21zZy5wZXJjZW50IHx8IDB9JSR7Y2h1bmtJbmZvfWA7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcbiAgICAgICAgaGlkZUdwdVdhcm5pbmcoKTtcbiAgICAgICAgaWYgKHBsYXlCdG4pIHtcbiAgICAgICAgICBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICBwbGF5QnRuLnRleHRDb250ZW50ID0gXCJcdTI1QjYgUGxheWluZyBBdWRpb1wiO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IHBsYXlpbmdcIjtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsYXlpbmcgYXVkaW8uLi5cIjtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19QUk9HUkVTU1wiKSB7XG4gICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGlmIChwbGF5QnRuKSB7XG4gICAgICAgIHBsYXlCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICBwbGF5QnRuLnRleHRDb250ZW50ID0gXCJcdTIzRjMgR2VuZXJhdGluZy4uLlwiO1xuICAgICAgfVxuICAgICAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IGAke21zZy5wZXJjZW50fSVgO1xuICAgICAgICBjb25zdCBjaHVua0luZm8gPSAobXNnLmN1cnJlbnQgJiYgbXNnLnRvdGFsKSA/IGAgKGNodW5rICR7bXNnLmN1cnJlbnR9LyR7bXNnLnRvdGFsfSlgIDogXCJcIjtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgU3ludGhlc2l6aW5nIGF1ZGlvLi4uICR7bXNnLnBlcmNlbnR9JSR7Y2h1bmtJbmZvfWA7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19TVEFUVVNcIikge1xuICAgICAgaWYgKG1zZy5zdGF0ZSA9PT0gXCJpZGxlXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiRmluaXNoZWQgcGxheWluZy5cIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJzdG9wcGVkXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiU3RvcHBlZC5cIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMobXNnLnN0YXR1cyB8fCBcIkVycm9yIG9jY3VycmVkXCIpO1xuICAgICAgICBpZiAobXNnLnN0YXR1cz8uaW5jbHVkZXMoXCJXZWJHUFVcIikgfHwgbXNnLnN0YXR1cz8uaW5jbHVkZXMoXCJjaHJvbWU6Ly9ncHVcIikgfHwgbXNnLnN0YXR1cz8uaW5jbHVkZXMoXCJncmFwaGljcyBhY2NlbGVyYXRpb25cIikpIHtcbiAgICAgICAgICBzaG93R3B1V2FybmluZyhcbiAgICAgICAgICAgICdXZWJHUFUgaXMgdW5hdmFpbGFibGUuIFBsZWFzZSB2ZXJpZnkgPHN0cm9uZz5cIlVzZSBncmFwaGljcyBhY2NlbGVyYXRpb24gd2hlbiBhdmFpbGFibGVcIjwvc3Ryb25nPiBpcyBlbmFibGVkIGluIDxhIGhyZWY9XCIjXCIgaWQ9XCJvcGVuU3lzdGVtU2V0dGluZ3NMaW5rXCIgY2xhc3M9XCJncHUtaW5saW5lLWxpbmtcIj5jaHJvbWU6Ly9zZXR0aW5ncy9zeXN0ZW0gXHUyMTk3PC9hPiBhbmQgcmVsYXVuY2ggQ2hyb21lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcbiAgICAgICAgaGlkZUdwdVdhcm5pbmcoKTtcbiAgICAgICAgaWYgKHBsYXlCdG4pIHtcbiAgICAgICAgICBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICBwbGF5QnRuLnRleHRDb250ZW50ID0gXCJcdTI1QjYgUGxheWluZyBBdWRpb1wiO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxheWluZyBhdWRpby4uLlwiO1xuICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IHBsYXlpbmdcIjtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImJ1c3lcIikge1xuICAgICAgICBpZiAocGxheUJ0bikge1xuICAgICAgICAgIHBsYXlCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICAgIHBsYXlCdG4udGV4dENvbnRlbnQgPSBcIlx1MjNGMyBHZW5lcmF0aW5nLi4uXCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBtc2cuc3RhdHVzO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX0FVRElPX1JFQURZXCIpIHtcbiAgICAgIGlmIChkb3dubG9hZEJ0bikgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGNoZWNrQ2FjaGVTdGF0dXMoKTtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19ERUJVR19MT0dcIikge1xuICAgICAgLy8gQXBwZW5kIHRvIGluLXBhbmVsIGRlYnVnIGxvZyBpZiB0aGUgcGFuZWwgZXhpc3RzXG4gICAgICBpZiAoZGVidWdQYW5lbCAmJiBkZWJ1Z0xvZykge1xuICAgICAgICAvLyBBdXRvLW9wZW4gdGhlIHBhbmVsIG9uIGZpcnN0IGV2ZW50IHJlY2VpdmVkXG4gICAgICAgIGlmICghZGVidWdQYW5lbC5vcGVuICYmIGRlYnVnRW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBkZWJ1Z1BhbmVsLm9wZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGRlYnVnRW50cmllcy5wdXNoKHsgdGFnOiBtc2cudGFnLCBkYXRhOiBtc2cuZGF0YSwgdHM6IG1zZy50cyA/PyBEYXRlLm5vdygpIH0pO1xuICAgICAgICAvLyBLZWVwIGJ1ZmZlciBib3VuZGVkIHRvIDIwMCBlbnRyaWVzXG4gICAgICAgIGlmIChkZWJ1Z0VudHJpZXMubGVuZ3RoID4gMjAwKSBkZWJ1Z0VudHJpZXMuc2hpZnQoKTtcbiAgICAgICAgcmVuZGVyRGVidWdMb2coKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICAvLyBSZWNvbm5lY3QgaWYgdGhlIHNlcnZpY2Ugd29ya2VyIHJlc3RhcnRzIGFuZCBkcm9wcyB0aGUgcG9ydFxuICBwb3J0Lm9uRGlzY29ubmVjdC5hZGRMaXN0ZW5lcigoKSA9PiBzZXRUaW1lb3V0KGNvbm5lY3RVaVBvcnQsIDIwMCkpO1xufSkoKTtcblxuXG4vLyA5LiBSZXNldCBFbmdpbmUgQWN0aW9uXG5yZXNldEdwdUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlJlc2V0dGluZyBHUFUgcHJvY2Vzcy4uLlwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgYXdhaXQgcG9sbEdwdUF2YWlsYWJpbGl0eSgpO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiUkVTRVRfR1BVX09GRlNDUkVFTlwiIH0sIChyZXMpID0+IHtcbiAgICByZXNldENvbnRyb2xzKHJlcz8ubWVzc2FnZSB8fCBcIkVuZ2luZSByZXNldC5cIik7XG4gIH0pO1xufSk7XG5cbmNsZWFyQXVkaW9DYWNoZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNsZWFyaW5nIGF1ZGlvIGNhY2hlLi4uXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiQ0xFQVJfQVVESU9fQ0FDSEVcIiB9LCAocmVzKSA9PiB7XG4gICAgcmVzZXRDb250cm9scyhyZXM/Lm1lc3NhZ2UgfHwgXCJBdWRpbyBjYWNoZSBjbGVhcmVkLlwiKTtcbiAgfSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwIDEwLiBEZWJ1ZyBQYW5lbCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXG4vKiogUmVuZGVyIGFsbCBkZWJ1ZyBlbnRyaWVzIGludG8gdGhlIGxvZyBwcmUgZWxlbWVudCAqL1xuZnVuY3Rpb24gcmVuZGVyRGVidWdMb2coKSB7XG4gIGlmICghZGVidWdMb2cpIHJldHVybjtcbiAgaWYgKGRlYnVnRW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICBkZWJ1Z0xvZy52YWx1ZSA9IFwiLS0gbm8gbG9nIGVudHJpZXMgeWV0IC0tXCI7XG4gICAgaWYgKGRlYnVnRW50cnlDb3VudCkgZGVidWdFbnRyeUNvdW50LnRleHRDb250ZW50ID0gXCIwIGVudHJpZXNcIjtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGRlYnVnRW50cnlDb3VudCkge1xuICAgIGRlYnVnRW50cnlDb3VudC50ZXh0Q29udGVudCA9IGAke2RlYnVnRW50cmllcy5sZW5ndGh9IGVudHIke2RlYnVnRW50cmllcy5sZW5ndGggPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YDtcbiAgfVxuICBkZWJ1Z0xvZy52YWx1ZSA9IGRlYnVnRW50cmllcy5tYXAoKHsgdGFnLCBkYXRhLCB0cyB9KSA9PiB7XG4gICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKHRzKS50b0lTT1N0cmluZygpLnNsaWNlKDExLCAyMyk7IC8vIEhIOm1tOnNzLm1tbVxuICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICByZXR1cm4gYFske3RpbWV9XSAke3RhZ31cXG4ke3BheWxvYWR9YDtcbiAgfSkuam9pbihcIlxcblxcblwiKTtcbiAgLy8gQXV0by1zY3JvbGwgdG8gYm90dG9tXG4gIGRlYnVnTG9nLnNjcm9sbFRvcCA9IGRlYnVnTG9nLnNjcm9sbEhlaWdodDtcbn1cblxuLy8gUmVhZCBpbml0aWFsIGRlYnVnIGZsYWcgYW5kIHByZXByb2Nlc3Npbmcgc3RhdGVcbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbXCJLSVRURU5fREVCVUdcIiwgXCJLSVRURU5fUFJFUFJPQ0VTU1wiXSwgKHJlc3VsdCkgPT4ge1xuICBpZiAoZGVidWdUb2dnbGUpIGRlYnVnVG9nZ2xlLmNoZWNrZWQgPSByZXN1bHQ/LktJVFRFTl9ERUJVRyA9PT0gdHJ1ZTtcbiAgaWYgKHByZXByb2Nlc3NUb2dnbGUpIHByZXByb2Nlc3NUb2dnbGUuY2hlY2tlZCA9IHJlc3VsdD8uS0lUVEVOX1BSRVBST0NFU1MgIT09IGZhbHNlO1xufSk7XG5cbi8vIEtlZXAgdG9nZ2xlcyBpbiBzeW5jIGlmIGNoYW5nZWQgZWxzZXdoZXJlXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgaWYgKGFyZWEgPT09IFwibG9jYWxcIikge1xuICAgIGlmIChcIktJVFRFTl9ERUJVR1wiIGluIGNoYW5nZXMgJiYgZGVidWdUb2dnbGUpIHtcbiAgICAgIGRlYnVnVG9nZ2xlLmNoZWNrZWQgPSBjaGFuZ2VzLktJVFRFTl9ERUJVRy5uZXdWYWx1ZSA9PT0gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKFwiS0lUVEVOX1BSRVBST0NFU1NcIiBpbiBjaGFuZ2VzICYmIHByZXByb2Nlc3NUb2dnbGUpIHtcbiAgICAgIHByZXByb2Nlc3NUb2dnbGUuY2hlY2tlZCA9IGNoYW5nZXMuS0lUVEVOX1BSRVBST0NFU1MubmV3VmFsdWUgIT09IGZhbHNlO1xuICAgIH1cbiAgfVxufSk7XG5cbi8vIFRvZ2dsZSBoYW5kbGVycyBcdTIwMTQgcGVyc2lzdCB0byBzdG9yYWdlIChwaWNrZWQgdXAgYnkgYWxsIGNvbnRleHRzIHZpYSBvbkNoYW5nZWQpXG5kZWJ1Z1RvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IEtJVFRFTl9ERUJVRzogZGVidWdUb2dnbGUuY2hlY2tlZCB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsIHR5cGU6IFwiU0VUX0RFQlVHXCIsIGVuYWJsZWQ6IGRlYnVnVG9nZ2xlLmNoZWNrZWQgfSkuY2F0Y2goKCkgPT4ge30pO1xuICBpZiAoZGVidWdUb2dnbGUuY2hlY2tlZCAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGRlYnVnTG9nKSBkZWJ1Z0xvZy52YWx1ZSA9IFwiLS0gZGVidWcgZW5hYmxlZDogdHJpZ2dlciBhIFBsYXkgdG8gc2VlIGV2ZW50cyAtLVwiO1xuICB9XG59KTtcblxucHJlcHJvY2Vzc1RvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IEtJVFRFTl9QUkVQUk9DRVNTOiBwcmVwcm9jZXNzVG9nZ2xlLmNoZWNrZWQgfSk7XG59KTtcblxuLy8gQ2xlYXIgYnV0dG9uXG5kZWJ1Z0NsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBkZWJ1Z0VudHJpZXMgPSBbXTtcbiAgcmVuZGVyRGVidWdMb2coKTtcbn0pO1xuXG4vLyBDb3B5IGJ1dHRvbiBcdTIwMTQgY29waWVzIHBsYWluIHRleHQgdG8gY2xpcGJvYXJkXG5kZWJ1Z0NvcHlCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpO1xuICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICByZXR1cm4gYFske3RpbWV9XSAke3RhZ31cXG4ke3BheWxvYWR9YDtcbiAgfSkuam9pbihcIlxcblxcblwiKTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0IHx8IFwiLS0gZW1wdHkgLS1cIik7XG4gICAgaWYgKGRlYnVnQ29weUJ0bikge1xuICAgICAgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3BpZWQhXCI7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKGRlYnVnQ29weUJ0bikgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3B5XCI7IH0sIDE1MDApO1xuICAgIH1cbiAgfSBjYXRjaCAoXykge1xuICAgIC8qIGNsaXBib2FyZCBub3QgYXZhaWxhYmxlICovXG4gIH1cbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUVBLE1BQU0sVUFBVTtBQUNoQixNQUFNLGFBQWE7QUFDbkIsTUFBTSxhQUFhO0FBRW5CLGlCQUFzQixpQkFBaUIsTUFBTSxPQUFPLE9BQU8sT0FBTyxhQUFhLE1BQU07QUFDbkYsVUFBTSxVQUFVLElBQUksWUFBWTtBQUNoQyxVQUFNLE9BQU8sUUFBUSxPQUFPLEtBQUssVUFBVSxFQUFFLEdBQUcsVUFBVSxNQUFNLE9BQU8sT0FBTyxPQUFPLFdBQVcsQ0FBQyxDQUFDO0FBQ2xHLFVBQU0sYUFBYSxNQUFNLE9BQU8sT0FBTyxPQUFPLFdBQVcsSUFBSTtBQUM3RCxVQUFNLFlBQVksTUFBTSxLQUFLLElBQUksV0FBVyxVQUFVLENBQUM7QUFDdkQsV0FBTyxVQUFVLElBQUksT0FBSyxFQUFFLFNBQVMsRUFBRSxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUU7QUFBQSxFQUNwRTtBQUVBLFdBQVMsU0FBUztBQUNoQixXQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN0QyxZQUFNLFVBQVUsVUFBVSxLQUFLLFNBQVMsVUFBVTtBQUNsRCxjQUFRLGtCQUFrQixDQUFDLE1BQU07QUFDL0IsY0FBTTtBQUFBO0FBQUEsVUFBb0MsRUFBRTtBQUFBO0FBQzVDLGNBQU0sS0FBSyxPQUFPO0FBQ2xCLFlBQUksQ0FBQyxHQUFHLGlCQUFp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QUksa0JBQWtCLFdBQVcsYUFBYTtBQUM1QyxvQkFBWSxVQUFVLFFBQVEsYUFBYSxhQUFhO0FBQUEsTUFDMUQ7QUFDQSxVQUFJLHVCQUF1QixXQUFXLGtCQUFrQjtBQUN0RCx5QkFBaUIsVUFBVSxRQUFRLGtCQUFrQixhQUFhO0FBQUEsTUFDcEU7QUFBQSxJQUNGO0FBQUEsRUFDRixDQUFDO0FBR0QsZUFBYSxpQkFBaUIsVUFBVSxNQUFNO0FBQzVDLFdBQU8sUUFBUSxNQUFNLElBQUksRUFBRSxjQUFjLFlBQVksUUFBUSxDQUFDO0FBQzlELFdBQU8sUUFBUSxZQUFZLEVBQUUsUUFBUSxhQUFhLE1BQU0sYUFBYSxTQUFTLFlBQVksUUFBUSxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsSUFBQyxDQUFDO0FBQ25ILFFBQUksWUFBWSxXQUFXLGFBQWEsV0FBVyxHQUFHO0FBQ3BELFVBQUksU0FBVSxVQUFTLFFBQVE7QUFBQSxJQUNqQztBQUFBLEVBQ0YsQ0FBQztBQUVELG9CQUFrQixpQkFBaUIsVUFBVSxNQUFNO0FBQ2pELFdBQU8sUUFBUSxNQUFNLElBQUksRUFBRSxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQztBQUFBLEVBQzFFLENBQUM7QUFHRCxpQkFBZSxpQkFBaUIsU0FBUyxNQUFNO0FBQzdDLG1CQUFlLENBQUM7QUFDaEIsbUJBQWU7QUFBQSxFQUNqQixDQUFDO0FBR0QsZ0JBQWMsaUJBQWlCLFNBQVMsWUFBWTtBQUNsRCxVQUFNLE9BQU8sYUFBYSxJQUFJLENBQUMsRUFBRSxLQUFLLE1BQU0sR0FBRyxNQUFNO0FBQ25ELFlBQU0sT0FBTyxJQUFJLEtBQUssRUFBRSxFQUFFLFlBQVksRUFBRSxNQUFNLElBQUksRUFBRTtBQUNwRCxZQUFNLFVBQVUsT0FBTyxTQUFTLFdBQVcsT0FBTyxLQUFLLFVBQVUsTUFBTSxNQUFNLENBQUM7QUFDOUUsYUFBTyxJQUFJLElBQUksS0FBSyxHQUFHO0FBQUEsRUFBSyxPQUFPO0FBQUEsSUFDckMsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUNkLFFBQUk7QUFDRixZQUFNLFVBQVUsVUFBVSxVQUFVLFFBQVEsYUFBYTtBQUN6RCxVQUFJLGNBQWM7QUFDaEIscUJBQWEsY0FBYztBQUMzQixtQkFBVyxNQUFNO0FBQUUsY0FBSSxhQUFjLGNBQWEsY0FBYztBQUFBLFFBQVEsR0FBRyxJQUFJO0FBQUEsTUFDakY7QUFBQSxJQUNGLFNBQVMsR0FBRztBQUFBLElBRVo7QUFBQSxFQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
