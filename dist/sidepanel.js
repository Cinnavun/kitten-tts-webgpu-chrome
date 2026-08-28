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
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3NpZGVwYW5lbC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgdGhlbWVTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRoZW1lU2VsZWN0XCIpO1xuY29uc3QgZXh0cmFjdEFydGljbGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImV4dHJhY3RBcnRpY2xlQnRuXCIpO1xuY29uc3Qgdm9pY2VTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInZvaWNlU2VsZWN0XCIpO1xuY29uc3QgbW9kZWxTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1vZGVsU2VsZWN0XCIpO1xuY29uc3Qgc3BlZWRJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWRJbnB1dFwiKTtcbmNvbnN0IHNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkVmFsdWVcIik7XG5jb25zdCB0ZXh0SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRleHRJbnB1dFwiKTtcbmNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhckJ0blwiKTtcbmNvbnN0IHBsYXlCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInBsYXlCdG5cIik7XG5jb25zdCBzdG9wQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdG9wQnRuXCIpO1xuY29uc3QgZG93bmxvYWRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRvd25sb2FkQnRuXCIpO1xuY29uc3Qgc3RhdHVzRG90ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNEb3RcIik7XG5jb25zdCBzdGF0dXNUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNUZXh0XCIpO1xuY29uc3QgcHJvZ3Jlc3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ29udGFpbmVyXCIpO1xuY29uc3QgcHJvZ3Jlc3NGaWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0ZpbGxcIik7XG5jb25zdCByZXNldEdwdUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVzZXRHcHVCdG5cIik7XG5jb25zdCBjaGFyQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXJDb3VudFwiKTtcblxuLy8gVXRpbGl0eSBmb3IgZGVib3VuY2luZ1xuZnVuY3Rpb24gZGVib3VuY2UoZnVuYywgdGltZW91dCA9IDMwMCkge1xuICBsZXQgdGltZXI7XG4gIHJldHVybiAoLi4uYXJncykgPT4ge1xuICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgZnVuYy5hcHBseSh0aGlzLCBhcmdzKTsgfSwgdGltZW91dCk7XG4gIH07XG59XG5cbi8vIDEuIFRoZW1lIE1hbmFnZW1lbnRcbmZ1bmN0aW9uIGFwcGx5VGhlbWUodGhlbWUpIHtcbiAgaWYgKHRoZW1lID09PSBcImF1dG9cIikge1xuICAgIGNvbnN0IGlzRGFyayA9IHdpbmRvdy5tYXRjaE1lZGlhKFwiKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKVwiKS5tYXRjaGVzO1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXG4gICAgICBcImRhdGEtdGhlbWVcIixcbiAgICAgIGlzRGFyayA/IFwiZGFya1wiIDogXCJsaWdodFwiLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZShcImRhdGEtdGhlbWVcIiwgdGhlbWUpO1xuICB9XG59XG5cbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcnJlZFRoZW1lXCIsIChkYXRhKSA9PiB7XG4gIGNvbnN0IHNhdmVkID0gZGF0YS5wcmVmZXJyZWRUaGVtZSB8fCBcImF1dG9cIjtcbiAgaWYgKHRoZW1lU2VsZWN0KSB0aGVtZVNlbGVjdC52YWx1ZSA9IHNhdmVkO1xuICBhcHBseVRoZW1lKHNhdmVkKTtcbn0pO1xuXG50aGVtZVNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoZSkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRUaGVtZTogZS50YXJnZXQudmFsdWUgfSk7XG4gIGFwcGx5VGhlbWUoZS50YXJnZXQudmFsdWUpO1xufSk7XG5cbi8vIDIuIExvYWQgU2F2ZWQgUHJlZmVyZW5jZXMgKHZvaWNlLCBtb2RlbCwgc3BlZWQpXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXG4gIHsgcHJlZmVycmVkVm9pY2U6IFwiSmFzcGVyXCIsIHByZWZlcnJlZE1vZGVsOiBcIm5hbm9cIiwgcHJlZmVycmVkU3BlZWQ6IFwiMS4wXCIgfSxcbiAgKGl0ZW1zKSA9PiB7XG4gICAgaWYgKHZvaWNlU2VsZWN0KSB2b2ljZVNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFZvaWNlO1xuICAgIGlmIChtb2RlbFNlbGVjdCkgbW9kZWxTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRNb2RlbDtcbiAgICBpZiAoc3BlZWRJbnB1dCkge1xuICAgICAgc3BlZWRJbnB1dC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFNwZWVkO1xuICAgICAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtpdGVtcy5wcmVmZXJyZWRTcGVlZH14YDtcbiAgICB9XG4gIH0sXG4pO1xuXG4vLyAzLiBTYXZlIFByZWZlcmVuY2VzIG9uIENoYW5nZVxudm9pY2VTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRWb2ljZTogdm9pY2VTZWxlY3QudmFsdWUgfSk7XG59KTtcblxubW9kZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRNb2RlbDogbW9kZWxTZWxlY3QudmFsdWUgfSk7XG59KTtcblxuY29uc3Qgc2F2ZVNwZWVkID0gZGVib3VuY2UoKHZhbHVlKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFNwZWVkOiB2YWx1ZSB9KTtcbn0sIDUwMCk7XG5cbnNwZWVkSW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7XG4gIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7c3BlZWRJbnB1dC52YWx1ZX14YDtcbiAgc2F2ZVNwZWVkKHNwZWVkSW5wdXQudmFsdWUpO1xufSk7XG5cbi8vIDQuIENoYXJhY3RlciBDb3VudCAmIENsZWFyIElucHV0XG5mdW5jdGlvbiB1cGRhdGVDaGFyQ291bnQoKSB7XG4gIGlmIChjaGFyQ291bnQgJiYgdGV4dElucHV0KSB7XG4gICAgY29uc3QgbGVuID0gdGV4dElucHV0LnZhbHVlLmxlbmd0aDtcbiAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSb3VnaCBlc3RpbWF0ZTogfjIwMCBjaGFycyBwZXIgY2h1bmtcbiAgICAgIGNvbnN0IGVzdGltYXRlZENodW5rcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChsZW4gLyAyMDApKTtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IGAke2xlbi50b0xvY2FsZVN0cmluZygpfSBjaGFycyBcdTAwQjcgfiR7ZXN0aW1hdGVkQ2h1bmtzfSBjaHVuayR7ZXN0aW1hdGVkQ2h1bmtzID4gMSA/IFwic1wiIDogXCJcIn1gO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQgPSBkZWJvdW5jZSh1cGRhdGVDaGFyQ291bnQsIDMwMCk7XG50ZXh0SW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQpO1xuXG5jbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IFwiXCI7XG4gICAgdGV4dElucHV0LmZvY3VzKCk7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gIH1cbn0pO1xuXG4vLyA1LiBTaWxlbnQgUHJlLVdhcm0gb24gUGFuZWwgTG9hZFxuKGFzeW5jICgpID0+IHtcbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICB0eXBlOiBcIlBSRVdBUk1fTU9ERUxcIixcbiAgICBtb2RlbDogbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiLFxuICB9KTtcbn0pKCk7XG5cbi8vIEhlbHBlciB0byBzdGFydCBwbGF5YmFja1xuYXN5bmMgZnVuY3Rpb24gc3RhcnRQbGF5YmFjayh0ZXh0VG9QbGF5KSB7XG4gIGNvbnN0IHRleHQgPSAodGV4dFRvUGxheSB8fCB0ZXh0SW5wdXQ/LnZhbHVlIHx8IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCF0ZXh0KSB7XG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGVhc2UgZW50ZXIgdGV4dCBvciBleHRyYWN0IGFuIGFydGljbGUuXCI7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICB0eXBlOiBcIlBMQVlfVEVYVFwiLFxuICAgIHRleHQsXG4gICAgdm9pY2U6IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiLFxuICAgIHNwZWVkOiBwYXJzZUZsb2F0KHNwZWVkSW5wdXQ/LnZhbHVlIHx8IFwiMS4wXCIpLFxuICAgIG1vZGVsOiBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCIsXG4gIH0pO1xuXG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgaWYgKGRvd25sb2FkQnRuKSBkb3dubG9hZEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlN5bnRoZXNpemluZyB3aXRoIFdlYkdQVS4uLlwiO1xufVxuXG4vLyA2LiBTY2FuICYgQXV0by1QbGF5IEFydGljbGUgQWN0aW9uXG5leHRyYWN0QXJ0aWNsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNoZWNraW5nIHBhZ2UgYWNjZXNzIHBlcm1pc3Npb25zLi4uXCI7XG5cbiAgICBjb25zdCBncmFudGVkID0gYXdhaXQgY2hyb21lLnBlcm1pc3Npb25zLnJlcXVlc3Qoe1xuICAgICAgb3JpZ2luczogW1wiaHR0cDovLyovKlwiLCBcImh0dHBzOi8vKi8qXCJdLFxuICAgIH0pO1xuXG4gICAgaWYgKCFncmFudGVkKSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGVybWlzc2lvbiBkZW5pZWQuIENhbm5vdCBzY2FuIHBhZ2UuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJTY2FubmluZyBhY3RpdmUgdGFiIGZvciBhcnRpY2xlLi4uXCI7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG5cbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShcbiAgICAgIHsgdHlwZTogXCJFWFRSQUNUX0NVUlJFTlRfVEFCX0FSVElDTEVcIiB9LFxuICAgICAgYXN5bmMgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChyZXNwb25zZT8uZXJyb3IpIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtyZXNwb25zZS5lcnJvcn1gO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzcG9uc2U/LmFydGljbGU/LnRleHQpIHtcbiAgICAgICAgICBpZiAodGV4dElucHV0KSB0ZXh0SW5wdXQudmFsdWUgPSByZXNwb25zZS5hcnRpY2xlLnRleHQ7XG4gICAgICAgICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgICAgICAgY29uc3QgdGl0bGVTbmlwcGV0ID1cbiAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUgP1xuICAgICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlLnNsaWNlKDAsIDI1KSArIFwiLi4uXCJcbiAgICAgICAgICAgIDogXCJBcnRpY2xlXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYExvYWRlZCBcIiR7dGl0bGVTbmlwcGV0fVwiLiBSZWFkaW5nLi4uYDtcblxuICAgICAgICAgIC8vIEF1dG8tcGxheSBpbW1lZGlhdGVseVxuICAgICAgICAgIGF3YWl0IHN0YXJ0UGxheWJhY2socmVzcG9uc2UuYXJ0aWNsZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPVxuICAgICAgICAgICAgICBcIkNvdWxkIG5vdCBmaW5kIGEgc3RydWN0dXJlZCBhcnRpY2xlIG9uIHRoaXMgcGFnZS5cIjtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkV4dHJhY3Rpb24gZXJyb3I6XCIsIGVycik7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbn0pO1xuXG4vLyBTdG9yYWdlIExpc3RlbmVyc1xuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwidHRzVGV4dFwiLCAoZGF0YSkgPT4ge1xuICBpZiAoZGF0YS50dHNUZXh0ICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudHRzVGV4dDtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgY2hhbmdlcy50dHNUZXh0Py5uZXdWYWx1ZSAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBjaGFuZ2VzLnR0c1RleHQubmV3VmFsdWU7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbi8vIDcuIFBsYXkgJiBTdG9wIExpc3RlbmVyc1xucGxheUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHN0YXJ0UGxheWJhY2soKSk7XG5cbnN0b3BCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNUT1BfQVVESU9cIiB9KTtcbiAgcmVzZXRDb250cm9scyhcIlN0b3BwZWQuXCIpO1xufSk7XG5cbmNvbnN0IGRvd25sb2FkQW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG5kb3dubG9hZEFuY2hvci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRvd25sb2FkQW5jaG9yKTtcblxuZG93bmxvYWRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKFxuICAgIHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIkdFVF9ET1dOTE9BRF9CTE9CXCIgfSxcbiAgICAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzPy5kYXRhVXJsKSB7XG4gICAgICAgIGRvd25sb2FkQW5jaG9yLmhyZWYgPSByZXMuZGF0YVVybDtcbiAgICAgICAgZG93bmxvYWRBbmNob3IuZG93bmxvYWQgPSBcImtpdHRlbi10dHMtYXVkaW8ud2F2XCI7XG4gICAgICAgIGRvd25sb2FkQW5jaG9yLmNsaWNrKCk7XG4gICAgICB9XG4gICAgfSxcbiAgKTtcbn0pO1xuXG5mdW5jdGlvbiByZXNldENvbnRyb2xzKHN0YXR1c01zZykge1xuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBzdGF0dXNNc2c7XG59XG5cbi8vIDguIFByb2dyZXNzIExpc3RlbmVyIFx1MjAxNCBjb25uZWN0ZWQgdmlhIFBvcnQgZm9yIHplcm8tb3ZlcmhlYWQgcmVsYXkgZnJvbSBiYWNrZ3JvdW5kXG4oZnVuY3Rpb24gY29ubmVjdFVpUG9ydCgpIHtcbiAgY29uc3QgcG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3QoeyBuYW1lOiBcInR0cy11aVwiIH0pO1xuICBwb3J0Lm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobXNnKSA9PiB7XG4gICAgaWYgKG1zZy50eXBlID09PSBcIlRUU19QUk9HUkVTU1wiKSB7XG4gICAgICBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgICAgIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGlmIChwcm9ncmVzc0ZpbGwpIHByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IGAke21zZy5wZXJjZW50fSVgO1xuICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYFN5bnRoZXNpemluZyBhdWRpby4uLiAke21zZy5wZXJjZW50fSVgO1xuICAgICAgfSk7XG4gICAgICBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfU1RBVFVTXCIpIHtcbiAgICAgIGlmIChtc2cuc3RhdGUgPT09IFwiaWRsZVwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMoXCJGaW5pc2hlZCBwbGF5aW5nLlwiKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcInN0b3BwZWRcIikge1xuICAgICAgICByZXNldENvbnRyb2xzKFwiU3RvcHBlZC5cIik7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgIHJlc2V0Q29udHJvbHMobXNnLnN0YXR1cyB8fCBcIkVycm9yIG9jY3VycmVkXCIpO1xuICAgICAgfSBlbHNlIGlmIChtc2cuc3RhdGUgPT09IFwicGxheWluZ1wiKSB7XG4gICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsYXlpbmcgYXVkaW8uLi5cIjtcbiAgICAgICAgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBwbGF5aW5nXCI7XG4gICAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJidXN5XCIpIHtcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IG1zZy5zdGF0dXM7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJUVFNfQVVESU9fUkVBRFlcIikge1xuICAgICAgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9XG4gIH0pO1xuICAvLyBSZWNvbm5lY3QgaWYgdGhlIHNlcnZpY2Ugd29ya2VyIHJlc3RhcnRzIGFuZCBkcm9wcyB0aGUgcG9ydFxuICBwb3J0Lm9uRGlzY29ubmVjdC5hZGRMaXN0ZW5lcigoKSA9PiBzZXRUaW1lb3V0KGNvbm5lY3RVaVBvcnQsIDIwMCkpO1xufSkoKTtcblxuXG4vLyA5LiBSZXNldCBFbmdpbmUgQWN0aW9uXG5yZXNldEdwdUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlJlc2V0dGluZyBHUFUgcHJvY2Vzcy4uLlwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIlJFU0VUX0dQVV9PRkZTQ1JFRU5cIiB9LCAocmVzKSA9PiB7XG4gICAgcmVzZXRDb250cm9scyhyZXM/Lm1lc3NhZ2UgfHwgXCJFbmdpbmUgcmVzZXQuXCIpO1xuICB9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFBQSxNQUFNLGNBQWMsU0FBUyxlQUFlLGFBQWE7QUFDekQsTUFBTSxvQkFBb0IsU0FBUyxlQUFlLG1CQUFtQjtBQUNyRSxNQUFNLGNBQWMsU0FBUyxlQUFlLGFBQWE7QUFDekQsTUFBTSxjQUFjLFNBQVMsZUFBZSxhQUFhO0FBQ3pELE1BQU0sYUFBYSxTQUFTLGVBQWUsWUFBWTtBQUN2RCxNQUFNLGFBQWEsU0FBUyxlQUFlLFlBQVk7QUFDdkQsTUFBTSxZQUFZLFNBQVMsZUFBZSxXQUFXO0FBQ3JELE1BQU0sV0FBVyxTQUFTLGVBQWUsVUFBVTtBQUNuRCxNQUFNLFVBQVUsU0FBUyxlQUFlLFNBQVM7QUFDakQsTUFBTSxVQUFVLFNBQVMsZUFBZSxTQUFTO0FBQ2pELE1BQU0sY0FBYyxTQUFTLGVBQWUs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
