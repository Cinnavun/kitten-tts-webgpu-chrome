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
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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
  var debugLog = document.getElementById("debugLog");
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
      debugLog.textContent = "-- no log entries yet --";
      if (debugEntryCount) debugEntryCount.textContent = "0 entries";
      return;
    }
    if (debugEntryCount) {
      debugEntryCount.textContent = `${debugEntries.length} entr${debugEntries.length === 1 ? "y" : "ies"}`;
    }
    debugLog.textContent = debugEntries.map(({ tag, data, ts }) => {
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
      if (debugLog) debugLog.textContent = "-- debug enabled: trigger a Play to see events --";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2RiLmpzIiwgIi4uL3NyYy9zaWRlcGFuZWwuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9kYi5qc1xuXG5jb25zdCBEQl9OQU1FID0gXCJraXR0ZW4tdHRzLWNhY2hlXCI7XG5jb25zdCBTVE9SRV9OQU1FID0gXCJhdWRpby1ibG9ic1wiO1xuY29uc3QgREJfVkVSU0lPTiA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNhY2hlS2V5KHRleHQsIHZvaWNlLCBzcGVlZCwgbW9kZWwpIHtcbiAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuICBjb25zdCBkYXRhID0gZW5jb2Rlci5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoeyB0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsIH0pKTtcbiAgY29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBkYXRhKTtcbiAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gIHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKS5qb2luKFwiXCIpO1xufVxuXG5mdW5jdGlvbiBvcGVuREIoKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IGluZGV4ZWREQi5vcGVuKERCX05BTUUsIERCX1ZFUlNJT04pO1xuICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gKCkgPT4ge1xuICAgICAgY29uc3QgZGIgPSByZXF1ZXN0LnJlc3VsdDtcbiAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucyhTVE9SRV9OQU1FKSkge1xuICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhdmVBdWRpbyhrZXksIGJsb2IpIHtcbiAgY29uc3QgZGIgPSBhd2FpdCBvcGVuREIoKTtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsIFwicmVhZHdyaXRlXCIpO1xuICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLnB1dChibG9iLCBrZXkpO1xuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpO1xuICAgIHJlcXVlc3Qub25lcnJvciA9ICgpID0+IHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRBdWRpbyhrZXkpIHtcbiAgY29uc3QgZGIgPSBhd2FpdCBvcGVuREIoKTtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsIFwicmVhZG9ubHlcIik7XG4gICAgY29uc3Qgc3RvcmUgPSB0eC5vYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICBjb25zdCByZXF1ZXN0ID0gc3RvcmUuZ2V0KGtleSk7XG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKHJlcXVlc3QucmVzdWx0KTtcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gIH0pO1xufVxuIiwgImltcG9ydCB7IGdlbmVyYXRlQ2FjaGVLZXksIGdldEF1ZGlvIH0gZnJvbSAnLi9kYi5qcyc7XG5cbi8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgdGhlbWVTZWxlY3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3RoZW1lU2VsZWN0XCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBleHRyYWN0QXJ0aWNsZUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZXh0cmFjdEFydGljbGVCdG5cIik7XG4vKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHZvaWNlU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiN2b2ljZVNlbGVjdFwiKTtcbi8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgbW9kZWxTZWxlY3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI21vZGVsU2VsZWN0XCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHNwZWVkSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3NwZWVkSW5wdXRcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkVmFsdWVcIik7XG4vKiogQHR5cGUge0hUTUxUZXh0QXJlYUVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgdGV4dElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiN0ZXh0SW5wdXRcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNjbGVhckJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcGxheUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcGxheUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3RvcEJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc3RvcEJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZG93bmxvYWRCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2Rvd25sb2FkQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdGF0dXNEb3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXR1c0RvdFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3RhdHVzVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdHVzVGV4dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcHJvZ3Jlc3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ29udGFpbmVyXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwcm9ncmVzc0ZpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzRmlsbFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgcmVzZXRHcHVCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3Jlc2V0R3B1QnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBjaGFyQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXJDb3VudFwiKTtcblxuLy8gRGVidWcgcGFuZWwgRE9NIHJlZnMgKHBvcHVsYXRlZCBpbiBzZWN0aW9uIDEwKVxuLyoqIEB0eXBlIHtIVE1MRGV0YWlsc0VsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdQYW5lbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdQYW5lbFwiKTtcbi8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z1RvZ2dsZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdUb2dnbGVcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnTG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z0xvZ1wiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdFbnRyeUNvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z0VudHJ5Q291bnRcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnQ2xlYXJCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2RlYnVnQ2xlYXJCdG5cIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnQ29weUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdDb3B5QnRuXCIpO1xuLyoqIEB0eXBlIHtBcnJheTx7IHRhZzogc3RyaW5nLCBkYXRhOiB1bmtub3duLCB0czogbnVtYmVyIH0+fSAqL1xubGV0IGRlYnVnRW50cmllcyA9IFtdO1xuXG4vLyBVdGlsaXR5IGZvciBkZWJvdW5jaW5nXG5mdW5jdGlvbiBkZWJvdW5jZShmdW5jLCB0aW1lb3V0ID0gMzAwKSB7XG4gIGxldCB0aW1lcjtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBmdW5jLmFwcGx5KHRoaXMsIGFyZ3MpOyB9LCB0aW1lb3V0KTtcbiAgfTtcbn1cblxuLy8gMS4gVGhlbWUgTWFuYWdlbWVudFxuZnVuY3Rpb24gYXBwbHlUaGVtZSh0aGVtZSkge1xuICBpZiAodGhlbWUgPT09IFwiYXV0b1wiKSB7XG4gICAgY29uc3QgaXNEYXJrID0gd2luZG93Lm1hdGNoTWVkaWEoXCIocHJlZmVycy1jb2xvci1zY2hlbWU6IGRhcmspXCIpLm1hdGNoZXM7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZShcbiAgICAgIFwiZGF0YS10aGVtZVwiLFxuICAgICAgaXNEYXJrID8gXCJkYXJrXCIgOiBcImxpZ2h0XCIsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZGF0YS10aGVtZVwiLCB0aGVtZSk7XG4gIH1cbn1cblxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVycmVkVGhlbWVcIiwgKGRhdGEpID0+IHtcbiAgY29uc3Qgc2F2ZWQgPSBkYXRhLnByZWZlcnJlZFRoZW1lIHx8IFwiYXV0b1wiO1xuICBpZiAodGhlbWVTZWxlY3QpIHRoZW1lU2VsZWN0LnZhbHVlID0gc2F2ZWQ7XG4gIGFwcGx5VGhlbWUoc2F2ZWQpO1xufSk7XG5cbnRoZW1lU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIChlKSA9PiB7XG4gIGNvbnN0IHRhcmdldCA9IC8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnR9ICovIChlLnRhcmdldCk7XG4gIGlmICghdGFyZ2V0KSByZXR1cm47XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFRoZW1lOiB0YXJnZXQudmFsdWUgfSk7XG4gIGFwcGx5VGhlbWUodGFyZ2V0LnZhbHVlKTtcbn0pO1xuXG4vLyAyLiBMb2FkIFNhdmVkIFByZWZlcmVuY2VzICh2b2ljZSwgbW9kZWwsIHNwZWVkKVxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFxuICB7IHByZWZlcnJlZFZvaWNlOiBcIkphc3BlclwiLCBwcmVmZXJyZWRNb2RlbDogXCJuYW5vXCIsIHByZWZlcnJlZFNwZWVkOiBcIjEuMFwiIH0sXG4gIChpdGVtcykgPT4ge1xuICAgIGlmICh2b2ljZVNlbGVjdCkgdm9pY2VTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRWb2ljZTtcbiAgICBpZiAobW9kZWxTZWxlY3QpIG1vZGVsU2VsZWN0LnZhbHVlID0gaXRlbXMucHJlZmVycmVkTW9kZWw7XG4gICAgaWYgKHNwZWVkSW5wdXQpIHtcbiAgICAgIHNwZWVkSW5wdXQudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRTcGVlZDtcbiAgICAgIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7aXRlbXMucHJlZmVycmVkU3BlZWR9eGA7XG4gICAgfVxuICB9LFxuKTtcblxuLy8gMy4gU2F2ZSBQcmVmZXJlbmNlcyBvbiBDaGFuZ2VcbnZvaWNlU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkVm9pY2U6IHZvaWNlU2VsZWN0LnZhbHVlIH0pO1xufSk7XG5cbm1vZGVsU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkTW9kZWw6IG1vZGVsU2VsZWN0LnZhbHVlIH0pO1xufSk7XG5cbmNvbnN0IHNhdmVTcGVlZCA9IGRlYm91bmNlKCh2YWx1ZSkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRTcGVlZDogdmFsdWUgfSk7XG59LCA1MDApO1xuXG5zcGVlZElucHV0Py5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4ge1xuICBpZiAoc3BlZWRWYWx1ZSkgc3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke3NwZWVkSW5wdXQudmFsdWV9eGA7XG4gIHNhdmVTcGVlZChzcGVlZElucHV0LnZhbHVlKTtcbn0pO1xuXG4vLyA0LiBDaGFyYWN0ZXIgQ291bnQgJiBDbGVhciBJbnB1dFxuZnVuY3Rpb24gdXBkYXRlQ2hhckNvdW50KCkge1xuICBpZiAoY2hhckNvdW50ICYmIHRleHRJbnB1dCkge1xuICAgIGNvbnN0IGxlbiA9IHRleHRJbnB1dC52YWx1ZS5sZW5ndGg7XG4gICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgY2hhckNvdW50LnRleHRDb250ZW50ID0gXCJcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUm91Z2ggZXN0aW1hdGU6IH4yMDAgY2hhcnMgcGVyIGNodW5rXG4gICAgICBjb25zdCBlc3RpbWF0ZWRDaHVua3MgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwobGVuIC8gMjAwKSk7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBgJHtsZW4udG9Mb2NhbGVTdHJpbmcoKX0gY2hhcnMgXHUwMEI3IH4ke2VzdGltYXRlZENodW5rc30gY2h1bmske2VzdGltYXRlZENodW5rcyA+IDEgPyBcInNcIiA6IFwiXCJ9YDtcbiAgICB9XG4gIH1cbn1cblxuY29uc3QgZGVib3VuY2VkVXBkYXRlQ2hhckNvdW50ID0gZGVib3VuY2UodXBkYXRlQ2hhckNvdW50LCAzMDApO1xudGV4dElucHV0Py5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgZGVib3VuY2VkVXBkYXRlQ2hhckNvdW50KTtcblxuY2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGlmICh0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBcIlwiO1xuICAgIHRleHRJbnB1dC5mb2N1cygpO1xuICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICB9XG59KTtcblxuLy8gNS4gU2lsZW50IFByZS1XYXJtIG9uIFBhbmVsIExvYWRcbihhc3luYyAoKSA9PiB7XG4gIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJFTlNVUkVfT0ZGU0NSRUVOXCIgfSk7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgdHlwZTogXCJQUkVXQVJNX01PREVMXCIsXG4gICAgbW9kZWw6IG1vZGVsU2VsZWN0Py52YWx1ZSB8fCBcIm5hbm9cIixcbiAgfSk7XG59KSgpO1xuXG4vLyBIZWxwZXIgdG8gc3RhcnQgcGxheWJhY2tcbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0UGxheWJhY2sodGV4dFRvUGxheSkge1xuICBjb25zdCB0ZXh0ID0gKHRleHRUb1BsYXkgfHwgdGV4dElucHV0Py52YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gIGlmICghdGV4dCkge1xuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxlYXNlIGVudGVyIHRleHQgb3IgZXh0cmFjdCBhbiBhcnRpY2xlLlwiO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJFTlNVUkVfT0ZGU0NSRUVOXCIgfSk7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsXG4gICAgdHlwZTogXCJQTEFZX1RFWFRcIixcbiAgICB0ZXh0LFxuICAgIHZvaWNlOiB2b2ljZVNlbGVjdD8udmFsdWUgfHwgXCJKYXNwZXJcIixcbiAgICBzcGVlZDogcGFyc2VGbG9hdChzcGVlZElucHV0Py52YWx1ZSB8fCBcIjEuMFwiKSxcbiAgICBtb2RlbDogbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiLFxuICB9KTtcblxuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gIGlmIChkb3dubG9hZEJ0bikgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IFwiMCVcIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJTeW50aGVzaXppbmcgd2l0aCBXZWJHUFUuLi5cIjtcbn1cblxuLy8gNi4gU2NhbiAmIEF1dG8tUGxheSBBcnRpY2xlIEFjdGlvblxuZXh0cmFjdEFydGljbGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJDaGVja2luZyBwYWdlIGFjY2VzcyBwZXJtaXNzaW9ucy4uLlwiO1xuXG4gICAgY29uc3QgZ3JhbnRlZCA9IGF3YWl0IGNocm9tZS5wZXJtaXNzaW9ucy5yZXF1ZXN0KHtcbiAgICAgIG9yaWdpbnM6IFtcImh0dHA6Ly8qLypcIiwgXCJodHRwczovLyovKlwiXSxcbiAgICB9KTtcblxuICAgIGlmICghZ3JhbnRlZCkge1xuICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBlcm1pc3Npb24gZGVuaWVkLiBDYW5ub3Qgc2NhbiBwYWdlLlwiO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiU2Nhbm5pbmcgYWN0aXZlIHRhYiBmb3IgYXJ0aWNsZS4uLlwiO1xuICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuXG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoXG4gICAgICB7IHR5cGU6IFwiRVhUUkFDVF9DVVJSRU5UX1RBQl9BUlRJQ0xFXCIgfSxcbiAgICAgIGFzeW5jIChyZXNwb25zZSkgPT4ge1xuICAgICAgICBpZiAocmVzcG9uc2U/LmVycm9yKSB7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7cmVzcG9uc2UuZXJyb3J9YDtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlPy5hcnRpY2xlPy50ZXh0KSB7XG4gICAgICAgICAgaWYgKHRleHRJbnB1dCkgdGV4dElucHV0LnZhbHVlID0gcmVzcG9uc2UuYXJ0aWNsZS50ZXh0O1xuICAgICAgICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICAgICAgICAgIGNvbnN0IHRpdGxlU25pcHBldCA9XG4gICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlID9cbiAgICAgICAgICAgICAgcmVzcG9uc2UuYXJ0aWNsZS50aXRsZS5zbGljZSgwLCAyNSkgKyBcIi4uLlwiXG4gICAgICAgICAgICA6IFwiQXJ0aWNsZVwiO1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBMb2FkZWQgXCIke3RpdGxlU25pcHBldH1cIi4gUmVhZGluZy4uLmA7XG5cbiAgICAgICAgICAvLyBBdXRvLXBsYXkgaW1tZWRpYXRlbHlcbiAgICAgICAgICBhd2FpdCBzdGFydFBsYXliYWNrKHJlc3BvbnNlLmFydGljbGUudGV4dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID1cbiAgICAgICAgICAgICAgXCJDb3VsZCBub3QgZmluZCBhIHN0cnVjdHVyZWQgYXJ0aWNsZSBvbiB0aGlzIHBhZ2UuXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJFeHRyYWN0aW9uIGVycm9yOlwiLCBlcnIpO1xuICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYEVycm9yOiAke2Vyci5tZXNzYWdlfWA7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICB9XG59KTtcblxuLy8gU3RvcmFnZSBMaXN0ZW5lcnNcbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInR0c1RleHRcIiwgKGRhdGEpID0+IHtcbiAgaWYgKGRhdGEudHRzVGV4dCAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBkYXRhLnR0c1RleHQ7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbmNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgYXJlYSkgPT4ge1xuICBpZiAoYXJlYSA9PT0gXCJsb2NhbFwiICYmIGNoYW5nZXMudHRzVGV4dD8ubmV3VmFsdWUgJiYgdGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gY2hhbmdlcy50dHNUZXh0Lm5ld1ZhbHVlO1xuICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShcInR0c1RleHRcIik7XG4gIH1cbn0pO1xuXG4vLyA3LiBQbGF5ICYgU3RvcCBMaXN0ZW5lcnNcbnBsYXlCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBzdGFydFBsYXliYWNrKCkpO1xuXG5zdG9wQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHRhcmdldDogXCJvZmZzY3JlZW5cIiwgdHlwZTogXCJTVE9QX0FVRElPXCIgfSk7XG4gIHJlc2V0Q29udHJvbHMoXCJTdG9wcGVkLlwiKTtcbn0pO1xuXG5jb25zdCBkb3dubG9hZEFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuZG93bmxvYWRBbmNob3Iuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkb3dubG9hZEFuY2hvcik7XG5cbmRvd25sb2FkQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gKHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCB2b2ljZSA9IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiO1xuICBjb25zdCBzcGVlZCA9IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIik7XG4gIGNvbnN0IG1vZGVsID0gbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiO1xuXG4gIGlmICghdGV4dCkgcmV0dXJuO1xuXG4gIHRyeSB7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlByZXBhcmluZyBkb3dubG9hZC4uLlwiO1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gYXdhaXQgZ2VuZXJhdGVDYWNoZUtleSh0ZXh0LCB2b2ljZSwgc3BlZWQsIG1vZGVsKTtcbiAgICBjb25zdCBibG9iID0gYXdhaXQgZ2V0QXVkaW8oY2FjaGVLZXkpO1xuXG4gICAgaWYgKGJsb2IpIHtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBkb3dubG9hZEFuY2hvci5ocmVmID0gdXJsO1xuICAgICAgZG93bmxvYWRBbmNob3IuZG93bmxvYWQgPSBcImtpdHRlbi10dHMtYXVkaW8ud2F2XCI7XG4gICAgICBkb3dubG9hZEFuY2hvci5jbGljaygpO1xuICAgICAgXG4gICAgICAvLyBDbGVhbiB1cCB0aGUgb2JqZWN0IFVSTCBhZnRlciBhIHNob3J0IGRlbGF5XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiRG93bmxvYWQgc3RhcnRlZC5cIjtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkVycm9yOiBBdWRpbyBub3QgZm91bmQgaW4gY2FjaGUuXCI7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBEb3dubG9hZCBFcnJvcjogJHtlcnIubWVzc2FnZX1gO1xuICB9XG59KTtcblxuZnVuY3Rpb24gcmVzZXRDb250cm9scyhzdGF0dXNNc2cpIHtcbiAgaWYgKHBsYXlCdG4pIHBsYXlCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gc3RhdHVzTXNnO1xufVxuXG4vLyA4LiBQcm9ncmVzcyBMaXN0ZW5lciBcdTIwMTQgY29ubmVjdGVkIHZpYSBQb3J0IGZvciB6ZXJvLW92ZXJoZWFkIHJlbGF5IGZyb20gYmFja2dyb3VuZFxuKGZ1bmN0aW9uIGNvbm5lY3RVaVBvcnQoKSB7XG4gIGNvbnN0IHBvcnQgPSBjaHJvbWUucnVudGltZS5jb25uZWN0KHsgbmFtZTogXCJ0dHMtdWlcIiB9KTtcbiAgcG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1zZykgPT4ge1xuICAgIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfUFJPR1JFU1NcIikge1xuICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gICAgICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBgJHttc2cucGVyY2VudH0lYDtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgU3ludGhlc2l6aW5nIGF1ZGlvLi4uICR7bXNnLnBlcmNlbnR9JWA7XG4gICAgICB9KTtcbiAgICAgIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfU1RBVFVTXCIpIHtcbiAgICAgIGlmIChtc2cuc3RhdGUgPT09IFwiaWRsZVwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMoXCJGaW5pc2hlZCBwbGF5aW5nLlwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcInN0b3BwZWRcIikge1xuICAgICAgICByZXNldENvbnRyb2xzKFwiU3RvcHBlZC5cIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMobXNnLnN0YXR1cyB8fCBcIkVycm9yIG9jY3VycmVkXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwicGxheWluZ1wiKSB7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGF5aW5nIGF1ZGlvLi4uXCI7XG4gICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgcGxheWluZ1wiO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwiYnVzeVwiKSB7XG4gICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gbXNnLnN0YXR1cztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19BVURJT19SRUFEWVwiKSB7XG4gICAgICBpZiAoZG93bmxvYWRCdG4pIGRvd25sb2FkQnRuLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfREVCVUdfTE9HXCIpIHtcbiAgICAgIC8vIEFwcGVuZCB0byBpbi1wYW5lbCBkZWJ1ZyBsb2cgaWYgdGhlIHBhbmVsIGV4aXN0c1xuICAgICAgaWYgKGRlYnVnUGFuZWwgJiYgZGVidWdMb2cpIHtcbiAgICAgICAgLy8gQXV0by1vcGVuIHRoZSBwYW5lbCBvbiBmaXJzdCBldmVudCByZWNlaXZlZFxuICAgICAgICBpZiAoIWRlYnVnUGFuZWwub3BlbiAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgZGVidWdQYW5lbC5vcGVuID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBkZWJ1Z0VudHJpZXMucHVzaCh7IHRhZzogbXNnLnRhZywgZGF0YTogbXNnLmRhdGEsIHRzOiBtc2cudHMgPz8gRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgLy8gS2VlcCBidWZmZXIgYm91bmRlZCB0byAyMDAgZW50cmllc1xuICAgICAgICBpZiAoZGVidWdFbnRyaWVzLmxlbmd0aCA+IDIwMCkgZGVidWdFbnRyaWVzLnNoaWZ0KCk7XG4gICAgICAgIHJlbmRlckRlYnVnTG9nKCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgLy8gUmVjb25uZWN0IGlmIHRoZSBzZXJ2aWNlIHdvcmtlciByZXN0YXJ0cyBhbmQgZHJvcHMgdGhlIHBvcnRcbiAgcG9ydC5vbkRpc2Nvbm5lY3QuYWRkTGlzdGVuZXIoKCkgPT4gc2V0VGltZW91dChjb25uZWN0VWlQb3J0LCAyMDApKTtcbn0pKCk7XG5cblxuLy8gOS4gUmVzZXQgRW5naW5lIEFjdGlvblxucmVzZXRHcHVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJSZXNldHRpbmcgR1BVIHByb2Nlc3MuLi5cIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJSRVNFVF9HUFVfT0ZGU0NSRUVOXCIgfSwgKHJlcykgPT4ge1xuICAgIHJlc2V0Q29udHJvbHMocmVzPy5tZXNzYWdlIHx8IFwiRW5naW5lIHJlc2V0LlwiKTtcbiAgfSk7XG59KTtcblxuXG4vLyBcdTI1MDBcdTI1MDAgMTAuIERlYnVnIFBhbmVsIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cbi8qKiBSZW5kZXIgYWxsIGRlYnVnIGVudHJpZXMgaW50byB0aGUgbG9nIHByZSBlbGVtZW50ICovXG5mdW5jdGlvbiByZW5kZXJEZWJ1Z0xvZygpIHtcbiAgaWYgKCFkZWJ1Z0xvZykgcmV0dXJuO1xuICBpZiAoZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGRlYnVnTG9nLnRleHRDb250ZW50ID0gXCItLSBubyBsb2cgZW50cmllcyB5ZXQgLS1cIjtcbiAgICBpZiAoZGVidWdFbnRyeUNvdW50KSBkZWJ1Z0VudHJ5Q291bnQudGV4dENvbnRlbnQgPSBcIjAgZW50cmllc1wiO1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoZGVidWdFbnRyeUNvdW50KSB7XG4gICAgZGVidWdFbnRyeUNvdW50LnRleHRDb250ZW50ID0gYCR7ZGVidWdFbnRyaWVzLmxlbmd0aH0gZW50ciR7ZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn1gO1xuICB9XG4gIGRlYnVnTG9nLnRleHRDb250ZW50ID0gZGVidWdFbnRyaWVzLm1hcCgoeyB0YWcsIGRhdGEsIHRzIH0pID0+IHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUodHMpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMTEsIDIzKTsgLy8gSEg6bW06c3MubW1tXG4gICAgY29uc3QgcGF5bG9hZCA9IHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiID8gZGF0YSA6IEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDIpO1xuICAgIHJldHVybiBgWyR7dGltZX1dICR7dGFnfVxcbiR7cGF5bG9hZH1gO1xuICB9KS5qb2luKFwiXFxuXFxuXCIpO1xuICAvLyBBdXRvLXNjcm9sbCB0byBib3R0b21cbiAgZGVidWdMb2cuc2Nyb2xsVG9wID0gZGVidWdMb2cuc2Nyb2xsSGVpZ2h0O1xufVxuXG4vLyBSZWFkIGluaXRpYWwgZGVidWcgZmxhZyBzdGF0ZVxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwiS0lUVEVOX0RFQlVHXCIsIChyZXN1bHQpID0+IHtcbiAgaWYgKGRlYnVnVG9nZ2xlKSBkZWJ1Z1RvZ2dsZS5jaGVja2VkID0gcmVzdWx0Py5LSVRURU5fREVCVUcgPT09IHRydWU7XG59KTtcblxuLy8gS2VlcCB0b2dnbGUgaW4gc3luYyBpZiBjaGFuZ2VkIGVsc2V3aGVyZVxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgXCJLSVRURU5fREVCVUdcIiBpbiBjaGFuZ2VzICYmIGRlYnVnVG9nZ2xlKSB7XG4gICAgZGVidWdUb2dnbGUuY2hlY2tlZCA9IGNoYW5nZXMuS0lUVEVOX0RFQlVHLm5ld1ZhbHVlID09PSB0cnVlO1xuICB9XG59KTtcblxuLy8gVG9nZ2xlIGhhbmRsZXIgXHUyMDE0IHBlcnNpc3QgdG8gc3RvcmFnZSAocGlja2VkIHVwIGJ5IGFsbCBjb250ZXh0cyB2aWEgb25DaGFuZ2VkKVxuZGVidWdUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBLSVRURU5fREVCVUc6IGRlYnVnVG9nZ2xlLmNoZWNrZWQgfSk7XG4gIGlmIChkZWJ1Z1RvZ2dsZS5jaGVja2VkICYmIGRlYnVnRW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoZGVidWdMb2cpIGRlYnVnTG9nLnRleHRDb250ZW50ID0gXCItLSBkZWJ1ZyBlbmFibGVkOiB0cmlnZ2VyIGEgUGxheSB0byBzZWUgZXZlbnRzIC0tXCI7XG4gIH1cbn0pO1xuXG4vLyBDbGVhciBidXR0b25cbmRlYnVnQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGRlYnVnRW50cmllcyA9IFtdO1xuICByZW5kZXJEZWJ1Z0xvZygpO1xufSk7XG5cbi8vIENvcHkgYnV0dG9uIFx1MjAxNCBjb3BpZXMgcGxhaW4gdGV4dCB0byBjbGlwYm9hcmRcbmRlYnVnQ29weUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgdGV4dCA9IGRlYnVnRW50cmllcy5tYXAoKHsgdGFnLCBkYXRhLCB0cyB9KSA9PiB7XG4gICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKHRzKS50b0lTT1N0cmluZygpLnNsaWNlKDExLCAyMyk7XG4gICAgY29uc3QgcGF5bG9hZCA9IHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiID8gZGF0YSA6IEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDIpO1xuICAgIHJldHVybiBgWyR7dGltZX1dICR7dGFnfVxcbiR7cGF5bG9hZH1gO1xuICB9KS5qb2luKFwiXFxuXFxuXCIpO1xuICB0cnkge1xuICAgIGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRleHQgfHwgXCItLSBlbXB0eSAtLVwiKTtcbiAgICBpZiAoZGVidWdDb3B5QnRuKSB7XG4gICAgICBkZWJ1Z0NvcHlCdG4udGV4dENvbnRlbnQgPSBcIkNvcGllZCFcIjtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBpZiAoZGVidWdDb3B5QnRuKSBkZWJ1Z0NvcHlCdG4udGV4dENvbnRlbnQgPSBcIkNvcHlcIjsgfSwgMTUwMCk7XG4gICAgfVxuICB9IGNhdGNoIChfKSB7XG4gICAgLyogY2xpcGJvYXJkIG5vdCBhdmFpbGFibGUgKi9cbiAgfVxufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBRUEsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sYUFBYTtBQUNuQixNQUFNLGFBQWE7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QVUsTUFBTSxNQUFNLENBQUM7QUFDOUUsYUFBTyxJQUFJLElBQUksS0FBSyxHQUFHO0FBQUEsRUFBSyxPQUFPO0FBQUEsSUFDckMsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUVkLGFBQVMsWUFBWSxTQUFTO0FBQUEsRUFDaEM7QUFHQSxTQUFPLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixDQUFDLFdBQVc7QUFDbkQsUUFBSSxZQUFhLGFBQVksVUFBVSxRQUFRLGlCQUFpQjtBQUFBLEVBQ2xFLENBQUM7QUFHRCxTQUFPLFFBQVEsVUFBVSxZQUFZLENBQUMsU0FBUyxTQUFTO0FBQ3RELFFBQUksU0FBUyxXQUFXLGtCQUFrQixXQUFXLGFBQWE7QUFDaEUsa0JBQVksVUFBVSxRQUFRLGFBQWEsYUFBYTtBQUFBLElBQzFEO0FBQUEsRUFDRixDQUFDO0FBR0QsZUFBYSxpQkFBaUIsVUFBVSxNQUFNO0FBQzVDLFdBQU8sUUFBUSxNQUFNLElBQUksRUFBRSxjQUFjLFlBQVksUUFBUSxDQUFDO0FBQzlELFFBQUksWUFBWSxXQUFXLGFBQWEsV0FBVyxHQUFHO0FBQ3BELFVBQUksU0FBVSxVQUFTLGNBQWM7QUFBQSxJQUN2QztBQUFBLEVBQ0YsQ0FBQztBQUdELGlCQUFlLGlCQUFpQixTQUFTLE1BQU07QUFDN0MsbUJBQWUsQ0FBQztBQUNoQixtQkFBZTtBQUFBLEVBQ2pCLENBQUM7QUFHRCxnQkFBYyxpQkFBaUIsU0FBUyxZQUFZO0FBQ2xELFVBQU0sT0FBTyxhQUFhLElBQUksQ0FBQyxFQUFFLEtBQUssTUFBTSxHQUFHLE1BQU07QUFDbkQsWUFBTSxPQUFPLElBQUksS0FBSyxFQUFFLEVBQUUsWUFBWSxFQUFFLE1BQU0sSUFBSSxFQUFFO0FBQ3BELFlBQU0sVUFBVSxPQUFPLFNBQVMsV0FBVyxPQUFPLEtBQUssVUFBVSxNQUFNLE1BQU0sQ0FBQztBQUM5RSxhQUFPLElBQUksSUFBSSxLQUFLLEdBQUc7QUFBQSxFQUFLLE9BQU87QUFBQSxJQUNyQyxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQ2QsUUFBSTtBQUNGLFlBQU0sVUFBVSxVQUFVLFVBQVUsUUFBUSxhQUFhO0FBQ3pELFVBQUksY0FBYztBQUNoQixxQkFBYSxjQUFjO0FBQzNCLG1CQUFXLE1BQU07QUFBRSxjQUFJLGFBQWMsY0FBYSxjQUFjO0FBQUEsUUFBUSxHQUFHLElBQUk7QUFBQSxNQUNqRjtBQUFBLElBQ0YsU0FBUyxHQUFHO0FBQUEsSUFFWjtBQUFBLEVBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
