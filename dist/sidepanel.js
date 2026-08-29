(() => {
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
  downloadBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { target: "offscreen", type: "GET_DOWNLOAD_BLOB" },
      (res) => {
        if (res?.dataUrl) {
          downloadAnchor.href = res.dataUrl;
          downloadAnchor.download = "kitten-tts-audio.wav";
          downloadAnchor.click();
        }
      }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3NpZGVwYW5lbC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB0aGVtZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjdGhlbWVTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxCdXR0b25FbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGV4dHJhY3RBcnRpY2xlQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNleHRyYWN0QXJ0aWNsZUJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgdm9pY2VTZWxlY3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3ZvaWNlU2VsZWN0XCIpO1xuLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBtb2RlbFNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjbW9kZWxTZWxlY3RcIik7XG4vKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3BlZWRJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc3BlZWRJbnB1dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3Qgc3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWRWYWx1ZVwiKTtcbi8qKiBAdHlwZSB7SFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCB0ZXh0SW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3RleHRJbnB1dFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgY2xlYXJCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2NsZWFyQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwbGF5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNwbGF5QnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdG9wQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzdG9wQnRuXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkb3dubG9hZEJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZG93bmxvYWRCdG5cIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHN0YXR1c0RvdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdHVzRG90XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBzdGF0dXNUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNUZXh0XCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBwcm9ncmVzc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NDb250YWluZXJcIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IHByb2dyZXNzRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NGaWxsXCIpO1xuLyoqIEB0eXBlIHtIVE1MQnV0dG9uRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCByZXNldEdwdUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcmVzZXRHcHVCdG5cIik7XG4vKiogQHR5cGUge0hUTUxFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGNoYXJDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2hhckNvdW50XCIpO1xuXG4vLyBEZWJ1ZyBwYW5lbCBET00gcmVmcyAocG9wdWxhdGVkIGluIHNlY3Rpb24gMTApXG4vKiogQHR5cGUge0hUTUxEZXRhaWxzRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z1BhbmVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1BhbmVsXCIpO1xuLyoqIEB0eXBlIHtIVE1MSW5wdXRFbGVtZW50IHwgbnVsbH0gKi9cbmNvbnN0IGRlYnVnVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z1RvZ2dsZVwiKTtcbi8qKiBAdHlwZSB7SFRNTEVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdMb2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnTG9nXCIpO1xuLyoqIEB0eXBlIHtIVE1MRWxlbWVudCB8IG51bGx9ICovXG5jb25zdCBkZWJ1Z0VudHJ5Q291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnRW50cnlDb3VudFwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDbGVhckJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZGVidWdDbGVhckJ0blwiKTtcbi8qKiBAdHlwZSB7SFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsfSAqL1xuY29uc3QgZGVidWdDb3B5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNkZWJ1Z0NvcHlCdG5cIik7XG4vKiogQHR5cGUge0FycmF5PHsgdGFnOiBzdHJpbmcsIGRhdGE6IHVua25vd24sIHRzOiBudW1iZXIgfT59ICovXG5sZXQgZGVidWdFbnRyaWVzID0gW107XG5cbi8vIFV0aWxpdHkgZm9yIGRlYm91bmNpbmdcbmZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHRpbWVvdXQgPSAzMDApIHtcbiAgbGV0IHRpbWVyO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGZ1bmMuYXBwbHkodGhpcywgYXJncyk7IH0sIHRpbWVvdXQpO1xuICB9O1xufVxuXG4vLyAxLiBUaGVtZSBNYW5hZ2VtZW50XG5mdW5jdGlvbiBhcHBseVRoZW1lKHRoZW1lKSB7XG4gIGlmICh0aGVtZSA9PT0gXCJhdXRvXCIpIHtcbiAgICBjb25zdCBpc0RhcmsgPSB3aW5kb3cubWF0Y2hNZWRpYShcIihwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyaylcIikubWF0Y2hlcztcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFxuICAgICAgXCJkYXRhLXRoZW1lXCIsXG4gICAgICBpc0RhcmsgPyBcImRhcmtcIiA6IFwibGlnaHRcIixcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXRoZW1lXCIsIHRoZW1lKTtcbiAgfVxufVxuXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJyZWRUaGVtZVwiLCAoZGF0YSkgPT4ge1xuICBjb25zdCBzYXZlZCA9IGRhdGEucHJlZmVycmVkVGhlbWUgfHwgXCJhdXRvXCI7XG4gIGlmICh0aGVtZVNlbGVjdCkgdGhlbWVTZWxlY3QudmFsdWUgPSBzYXZlZDtcbiAgYXBwbHlUaGVtZShzYXZlZCk7XG59KTtcblxudGhlbWVTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gLyoqIEB0eXBlIHtIVE1MU2VsZWN0RWxlbWVudH0gKi8gKGUudGFyZ2V0KTtcbiAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkVGhlbWU6IHRhcmdldC52YWx1ZSB9KTtcbiAgYXBwbHlUaGVtZSh0YXJnZXQudmFsdWUpO1xufSk7XG5cbi8vIDIuIExvYWQgU2F2ZWQgUHJlZmVyZW5jZXMgKHZvaWNlLCBtb2RlbCwgc3BlZWQpXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXG4gIHsgcHJlZmVycmVkVm9pY2U6IFwiSmFzcGVyXCIsIHByZWZlcnJlZE1vZGVsOiBcIm5hbm9cIiwgcHJlZmVycmVkU3BlZWQ6IFwiMS4wXCIgfSxcbiAgKGl0ZW1zKSA9PiB7XG4gICAgaWYgKHZvaWNlU2VsZWN0KSB2b2ljZVNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFZvaWNlO1xuICAgIGlmIChtb2RlbFNlbGVjdCkgbW9kZWxTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRNb2RlbDtcbiAgICBpZiAoc3BlZWRJbnB1dCkge1xuICAgICAgc3BlZWRJbnB1dC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFNwZWVkO1xuICAgICAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtpdGVtcy5wcmVmZXJyZWRTcGVlZH14YDtcbiAgICB9XG4gIH0sXG4pO1xuXG4vLyAzLiBTYXZlIFByZWZlcmVuY2VzIG9uIENoYW5nZVxudm9pY2VTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRWb2ljZTogdm9pY2VTZWxlY3QudmFsdWUgfSk7XG59KTtcblxubW9kZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRNb2RlbDogbW9kZWxTZWxlY3QudmFsdWUgfSk7XG59KTtcblxuY29uc3Qgc2F2ZVNwZWVkID0gZGVib3VuY2UoKHZhbHVlKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFNwZWVkOiB2YWx1ZSB9KTtcbn0sIDUwMCk7XG5cbnNwZWVkSW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7XG4gIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7c3BlZWRJbnB1dC52YWx1ZX14YDtcbiAgc2F2ZVNwZWVkKHNwZWVkSW5wdXQudmFsdWUpO1xufSk7XG5cbi8vIDQuIENoYXJhY3RlciBDb3VudCAmIENsZWFyIElucHV0XG5mdW5jdGlvbiB1cGRhdGVDaGFyQ291bnQoKSB7XG4gIGlmIChjaGFyQ291bnQgJiYgdGV4dElucHV0KSB7XG4gICAgY29uc3QgbGVuID0gdGV4dElucHV0LnZhbHVlLmxlbmd0aDtcbiAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSb3VnaCBlc3RpbWF0ZTogfjIwMCBjaGFycyBwZXIgY2h1bmtcbiAgICAgIGNvbnN0IGVzdGltYXRlZENodW5rcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChsZW4gLyAyMDApKTtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IGAke2xlbi50b0xvY2FsZVN0cmluZygpfSBjaGFycyBcdTAwQjcgfiR7ZXN0aW1hdGVkQ2h1bmtzfSBjaHVuayR7ZXN0aW1hdGVkQ2h1bmtzID4gMSA/IFwic1wiIDogXCJcIn1gO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQgPSBkZWJvdW5jZSh1cGRhdGVDaGFyQ291bnQsIDMwMCk7XG50ZXh0SW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQpO1xuXG5jbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IFwiXCI7XG4gICAgdGV4dElucHV0LmZvY3VzKCk7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gIH1cbn0pO1xuXG4vLyA1LiBTaWxlbnQgUHJlLVdhcm0gb24gUGFuZWwgTG9hZFxuKGFzeW5jICgpID0+IHtcbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICB0eXBlOiBcIlBSRVdBUk1fTU9ERUxcIixcbiAgICBtb2RlbDogbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiLFxuICB9KTtcbn0pKCk7XG5cbi8vIEhlbHBlciB0byBzdGFydCBwbGF5YmFja1xuYXN5bmMgZnVuY3Rpb24gc3RhcnRQbGF5YmFjayh0ZXh0VG9QbGF5KSB7XG4gIGNvbnN0IHRleHQgPSAodGV4dFRvUGxheSB8fCB0ZXh0SW5wdXQ/LnZhbHVlIHx8IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCF0ZXh0KSB7XG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGVhc2UgZW50ZXIgdGV4dCBvciBleHRyYWN0IGFuIGFydGljbGUuXCI7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICB0eXBlOiBcIlBMQVlfVEVYVFwiLFxuICAgIHRleHQsXG4gICAgdm9pY2U6IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiLFxuICAgIHNwZWVkOiBwYXJzZUZsb2F0KHNwZWVkSW5wdXQ/LnZhbHVlIHx8IFwiMS4wXCIpLFxuICAgIG1vZGVsOiBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCIsXG4gIH0pO1xuXG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgaWYgKGRvd25sb2FkQnRuKSBkb3dubG9hZEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlN5bnRoZXNpemluZyB3aXRoIFdlYkdQVS4uLlwiO1xufVxuXG4vLyA2LiBTY2FuICYgQXV0by1QbGF5IEFydGljbGUgQWN0aW9uXG5leHRyYWN0QXJ0aWNsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNoZWNraW5nIHBhZ2UgYWNjZXNzIHBlcm1pc3Npb25zLi4uXCI7XG5cbiAgICBjb25zdCBncmFudGVkID0gYXdhaXQgY2hyb21lLnBlcm1pc3Npb25zLnJlcXVlc3Qoe1xuICAgICAgb3JpZ2luczogW1wiaHR0cDovLyovKlwiLCBcImh0dHBzOi8vKi8qXCJdLFxuICAgIH0pO1xuXG4gICAgaWYgKCFncmFudGVkKSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGVybWlzc2lvbiBkZW5pZWQuIENhbm5vdCBzY2FuIHBhZ2UuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJTY2FubmluZyBhY3RpdmUgdGFiIGZvciBhcnRpY2xlLi4uXCI7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG5cbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShcbiAgICAgIHsgdHlwZTogXCJFWFRSQUNUX0NVUlJFTlRfVEFCX0FSVElDTEVcIiB9LFxuICAgICAgYXN5bmMgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChyZXNwb25zZT8uZXJyb3IpIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtyZXNwb25zZS5lcnJvcn1gO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzcG9uc2U/LmFydGljbGU/LnRleHQpIHtcbiAgICAgICAgICBpZiAodGV4dElucHV0KSB0ZXh0SW5wdXQudmFsdWUgPSByZXNwb25zZS5hcnRpY2xlLnRleHQ7XG4gICAgICAgICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgICAgICAgY29uc3QgdGl0bGVTbmlwcGV0ID1cbiAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUgP1xuICAgICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlLnNsaWNlKDAsIDI1KSArIFwiLi4uXCJcbiAgICAgICAgICAgIDogXCJBcnRpY2xlXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYExvYWRlZCBcIiR7dGl0bGVTbmlwcGV0fVwiLiBSZWFkaW5nLi4uYDtcblxuICAgICAgICAgIC8vIEF1dG8tcGxheSBpbW1lZGlhdGVseVxuICAgICAgICAgIGF3YWl0IHN0YXJ0UGxheWJhY2socmVzcG9uc2UuYXJ0aWNsZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPVxuICAgICAgICAgICAgICBcIkNvdWxkIG5vdCBmaW5kIGEgc3RydWN0dXJlZCBhcnRpY2xlIG9uIHRoaXMgcGFnZS5cIjtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkV4dHJhY3Rpb24gZXJyb3I6XCIsIGVycik7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbn0pO1xuXG4vLyBTdG9yYWdlIExpc3RlbmVyc1xuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwidHRzVGV4dFwiLCAoZGF0YSkgPT4ge1xuICBpZiAoZGF0YS50dHNUZXh0ICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudHRzVGV4dDtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgY2hhbmdlcy50dHNUZXh0Py5uZXdWYWx1ZSAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBjaGFuZ2VzLnR0c1RleHQubmV3VmFsdWU7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbi8vIDcuIFBsYXkgJiBTdG9wIExpc3RlbmVyc1xucGxheUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHN0YXJ0UGxheWJhY2soKSk7XG5cbnN0b3BCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNUT1BfQVVESU9cIiB9KTtcbiAgcmVzZXRDb250cm9scyhcIlN0b3BwZWQuXCIpO1xufSk7XG5cbmNvbnN0IGRvd25sb2FkQW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG5kb3dubG9hZEFuY2hvci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRvd25sb2FkQW5jaG9yKTtcblxuZG93bmxvYWRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKFxuICAgIHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIkdFVF9ET1dOTE9BRF9CTE9CXCIgfSxcbiAgICAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzPy5kYXRhVXJsKSB7XG4gICAgICAgIGRvd25sb2FkQW5jaG9yLmhyZWYgPSByZXMuZGF0YVVybDtcbiAgICAgICAgZG93bmxvYWRBbmNob3IuZG93bmxvYWQgPSBcImtpdHRlbi10dHMtYXVkaW8ud2F2XCI7XG4gICAgICAgIGRvd25sb2FkQW5jaG9yLmNsaWNrKCk7XG4gICAgICB9XG4gICAgfSxcbiAgKTtcbn0pO1xuXG5mdW5jdGlvbiByZXNldENvbnRyb2xzKHN0YXR1c01zZykge1xuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBzdGF0dXNNc2c7XG59XG5cbi8vIDguIFByb2dyZXNzIExpc3RlbmVyIFx1MjAxNCBjb25uZWN0ZWQgdmlhIFBvcnQgZm9yIHplcm8tb3ZlcmhlYWQgcmVsYXkgZnJvbSBiYWNrZ3JvdW5kXG4oZnVuY3Rpb24gY29ubmVjdFVpUG9ydCgpIHtcbiAgY29uc3QgcG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3QoeyBuYW1lOiBcInR0cy11aVwiIH0pO1xuICBwb3J0Lm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobXNnKSA9PiB7XG4gICAgaWYgKG1zZy50eXBlID09PSBcIlRUU19QUk9HUkVTU1wiKSB7XG4gICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IGAke21zZy5wZXJjZW50fSVgO1xuICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBTeW50aGVzaXppbmcgYXVkaW8uLi4gJHttc2cucGVyY2VudH0lYDtcbiAgICAgIH0pO1xuICAgICAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19TVEFUVVNcIikge1xuICAgICAgaWYgKG1zZy5zdGF0ZSA9PT0gXCJpZGxlXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhcIkZpbmlzaGVkIHBsYXlpbmcuXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwic3RvcHBlZFwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMoXCJTdG9wcGVkLlwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImVycm9yXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiRXJyb3Igb2NjdXJyZWRcIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsYXlpbmcgYXVkaW8uLi5cIjtcbiAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBwbGF5aW5nXCI7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJidXN5XCIpIHtcbiAgICAgICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBtc2cuc3RhdHVzO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX0FVRElPX1JFQURZXCIpIHtcbiAgICAgIGlmIChkb3dubG9hZEJ0bikgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19ERUJVR19MT0dcIikge1xuICAgICAgLy8gQXBwZW5kIHRvIGluLXBhbmVsIGRlYnVnIGxvZyBpZiB0aGUgcGFuZWwgZXhpc3RzXG4gICAgICBpZiAoZGVidWdQYW5lbCAmJiBkZWJ1Z0xvZykge1xuICAgICAgICAvLyBBdXRvLW9wZW4gdGhlIHBhbmVsIG9uIGZpcnN0IGV2ZW50IHJlY2VpdmVkXG4gICAgICAgIGlmICghZGVidWdQYW5lbC5vcGVuICYmIGRlYnVnRW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBkZWJ1Z1BhbmVsLm9wZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGRlYnVnRW50cmllcy5wdXNoKHsgdGFnOiBtc2cudGFnLCBkYXRhOiBtc2cuZGF0YSwgdHM6IG1zZy50cyA/PyBEYXRlLm5vdygpIH0pO1xuICAgICAgICAvLyBLZWVwIGJ1ZmZlciBib3VuZGVkIHRvIDIwMCBlbnRyaWVzXG4gICAgICAgIGlmIChkZWJ1Z0VudHJpZXMubGVuZ3RoID4gMjAwKSBkZWJ1Z0VudHJpZXMuc2hpZnQoKTtcbiAgICAgICAgcmVuZGVyRGVidWdMb2coKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICAvLyBSZWNvbm5lY3QgaWYgdGhlIHNlcnZpY2Ugd29ya2VyIHJlc3RhcnRzIGFuZCBkcm9wcyB0aGUgcG9ydFxuICBwb3J0Lm9uRGlzY29ubmVjdC5hZGRMaXN0ZW5lcigoKSA9PiBzZXRUaW1lb3V0KGNvbm5lY3RVaVBvcnQsIDIwMCkpO1xufSkoKTtcblxuXG4vLyA5LiBSZXNldCBFbmdpbmUgQWN0aW9uXG5yZXNldEdwdUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlJlc2V0dGluZyBHUFUgcHJvY2Vzcy4uLlwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIlJFU0VUX0dQVV9PRkZTQ1JFRU5cIiB9LCAocmVzKSA9PiB7XG4gICAgcmVzZXRDb250cm9scyhyZXM/Lm1lc3NhZ2UgfHwgXCJFbmdpbmUgcmVzZXQuXCIpO1xuICB9KTtcbn0pO1xuXG5cbi8vIFx1MjUwMFx1MjUwMCAxMC4gRGVidWcgUGFuZWwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblxuLyoqIFJlbmRlciBhbGwgZGVidWcgZW50cmllcyBpbnRvIHRoZSBsb2cgcHJlIGVsZW1lbnQgKi9cbmZ1bmN0aW9uIHJlbmRlckRlYnVnTG9nKCkge1xuICBpZiAoIWRlYnVnTG9nKSByZXR1cm47XG4gIGlmIChkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgZGVidWdMb2cudGV4dENvbnRlbnQgPSBcIi0tIG5vIGxvZyBlbnRyaWVzIHlldCAtLVwiO1xuICAgIGlmIChkZWJ1Z0VudHJ5Q291bnQpIGRlYnVnRW50cnlDb3VudC50ZXh0Q29udGVudCA9IFwiMCBlbnRyaWVzXCI7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChkZWJ1Z0VudHJ5Q291bnQpIHtcbiAgICBkZWJ1Z0VudHJ5Q291bnQudGV4dENvbnRlbnQgPSBgJHtkZWJ1Z0VudHJpZXMubGVuZ3RofSBlbnRyJHtkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAxID8gXCJ5XCIgOiBcImllc1wifWA7XG4gIH1cbiAgZGVidWdMb2cudGV4dENvbnRlbnQgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpOyAvLyBISDptbTpzcy5tbW1cbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIC8vIEF1dG8tc2Nyb2xsIHRvIGJvdHRvbVxuICBkZWJ1Z0xvZy5zY3JvbGxUb3AgPSBkZWJ1Z0xvZy5zY3JvbGxIZWlnaHQ7XG59XG5cbi8vIFJlYWQgaW5pdGlhbCBkZWJ1ZyBmbGFnIHN0YXRlXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJLSVRURU5fREVCVUdcIiwgKHJlc3VsdCkgPT4ge1xuICBpZiAoZGVidWdUb2dnbGUpIGRlYnVnVG9nZ2xlLmNoZWNrZWQgPSByZXN1bHQ/LktJVFRFTl9ERUJVRyA9PT0gdHJ1ZTtcbn0pO1xuXG4vLyBLZWVwIHRvZ2dsZSBpbiBzeW5jIGlmIGNoYW5nZWQgZWxzZXdoZXJlXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgaWYgKGFyZWEgPT09IFwibG9jYWxcIiAmJiBcIktJVFRFTl9ERUJVR1wiIGluIGNoYW5nZXMgJiYgZGVidWdUb2dnbGUpIHtcbiAgICBkZWJ1Z1RvZ2dsZS5jaGVja2VkID0gY2hhbmdlcy5LSVRURU5fREVCVUcubmV3VmFsdWUgPT09IHRydWU7XG4gIH1cbn0pO1xuXG4vLyBUb2dnbGUgaGFuZGxlciBcdTIwMTQgcGVyc2lzdCB0byBzdG9yYWdlIChwaWNrZWQgdXAgYnkgYWxsIGNvbnRleHRzIHZpYSBvbkNoYW5nZWQpXG5kZWJ1Z1RvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IEtJVFRFTl9ERUJVRzogZGVidWdUb2dnbGUuY2hlY2tlZCB9KTtcbiAgaWYgKGRlYnVnVG9nZ2xlLmNoZWNrZWQgJiYgZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChkZWJ1Z0xvZykgZGVidWdMb2cudGV4dENvbnRlbnQgPSBcIi0tIGRlYnVnIGVuYWJsZWQ6IHRyaWdnZXIgYSBQbGF5IHRvIHNlZSBldmVudHMgLS1cIjtcbiAgfVxufSk7XG5cbi8vIENsZWFyIGJ1dHRvblxuZGVidWdDbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgZGVidWdFbnRyaWVzID0gW107XG4gIHJlbmRlckRlYnVnTG9nKCk7XG59KTtcblxuLy8gQ29weSBidXR0b24gXHUyMDE0IGNvcGllcyBwbGFpbiB0ZXh0IHRvIGNsaXBib2FyZFxuZGVidWdDb3B5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB0ZXh0ID0gZGVidWdFbnRyaWVzLm1hcCgoeyB0YWcsIGRhdGEsIHRzIH0pID0+IHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUodHMpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMTEsIDIzKTtcbiAgICBjb25zdCBwYXlsb2FkID0gdHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgPyBkYXRhIDogSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGBbJHt0aW1lfV0gJHt0YWd9XFxuJHtwYXlsb2FkfWA7XG4gIH0pLmpvaW4oXCJcXG5cXG5cIik7XG4gIHRyeSB7XG4gICAgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGV4dCB8fCBcIi0tIGVtcHR5IC0tXCIpO1xuICAgIGlmIChkZWJ1Z0NvcHlCdG4pIHtcbiAgICAgIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29waWVkIVwiO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGlmIChkZWJ1Z0NvcHlCdG4pIGRlYnVnQ29weUJ0bi50ZXh0Q29udGVudCA9IFwiQ29weVwiOyB9LCAxNTAwKTtcbiAgICB9XG4gIH0gY2F0Y2ggKF8pIHtcbiAgICAvKiBjbGlwYm9hcmQgbm90IGF2YWlsYWJsZSAqL1xuICB9XG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFDQSxNQUFNLGNBQWMsU0FBUyxjQUFjLGNBQWM7QUFFekQsTUFBTSxvQkFBb0IsU0FBUyxjQUFjLG9CQUFvQjtBQUVyRSxNQUFNLGNBQWMsU0FBUyxjQUFjLGNBQWM7QUFFekQsTUFBTSxjQUFjLFNBQVMsY0FBYyxjQUFjO0FBRXpELE1BQU0sYUFBYSxTQUFTLGNBQWMsYUFBYTtBQUV2RCxNQUFNLGFBQWEsU0FBUyxlQUFlLFlBQVk7QUFFdkQsTUFBTSxZQUFZLFNBQVMsY0FBYyxZQUFZO0FBRXJELE1BQU0sV0FBVyxTQUFTLGNBQWMsV0FBVztBQUVuRCxNQUFNLFVBQVUsU0FBUyxjQUFjLFVBQVU7QUFFakQsTUFBTSxVQUFVLFNBQVMsY0FBYyxVQUFVO0FBRWpELE1BQU0sY0FBYyxTQUFTLGNBQWMsY0FBYztBQUV6RCxNQUFNLFlBQVksU0FBUyxlQUFlLFdBQVc7QUFFckQsTUFBTSxhQUFhLFNBQVMsZUFBZSxZQUFZO0FBRXZELE1BQU0sb0JBQW9CLFNBQVMsZUFBZSxtQkFBbUI7QUFFckUsTUFBTSxlQUFlLFNBQVMsZUFBZSxjQUFjO0FBRTNELE1BQU0sY0FBYyxTQUFTLGNBQWMsY0FBYztBQUV6RCxNQUFNLFlBQVksU0FBUyxlQUFlLFdBQVc7QUFJckQsTUFBTSxhQUFhLFNBQVMsY0FBYyxhQUFhO0FBRXZELE1BQU0sY0FBYyxTQUFTLGNBQWMsY0FBYztBQUV6RCxNQUFNLFdBQVcsU0FBUyxlQUFlLFVBQVU7QUFFbkQsTUFBTSxrQkFBa0IsU0FBUyxlQUFlLGlCQUFpQjtBQUVqRSxNQUFNLGdCQUFnQixTQUFTLGNBQWMsZ0JBQWdCO0FBRTdELE1BQU0sZUFBZSxTQUFTLGNBQWMsZUFBZTtBQUUzRCxNQUFJLGVBQWUsQ0FBQztBQUdwQixXQUFTLFNBQVMs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
