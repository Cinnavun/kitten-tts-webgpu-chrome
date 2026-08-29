(() => {
  // src/sidepanel.js
  var themeSelect = document.getElementById("themeSelect");
  var extractArticleBtn = document.getElementById("extractArticleBtn");
  var voiceSelect = document.getElementById("voiceSelect");
  var modelSelect = document.getElementById("modelSelect");
  var speedInput = document.getElementById("speedInput");
  var speedValue = document.getElementById("speedValue");
  var textInput = document.getElementById("textInput");
  var clearBtn = document.getElementById("clearBtn");
  var playBtn = document.getElementById("playBtn");
  var stopBtn = document.getElementById("stopBtn");
  var downloadBtn = document.getElementById("downloadBtn");
  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var progressContainer = document.getElementById("progressContainer");
  var progressFill = document.getElementById("progressFill");
  var resetGpuBtn = document.getElementById("resetGpuBtn");
  var charCount = document.getElementById("charCount");
  var debugPanel = document.getElementById("debugPanel");
  var debugToggle = document.getElementById("debugToggle");
  var debugLog = document.getElementById("debugLog");
  var debugEntryCount = document.getElementById("debugEntryCount");
  var debugClearBtn = document.getElementById("debugClearBtn");
  var debugCopyBtn = document.getElementById("debugCopyBtn");
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
    chrome.storage.local.set({ preferredTheme: e.target.value });
    applyTheme(e.target.value);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3NpZGVwYW5lbC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgdGhlbWVTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRoZW1lU2VsZWN0XCIpO1xuY29uc3QgZXh0cmFjdEFydGljbGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImV4dHJhY3RBcnRpY2xlQnRuXCIpO1xuY29uc3Qgdm9pY2VTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInZvaWNlU2VsZWN0XCIpO1xuY29uc3QgbW9kZWxTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1vZGVsU2VsZWN0XCIpO1xuY29uc3Qgc3BlZWRJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWRJbnB1dFwiKTtcbmNvbnN0IHNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkVmFsdWVcIik7XG5jb25zdCB0ZXh0SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRleHRJbnB1dFwiKTtcbmNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhckJ0blwiKTtcbmNvbnN0IHBsYXlCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInBsYXlCdG5cIik7XG5jb25zdCBzdG9wQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdG9wQnRuXCIpO1xuY29uc3QgZG93bmxvYWRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRvd25sb2FkQnRuXCIpO1xuY29uc3Qgc3RhdHVzRG90ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNEb3RcIik7XG5jb25zdCBzdGF0dXNUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNUZXh0XCIpO1xuY29uc3QgcHJvZ3Jlc3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ29udGFpbmVyXCIpO1xuY29uc3QgcHJvZ3Jlc3NGaWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0ZpbGxcIik7XG5jb25zdCByZXNldEdwdUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVzZXRHcHVCdG5cIik7XG5jb25zdCBjaGFyQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXJDb3VudFwiKTtcblxuLy8gRGVidWcgcGFuZWwgRE9NIHJlZnMgKHBvcHVsYXRlZCBpbiBzZWN0aW9uIDEwKVxuY29uc3QgZGVidWdQYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdQYW5lbFwiKTtcbmNvbnN0IGRlYnVnVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z1RvZ2dsZVwiKTtcbmNvbnN0IGRlYnVnTG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z0xvZ1wiKTtcbmNvbnN0IGRlYnVnRW50cnlDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdFbnRyeUNvdW50XCIpO1xuY29uc3QgZGVidWdDbGVhckJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdDbGVhckJ0blwiKTtcbmNvbnN0IGRlYnVnQ29weUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVidWdDb3B5QnRuXCIpO1xuLyoqIEB0eXBlIHtBcnJheTx7IHRhZzogc3RyaW5nLCBkYXRhOiB1bmtub3duLCB0czogbnVtYmVyIH0+fSAqL1xubGV0IGRlYnVnRW50cmllcyA9IFtdO1xuXG4vLyBVdGlsaXR5IGZvciBkZWJvdW5jaW5nXG5mdW5jdGlvbiBkZWJvdW5jZShmdW5jLCB0aW1lb3V0ID0gMzAwKSB7XG4gIGxldCB0aW1lcjtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBmdW5jLmFwcGx5KHRoaXMsIGFyZ3MpOyB9LCB0aW1lb3V0KTtcbiAgfTtcbn1cblxuLy8gMS4gVGhlbWUgTWFuYWdlbWVudFxuZnVuY3Rpb24gYXBwbHlUaGVtZSh0aGVtZSkge1xuICBpZiAodGhlbWUgPT09IFwiYXV0b1wiKSB7XG4gICAgY29uc3QgaXNEYXJrID0gd2luZG93Lm1hdGNoTWVkaWEoXCIocHJlZmVycy1jb2xvci1zY2hlbWU6IGRhcmspXCIpLm1hdGNoZXM7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZShcbiAgICAgIFwiZGF0YS10aGVtZVwiLFxuICAgICAgaXNEYXJrID8gXCJkYXJrXCIgOiBcImxpZ2h0XCIsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZGF0YS10aGVtZVwiLCB0aGVtZSk7XG4gIH1cbn1cblxuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVycmVkVGhlbWVcIiwgKGRhdGEpID0+IHtcbiAgY29uc3Qgc2F2ZWQgPSBkYXRhLnByZWZlcnJlZFRoZW1lIHx8IFwiYXV0b1wiO1xuICBpZiAodGhlbWVTZWxlY3QpIHRoZW1lU2VsZWN0LnZhbHVlID0gc2F2ZWQ7XG4gIGFwcGx5VGhlbWUoc2F2ZWQpO1xufSk7XG5cbnRoZW1lU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIChlKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFRoZW1lOiBlLnRhcmdldC52YWx1ZSB9KTtcbiAgYXBwbHlUaGVtZShlLnRhcmdldC52YWx1ZSk7XG59KTtcblxuLy8gMi4gTG9hZCBTYXZlZCBQcmVmZXJlbmNlcyAodm9pY2UsIG1vZGVsLCBzcGVlZClcbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcbiAgeyBwcmVmZXJyZWRWb2ljZTogXCJKYXNwZXJcIiwgcHJlZmVycmVkTW9kZWw6IFwibmFub1wiLCBwcmVmZXJyZWRTcGVlZDogXCIxLjBcIiB9LFxuICAoaXRlbXMpID0+IHtcbiAgICBpZiAodm9pY2VTZWxlY3QpIHZvaWNlU2VsZWN0LnZhbHVlID0gaXRlbXMucHJlZmVycmVkVm9pY2U7XG4gICAgaWYgKG1vZGVsU2VsZWN0KSBtb2RlbFNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZE1vZGVsO1xuICAgIGlmIChzcGVlZElucHV0KSB7XG4gICAgICBzcGVlZElucHV0LnZhbHVlID0gaXRlbXMucHJlZmVycmVkU3BlZWQ7XG4gICAgICBpZiAoc3BlZWRWYWx1ZSkgc3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke2l0ZW1zLnByZWZlcnJlZFNwZWVkfXhgO1xuICAgIH1cbiAgfSxcbik7XG5cbi8vIDMuIFNhdmUgUHJlZmVyZW5jZXMgb24gQ2hhbmdlXG52b2ljZVNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFZvaWNlOiB2b2ljZVNlbGVjdC52YWx1ZSB9KTtcbn0pO1xuXG5tb2RlbFNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZE1vZGVsOiBtb2RlbFNlbGVjdC52YWx1ZSB9KTtcbn0pO1xuXG5jb25zdCBzYXZlU3BlZWQgPSBkZWJvdW5jZSgodmFsdWUpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgcHJlZmVycmVkU3BlZWQ6IHZhbHVlIH0pO1xufSwgNTAwKTtcblxuc3BlZWRJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtzcGVlZElucHV0LnZhbHVlfXhgO1xuICBzYXZlU3BlZWQoc3BlZWRJbnB1dC52YWx1ZSk7XG59KTtcblxuLy8gNC4gQ2hhcmFjdGVyIENvdW50ICYgQ2xlYXIgSW5wdXRcbmZ1bmN0aW9uIHVwZGF0ZUNoYXJDb3VudCgpIHtcbiAgaWYgKGNoYXJDb3VudCAmJiB0ZXh0SW5wdXQpIHtcbiAgICBjb25zdCBsZW4gPSB0ZXh0SW5wdXQudmFsdWUubGVuZ3RoO1xuICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJvdWdoIGVzdGltYXRlOiB+MjAwIGNoYXJzIHBlciBjaHVua1xuICAgICAgY29uc3QgZXN0aW1hdGVkQ2h1bmtzID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGxlbiAvIDIwMCkpO1xuICAgICAgY2hhckNvdW50LnRleHRDb250ZW50ID0gYCR7bGVuLnRvTG9jYWxlU3RyaW5nKCl9IGNoYXJzIFx1MDBCNyB+JHtlc3RpbWF0ZWRDaHVua3N9IGNodW5rJHtlc3RpbWF0ZWRDaHVua3MgPiAxID8gXCJzXCIgOiBcIlwifWA7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGRlYm91bmNlZFVwZGF0ZUNoYXJDb3VudCA9IGRlYm91bmNlKHVwZGF0ZUNoYXJDb3VudCwgMzAwKTtcbnRleHRJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIGRlYm91bmNlZFVwZGF0ZUNoYXJDb3VudCk7XG5cbmNsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAodGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gXCJcIjtcbiAgICB0ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgfVxufSk7XG5cbi8vIDUuIFNpbGVudCBQcmUtV2FybSBvbiBQYW5lbCBMb2FkXG4oYXN5bmMgKCkgPT4ge1xuICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiRU5TVVJFX09GRlNDUkVFTlwiIH0pO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgIHR5cGU6IFwiUFJFV0FSTV9NT0RFTFwiLFxuICAgIG1vZGVsOiBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCIsXG4gIH0pO1xufSkoKTtcblxuLy8gSGVscGVyIHRvIHN0YXJ0IHBsYXliYWNrXG5hc3luYyBmdW5jdGlvbiBzdGFydFBsYXliYWNrKHRleHRUb1BsYXkpIHtcbiAgY29uc3QgdGV4dCA9ICh0ZXh0VG9QbGF5IHx8IHRleHRJbnB1dD8udmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICBpZiAoIXRleHQpIHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsZWFzZSBlbnRlciB0ZXh0IG9yIGV4dHJhY3QgYW4gYXJ0aWNsZS5cIjtcbiAgICByZXR1cm47XG4gIH1cblxuICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiRU5TVVJFX09GRlNDUkVFTlwiIH0pO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLFxuICAgIHR5cGU6IFwiUExBWV9URVhUXCIsXG4gICAgdGV4dCxcbiAgICB2b2ljZTogdm9pY2VTZWxlY3Q/LnZhbHVlIHx8IFwiSmFzcGVyXCIsXG4gICAgc3BlZWQ6IHBhcnNlRmxvYXQoc3BlZWRJbnB1dD8udmFsdWUgfHwgXCIxLjBcIiksXG4gICAgbW9kZWw6IG1vZGVsU2VsZWN0Py52YWx1ZSB8fCBcIm5hbm9cIixcbiAgfSk7XG5cbiAgaWYgKHBsYXlCdG4pIHBsYXlCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoZG93bmxvYWRCdG4pIGRvd25sb2FkQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiU3ludGhlc2l6aW5nIHdpdGggV2ViR1BVLi4uXCI7XG59XG5cbi8vIDYuIFNjYW4gJiBBdXRvLVBsYXkgQXJ0aWNsZSBBY3Rpb25cbmV4dHJhY3RBcnRpY2xlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiQ2hlY2tpbmcgcGFnZSBhY2Nlc3MgcGVybWlzc2lvbnMuLi5cIjtcblxuICAgIGNvbnN0IGdyYW50ZWQgPSBhd2FpdCBjaHJvbWUucGVybWlzc2lvbnMucmVxdWVzdCh7XG4gICAgICBvcmlnaW5zOiBbXCJodHRwOi8vKi8qXCIsIFwiaHR0cHM6Ly8qLypcIl0sXG4gICAgfSk7XG5cbiAgICBpZiAoIWdyYW50ZWQpIHtcbiAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQZXJtaXNzaW9uIGRlbmllZC4gQ2Fubm90IHNjYW4gcGFnZS5cIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlNjYW5uaW5nIGFjdGl2ZSB0YWIgZm9yIGFydGljbGUuLi5cIjtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcblxuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKFxuICAgICAgeyB0eXBlOiBcIkVYVFJBQ1RfQ1VSUkVOVF9UQUJfQVJUSUNMRVwiIH0sXG4gICAgICBhc3luYyAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKHJlc3BvbnNlPy5lcnJvcikge1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KSBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYEVycm9yOiAke3Jlc3BvbnNlLmVycm9yfWA7XG4gICAgICAgICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXNwb25zZT8uYXJ0aWNsZT8udGV4dCkge1xuICAgICAgICAgIGlmICh0ZXh0SW5wdXQpIHRleHRJbnB1dC52YWx1ZSA9IHJlc3BvbnNlLmFydGljbGUudGV4dDtcbiAgICAgICAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICAgICAgICBjb25zdCB0aXRsZVNuaXBwZXQgPVxuICAgICAgICAgICAgcmVzcG9uc2UuYXJ0aWNsZS50aXRsZSA/XG4gICAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUuc2xpY2UoMCwgMjUpICsgXCIuLi5cIlxuICAgICAgICAgICAgOiBcIkFydGljbGVcIjtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgTG9hZGVkIFwiJHt0aXRsZVNuaXBwZXR9XCIuIFJlYWRpbmcuLi5gO1xuXG4gICAgICAgICAgLy8gQXV0by1wbGF5IGltbWVkaWF0ZWx5XG4gICAgICAgICAgYXdhaXQgc3RhcnRQbGF5YmFjayhyZXNwb25zZS5hcnRpY2xlLnRleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChzdGF0dXNUZXh0KVxuICAgICAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9XG4gICAgICAgICAgICAgIFwiQ291bGQgbm90IGZpbmQgYSBzdHJ1Y3R1cmVkIGFydGljbGUgb24gdGhpcyBwYWdlLlwiO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICApO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiRXh0cmFjdGlvbiBlcnJvcjpcIiwgZXJyKTtcbiAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtlcnIubWVzc2FnZX1gO1xuICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgfVxufSk7XG5cbi8vIFN0b3JhZ2UgTGlzdGVuZXJzXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJ0dHNUZXh0XCIsIChkYXRhKSA9PiB7XG4gIGlmIChkYXRhLnR0c1RleHQgJiYgdGV4dElucHV0KSB7XG4gICAgdGV4dElucHV0LnZhbHVlID0gZGF0YS50dHNUZXh0O1xuICAgIHVwZGF0ZUNoYXJDb3VudCgpO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShcInR0c1RleHRcIik7XG4gIH1cbn0pO1xuXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgaWYgKGFyZWEgPT09IFwibG9jYWxcIiAmJiBjaGFuZ2VzLnR0c1RleHQ/Lm5ld1ZhbHVlICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGNoYW5nZXMudHRzVGV4dC5uZXdWYWx1ZTtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuLy8gNy4gUGxheSAmIFN0b3AgTGlzdGVuZXJzXG5wbGF5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gc3RhcnRQbGF5YmFjaygpKTtcblxuc3RvcEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsIHR5cGU6IFwiU1RPUF9BVURJT1wiIH0pO1xuICByZXNldENvbnRyb2xzKFwiU3RvcHBlZC5cIik7XG59KTtcblxuY29uc3QgZG93bmxvYWRBbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbmRvd25sb2FkQW5jaG9yLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZG93bmxvYWRBbmNob3IpO1xuXG5kb3dubG9hZEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoXG4gICAgeyB0YXJnZXQ6IFwib2Zmc2NyZWVuXCIsIHR5cGU6IFwiR0VUX0RPV05MT0FEX0JMT0JcIiB9LFxuICAgIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXM/LmRhdGFVcmwpIHtcbiAgICAgICAgZG93bmxvYWRBbmNob3IuaHJlZiA9IHJlcy5kYXRhVXJsO1xuICAgICAgICBkb3dubG9hZEFuY2hvci5kb3dubG9hZCA9IFwia2l0dGVuLXR0cy1hdWRpby53YXZcIjtcbiAgICAgICAgZG93bmxvYWRBbmNob3IuY2xpY2soKTtcbiAgICAgIH1cbiAgICB9LFxuICApO1xufSk7XG5cbmZ1bmN0aW9uIHJlc2V0Q29udHJvbHMoc3RhdHVzTXNnKSB7XG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gZmFsc2U7XG4gIGlmIChzdG9wQnRuKSBzdG9wQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IFwiMCVcIjtcbiAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdFwiO1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IHN0YXR1c01zZztcbn1cblxuLy8gOC4gUHJvZ3Jlc3MgTGlzdGVuZXIgXHUyMDE0IGNvbm5lY3RlZCB2aWEgUG9ydCBmb3IgemVyby1vdmVyaGVhZCByZWxheSBmcm9tIGJhY2tncm91bmRcbihmdW5jdGlvbiBjb25uZWN0VWlQb3J0KCkge1xuICBjb25zdCBwb3J0ID0gY2hyb21lLnJ1bnRpbWUuY29ubmVjdCh7IG5hbWU6IFwidHRzLXVpXCIgfSk7XG4gIHBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKChtc2cpID0+IHtcbiAgICBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1BST0dSRVNTXCIpIHtcbiAgICAgIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICAgICAgaWYgKHByb2dyZXNzQ29udGFpbmVyKSBwcm9ncmVzc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gYCR7bXNnLnBlcmNlbnR9JWA7XG4gICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgU3ludGhlc2l6aW5nIGF1ZGlvLi4uICR7bXNnLnBlcmNlbnR9JWA7XG4gICAgICB9KTtcbiAgICAgIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19TVEFUVVNcIikge1xuICAgICAgaWYgKG1zZy5zdGF0ZSA9PT0gXCJpZGxlXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhcIkZpbmlzaGVkIHBsYXlpbmcuXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwic3RvcHBlZFwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMoXCJTdG9wcGVkLlwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImVycm9yXCIpIHtcbiAgICAgICAgcmVzZXRDb250cm9scyhtc2cuc3RhdHVzIHx8IFwiRXJyb3Igb2NjdXJyZWRcIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGxheWluZyBhdWRpby4uLlwiO1xuICAgICAgICBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IHBsYXlpbmdcIjtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImJ1c3lcIikge1xuICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gbXNnLnN0YXR1cztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19BVURJT19SRUFEWVwiKSB7XG4gICAgICBkb3dubG9hZEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX0RFQlVHX0xPR1wiKSB7XG4gICAgICAvLyBBcHBlbmQgdG8gaW4tcGFuZWwgZGVidWcgbG9nIGlmIHRoZSBwYW5lbCBleGlzdHNcbiAgICAgIGlmIChkZWJ1Z1BhbmVsICYmIGRlYnVnTG9nKSB7XG4gICAgICAgIC8vIEF1dG8tb3BlbiB0aGUgcGFuZWwgb24gZmlyc3QgZXZlbnQgcmVjZWl2ZWRcbiAgICAgICAgaWYgKCFkZWJ1Z1BhbmVsLm9wZW4gJiYgZGVidWdFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGRlYnVnUGFuZWwub3BlbiA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZGVidWdFbnRyaWVzLnB1c2goeyB0YWc6IG1zZy50YWcsIGRhdGE6IG1zZy5kYXRhLCB0czogbXNnLnRzID8/IERhdGUubm93KCkgfSk7XG4gICAgICAgIC8vIEtlZXAgYnVmZmVyIGJvdW5kZWQgdG8gMjAwIGVudHJpZXNcbiAgICAgICAgaWYgKGRlYnVnRW50cmllcy5sZW5ndGggPiAyMDApIGRlYnVnRW50cmllcy5zaGlmdCgpO1xuICAgICAgICByZW5kZXJEZWJ1Z0xvZygpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIC8vIFJlY29ubmVjdCBpZiB0aGUgc2VydmljZSB3b3JrZXIgcmVzdGFydHMgYW5kIGRyb3BzIHRoZSBwb3J0XG4gIHBvcnQub25EaXNjb25uZWN0LmFkZExpc3RlbmVyKCgpID0+IHNldFRpbWVvdXQoY29ubmVjdFVpUG9ydCwgMjAwKSk7XG59KSgpO1xuXG5cbi8vIDkuIFJlc2V0IEVuZ2luZSBBY3Rpb25cbnJlc2V0R3B1QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUmVzZXR0aW5nIEdQVSBwcm9jZXNzLi4uXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiUkVTRVRfR1BVX09GRlNDUkVFTlwiIH0sIChyZXMpID0+IHtcbiAgICByZXNldENvbnRyb2xzKHJlcz8ubWVzc2FnZSB8fCBcIkVuZ2luZSByZXNldC5cIik7XG4gIH0pO1xufSk7XG5cblxuLy8gXHUyNTAwXHUyNTAwIDEwLiBEZWJ1ZyBQYW5lbCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXG4vKiogUmVuZGVyIGFsbCBkZWJ1ZyBlbnRyaWVzIGludG8gdGhlIGxvZyBwcmUgZWxlbWVudCAqL1xuZnVuY3Rpb24gcmVuZGVyRGVidWdMb2coKSB7XG4gIGlmICghZGVidWdMb2cpIHJldHVybjtcbiAgaWYgKGRlYnVnRW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICBkZWJ1Z0xvZy50ZXh0Q29udGVudCA9IFwiLS0gbm8gbG9nIGVudHJpZXMgeWV0IC0tXCI7XG4gICAgaWYgKGRlYnVnRW50cnlDb3VudCkgZGVidWdFbnRyeUNvdW50LnRleHRDb250ZW50ID0gXCIwIGVudHJpZXNcIjtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGRlYnVnRW50cnlDb3VudCkge1xuICAgIGRlYnVnRW50cnlDb3VudC50ZXh0Q29udGVudCA9IGAke2RlYnVnRW50cmllcy5sZW5ndGh9IGVudHIke2RlYnVnRW50cmllcy5sZW5ndGggPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YDtcbiAgfVxuICBkZWJ1Z0xvZy50ZXh0Q29udGVudCA9IGRlYnVnRW50cmllcy5tYXAoKHsgdGFnLCBkYXRhLCB0cyB9KSA9PiB7XG4gICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKHRzKS50b0lTT1N0cmluZygpLnNsaWNlKDExLCAyMyk7IC8vIEhIOm1tOnNzLm1tbVxuICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICByZXR1cm4gYFske3RpbWV9XSAke3RhZ31cXG4ke3BheWxvYWR9YDtcbiAgfSkuam9pbihcIlxcblxcblwiKTtcbiAgLy8gQXV0by1zY3JvbGwgdG8gYm90dG9tXG4gIGRlYnVnTG9nLnNjcm9sbFRvcCA9IGRlYnVnTG9nLnNjcm9sbEhlaWdodDtcbn1cblxuLy8gUmVhZCBpbml0aWFsIGRlYnVnIGZsYWcgc3RhdGVcbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcIktJVFRFTl9ERUJVR1wiLCAocmVzdWx0KSA9PiB7XG4gIGlmIChkZWJ1Z1RvZ2dsZSkgZGVidWdUb2dnbGUuY2hlY2tlZCA9IHJlc3VsdD8uS0lUVEVOX0RFQlVHID09PSB0cnVlO1xufSk7XG5cbi8vIEtlZXAgdG9nZ2xlIGluIHN5bmMgaWYgY2hhbmdlZCBlbHNld2hlcmVcbmNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgYXJlYSkgPT4ge1xuICBpZiAoYXJlYSA9PT0gXCJsb2NhbFwiICYmIFwiS0lUVEVOX0RFQlVHXCIgaW4gY2hhbmdlcyAmJiBkZWJ1Z1RvZ2dsZSkge1xuICAgIGRlYnVnVG9nZ2xlLmNoZWNrZWQgPSBjaGFuZ2VzLktJVFRFTl9ERUJVRy5uZXdWYWx1ZSA9PT0gdHJ1ZTtcbiAgfVxufSk7XG5cbi8vIFRvZ2dsZSBoYW5kbGVyIFx1MjAxNCBwZXJzaXN0IHRvIHN0b3JhZ2UgKHBpY2tlZCB1cCBieSBhbGwgY29udGV4dHMgdmlhIG9uQ2hhbmdlZClcbmRlYnVnVG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgS0lUVEVOX0RFQlVHOiBkZWJ1Z1RvZ2dsZS5jaGVja2VkIH0pO1xuICBpZiAoZGVidWdUb2dnbGUuY2hlY2tlZCAmJiBkZWJ1Z0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGRlYnVnTG9nKSBkZWJ1Z0xvZy50ZXh0Q29udGVudCA9IFwiLS0gZGVidWcgZW5hYmxlZDogdHJpZ2dlciBhIFBsYXkgdG8gc2VlIGV2ZW50cyAtLVwiO1xuICB9XG59KTtcblxuLy8gQ2xlYXIgYnV0dG9uXG5kZWJ1Z0NsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBkZWJ1Z0VudHJpZXMgPSBbXTtcbiAgcmVuZGVyRGVidWdMb2coKTtcbn0pO1xuXG4vLyBDb3B5IGJ1dHRvbiBcdTIwMTQgY29waWVzIHBsYWluIHRleHQgdG8gY2xpcGJvYXJkXG5kZWJ1Z0NvcHlCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHRleHQgPSBkZWJ1Z0VudHJpZXMubWFwKCh7IHRhZywgZGF0YSwgdHMgfSkgPT4ge1xuICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZSh0cykudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMjMpO1xuICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICByZXR1cm4gYFske3RpbWV9XSAke3RhZ31cXG4ke3BheWxvYWR9YDtcbiAgfSkuam9pbihcIlxcblxcblwiKTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0IHx8IFwiLS0gZW1wdHkgLS1cIik7XG4gICAgaWYgKGRlYnVnQ29weUJ0bikge1xuICAgICAgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3BpZWQhXCI7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKGRlYnVnQ29weUJ0bikgZGVidWdDb3B5QnRuLnRleHRDb250ZW50ID0gXCJDb3B5XCI7IH0sIDE1MDApO1xuICAgIH1cbiAgfSBjYXRjaCAoXykge1xuICAgIC8qIGNsaXBib2FyZCBub3QgYXZhaWxhYmxlICovXG4gIH1cbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUFBLE1BQU0sY0FBYyxTQUFTLGVBQWUsYUFBYTtBQUN6RCxNQUFNLG9CQUFvQixTQUFT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
