(() => {
  // src/db.js
  var DB_NAME = "kitten-tts-cache";
  var STORE_NAME = "audio-blobs";
  var DB_VERSION = 1;
  async function generateCacheKey(text, voice, speed, model) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ text, voice, speed, model }));
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
    { preferredVoice: "Jasper", preferredModel: "nano", preferredSpeed: "1.0", renderBeforePlay: false },
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
    }
  );
  voiceSelect?.addEventListener("change", () => {
    chrome.storage.local.set({ preferredVoice: voiceSelect.value });
  });
  modelSelect?.addEventListener("change", () => {
    chrome.storage.local.set({ preferredModel: modelSelect.value });
  });
  var saveSpeed = debounce((value) => {
    chrome.storage.local.set({ preferredSpeed: value });
  }, 500);
  speedInput?.addEventListener("input", () => {
    if (speedValue) speedValue.textContent = `${speedInput.value}x`;
    saveSpeed(speedInput.value);
  });
  renderBeforePlayToggle?.addEventListener("change", () => {
    if (renderBeforePlayToggle) {
      chrome.storage.local.set({ renderBeforePlay: renderBeforePlayToggle.checked });
    }
  });
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
  textInput?.addEventListener("input", debouncedUpdateCharCount);
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
        renderBeforePlay
      });
    }
    if (playBtn) playBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    if (downloadBtn) downloadBtn.style.display = "none";
    if (progressContainer) progressContainer.style.display = "block";
    if (progressFill) progressFill.style.width = "0%";
    if (statusDot) statusDot.className = "status-dot busy";
    if (statusText) statusText.textContent = cachedBlob ? "Playing cached audio..." : "Synthesizing with WebGPU...";
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
          resetControls("Finished playing.");
        } else if (msg.state === "stopped") {
          resetControls("Stopped.");
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2RiLmpzIiwgIi4uL3NyYy9zaWRlcGFuZWwuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9kYi5qc1xuXG5jb25zdCBEQl9OQU1FID0gXCJraXR0ZW4tdHRzLWNhY2hlXCI7XG5jb25zdCBTVE9SRV9OQU1FID0gXCJhdWRpby1ibG9ic1wiO1xuY29uc3QgREJfVkVSU0lPTiA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpIHtcbiAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuICBjb25zdCBkYXRhID0gZW5jb2Rlci5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoeyB0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsIH0pKTtcbiAgY29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBkYXRhKTtcbiAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gIHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKS5qb2luKFwiXCIpO1xufVxuXG5mdW5jdGlvbiBvcGVuREIoKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IGluZGV4ZWREQi5vcGVuKERCX05BTUUsIERCX1ZFUlNJT04pO1xuICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIGNvbnN0IGRiID0gdGFyZ2V0LnJlc3VsdDtcbiAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucyhTVE9SRV9OQU1FKSkge1xuICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIHJlc29sdmUodGFyZ2V0LnJlc3VsdCk7XG4gICAgfTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtJREJSZXF1ZXN0fSAqLyAoZS50YXJnZXQpO1xuICAgICAgcmVqZWN0KHRhcmdldC5lcnJvcik7XG4gICAgfTtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlQXVkaW8oa2V5LCBibG9iKSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWR3cml0ZVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5wdXQoYmxvYiwga2V5KTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUodW5kZWZpbmVkKTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QXVkaW8oa2V5KSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWRvbmx5XCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmdldChrZXkpO1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsZWFyQXVkaW9DYWNoZSgpIHtcbiAgY29uc3QgZGIgPSBhd2FpdCBvcGVuREIoKTtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsIFwicmVhZHdyaXRlXCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmNsZWFyKCk7XG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBnZW5lcmF0ZUNhY2hlS2V5LCBnZXRBdWRpbyB9IGZyb20gJy4vZGIuanMnO1xuXG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHRoZW1lU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiN0aGVtZVNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZXh0cmFjdEFydGljbGVCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2V4dHJhY3RBcnRpY2xlQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB2b2ljZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdm9pY2VTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IG1vZGVsU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNtb2RlbFNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzcGVlZElucHV0XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZFZhbHVlXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHJlbmRlckJlZm9yZVBsYXlUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3JlbmRlckJlZm9yZVBsYXlUb2dnbGVcIik7XG4vKiogQHR5cGUge0hUTUxUZXh0QXJlYUVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgdGV4dElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiN0ZXh0SW5wdXRcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNjbGVhckJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcGxheUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcGxheUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3RvcEJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc3RvcEJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZG93bmxvYWRCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2Rvd25sb2FkQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdGF0dXNEb3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXR1c0RvdFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3RhdHVzVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdHVzVGV4dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcHJvZ3Jlc3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ29udGFpbmVyXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwcm9ncmVzc0ZpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzRmlsbFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcmVzZXRHcHVCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3Jlc2V0R3B1QnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBjbGVhckF1ZGlvQ2FjaGVCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2NsZWFyQXVkaW9DYWNoZUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgY2hhckNvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjaGFyQ291bnRcIik7XG5cbi8vIERlYnVnIHBhbmVsIERPTSByZWZzIChwb3B1bGF0ZWQgaW4gc2VjdGlvbiAxMClcbi8qKiBAdHlwZSB7SFRNTERldGFpbHNFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnUGFuZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2RlYnVnUGFuZWxcIik7XG4vKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2RlYnVnVG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnTG9nID0gLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi8gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdMb2dcIikpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0VudHJ5Q291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnRW50cnlDb3VudFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdDbGVhckJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDb3B5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z0NvcHlCdG5cIik7XG4vKiogQHR5cGUge0FycmF5PHsgdGFnOiBzdHJpbmcsIGRhdGE6IHVua25vd24sIHRzOiBudW1iZXIgfT59ICovXG5sZXQgZGVidWdFbnRyaWVzID0gW107XG5cbi8vIFV0aWxpdHkgZm9yIGRlYm91bmNpbmdcbmZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHRpbWVvdXQgPSAzMDApIHtcbiAgbGV0IHRpbWVyO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGZ1bmMuYXBwbHkodGhpcywgYXJncyk7IH0sIHRpbWVvdXQpO1xuICB9O1xufVxuXG4vLyAxLiBUaGVtZSBNYW5hZ2VtZW50XG5mdW5jdGlvbiBhcHBseVRoZW1lKHRoZW1lKSB7XG4gIGlmICh0aGVtZSA9PT0gXCJhdXRvXCIpIHtcbiAgICBjb25zdCBpc0RhcmsgPSB3aW5kb3cubWF0Y2hNZWRpYShcIihwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyaylcIikubWF0Y2hlcztcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFxuICAgICAgXCJkYXRhLXRoZW1lXCIsXG4gICAgICBpc0RhcmsgPyBcImRhcmtcIiA6IFwibGlnaHRcIixcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXRoZW1lXCIsIHRoZW1lKTtcbiAgfVxufVxuXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJyZWRUaGVtZVwiLCAoZGF0YSkgPT4ge1xuICBjb25zdCBzYXZlZCA9IGRhdGEucHJlZmVycmVkVGhlbWUgfHwgXCJhdXRvXCI7XG4gIGlmICh0aGVtZVNlbGVjdCkgdGhlbWVTZWxlY3QudmFsdWUgPSBzYXZlZDtcbiAgYXBwbHlUaGVtZShzYXZlZCk7XG59KTtcblxudGhlbWVTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudH0gKi8gKGUudGFyZ2V0KTtcbiAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkVGhlbWU6IHRhcmdldC52YWx1ZSB9KTtcbiAgYXBwbHlUaGVtZSh0YXJnZXQudmFsdWUpO1xufSk7XG5cbi8vIDIuIExvYWQgU2F2ZWQgUHJlZmVyZW5jZXMgKHZvaWNlLCBtb2RlbCwgc3BlZWQsIHJlbmRlckJlZm9yZVBsYXkpXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXG4gIHsgcHJlZmVycmVkVm9pY2U6IFwiSmFzcGVyXCIsIHByZWZlcnJlZE1vZGVsOiBcIm5hbm9cIiwgcHJlZmVycmVkU3BlZWQ6IFwiMS4wXCIsIHJlbmRlckJlZm9yZVBsYXk6IGZhbHNlIH0sXG4gIChpdGVtcykgPT4ge1xuICAgIGlmICh2b2ljZVNlbGVjdCkgdm9pY2VTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRWb2ljZTtcbiAgICBpZiAobW9kZWxTZWxlY3QpIG1vZGVsU2VsZWN0LnZhbHVlID0gaXRlbXMucHJlZmVycmVkTW9kZWw7XG4gICAgaWYgKHNwZWVkSW5wdXQpIHtcbiAgICAgIHNwZWVkSW5wdXQudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRTcGVlZDtcbiAgICAgIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7aXRlbXMucHJlZmVycmVkU3BlZWR9eGA7XG4gICAgfVxuICAgIGlmIChyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlKSB7XG4gICAgICByZW5kZXJCZWZvcmVQbGF5VG9nZ2xlLmNoZWNrZWQgPSBpdGVtcy5yZW5kZXJCZWZvcmVQbGF5O1xuICAgIH1cbiAgfSxcbik7XG5cbi8vIDMuIFNhdmUgUHJlZmVyZW5jZXMgb24gQ2hhbmdlXG52b2ljZVNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFZvaWNlOiB2b2ljZVNlbGVjdC52YWx1ZSB9KTtcbn0pO1xuXG5tb2RlbFNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZE1vZGVsOiBtb2RlbFNlbGVjdC52YWx1ZSB9KTtcbn0pO1xuXG5jb25zdCBzYXZlU3BlZWQgPSBkZWJvdW5jZSgodmFsdWUpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkU3BlZWQ6IHZhbHVlIH0pO1xufSwgNTAwKTtcblxuc3BlZWRJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtzcGVlZElucHV0LnZhbHVlfXhgO1xuICBzYXZlU3BlZWQoc3BlZWRJbnB1dC52YWx1ZSk7XG59KTtcblxucmVuZGVyQmVmb3JlUGxheVRvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGlmIChyZW5kZXJCZWZvcmVQbGF5VG9nZ2xlKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcmVuZGVyQmVmb3JlUGxheTogcmVuZGVyQmVmb3JlUGxheVRvZ2dsZS5jaGVja2VkIH0pO1xuICB9XG59KTtcblxuLy8gNC4gQ2hhcmFjdGVyIENvdW50ICYgQ2xlYXIgSW5wdXRcbmZ1bmN0aW9uIHVwZGF0ZUNoYXJDb3VudCgpIHtcbiAgaWYgKGNoYXJDb3VudCAmJiB0ZXh0SW5wdXQpIHtcbiAgICBjb25zdCBsZW4gPSB0ZXh0SW5wdXQudmFsdWUubGVuZ3RoO1xuICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJvdWdoIGVzdGltYXRlOiB+MjAwIGNoYXJzIHBlciBjaHVua1xuICAgICAgY29uc3QgZXN0aW1hdGVkQ2h1bmtzID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGxlbiAvIDIwMCkpO1xuICAgICAgY2hhckNvdW50LnRleHRDb250ZW50ID0gYCR7bGVuLnRvTG9jYWxlU3RyaW5nKCl9IGNoYXJzIFx1MDBCNyB+JHtlc3RpbWF0ZWRDaHVua3N9IGNodW5rJHtlc3RpbWF0ZWRDaHVua3MgPiAxID8gXCJzXCIgOiBcIlwifWA7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGRlYm91bmNlZFVwZGF0ZUNoYXJDb3VudCA9IGRlYm91bmNlKHVwZGF0ZUNoYXJDb3VudCwgMzAwKTtcbnRleHRJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIGRlYm91bmNlZFVwZGF0ZUNoYXJDb3VudCk7XG5cbmNsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAodGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gXCJcIjtcbiAgICB0ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgfVxufSk7XG5cbi8vIDUuIFNpbGVudCBQcmUtV2FybSBvbiBQYW5lbCBMb2FkXG4oYXN5bmMgKCkgPT4ge1xuICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiRU5TVVJFX09GRlNDUkVFTlwiIH0pO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgIHR5cGU6IFwiUFJFV0FSTV9NT0RFTFwiLFxuICAgIG1vZGVsOiBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCIsXG4gIH0pO1xufSkoKTtcblxuLy8gSGVscGVyIHRvIHN0YXJ0IHBsYXliYWNrXG5hc3luYyBmdW5jdGlvbiBzdGFydFBsYXliYWNrKHRleHRUb1BsYXkpIHtcbiAgY29uc3QgdGV4dCA9ICh0ZXh0VG9QbGF5IHx8IHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCB2b2ljZSA9IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiO1xuICBjb25zdCBzcGVlZCA9IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIik7XG4gIGNvbnN0IG1vZGVsID0gbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiO1xuICBjb25zdCByZW5kZXJCZWZvcmVQbGF5ID0gcmVuZGVyQmVmb3JlUGxheVRvZ2dsZT8uY2hlY2tlZCB8fCBmYWxzZTtcblxuICBpZiAoIXRleHQpIHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsZWFzZSBlbnRlciB0ZXh0IG9yIGV4dHJhY3QgYW4gYXJ0aWNsZS5cIjtcbiAgICByZXR1cm47XG4gIH1cblxuICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiRU5TVVJFX09GRlNDUkVFTlwiIH0pO1xuICBcbiAgY29uc3QgY2FjaGVLZXkgPSBhd2FpdCBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpO1xuICBjb25zdCBjYWNoZWRCbG9iID0gYXdhaXQgZ2V0QXVkaW8oY2FjaGVLZXkpO1xuXG4gIGlmIChjYWNoZWRCbG9iKSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgICAgdHlwZTogXCJQTEFZX0NBQ0hFRFwiLFxuICAgICAgY2FjaGVLZXlcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgICB0eXBlOiBcIlBMQVlfVEVYVFwiLFxuICAgICAgdGV4dCxcbiAgICAgIHZvaWNlLFxuICAgICAgc3BlZWQsXG4gICAgICBtb2RlbCxcbiAgICAgIGNhY2hlS2V5LFxuICAgICAgcmVuZGVyQmVmb3JlUGxheVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKHBsYXlCdG4pIHBsYXlCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoZG93bmxvYWRCdG4pIGRvd25sb2FkQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGNhY2hlZEJsb2IgPyBcIlBsYXlpbmcgY2FjaGVkIGF1ZGlvLi4uXCIgOiBcIlN5bnRoZXNpemluZyB3aXRoIFdlYkdQVS4uLlwiO1xufVxuXG4vLyA2LiBTY2FuICYgQXV0by1QbGF5IEFydGljbGUgQWN0aW9uXG5leHRyYWN0QXJ0aWNsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNoZWNraW5nIHBhZ2UgYWNjZXNzIHBlcm1pc3Npb25zLi4uXCI7XG5cbiAgICBjb25zdCBncmFudGVkID0gYXdhaXQgY2hyb21lLnBlcm1pc3Npb25zLnJlcXVlc3Qoe1xuICAgICAgb3JpZ2luczogW1wiaHR0cDovLyovKlwiLCBcImh0dHBzOi8vKi8qXCJdLFxuICAgIH0pO1xuXG4gICAgaWYgKCFncmFudGVkKSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGVybWlzc2lvbiBkZW5pZWQuIENhbm5vdCBzY2FuIHBhZ2UuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJTY2FubmluZyBhY3RpdmUgdGFiIGZvciBhcnRpY2xlLi4uXCI7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG5cbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShcbiAgICAgIHsgdHlwZTogXCJFWFRSQUNUX0NVUlJFTlRfVEFCX0FSVElDTEVcIiB9LFxuICAgICAgYXN5bmMgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChyZXNwb25zZT8uZXJyb3IpIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtyZXNwb25zZS5lcnJvcn1gO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzcG9uc2U/LmFydGljbGU/LnRleHQpIHtcbiAgICAgICAgICBpZiAodGV4dElucHV0KSB0ZXh0SW5wdXQudmFsdWUgPSByZXNwb25zZS5hcnRpY2xlLnRleHQ7XG4gICAgICAgICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgICAgICAgY29uc3QgdGl0bGVTbmlwcGV0ID1cbiAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUgP1xuICAgICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlLnNsaWNlKDAsIDI1KSArIFwiLi4uXCJcbiAgICAgICAgICAgIDogXCJBcnRpY2xlXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYExvYWRlZCBcIiR7dGl0bGVTbmlwcGV0fVwiLiBSZWFkaW5nLi4uYDtcblxuICAgICAgICAgIC8vIEF1dG8tcGxheSBpbW1lZGlhdGVseVxuICAgICAgICAgIGF3YWl0IHN0YXJ0UGxheWJhY2socmVzcG9uc2UuYXJ0aWNsZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPVxuICAgICAgICAgICAgICBcIkNvdWxkIG5vdCBmaW5kIGEgc3RydWN0dXJlZCBhcnRpY2xlIG9uIHRoaXMgcGFnZS5cIjtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkV4dHJhY3Rpb24gZXJyb3I6XCIsIGVycik7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbn0pO1xuXG4vLyBTdG9yYWdlIExpc3RlbmVyc1xuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwidHRzVGV4dFwiLCAoZGF0YSkgPT4ge1xuICBpZiAoZGF0YS50dHNUZXh0ICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudHRzVGV4dDtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgY2hhbmdlcy50dHNUZXh0Py5uZXdWYWx1ZSAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBjaGFuZ2VzLnR0c1RleHQubmV3VmFsdWU7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbi8vIDcuIFBsYXkgJiBTdG9wIExpc3RlbmVyc1xucGxheUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHN0YXJ0UGxheWJhY2soKSk7XG5cbnN0b3BCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNUT1BfQVVESU9cIiB9KTtcbiAgcmVzZXRDb250cm9scyhcIlN0b3BwZWQuXCIpO1xufSk7XG5cbmNvbnN0IGRvd25sb2FkQW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG5kb3dubG9hZEFuY2hvci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRvd25sb2FkQW5jaG9yKTtcblxuZG93bmxvYWRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSAodGV4dElucHV0Py52YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHZvaWNlID0gdm9pY2VTZWxlY3Q/LnZhbHVlIHx8IFwiSmFzcGVyXCI7XG4gIGNvbnN0IHNwZWVkID0gcGFyc2VGbG9hdChzcGVlZElucHV0Py52YWx1ZSB8fCBcIjEuMFwiKTtcbiAgY29uc3QgbW9kZWwgPSBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCI7XG5cbiAgaWYgKCF0ZXh0KSByZXR1cm47XG5cbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUHJlcGFyaW5nIGRvd25sb2FkLi4uXCI7XG4gICAgY29uc3QgY2FjaGVLZXkgPSBhd2FpdCBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpO1xuICAgIGNvbnN0IGJsb2IgPSBhd2FpdCBnZXRBdWRpbyhjYWNoZUtleSk7XG5cbiAgICBpZiAoYmxvYikge1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmhyZWYgPSB1cmw7XG4gICAgICBkb3dubG9hZEFuY2hvci5kb3dubG9hZCA9IFwia2l0dGVuLXR0cy1hdWRpby53YXZcIjtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmNsaWNrKCk7XG4gICAgICBcbiAgICAgIC8vIENsZWFuIHVwIHRoZSBvYmplY3QgVVJMIGFmdGVyIGEgc2hvcnQgZGVsYXlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAxMDAwKTtcbiAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJEb3dubG9hZCBzdGFydGVkLlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiRXJyb3I6IEF1ZGlvIG5vdCBmb3VuZCBpbiBjYWNoZS5cIjtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYERvd25sb2FkIEVycm9yOiAke2Vyci5tZXNzYWdlfWA7XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiByZXNldENvbnRyb2xzKHN0YXR1c01zZykge1xuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBzdGF0dXNNc2c7XG59XG5cbi8vIDguIFByb2dyZXNzIExpc3RlbmVyIFx1MjAxNCBjb25uZWN0ZWQgdmlhIFBvcnQgZm9yIHplcm8tb3ZlcmhlYWQgcmVsYXkgZnJvbSBiYWNrZ3JvdW5kXG4oZnVuY3Rpb24gY29ubmVjdFVpUG9ydCgpIHtcbiAgY29uc3QgcG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3QoeyBuYW1lOiBcInR0cy11aVwiIH0pO1xuICBwb3J0Lm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobXNnKSA9PiB7XG4gICAgaWYgKG1zZy50eXBlID09PSBcIlRUU19QUk9HUkVTU1wiKSB7XG4gICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IGAke21zZy5wZXJjZW50fSVgO1xuICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBTeW50aGVzaXppbmcgYXVkaW8uLi4gJHttc2cucGVyY2VudH0lYDtcbiAgICAgIH0pO1xuICAgICAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19TVEFUVVNcIikge1xuICAgICAgaWYgKG1zZy5zdGF0ZSA9PT0gXCJpZGxlXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhcIkZpbmlzaGVkIHBsYXlpbmcuXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwic3RvcHBlZFwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMoXCJTdG9wcGVkLlwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImVycm9yXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiRXJyb3Igb2NjdXJyZWRcIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsYXlpbmcgYXVkaW8uLi5cIjtcbiAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBwbGF5aW5nXCI7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJidXN5XCIpIHtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBtc2cuc3RhdHVzO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX0FVRElPX1JFQURZXCIpIHtcbiAgICAgIGlmIChkb3dubG9hZEJ0bikgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19ERUJVR19MT0dcIikge1xuICAgICAgLy8gQXBwZW5kIHRvIGluLXBhbmVsIGRlYnVnIGxvZyBpZiB0aGUgcGFuZWwgZXhpc3RzXG4gICAgICBpZiAoZGVidWdQYW5lbCAmJiBkZWJ1Z0xvZykge1xuICAgICAgICAvLyBBdXRvLW9wZW4gdGhlIHBhbmVsIG9uIGZpcnN0IGV2ZW50IHJlY2VpdmVkXG4gICAgICAgIGlmICghZGVidWdQYW5lbC5vcGVuICYmIGRlYnVnRW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBkZWJ1Z1BhbmVsLm9wZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGRlYnVnRW50cmllcy5wdXNoKHsgdGFnOiBtc2cudGFnLCBkYXRhOiBtc2cuZGF0YSwgdHM6IG1zZy50cyA/PyBEYXRlLm5vdygpIH0pO1xuICAgICAgICAvLyBLZWVwIGJ1ZmZlciBib3VuZGVkIHRvIDIwMCBlbnRyaWVzXG4gICAgICAgIGlmIChkZWJ1Z0VudHJpZXMubGVuZ3RoID4gMjAwKSBkZWJ1Z0VudHJpZXMuc2hpZnQoKTtcbiAgICAgICAgcmVuZGVyRGVidWdMb2coKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICAvLyBSZWNvbm5lY3QgaWYgdGhlIHNlcnZpY2Ugd29ya2VyIHJlc3RhcnRzIGFuZCBkcm9wcyB0aGUgcG9ydFxuICBwb3J0Lm9uRGlzY29ubmVjdC5hZGRMaXN0ZW5lcigoKSA9PiBzZXRUaW1lb3V0KGNvbm5lY3RVaVBvcnQsIDIwMCkpO1xufSkoKTtcblxuXG4vLyA5LiBSZXNldCBFbmdpbmUgQWN0aW9uXG5yZXNldEdwdUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlJlc2V0dGluZyBHUFUgcHJvY2Vzcy4uLlwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIlJFU0VUX0dQVV9PRkZTQ1JFRU5cIiB9LCAocmVzKSA9PiB7XG4gICAgcmVzZXRDb250cm9scyhyZXM/Lm1lc3NhZ2UgfHwgXCJFbmdpbmUgcmVzZXQuXCIpO1xuICB9KTtcbn0pO1xuXG5jbGVhckF1ZGlvQ2FjaGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJDbGVhcmluZyBhdWRpbyBjYWNoZS4uLlwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkNMRUFSX0FVRElPX0NBQ0hFXCIgfSwgKHJlcykgPT4ge1xuICAgIHJlc2V0Q29udHJvbHMocmVzPy5tZXNzYWdlIHx8IFwiQXVkaW8gY2FjaGUgY2xlYXJlZC5cIik7XG4gIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCAxMC4gRGVidWcgUGFuZWwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblxuLyoqIFJlbmRlciBhbGwgZGVidWcgZW50cmllcyBpbnRvIHRoZSBsb2cgcHJlIGVsZW1lbnQgKi9cbmZ1bmN0aW9uIHJlbmRlckRlYnVnTG9nKCkge1xuICBpZiAoIWRlYnVnTG9nKSByZXR1cm47XG4gIGlmIChkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgZGVidWdMb2cudmFsdWUgPSBcIi0tIG5vIGxvZyBlbnRyaWVzIHlldCAtLVwiO1xuICAgIGlmIChkZWJ1Z0VudHJ5Q291bnQpIGRlYnVnRW50cnlDb3VudC50ZXh0Q29udGVudCA9IFwiMCBlbnRyaWVzXCI7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChkZWJ1Z0VudHJ5Q291bnQpIHtcbiAgICBkZWJ1Z0VudHJ5Q291bnQudGV4dENvbnRlbnQgPSBgJHtkZWJ1Z0VudHJpZXMubGVuZ3RofSBlbnRyJHtkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAxID8gXCJ5XCIgOiBcImllc1wifWA7XG4gIH1cbiAgZGVidWdMb2cudmFsdWUgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpOyAvLyBISDptbTpzcy5tbW1cbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIC8vIEF1dG8tc2Nyb2xsIHRvIGJvdHRvbVxuICBkZWJ1Z0xvZy5zY3JvbGxUb3AgPSBkZWJ1Z0xvZy5zY3JvbGxIZWlnaHQ7XG59XG5cbi8vIFJlYWQgaW5pdGlhbCBkZWJ1ZyBmbGFnIHN0YXRlXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJLSVRURU5fREVCVUdcIiwgKHJlc3VsdCkgPT4ge1xuICBpZiAoZGVidWdUb2dnbGUpIGRlYnVnVG9nZ2xlLmNoZWNrZWQgPSByZXN1bHQ/LktJVFRFTl9ERUJVRyA9PT0gdHJ1ZTtcbn0pO1xuXG4vLyBLZWVwIHRvZ2dsZSBpbiBzeW5jIGlmIGNoYW5nZWQgZWxzZXdoZXJlXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgaWYgKGFyZWEgPT09IFwibG9jYWxcIiAmJiBcIktJVFRFTl9ERUJVR1wiIGluIGNoYW5nZXMgJiYgZGVidWdUb2dnbGUpIHtcbiAgICBkZWJ1Z1RvZ2dsZS5jaGVja2VkID0gY2hhbmdlcy5LSVRURU5fREVCVUcubmV3VmFsdWUgPT09IHRydWU7XG4gIH1cbn0pO1xuXG4vLyBUb2dnbGUgaGFuZGxlciBcdTIwMTQgcGVyc2lzdCB0byBzdG9yYWdlIChwaWNrZWQgdXAgYnkgYWxsIGNvbnRleHRzIHZpYSBvbkNoYW5nZWQpXG5kZWJ1Z1RvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IEtJVFRFTl9ERUJVRzogZGVidWdUb2dnbGUuY2hlY2tlZCB9KTtcbiAgaWYgKGRlYnVnVG9nZ2xlLmNoZWNrZWQgJiYgZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChkZWJ1Z0xvZykgZGVidWdMb2cudmFsdWUgPSBcIi0tIGRlYnVnIGVuYWJsZWQ6IHRyaWdnZXIgYSBQbGF5IHRvIHNlZSBldmVudHMgLS1cIjtcbiAgfVxufSk7XG5cbi8vIENsZWFyIGJ1dHRvblxuZGVidWdDbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgZGVidWdFbnRyaWVzID0gW107XG4gIHJlbmRlckRlYnVnTG9nKCk7XG59KTtcblxuLy8gQ29weSBidXR0b24gXHUyMDE0IGNvcGllcyBwbGFpbiB0ZXh0IHRvIGNsaXBib2FyZFxuZGVidWdDb3B5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gZGVidWdFbnRyaWVzLm1hcCgoeyB0YWcsIGRhdGEsIHRzIH0pID0+IHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUodHMpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMTEsIDIzKTtcbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIHRyeSB7XG4gICAgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGV4dCB8fCBcIi0tIGVtcHR5IC0tXCIpO1xuICAgIGlmIChkZWJ1Z0NvcHlCdG4pIHtcbiAgICAgIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29waWVkIVwiO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGlmIChkZWJ1Z0NvcHlCdG4pIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29weVwiOyB9LCAxNTAwKTtcbiAgICB9XG4gIH0gY2F0Y2ggKF8pIHtcbiAgICAvKiBjbGlwYm9hcmQgbm90IGF2YWlsYWJsZSAqL1xuICB9XG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFFQSxNQUFNLFVBQVU7QUFDaEIsTUFBTSxhQUFhO0FBQ25CLE1BQU0sYUFBYTtBQUVuQixpQkFBc0IsaUJBQWlCLE1BQU0sT0FBTyxPQUFPLE9BQU87QUFDaEUsVUFBTSxVQUFVLElBQUksWUFBWTtBQUNoQyxVQUFNLE9BQU8sUUFBUSxPQUFPLEtBQUssVUFBVSxFQUFFLE1BQU0sT0FBTyxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQ3pFLFVBQU0sYUFBYSxNQUFNLE9BQU8sT0FBTyxPQUFPLFdBQVcsSUFBSTtBQUM3RCxVQUFNLFlBQVksTUFBTSxLQUFLLElBQUksV0FBVyxVQUFVLENBQUM7QUFDdkQsV0FBTyxVQUFVLElBQUksT0FBSyxFQUFFLFNBQVMsRUFBRSxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUU7QUFBQSxFQUNwRTtBQUVBLFdBQVMsU0FBUztBQUNoQixXQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN0QyxZQUFNLFVBQVUsVUFBVSxLQUFLLFNBQVMsVUFBVTtBQUNsRCxjQUFRLGtCQUFrQixDQUFDLE1BQU07QUFDL0IsY0FBTTtBQUFBO0FBQUEsVUFBb0MsRUFBRTtBQUFBO0FBQzVDLGNBQU0sS0FBSyxPQUFPO0FBQ2xCLFlBQUksQ0FBQyxHQUFHLGlCQUFpQixTQUFTLFVBQVUsR0FBRztBQUM3QyxhQUFHLGtCQUFrQixVQUFVO0FBQUEsUUFDakM7QUFBQSxNQUNGO0FBQ0EsY0FBUSxZQUFZLENBQUMsTUFBTTtBQUN6QixjQUFNO0FBQUE7QUFBQSxVQUFvQyxFQUFFO0FBQUE7QUFDNUMs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
