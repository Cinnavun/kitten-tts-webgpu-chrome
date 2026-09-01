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
    { preferredVoice: "Jasper", preferredModel: "nano", preferredSpeed: "1.0" },
    (items) => {
      if (voiceSelect) voiceSelect.value = items.preferredVoice;
      if (modelSelect) modelSelect.value = items.preferredModel;
      if (speedInput) {
        speedInput.value = items.preferredSpeed;
        if (speedValue) speedValue.textContent = `${items.preferredSpeed}x`;
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
        cacheKey
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2RiLmpzIiwgIi4uL3NyYy9zaWRlcGFuZWwuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9kYi5qc1xuXG5jb25zdCBEQl9OQU1FID0gXCJraXR0ZW4tdHRzLWNhY2hlXCI7XG5jb25zdCBTVE9SRV9OQU1FID0gXCJhdWRpby1ibG9ic1wiO1xuY29uc3QgREJfVkVSU0lPTiA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpIHtcbiAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuICBjb25zdCBkYXRhID0gZW5jb2Rlci5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoeyB0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsIH0pKTtcbiAgY29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBkYXRhKTtcbiAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gIHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKS5qb2luKFwiXCIpO1xufVxuXG5mdW5jdGlvbiBvcGVuREIoKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IGluZGV4ZWREQi5vcGVuKERCX05BTUUsIERCX1ZFUlNJT04pO1xuICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIGNvbnN0IGRiID0gdGFyZ2V0LnJlc3VsdDtcbiAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucyhTVE9SRV9OQU1FKSkge1xuICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SURCUmVxdWVzdH0gKi8gKGUudGFyZ2V0KTtcbiAgICAgIHJlc29sdmUodGFyZ2V0LnJlc3VsdCk7XG4gICAgfTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtJREJSZXF1ZXN0fSAqLyAoZS50YXJnZXQpO1xuICAgICAgcmVqZWN0KHRhcmdldC5lcnJvcik7XG4gICAgfTtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlQXVkaW8oa2V5LCBibG9iKSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWR3cml0ZVwiKTtcbiAgICBjb25zdCBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5wdXQoYmxvYiwga2V5KTtcbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUodW5kZWZpbmVkKTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QXVkaW8oa2V5KSB7XG4gIGNvbnN0IGRiID0gYXdhaXQgb3BlbkRCKCk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCBcInJlYWRvbmx5XCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmdldChrZXkpO1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBnZW5lcmF0ZUNhY2hlS2V5LCBnZXRBdWRpbyB9IGZyb20gJy4vZGIuanMnO1xuXG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHRoZW1lU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiN0aGVtZVNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZXh0cmFjdEFydGljbGVCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2V4dHJhY3RBcnRpY2xlQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB2b2ljZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdm9pY2VTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IG1vZGVsU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNtb2RlbFNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzcGVlZElucHV0XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZFZhbHVlXCIpO1xuLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHRleHRJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdGV4dElucHV0XCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBjbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjY2xlYXJCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHBsYXlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3BsYXlCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0b3BCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3N0b3BCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRvd25sb2FkQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkb3dubG9hZEJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3RhdHVzRG90ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNEb3RcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0YXR1c1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXR1c1RleHRcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHByb2dyZXNzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0NvbnRhaW5lclwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcHJvZ3Jlc3NGaWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0ZpbGxcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHJlc2V0R3B1QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNyZXNldEdwdUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgY2hhckNvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjaGFyQ291bnRcIik7XG5cbi8vIERlYnVnIHBhbmVsIERPTSByZWZzIChwb3B1bGF0ZWQgaW4gc2VjdGlvbiAxMClcbi8qKiBAdHlwZSB7SFRNTERldGFpbHNFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnUGFuZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2RlYnVnUGFuZWxcIik7XG4vKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2RlYnVnVG9nZ2xlXCIpO1xuLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnTG9nID0gLyoqIEB0eXBlIHtIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbH0gKi8gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdMb2dcIikpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0VudHJ5Q291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnRW50cnlDb3VudFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdDbGVhckJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDb3B5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z0NvcHlCdG5cIik7XG4vKiogQHR5cGUge0FycmF5PHsgdGFnOiBzdHJpbmcsIGRhdGE6IHVua25vd24sIHRzOiBudW1iZXIgfT59ICovXG5sZXQgZGVidWdFbnRyaWVzID0gW107XG5cbi8vIFV0aWxpdHkgZm9yIGRlYm91bmNpbmdcbmZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHRpbWVvdXQgPSAzMDApIHtcbiAgbGV0IHRpbWVyO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGZ1bmMuYXBwbHkodGhpcywgYXJncyk7IH0sIHRpbWVvdXQpO1xuICB9O1xufVxuXG4vLyAxLiBUaGVtZSBNYW5hZ2VtZW50XG5mdW5jdGlvbiBhcHBseVRoZW1lKHRoZW1lKSB7XG4gIGlmICh0aGVtZSA9PT0gXCJhdXRvXCIpIHtcbiAgICBjb25zdCBpc0RhcmsgPSB3aW5kb3cubWF0Y2hNZWRpYShcIihwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyaylcIikubWF0Y2hlcztcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFxuICAgICAgXCJkYXRhLXRoZW1lXCIsXG4gICAgICBpc0RhcmsgPyBcImRhcmtcIiA6IFwibGlnaHRcIixcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXRoZW1lXCIsIHRoZW1lKTtcbiAgfVxufVxuXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJyZWRUaGVtZVwiLCAoZGF0YSkgPT4ge1xuICBjb25zdCBzYXZlZCA9IGRhdGEucHJlZmVycmVkVGhlbWUgfHwgXCJhdXRvXCI7XG4gIGlmICh0aGVtZVNlbGVjdCkgdGhlbWVTZWxlY3QudmFsdWUgPSBzYXZlZDtcbiAgYXBwbHlUaGVtZShzYXZlZCk7XG59KTtcblxudGhlbWVTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudH0gKi8gKGUudGFyZ2V0KTtcbiAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkVGhlbWU6IHRhcmdldC52YWx1ZSB9KTtcbiAgYXBwbHlUaGVtZSh0YXJnZXQudmFsdWUpO1xufSk7XG5cbi8vIDIuIExvYWQgU2F2ZWQgUHJlZmVyZW5jZXMgKHZvaWNlLCBtb2RlbCwgc3BlZWQpXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXG4gIHsgcHJlZmVycmVkVm9pY2U6IFwiSmFzcGVyXCIsIHByZWZlcnJlZE1vZGVsOiBcIm5hbm9cIiwgcHJlZmVycmVkU3BlZWQ6IFwiMS4wXCIgfSxcbiAgKGl0ZW1zKSA9PiB7XG4gICAgaWYgKHZvaWNlU2VsZWN0KSB2b2ljZVNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFZvaWNlO1xuICAgIGlmIChtb2RlbFNlbGVjdCkgbW9kZWxTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRNb2RlbDtcbiAgICBpZiAoc3BlZWRJbnB1dCkge1xuICAgICAgc3BlZWRJbnB1dC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFNwZWVkO1xuICAgICAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtpdGVtcy5wcmVmZXJyZWRTcGVlZH14YDtcbiAgICB9XG4gIH0sXG4pO1xuXG4vLyAzLiBTYXZlIFByZWZlcmVuY2VzIG9uIENoYW5nZVxudm9pY2VTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRWb2ljZTogdm9pY2VTZWxlY3QudmFsdWUgfSk7XG59KTtcblxubW9kZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRNb2RlbDogbW9kZWxTZWxlY3QudmFsdWUgfSk7XG59KTtcblxuY29uc3Qgc2F2ZVNwZWVkID0gZGVib3VuY2UoKHZhbHVlKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFNwZWVkOiB2YWx1ZSB9KTtcbn0sIDUwMCk7XG5cbnNwZWVkSW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7XG4gIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7c3BlZWRJbnB1dC52YWx1ZX14YDtcbiAgc2F2ZVNwZWVkKHNwZWVkSW5wdXQudmFsdWUpO1xufSk7XG5cbi8vIDQuIENoYXJhY3RlciBDb3VudCAmIENsZWFyIElucHV0XG5mdW5jdGlvbiB1cGRhdGVDaGFyQ291bnQoKSB7XG4gIGlmIChjaGFyQ291bnQgJiYgdGV4dElucHV0KSB7XG4gICAgY29uc3QgbGVuID0gdGV4dElucHV0LnZhbHVlLmxlbmd0aDtcbiAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSb3VnaCBlc3RpbWF0ZTogfjIwMCBjaGFycyBwZXIgY2h1bmtcbiAgICAgIGNvbnN0IGVzdGltYXRlZENodW5rcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChsZW4gLyAyMDApKTtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IGAke2xlbi50b0xvY2FsZVN0cmluZygpfSBjaGFycyBcdTAwQjcgfiR7ZXN0aW1hdGVkQ2h1bmtzfSBjaHVuayR7ZXN0aW1hdGVkQ2h1bmtzID4gMSA/IFwic1wiIDogXCJcIn1gO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQgPSBkZWJvdW5jZSh1cGRhdGVDaGFyQ291bnQsIDMwMCk7XG50ZXh0SW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQpO1xuXG5jbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IFwiXCI7XG4gICAgdGV4dElucHV0LmZvY3VzKCk7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gIH1cbn0pO1xuXG4vLyA1LiBTaWxlbnQgUHJlLVdhcm0gb24gUGFuZWwgTG9hZFxuKGFzeW5jICgpID0+IHtcbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICB0eXBlOiBcIlBSRVdBUk1fTU9ERUxcIixcbiAgICBtb2RlbDogbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiLFxuICB9KTtcbn0pKCk7XG5cbi8vIEhlbHBlciB0byBzdGFydCBwbGF5YmFja1xuYXN5bmMgZnVuY3Rpb24gc3RhcnRQbGF5YmFjayh0ZXh0VG9QbGF5KSB7XG4gIGNvbnN0IHRleHQgPSAodGV4dFRvUGxheSB8fCB0ZXh0SW5wdXQ/LnZhbHVlIHx8IFwiXCIpLnRyaW0oKTtcbiAgY29uc3Qgdm9pY2UgPSB2b2ljZVNlbGVjdD8udmFsdWUgfHwgXCJKYXNwZXJcIjtcbiAgY29uc3Qgc3BlZWQgPSBwYXJzZUZsb2F0KHNwZWVkSW5wdXQ/LnZhbHVlIHx8IFwiMS4wXCIpO1xuICBjb25zdCBtb2RlbCA9IG1vZGVsU2VsZWN0Py52YWx1ZSB8fCBcIm5hbm9cIjtcblxuICBpZiAoIXRleHQpIHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsZWFzZSBlbnRlciB0ZXh0IG9yIGV4dHJhY3QgYW4gYXJ0aWNsZS5cIjtcbiAgICByZXR1cm47XG4gIH1cblxuICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiRU5TVVJFX09GRlNDUkVFTlwiIH0pO1xuICBcbiAgY29uc3QgY2FjaGVLZXkgPSBhd2FpdCBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpO1xuICBjb25zdCBjYWNoZWRCbG9iID0gYXdhaXQgZ2V0QXVkaW8oY2FjaGVLZXkpO1xuXG4gIGlmIChjYWNoZWRCbG9iKSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgICAgdHlwZTogXCJQTEFZX0NBQ0hFRFwiLFxuICAgICAgY2FjaGVLZXlcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgICB0eXBlOiBcIlBMQVlfVEVYVFwiLFxuICAgICAgdGV4dCxcbiAgICAgIHZvaWNlLFxuICAgICAgc3BlZWQsXG4gICAgICBtb2RlbCxcbiAgICAgIGNhY2hlS2V5XG4gICAgfSk7XG4gIH1cblxuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gIGlmIChkb3dubG9hZEJ0bikgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IFwiMCVcIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gY2FjaGVkQmxvYiA/IFwiUGxheWluZyBjYWNoZWQgYXVkaW8uLi5cIiA6IFwiU3ludGhlc2l6aW5nIHdpdGggV2ViR1BVLi4uXCI7XG59XG5cbi8vIDYuIFNjYW4gJiBBdXRvLVBsYXkgQXJ0aWNsZSBBY3Rpb25cbmV4dHJhY3RBcnRpY2xlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiQ2hlY2tpbmcgcGFnZSBhY2Nlc3MgcGVybWlzc2lvbnMuLi5cIjtcblxuICAgIGNvbnN0IGdyYW50ZWQgPSBhd2FpdCBjaHJvbWUucGVybWlzc2lvbnMucmVxdWVzdCh7XG4gICAgICBvcmlnaW5zOiBbXCJodHRwOi8vKi8qXCIsIFwiaHR0cHM6Ly8qLypcIl0sXG4gICAgfSk7XG5cbiAgICBpZiAoIWdyYW50ZWQpIHtcbiAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQZXJtaXNzaW9uIGRlbmllZC4gQ2Fubm90IHNjYW4gcGFnZS5cIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlNjYW5uaW5nIGFjdGl2ZSB0YWIgZm9yIGFydGljbGUuLi5cIjtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcblxuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKFxuICAgICAgeyB0eXBlOiBcIkVYVFJBQ1RfQ1VSUkVOVF9UQUJfQVJUSUNMRVwiIH0sXG4gICAgICBhc3luYyAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKHJlc3BvbnNlPy5lcnJvcikge1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYEVycm9yOiAke3Jlc3BvbnNlLmVycm9yfWA7XG4gICAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXNwb25zZT8uYXJ0aWNsZT8udGV4dCkge1xuICAgICAgICAgIGlmICh0ZXh0SW5wdXQpIHRleHRJbnB1dC52YWx1ZSA9IHJlc3BvbnNlLmFydGljbGUudGV4dDtcbiAgICAgICAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICAgICAgICBjb25zdCB0aXRsZVNuaXBwZXQgPVxuICAgICAgICAgICAgcmVzcG9uc2UuYXJ0aWNsZS50aXRsZSA/XG4gICAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUuc2xpY2UoMCwgMjUpICsgXCIuLi5cIlxuICAgICAgICAgICAgOiBcIkFydGljbGVcIjtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgTG9hZGVkIFwiJHt0aXRsZVNuaXBwZXR9XCIuIFJlYWRpbmcuLi5gO1xuXG4gICAgICAgICAgLy8gQXV0by1wbGF5IGltbWVkaWF0ZWx5XG4gICAgICAgICAgYXdhaXQgc3RhcnRQbGF5YmFjayhyZXNwb25zZS5hcnRpY2xlLnRleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9XG4gICAgICAgICAgICAgIFwiQ291bGQgbm90IGZpbmQgYSBzdHJ1Y3R1cmVkIGFydGljbGUgb24gdGhpcyBwYWdlLlwiO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICApO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiRXh0cmFjdGlvbiBlcnJvcjpcIiwgZXJyKTtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtlcnIubWVzc2FnZX1gO1xuICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgfVxufSk7XG5cbi8vIFN0b3JhZ2UgTGlzdGVuZXJzXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJ0dHNUZXh0XCIsIChkYXRhKSA9PiB7XG4gIGlmIChkYXRhLnR0c1RleHQgJiYgdGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gZGF0YS50dHNUZXh0O1xuICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShcInR0c1RleHRcIik7XG4gIH1cbn0pO1xuXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgaWYgKGFyZWEgPT09IFwibG9jYWxcIiAmJiBjaGFuZ2VzLnR0c1RleHQ/Lm5ld1ZhbHVlICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGNoYW5nZXMudHRzVGV4dC5uZXdWYWx1ZTtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuLy8gNy4gUGxheSAmIFN0b3AgTGlzdGVuZXJzXG5wbGF5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gc3RhcnRQbGF5YmFjaygpKTtcblxuc3RvcEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsIHR5cGU6IFwiU1RPUF9BVURJT1wiIH0pO1xuICByZXNldENvbnRyb2xzKFwiU3RvcHBlZC5cIik7XG59KTtcblxuY29uc3QgZG93bmxvYWRBbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbmRvd25sb2FkQW5jaG9yLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZG93bmxvYWRBbmNob3IpO1xuXG5kb3dubG9hZEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgdGV4dCA9ICh0ZXh0SW5wdXQ/LnZhbHVlIHx8IFwiXCIpLnRyaW0oKTtcbiAgY29uc3Qgdm9pY2UgPSB2b2ljZVNlbGVjdD8udmFsdWUgfHwgXCJKYXNwZXJcIjtcbiAgY29uc3Qgc3BlZWQgPSBwYXJzZUZsb2F0KHNwZWVkSW5wdXQ/LnZhbHVlIHx8IFwiMS4wXCIpO1xuICBjb25zdCBtb2RlbCA9IG1vZGVsU2VsZWN0Py52YWx1ZSB8fCBcIm5hbm9cIjtcblxuICBpZiAoIXRleHQpIHJldHVybjtcblxuICB0cnkge1xuICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQcmVwYXJpbmcgZG93bmxvYWQuLi5cIjtcbiAgICBjb25zdCBjYWNoZUtleSA9IGF3YWl0IGdlbmVyYXRlQ2FjaGVLZXkodGV4dCwgdm9pY2UsIHNwZWVkLCBtb2RlbCk7XG4gICAgY29uc3QgYmxvYiA9IGF3YWl0IGdldEF1ZGlvKGNhY2hlS2V5KTtcblxuICAgIGlmIChibG9iKSB7XG4gICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgZG93bmxvYWRBbmNob3IuaHJlZiA9IHVybDtcbiAgICAgIGRvd25sb2FkQW5jaG9yLmRvd25sb2FkID0gXCJraXR0ZW4tdHRzLWF1ZGlvLndhdlwiO1xuICAgICAgZG93bmxvYWRBbmNob3IuY2xpY2soKTtcbiAgICAgIFxuICAgICAgLy8gQ2xlYW4gdXAgdGhlIG9iamVjdCBVUkwgYWZ0ZXIgYSBzaG9ydCBkZWxheVxuICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkRvd25sb2FkIHN0YXJ0ZWQuXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJFcnJvcjogQXVkaW8gbm90IGZvdW5kIGluIGNhY2hlLlwiO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRG93bmxvYWQgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHJlc2V0Q29udHJvbHMoc3RhdHVzTXNnKSB7XG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gZmFsc2U7XG4gIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IFwiMCVcIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IHN0YXR1c01zZztcbn1cblxuLy8gOC4gUHJvZ3Jlc3MgTGlzdGVuZXIgXHUyMDE0IGNvbm5lY3RlZCB2aWEgUG9ydCBmb3IgemVyby1vdmVyaGVhZCByZWxheSBmcm9tIGJhY2tncm91bmRcbihmdW5jdGlvbiBjb25uZWN0VWlQb3J0KCkge1xuICBjb25zdCBwb3J0ID0gY2hyb21lLnJ1bnRpbWUuY29ubmVjdCh7IG5hbWU6IFwidHRzLXVpXCIgfSk7XG4gIHBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKChtc2cpID0+IHtcbiAgICBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1BST0dSRVNTXCIpIHtcbiAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICAgICAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gYCR7bXNnLnBlcmNlbnR9JWA7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYFN5bnRoZXNpemluZyBhdWRpby4uLiAke21zZy5wZXJjZW50fSVgO1xuICAgICAgfSk7XG4gICAgICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1NUQVRVU1wiKSB7XG4gICAgICBpZiAobXNnLnN0YXRlID09PSBcImlkbGVcIikge1xuICAgICAgICByZXNldENvbnRyb2xzKFwiRmluaXNoZWQgcGxheWluZy5cIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJzdG9wcGVkXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhcIlN0b3BwZWQuXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwiZXJyb3JcIikge1xuICAgICAgICByZXNldENvbnRyb2xzKG1zZy5zdGF0dXMgfHwgXCJFcnJvciBvY2N1cnJlZFwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcInBsYXlpbmdcIikge1xuICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxheWluZyBhdWRpby4uLlwiO1xuICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IHBsYXlpbmdcIjtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImJ1c3lcIikge1xuICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IG1zZy5zdGF0dXM7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfQVVESU9fUkVBRFlcIikge1xuICAgICAgaWYgKGRvd25sb2FkQnRuKSBkb3dubG9hZEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX0RFQlVHX0xPR1wiKSB7XG4gICAgICAvLyBBcHBlbmQgdG8gaW4tcGFuZWwgZGVidWcgbG9nIGlmIHRoZSBwYW5lbCBleGlzdHNcbiAgICAgIGlmIChkZWJ1Z1BhbmVsICYmIGRlYnVnTG9nKSB7XG4gICAgICAgIC8vIEF1dG8tb3BlbiB0aGUgcGFuZWwgb24gZmlyc3QgZXZlbnQgcmVjZWl2ZWRcbiAgICAgICAgaWYgKCFkZWJ1Z1BhbmVsLm9wZW4gJiYgZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGRlYnVnUGFuZWwub3BlbiA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZGVidWdFbnRyaWVzLnB1c2goeyB0YWc6IG1zZy50YWcsIGRhdGE6IG1zZy5kYXRhLCB0czogbXNnLnRzID8/IERhdGUubm93KCkgfSk7XG4gICAgICAgIC8vIEtlZXAgYnVmZmVyIGJvdW5kZWQgdG8gMjAwIGVudHJpZXNcbiAgICAgICAgaWYgKGRlYnVnRW50cmllcy5sZW5ndGggPiAyMDApIGRlYnVnRW50cmllcy5zaGlmdCgpO1xuICAgICAgICByZW5kZXJEZWJ1Z0xvZygpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIC8vIFJlY29ubmVjdCBpZiB0aGUgc2VydmljZSB3b3JrZXIgcmVzdGFydHMgYW5kIGRyb3BzIHRoZSBwb3J0XG4gIHBvcnQub25EaXNjb25uZWN0LmFkZExpc3RlbmVyKCgpID0+IHNldFRpbWVvdXQoY29ubmVjdFVpUG9ydCwgMjAwKSk7XG59KSgpO1xuXG5cbi8vIDkuIFJlc2V0IEVuZ2luZSBBY3Rpb25cbnJlc2V0R3B1QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUmVzZXR0aW5nIEdQVSBwcm9jZXNzLi4uXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiUkVTRVRfR1BVX09GRlNDUkVFTlwiIH0sIChyZXMpID0+IHtcbiAgICByZXNldENvbnRyb2xzKHJlcz8ubWVzc2FnZSB8fCBcIkVuZ2luZSByZXNldC5cIik7XG4gIH0pO1xufSk7XG5cblxuLy8gXHUyNTAwXHUyNTAwIDEwLiBEZWJ1ZyBQYW5lbCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXG4vKiogUmVuZGVyIGFsbCBkZWJ1ZyBlbnRyaWVzIGludG8gdGhlIGxvZyBwcmUgZWxlbWVudCAqL1xuZnVuY3Rpb24gcmVuZGVyRGVidWdMb2coKSB7XG4gIGlmICghZGVidWdMb2cpIHJldHVybjtcbiAgaWYgKGRlYnVnRW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICBkZWJ1Z0xvZy52YWx1ZSA9IFwiLS0gbm8gbG9nIGVudHJpZXMgeWV0IC0tXCI7XG4gICAgaWYgKGRlYnVnRW50cnlDb3VudCkgZGVidWdFbnRyeUNvdW50LnRleHRDb250ZW50ID0gXCIwIGVudHJpZXNcIjtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGRlYnVnRW50cnlDb3VudCkge1xuICAgIGRlYnVnRW50cnlDb3VudC50ZXh0Q29udGVudCA9IGAke2RlYnVnRW50cmllcy5sZW5ndGh9IGVudHIke2RlYnVnRW50cmllcy5sZW5ndGggPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YDtcbiAgfVxuICBkZWJ1Z0xvZy52YWx1ZSA9IGRlYnVnRW50cmllcy5tYXAoKHsgdGFnLCBkYXRhLCB0cyB9KSA9PiB7XG4gICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKHRzKS50b0lTT1N0cmluZygpLnNsaWNlKDExLCAyMyk7IC8vIEhIOm1tOnNzLm1tbVxuICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICByZXR1cm4gYFske3RpbWV9XSAke3RhZ31cXG4ke3BheWxvYWR9YDtcbiAgfSkuam9pbihcIlxcblxcblwiKTtcbiAgLy8gQXV0by1zY3JvbGwgdG8gYm90dG9tXG4gIGRlYnVnTG9nLnNjcm9sbFRvcCA9IGRlYnVnTG9nLnNjcm9sbEhlaWdodDtcbn1cblxuLy8gUmVhZCBpbml0aWFsIGRlYnVnIGZsYWcgc3RhdGVcbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcIktJVFRFTl9ERUJVR1wiLCAocmVzdWx0KSA9PiB7XG4gIGlmIChkZWJ1Z1RvZ2dsZSkgZGVidWdUb2dnbGUuY2hlY2tlZCA9IHJlc3VsdD8uS0lUVEVOX0RFQlVHID09PSB0cnVlO1xufSk7XG5cbi8vIEtlZXAgdG9nZ2xlIGluIHN5bmMgaWYgY2hhbmdlZCBlbHNld2hlcmVcbmNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgYXJlYSkgPT4ge1xuICBpZiAoYXJlYSA9PT0gXCJsb2NhbFwiICYmIFwiS0lUVEVOX0RFQlVHXCIgaW4gY2hhbmdlcyAmJiBkZWJ1Z1RvZ2dsZSkge1xuICAgIGRlYnVnVG9nZ2xlLmNoZWNrZWQgPSBjaGFuZ2VzLktJVFRFTl9ERUJVRy5uZXdWYWx1ZSA9PT0gdHJ1ZTtcbiAgfVxufSk7XG5cbi8vIFRvZ2dsZSBoYW5kbGVyIFx1MjAxNCBwZXJzaXN0IHRvIHN0b3JhZ2UgKHBpY2tlZCB1cCBieSBhbGwgY29udGV4dHMgdmlhIG9uQ2hhbmdlZClcbmRlYnVnVG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgS0lUVEVOX0RFQlVHOiBkZWJ1Z1RvZ2dsZS5jaGVja2VkIH0pO1xuICBpZiAoZGVidWdUb2dnbGUuY2hlY2tlZCAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGRlYnVnTG9nKSBkZWJ1Z0xvZy52YWx1ZSA9IFwiLS0gZGVidWcgZW5hYmxlZDogdHJpZ2dlciBhIFBsYXkgdG8gc2VlIGV2ZW50cyAtLVwiO1xuICB9XG59KTtcblxuLy8gQ2xlYXIgYnV0dG9uXG5kZWJ1Z0NsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBkZWJ1Z0VudHJpZXMgPSBbXTtcbiAgcmVuZGVyRGVidWdMb2coKTtcbn0pO1xuXG4vLyBDb3B5IGJ1dHRvbiBcdTIwMTQgY29waWVzIHBsYWluIHRleHQgdG8gY2xpcGJvYXJkXG5kZWJ1Z0NvcHlCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpO1xuICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICByZXR1cm4gYFske3RpbWV9XSAke3RhZ31cXG4ke3BheWxvYWR9YDtcbiAgfSkuam9pbihcIlxcblxcblwiKTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0IHx8IFwiLS0gZW1wdHkgLS1cIik7XG4gICAgaWYgKGRlYnVnQ29weUJ0bikge1xuICAgICAgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3BpZWQhXCI7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKGRlYnVnQ29weUJ0bikgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3B5XCI7IH0sIDE1MDApO1xuICAgIH1cbiAgfSBjYXRjaCAoXykge1xuICAgIC8qIGNsaXBib2FyZCBub3QgYXZhaWxhYmxlICovXG4gIH1cbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUVBLE1BQU0sVUFBVTtBQUNoQixNQUFNLGFBQWE7QUFDbkIsTUFBTSxhQUFhO0FBRW5CLGlCQUFzQixpQkFBaUIsTUFBTSxPQUFPLE9BQU8sT0FBTztBQUNoRSxVQUFNLFVBQVUsSUFBSSxZQUFZO0FBQ2hDLFVBQU0sT0FBTyxRQUFRLE9BQU8sS0FBSyxVQUFVLEVBQUUsTUFBTSxPQUFPLE9BQU8sTUFBTSxDQUFDLENBQUM7QUFDekUsVUFBTSxhQUFhLE1BQU0sT0FBTyxPQUFPLE9BQU8sV0FBVyxJQUFJO0FBQzdELFVBQU0sWUFBWSxNQUFNLEtBQUssSUFBSSxXQUFXLFVBQVUsQ0FBQztBQUN2RCxXQUFPLFVB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
