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
    await chrome.runtime.sendMessage({ type: "ENSURE_OFFSCREEN" });
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PREWARM_MODEL",
      model: modelSelect?.value || "nano"
    });
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
    if (statusDot) statusDot.className = "status-dot";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2RiLmpzIiwgIi4uL3NyYy9zaWRlcGFuZWwuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9kYi5qc1xuXG5jb25zdCBEQl9OQU1FID0gXCJraXR0ZW4tdHRzLWNhY2hlXCI7XG5jb25zdCBTVE9SRV9OQU1FID0gXCJhdWRpby1ibG9ic1wiO1xuY29uc3QgREJfVkVSU0lPTiA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpIHtcbiAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuICBjb25zdCBkYXRhID0gZW5jb2Rlci5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoeyB2OiBcInYxLjMuNVwiLCB0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsIH0pKTtcbiAgY29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBkYXRhKTtcbiAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gIHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKS5qb2luKFwiXCIpO1xufVxuXG5mdW5jdGlvbiBvcGVuREIoKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IGluZGV4ZWREQi5vcGVuKERCX05BTUUsIERCX1ZFUlNJT04pO1xuICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIGNvbnN0IGRiID0gdGFyZ2V0LnJlc3VsdDtcbiAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucyhTVE9SRV9OQU1FKSkge1xuICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIHJlc29sdmUodGFyZ2V0LnJlc3VsdCk7XG4gICAgfTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtJREJSZXF1ZXN0fSAqLyAoZS50YXJnZXQpO1xuICAgICAgcmVqZWN0KHRhcmdldC5lcnJvcik7XG4gICAgfTtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlQXVkaW8oa2V5LCBibG9iKSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWR3cml0ZVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5wdXQoYmxvYiwga2V5KTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUodW5kZWZpbmVkKTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QXVkaW8oa2V5KSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWRvbmx5XCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmdldChrZXkpO1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsZWFyQXVkaW9DYWNoZSgpIHtcbiAgY29uc3QgZGIgPSBhd2FpdCBvcGVuREIoKTtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsIFwicmVhZHdyaXRlXCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmNsZWFyKCk7XG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBnZW5lcmF0ZUNhY2hlS2V5LCBnZXRBdWRpbyB9IGZyb20gJy4vZGIuanMnO1xuXG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHRoZW1lU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiN0aGVtZVNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZXh0cmFjdEFydGljbGVCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2V4dHJhY3RBcnRpY2xlQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB2b2ljZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdm9pY2VTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IG1vZGVsU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNtb2RlbFNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzcGVlZElucHV0XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZFZhbHVlXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHJlbmRlckJlZm9yZVBsYXlUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3JlbmRlckJlZm9yZVBsYXlUb2dnbGVcIik7XG4vKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgYXV0b3BsYXlUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2F1dG9wbGF5VG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHRleHRJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdGV4dElucHV0XCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBjbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjY2xlYXJCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHBsYXlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3BsYXlCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0b3BCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3N0b3BCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRvd25sb2FkQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkb3dubG9hZEJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3RhdHVzRG90ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNEb3RcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0YXR1c1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXR1c1RleHRcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHByb2dyZXNzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0NvbnRhaW5lclwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcHJvZ3Jlc3NGaWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0ZpbGxcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHJlc2V0R3B1QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNyZXNldEdwdUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgY2xlYXJBdWRpb0NhY2hlQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNjbGVhckF1ZGlvQ2FjaGVCdG5cIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGNoYXJDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2hhckNvdW50XCIpO1xuXG4vLyBEZWJ1ZyBwYW5lbCBET00gcmVmcyAocG9wdWxhdGVkIGluIHNlY3Rpb24gMTApXG4vKiogQHR5cGUge0hUTUxEZXRhaWxzRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z1BhbmVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1BhbmVsXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1RvZ2dsZVwiKTtcbi8qKiBAdHlwZSB7SFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0xvZyA9IC8qKiBAdHlwZSB7SFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGx9ICovIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnTG9nXCIpKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdFbnRyeUNvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z0VudHJ5Q291bnRcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnQ2xlYXJCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2RlYnVnQ2xlYXJCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnQ29weUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdDb3B5QnRuXCIpO1xuLyoqIEB0eXBlIHtBcnJheTx7IHRhZzogc3RyaW5nLCBkYXRhOiB1bmtub3duLCB0czogbnVtYmVyIH0+fSAqL1xubGV0IGRlYnVnRW50cmllcyA9IFtdO1xuXG4vLyBVdGlsaXR5IGZvciBkZWJvdW5jaW5nXG5mdW5jdGlvbiBkZWJvdW5jZShmdW5jLCB0aW1lb3V0ID0gMzAwKSB7XG4gIGxldCB0aW1lcjtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBmdW5jLmFwcGx5KHRoaXMsIGFyZ3MpOyB9LCB0aW1lb3V0KTtcbiAgfTtcbn1cblxuLy8gMS4gVGhlbWUgTWFuYWdlbWVudFxuZnVuY3Rpb24gYXBwbHlUaGVtZSh0aGVtZSkge1xuICBpZiAodGhlbWUgPT09IFwiYXV0b1wiKSB7XG4gICAgY29uc3QgaXNEYXJrID0gd2luZG93Lm1hdGNoTWVkaWEoXCIocHJlZmVycy1jb2xvci1zY2hlbWU6IGRhcmspXCIpLm1hdGNoZXM7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZShcbiAgICAgIFwiZGF0YS10aGVtZVwiLFxuICAgICAgaXNEYXJrID8gXCJkYXJrXCIgOiBcImxpZ2h0XCIsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZGF0YS10aGVtZVwiLCB0aGVtZSk7XG4gIH1cbn1cblxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVycmVkVGhlbWVcIiwgKGRhdGEpID0+IHtcbiAgY29uc3Qgc2F2ZWQgPSBkYXRhLnByZWZlcnJlZFRoZW1lIHx8IFwiYXV0b1wiO1xuICBpZiAodGhlbWVTZWxlY3QpIHRoZW1lU2VsZWN0LnZhbHVlID0gc2F2ZWQ7XG4gIGFwcGx5VGhlbWUoc2F2ZWQpO1xufSk7XG5cbnRoZW1lU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIChlKSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnR9ICovIChlLnRhcmdldCk7XG4gIGlmICghdGFyZ2V0KSByZXR1cm47XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFRoZW1lOiB0YXJnZXQudmFsdWUgfSk7XG4gIGFwcGx5VGhlbWUodGFyZ2V0LnZhbHVlKTtcbn0pO1xuXG4vLyAyLiBMb2FkIFNhdmVkIFByZWZlcmVuY2VzICh2b2ljZSwgbW9kZWwsIHNwZWVkLCByZW5kZXJCZWZvcmVQbGF5LCBhdXRvcGxheSlcbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcbiAgeyBwcmVmZXJyZWRWb2ljZTogXCJKYXNwZXJcIiwgcHJlZmVycmVkTW9kZWw6IFwibmFub1wiLCBwcmVmZXJyZWRTcGVlZDogXCIxLjBcIiwgcmVuZGVyQmVmb3JlUGxheTogZmFsc2UsIGF1dG9wbGF5OiB0cnVlIH0sXG4gIChpdGVtcykgPT4ge1xuICAgIGlmICh2b2ljZVNlbGVjdCkgdm9pY2VTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRWb2ljZTtcbiAgICBpZiAobW9kZWxTZWxlY3QpIG1vZGVsU2VsZWN0LnZhbHVlID0gaXRlbXMucHJlZmVycmVkTW9kZWw7XG4gICAgaWYgKHNwZWVkSW5wdXQpIHtcbiAgICAgIHNwZWVkSW5wdXQudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRTcGVlZDtcbiAgICAgIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7aXRlbXMucHJlZmVycmVkU3BlZWR9eGA7XG4gICAgfVxuICAgIGlmIChyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlKSB7XG4gICAgICByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlLmNoZWNrZWQgPSBpdGVtcy5yZW5kZXJCZWZvcmVQbGF5O1xuICAgIH1cbiAgICBpZiAoYXV0b3BsYXlUb2dnbGUpIHtcbiAgICAgIGF1dG9wbGF5VG9nZ2xlLmNoZWNrZWQgPSBpdGVtcy5hdXRvcGxheTtcbiAgICAgIGF1dG9wbGF5VG9nZ2xlLmRpc2FibGVkID0gIWl0ZW1zLnJlbmRlckJlZm9yZVBsYXk7XG4gICAgfVxuICAgIGNoZWNrQ2FjaGVTdGF0dXMoKTsgLy8gSW5pdGlhbCBjaGVja1xuICB9LFxuKTtcblxuLy8gMy4gU2F2ZSBQcmVmZXJlbmNlcyBvbiBDaGFuZ2VcbnZvaWNlU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkVm9pY2U6IHZvaWNlU2VsZWN0LnZhbHVlIH0pO1xuICBjaGVja0NhY2hlU3RhdHVzKCk7XG59KTtcblxubW9kZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRNb2RlbDogbW9kZWxTZWxlY3QudmFsdWUgfSk7XG4gIGNoZWNrQ2FjaGVTdGF0dXMoKTtcbn0pO1xuXG5jb25zdCBzYXZlU3BlZWQgPSBkZWJvdW5jZSgodmFsdWUpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkU3BlZWQ6IHZhbHVlIH0pO1xufSwgNTAwKTtcblxuc3BlZWRJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtzcGVlZElucHV0LnZhbHVlfXhgO1xuICBzYXZlU3BlZWQoc3BlZWRJbnB1dC52YWx1ZSk7XG4gIGNoZWNrQ2FjaGVTdGF0dXMoKTtcbn0pO1xuXG5yZW5kZXJCZWZvcmVQbGF5VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgaWYgKHJlbmRlckJlZm9yZVBsYXlUb2dnbGUpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyByZW5kZXJCZWZvcmVQbGF5OiByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlLmNoZWNrZWQgfSk7XG4gICAgaWYgKGF1dG9wbGF5VG9nZ2xlKSB7XG4gICAgICBhdXRvcGxheVRvZ2dsZS5kaXNhYmxlZCA9ICFyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlLmNoZWNrZWQ7XG4gICAgfVxuICB9XG59KTtcblxuYXV0b3BsYXlUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBpZiAoYXV0b3BsYXlUb2dnbGUpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBhdXRvcGxheTogYXV0b3BsYXlUb2dnbGUuY2hlY2tlZCB9KTtcbiAgfVxufSk7XG5cbi8vIEhlbHBlcnMgZm9yIGNhY2hlIGNoZWNraW5nXG5hc3luYyBmdW5jdGlvbiBnZXRCbG9iRHVyYXRpb24oYmxvYikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xuICAgIGF1ZGlvLnNyYyA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgYXVkaW8ub25sb2FkZWRtZXRhZGF0YSA9ICgpID0+IHtcbiAgICAgIHJlc29sdmUoYXVkaW8uZHVyYXRpb24pO1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChhdWRpby5zcmMpO1xuICAgIH07XG4gICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcbiAgICAgIHJlc29sdmUoMCk7XG4gICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGF1ZGlvLnNyYyk7XG4gICAgfTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdER1cmF0aW9uKHNlY29uZHMpIHtcbiAgaWYgKCFzZWNvbmRzIHx8ICFpc0Zpbml0ZShzZWNvbmRzKSkgcmV0dXJuIFwiMDowMFwiO1xuICBjb25zdCBtID0gTWF0aC5mbG9vcihzZWNvbmRzIC8gNjApO1xuICBjb25zdCBzID0gTWF0aC5mbG9vcihzZWNvbmRzICUgNjApO1xuICByZXR1cm4gYCR7bX06JHtzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX1gO1xufVxuXG5jb25zdCBjaGVja0NhY2hlU3RhdHVzID0gZGVib3VuY2UoYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gKHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCB2b2ljZSA9IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiO1xuICBjb25zdCBzcGVlZCA9IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIik7XG4gIGNvbnN0IG1vZGVsID0gbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiO1xuXG4gIGlmICghdGV4dCkge1xuICAgIGlmIChwbGF5QnRuKSBwbGF5QnRuLnRleHRDb250ZW50ID0gXCJcdTI1QjYgR2VuZXJhdGUgQXVkaW9cIjtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBjYWNoZUtleSA9IGF3YWl0IGdlbmVyYXRlQ2FjaGVLZXkodGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCk7XG4gIGNvbnN0IGNhY2hlZEJsb2IgPSBhd2FpdCBnZXRBdWRpbyhjYWNoZUtleSk7XG5cbiAgaWYgKGNhY2hlZEJsb2IgJiYgcGxheUJ0bikge1xuICAgIGNvbnN0IGR1cmF0aW9uID0gYXdhaXQgZ2V0QmxvYkR1cmF0aW9uKGNhY2hlZEJsb2IpO1xuICAgIHBsYXlCdG4udGV4dENvbnRlbnQgPSBgXHUyNUI2IExpc3RlbiB0byBBdWRpbyAoJHtmb3JtYXREdXJhdGlvbihkdXJhdGlvbil9KWA7XG4gIH0gZWxzZSBpZiAocGxheUJ0bikge1xuICAgIHBsYXlCdG4udGV4dENvbnRlbnQgPSBcIlx1MjVCNiBHZW5lcmF0ZSBBdWRpb1wiO1xuICB9XG59LCAzMDApO1xuXG4vLyA0LiBDaGFyYWN0ZXIgQ291bnQgJiBDbGVhciBJbnB1dFxuZnVuY3Rpb24gdXBkYXRlQ2hhckNvdW50KCkge1xuICBpZiAoY2hhckNvdW50ICYmIHRleHRJbnB1dCkge1xuICAgIGNvbnN0IGxlbiA9IHRleHRJbnB1dC52YWx1ZS5sZW5ndGg7XG4gICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgY2hhckNvdW50LnRleHRDb250ZW50ID0gXCJcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUm91Z2ggZXN0aW1hdGU6IH4yMDAgY2hhcnMgcGVyIGNodW5rXG4gICAgICBjb25zdCBlc3RpbWF0ZWRDaHVua3MgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwobGVuIC8gMjAwKSk7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBgJHtsZW4udG9Mb2NhbGVTdHJpbmcoKX0gY2hhcnMgXHUwMEI3IH4ke2VzdGltYXRlZENodW5rc30gY2h1bmske2VzdGltYXRlZENodW5rcyA+IDEgPyBcInNcIiA6IFwiXCJ9YDtcbiAgICB9XG4gIH1cbn1cblxuY29uc3QgZGVib3VuY2VkVXBkYXRlQ2hhckNvdW50ID0gZGVib3VuY2UodXBkYXRlQ2hhckNvdW50LCAzMDApO1xudGV4dElucHV0Py5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4ge1xuICBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQoKTtcbiAgY2hlY2tDYWNoZVN0YXR1cygpO1xufSk7XG5cbmNsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAodGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gXCJcIjtcbiAgICB0ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgfVxufSk7XG5cbi8vIDUuIFNpbGVudCBQcmUtV2FybSBvbiBQYW5lbCBMb2FkXG4oYXN5bmMgKCkgPT4ge1xuICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiRU5TVVJFX09GRlNDUkVFTlwiIH0pO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgIHR5cGU6IFwiUFJFV0FSTV9NT0RFTFwiLFxuICAgIG1vZGVsOiBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCIsXG4gIH0pO1xufSkoKTtcblxuLy8gSGVscGVyIHRvIHN0YXJ0IHBsYXliYWNrXG5hc3luYyBmdW5jdGlvbiBzdGFydFBsYXliYWNrKHRleHRUb1BsYXkpIHtcbiAgY29uc3QgdGV4dCA9ICh0ZXh0VG9QbGF5IHx8IHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCB2b2ljZSA9IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiO1xuICBjb25zdCBzcGVlZCA9IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIik7XG4gIGNvbnN0IG1vZGVsID0gbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiO1xuICBjb25zdCByZW5kZXJCZWZvcmVQbGF5ID0gcmVuZGVyQmVmb3JlUGxheVRvZ2dsZT8uY2hlY2tlZCB8fCBmYWxzZTtcbiAgY29uc3QgYXV0b3BsYXkgPSBhdXRvcGxheVRvZ2dsZT8uY2hlY2tlZCA/PyB0cnVlO1xuXG4gIGlmICghdGV4dCkge1xuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxlYXNlIGVudGVyIHRleHQgb3IgZXh0cmFjdCBhbiBhcnRpY2xlLlwiO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJFTlNVUkVfT0ZGU0NSRUVOXCIgfSk7XG4gIFxuICBjb25zdCBjYWNoZUtleSA9IGF3YWl0IGdlbmVyYXRlQ2FjaGVLZXkodGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCk7XG4gIGNvbnN0IGNhY2hlZEJsb2IgPSBhd2FpdCBnZXRBdWRpbyhjYWNoZUtleSk7XG5cbiAgaWYgKGNhY2hlZEJsb2IpIHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgICB0eXBlOiBcIlBMQVlfQ0FDSEVEXCIsXG4gICAgICBjYWNoZUtleVxuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICAgIHR5cGU6IFwiUExBWV9URVhUXCIsXG4gICAgICB0ZXh0LFxuICAgICAgdm9pY2UsXG4gICAgICBzcGVlZCxcbiAgICAgIG1vZGVsLFxuICAgICAgY2FjaGVLZXksXG4gICAgICByZW5kZXJCZWZvcmVQbGF5LFxuICAgICAgYXV0b3BsYXksXG4gICAgICBkZWJ1ZzogZGVidWdUb2dnbGU/LmNoZWNrZWQgfHwgZmFsc2VcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgaWYgKGRvd25sb2FkQnRuKSBkb3dubG9hZEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHtcbiAgICBpZiAoY2FjaGVkQmxvYikge1xuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxheWluZyBjYWNoZWQgYXVkaW8uLi5cIjtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGF1dG9wbGF5ID8gXCJTeW50aGVzaXppbmcgYW5kIHBsYXlpbmcuLi5cIiA6IFwiR2VuZXJhdGluZyBhdWRpbyB0byBjYWNoZS4uLlwiO1xuICAgIH1cbiAgfVxufVxuXG4vLyA2LiBTY2FuICYgQXV0by1QbGF5IEFydGljbGUgQWN0aW9uXG5leHRyYWN0QXJ0aWNsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNoZWNraW5nIHBhZ2UgYWNjZXNzIHBlcm1pc3Npb25zLi4uXCI7XG5cbiAgICBjb25zdCBncmFudGVkID0gYXdhaXQgY2hyb21lLnBlcm1pc3Npb25zLnJlcXVlc3Qoe1xuICAgICAgb3JpZ2luczogW1wiaHR0cDovLyovKlwiLCBcImh0dHBzOi8vKi8qXCJdLFxuICAgIH0pO1xuXG4gICAgaWYgKCFncmFudGVkKSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGVybWlzc2lvbiBkZW5pZWQuIENhbm5vdCBzY2FuIHBhZ2UuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJTY2FubmluZyBhY3RpdmUgdGFiIGZvciBhcnRpY2xlLi4uXCI7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG5cbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShcbiAgICAgIHsgdHlwZTogXCJFWFRSQUNUX0NVUlJFTlRfVEFCX0FSVElDTEVcIiB9LFxuICAgICAgYXN5bmMgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChyZXNwb25zZT8uZXJyb3IpIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtyZXNwb25zZS5lcnJvcn1gO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzcG9uc2U/LmFydGljbGU/LnRleHQpIHtcbiAgICAgICAgICBpZiAodGV4dElucHV0KSB0ZXh0SW5wdXQudmFsdWUgPSByZXNwb25zZS5hcnRpY2xlLnRleHQ7XG4gICAgICAgICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgICAgICAgY29uc3QgdGl0bGVTbmlwcGV0ID1cbiAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUgP1xuICAgICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlLnNsaWNlKDAsIDI1KSArIFwiLi4uXCJcbiAgICAgICAgICAgIDogXCJBcnRpY2xlXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYExvYWRlZCBcIiR7dGl0bGVTbmlwcGV0fVwiLiBSZWFkaW5nLi4uYDtcblxuICAgICAgICAgIC8vIEF1dG8tcGxheSBpbW1lZGlhdGVseVxuICAgICAgICAgIGF3YWl0IHN0YXJ0UGxheWJhY2socmVzcG9uc2UuYXJ0aWNsZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPVxuICAgICAgICAgICAgICBcIkNvdWxkIG5vdCBmaW5kIGEgc3RydWN0dXJlZCBhcnRpY2xlIG9uIHRoaXMgcGFnZS5cIjtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkV4dHJhY3Rpb24gZXJyb3I6XCIsIGVycik7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbn0pO1xuXG4vLyBTdG9yYWdlIExpc3RlbmVyc1xuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwidHRzVGV4dFwiLCAoZGF0YSkgPT4ge1xuICBpZiAoZGF0YS50dHNUZXh0ICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudHRzVGV4dDtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgY2hhbmdlcy50dHNUZXh0Py5uZXdWYWx1ZSAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBjaGFuZ2VzLnR0c1RleHQubmV3VmFsdWU7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbi8vIDcuIFBsYXkgJiBTdG9wIExpc3RlbmVyc1xucGxheUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHN0YXJ0UGxheWJhY2soKSk7XG5cbnN0b3BCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNUT1BfQVVESU9cIiB9KTtcbiAgcmVzZXRDb250cm9scyhcIlN0b3BwZWQuXCIpO1xufSk7XG5cbmNvbnN0IGRvd25sb2FkQW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG5kb3dubG9hZEFuY2hvci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRvd25sb2FkQW5jaG9yKTtcblxuZG93bmxvYWRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSAodGV4dElucHV0Py52YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHZvaWNlID0gdm9pY2VTZWxlY3Q/LnZhbHVlIHx8IFwiSmFzcGVyXCI7XG4gIGNvbnN0IHNwZWVkID0gcGFyc2VGbG9hdChzcGVlZElucHV0Py52YWx1ZSB8fCBcIjEuMFwiKTtcbiAgY29uc3QgbW9kZWwgPSBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCI7XG5cbiAgaWYgKCF0ZXh0KSByZXR1cm47XG5cbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUHJlcGFyaW5nIGRvd25sb2FkLi4uXCI7XG4gICAgY29uc3QgY2FjaGVLZXkgPSBhd2FpdCBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpO1xuICAgIGNvbnN0IGJsb2IgPSBhd2FpdCBnZXRBdWRpbyhjYWNoZUtleSk7XG5cbiAgICBpZiAoYmxvYikge1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmhyZWYgPSB1cmw7XG4gICAgICBkb3dubG9hZEFuY2hvci5kb3dubG9hZCA9IFwia2l0dGVuLXR0cy1hdWRpby53YXZcIjtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmNsaWNrKCk7XG4gICAgICBcbiAgICAgIC8vIENsZWFuIHVwIHRoZSBvYmplY3QgVVJMIGFmdGVyIGEgc2hvcnQgZGVsYXlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAxMDAwKTtcbiAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJEb3dubG9hZCBzdGFydGVkLlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiRXJyb3I6IEF1ZGlvIG5vdCBmb3VuZCBpbiBjYWNoZS5cIjtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYERvd25sb2FkIEVycm9yOiAke2Vyci5tZXNzYWdlfWA7XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiByZXNldENvbnRyb2xzKHN0YXR1c01zZykge1xuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBzdGF0dXNNc2c7XG59XG5cbi8vIDguIFByb2dyZXNzIExpc3RlbmVyIFx1MjAxNCBjb25uZWN0ZWQgdmlhIFBvcnQgZm9yIHplcm8tb3ZlcmhlYWQgcmVsYXkgZnJvbSBiYWNrZ3JvdW5kXG4oZnVuY3Rpb24gY29ubmVjdFVpUG9ydCgpIHtcbiAgY29uc3QgcG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3QoeyBuYW1lOiBcInR0cy11aVwiIH0pO1xuICBwb3J0Lm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobXNnKSA9PiB7XG4gICAgaWYgKG1zZy50eXBlID09PSBcIlRUU19QUk9HUkVTU1wiKSB7XG4gICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IGAke21zZy5wZXJjZW50fSVgO1xuICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBTeW50aGVzaXppbmcgYXVkaW8uLi4gJHttc2cucGVyY2VudH0lYDtcbiAgICAgIH0pO1xuICAgICAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19TVEFUVVNcIikge1xuICAgICAgaWYgKG1zZy5zdGF0ZSA9PT0gXCJpZGxlXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiRmluaXNoZWQgcGxheWluZy5cIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJzdG9wcGVkXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiU3RvcHBlZC5cIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMobXNnLnN0YXR1cyB8fCBcIkVycm9yIG9jY3VycmVkXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwicGxheWluZ1wiKSB7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGF5aW5nIGF1ZGlvLi4uXCI7XG4gICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgcGxheWluZ1wiO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwiYnVzeVwiKSB7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gbXNnLnN0YXR1cztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19BVURJT19SRUFEWVwiKSB7XG4gICAgICBpZiAoZG93bmxvYWRCdG4pIGRvd25sb2FkQnRuLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBjaGVja0NhY2hlU3RhdHVzKCk7XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfREVCVUdfTE9HXCIpIHtcbiAgICAgIC8vIEFwcGVuZCB0byBpbi1wYW5lbCBkZWJ1ZyBsb2cgaWYgdGhlIHBhbmVsIGV4aXN0c1xuICAgICAgaWYgKGRlYnVnUGFuZWwgJiYgZGVidWdMb2cpIHtcbiAgICAgICAgLy8gQXV0by1vcGVuIHRoZSBwYW5lbCBvbiBmaXJzdCBldmVudCByZWNlaXZlZFxuICAgICAgICBpZiAoIWRlYnVnUGFuZWwub3BlbiAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgZGVidWdQYW5lbC5vcGVuID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBkZWJ1Z0VudHJpZXMucHVzaCh7IHRhZzogbXNnLnRhZywgZGF0YTogbXNnLmRhdGEsIHRzOiBtc2cudHMgPz8gRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgLy8gS2VlcCBidWZmZXIgYm91bmRlZCB0byAyMDAgZW50cmllc1xuICAgICAgICBpZiAoZGVidWdFbnRyaWVzLmxlbmd0aCA+IDIwMCkgZGVidWdFbnRyaWVzLnNoaWZ0KCk7XG4gICAgICAgIHJlbmRlckRlYnVnTG9nKCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgLy8gUmVjb25uZWN0IGlmIHRoZSBzZXJ2aWNlIHdvcmtlciByZXN0YXJ0cyBhbmQgZHJvcHMgdGhlIHBvcnRcbiAgcG9ydC5vbkRpc2Nvbm5lY3QuYWRkTGlzdGVuZXIoKCkgPT4gc2V0VGltZW91dChjb25uZWN0VWlQb3J0LCAyMDApKTtcbn0pKCk7XG5cblxuLy8gOS4gUmVzZXQgRW5naW5lIEFjdGlvblxucmVzZXRHcHVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJSZXNldHRpbmcgR1BVIHByb2Nlc3MuLi5cIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJSRVNFVF9HUFVfT0ZGU0NSRUVOXCIgfSwgKHJlcykgPT4ge1xuICAgIHJlc2V0Q29udHJvbHMocmVzPy5tZXNzYWdlIHx8IFwiRW5naW5lIHJlc2V0LlwiKTtcbiAgfSk7XG59KTtcblxuY2xlYXJBdWRpb0NhY2hlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiQ2xlYXJpbmcgYXVkaW8gY2FjaGUuLi5cIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJDTEVBUl9BVURJT19DQUNIRVwiIH0sIChyZXMpID0+IHtcbiAgICByZXNldENvbnRyb2xzKHJlcz8ubWVzc2FnZSB8fCBcIkF1ZGlvIGNhY2hlIGNsZWFyZWQuXCIpO1xuICB9KTtcbn0pO1xuXG4vLyBcdTI1MDBcdTI1MDAgMTAuIERlYnVnIFBhbmVsIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cbi8qKiBSZW5kZXIgYWxsIGRlYnVnIGVudHJpZXMgaW50byB0aGUgbG9nIHByZSBlbGVtZW50ICovXG5mdW5jdGlvbiByZW5kZXJEZWJ1Z0xvZygpIHtcbiAgaWYgKCFkZWJ1Z0xvZykgcmV0dXJuO1xuICBpZiAoZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGRlYnVnTG9nLnZhbHVlID0gXCItLSBubyBsb2cgZW50cmllcyB5ZXQgLS1cIjtcbiAgICBpZiAoZGVidWdFbnRyeUNvdW50KSBkZWJ1Z0VudHJ5Q291bnQudGV4dENvbnRlbnQgPSBcIjAgZW50cmllc1wiO1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoZGVidWdFbnRyeUNvdW50KSB7XG4gICAgZGVidWdFbnRyeUNvdW50LnRleHRDb250ZW50ID0gYCR7ZGVidWdFbnRyaWVzLmxlbmd0aH0gZW50ciR7ZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn1gO1xuICB9XG4gIGRlYnVnTG9nLnZhbHVlID0gZGVidWdFbnRyaWVzLm1hcCgoeyB0YWcsIGRhdGEsIHRzIH0pID0+IHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUodHMpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMTEsIDIzKTsgLy8gSEg6bW06c3MubW1tXG4gICAgY29uc3QgcGF5bG9hZCA9IHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiID8gZGF0YSA6IEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDIpO1xuICAgIHJldHVybiBgWyR7dGltZX1dICR7dGFnfVxcbiR7cGF5bG9hZH1gO1xuICB9KS5qb2luKFwiXFxuXFxuXCIpO1xuICAvLyBBdXRvLXNjcm9sbCB0byBib3R0b21cbiAgZGVidWdMb2cuc2Nyb2xsVG9wID0gZGVidWdMb2cuc2Nyb2xsSGVpZ2h0O1xufVxuXG4vLyBSZWFkIGluaXRpYWwgZGVidWcgZmxhZyBzdGF0ZVxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwiS0lUVEVOX0RFQlVHXCIsIChyZXN1bHQpID0+IHtcbiAgaWYgKGRlYnVnVG9nZ2xlKSBkZWJ1Z1RvZ2dsZS5jaGVja2VkID0gcmVzdWx0Py5LSVRURU5fREVCVUcgPT09IHRydWU7XG59KTtcblxuLy8gS2VlcCB0b2dnbGUgaW4gc3luYyBpZiBjaGFuZ2VkIGVsc2V3aGVyZVxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgXCJLSVRURU5fREVCVUdcIiBpbiBjaGFuZ2VzICYmIGRlYnVnVG9nZ2xlKSB7XG4gICAgZGVidWdUb2dnbGUuY2hlY2tlZCA9IGNoYW5nZXMuS0lUVEVOX0RFQlVHLm5ld1ZhbHVlID09PSB0cnVlO1xuICB9XG59KTtcblxuLy8gVG9nZ2xlIGhhbmRsZXIgXHUyMDE0IHBlcnNpc3QgdG8gc3RvcmFnZSAocGlja2VkIHVwIGJ5IGFsbCBjb250ZXh0cyB2aWEgb25DaGFuZ2VkKVxuZGVidWdUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBLSVRURU5fREVCVUc6IGRlYnVnVG9nZ2xlLmNoZWNrZWQgfSk7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNFVF9ERUJVR1wiLCBlbmFibGVkOiBkZWJ1Z1RvZ2dsZS5jaGVja2VkIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgaWYgKGRlYnVnVG9nZ2xlLmNoZWNrZWQgJiYgZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChkZWJ1Z0xvZykgZGVidWdMb2cudmFsdWUgPSBcIi0tIGRlYnVnIGVuYWJsZWQ6IHRyaWdnZXIgYSBQbGF5IHRvIHNlZSBldmVudHMgLS1cIjtcbiAgfVxufSk7XG5cbi8vIENsZWFyIGJ1dHRvblxuZGVidWdDbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgZGVidWdFbnRyaWVzID0gW107XG4gIHJlbmRlckRlYnVnTG9nKCk7XG59KTtcblxuLy8gQ29weSBidXR0b24gXHUyMDE0IGNvcGllcyBwbGFpbiB0ZXh0IHRvIGNsaXBib2FyZFxuZGVidWdDb3B5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gZGVidWdFbnRyaWVzLm1hcCgoeyB0YWcsIGRhdGEsIHRzIH0pID0+IHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUodHMpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMTEsIDIzKTtcbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIHRyeSB7XG4gICAgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGV4dCB8fCBcIi0tIGVtcHR5IC0tXCIpO1xuICAgIGlmIChkZWJ1Z0NvcHlCdG4pIHtcbiAgICAgIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29waWVkIVwiO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGlmIChkZWJ1Z0NvcHlCdG4pIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29weVwiOyB9LCAxNTAwKTtcbiAgICB9XG4gIH0gY2F0Y2ggKF8pIHtcbiAgICAvKiBjbGlwYm9hcmQgbm90IGF2YWlsYWJsZSAqL1xuICB9XG59KTtcblxuIl0sCiAgIm1hcHBp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
