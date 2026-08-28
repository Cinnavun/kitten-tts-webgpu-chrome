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
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TTS_PROGRESS") {
      statusDot.className = "status-dot busy";
      if (progressContainer) progressContainer.style.display = "block";
      if (progressFill) progressFill.style.width = `${msg.percent}%`;
      statusText.textContent = `Synthesizing audio... ${msg.percent}%`;
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
  resetGpuBtn?.addEventListener("click", () => {
    if (statusText) statusText.textContent = "Resetting GPU process...";
    if (statusDot) statusDot.className = "status-dot busy";
    chrome.runtime.sendMessage({ type: "RESET_GPU_OFFSCREEN" }, (res) => {
      resetControls(res?.message || "Engine reset.");
    });
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3NpZGVwYW5lbC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgdGhlbWVTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRoZW1lU2VsZWN0XCIpO1xuY29uc3QgZXh0cmFjdEFydGljbGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImV4dHJhY3RBcnRpY2xlQnRuXCIpO1xuY29uc3Qgdm9pY2VTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInZvaWNlU2VsZWN0XCIpO1xuY29uc3QgbW9kZWxTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1vZGVsU2VsZWN0XCIpO1xuY29uc3Qgc3BlZWRJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWRJbnB1dFwiKTtcbmNvbnN0IHNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkVmFsdWVcIik7XG5jb25zdCB0ZXh0SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRleHRJbnB1dFwiKTtcbmNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhckJ0blwiKTtcbmNvbnN0IHBsYXlCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInBsYXlCdG5cIik7XG5jb25zdCBzdG9wQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdG9wQnRuXCIpO1xuY29uc3QgZG93bmxvYWRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRvd25sb2FkQnRuXCIpO1xuY29uc3Qgc3RhdHVzRG90ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNEb3RcIik7XG5jb25zdCBzdGF0dXNUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0dXNUZXh0XCIpO1xuY29uc3QgcHJvZ3Jlc3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ29udGFpbmVyXCIpO1xuY29uc3QgcHJvZ3Jlc3NGaWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0ZpbGxcIik7XG5jb25zdCByZXNldEdwdUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVzZXRHcHVCdG5cIik7XG5jb25zdCBjaGFyQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXJDb3VudFwiKTtcblxuLy8gVXRpbGl0eSBmb3IgZGVib3VuY2luZ1xuZnVuY3Rpb24gZGVib3VuY2UoZnVuYywgdGltZW91dCA9IDMwMCkge1xuICBsZXQgdGltZXI7XG4gIHJldHVybiAoLi4uYXJncykgPT4ge1xuICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgZnVuYy5hcHBseSh0aGlzLCBhcmdzKTsgfSwgdGltZW91dCk7XG4gIH07XG59XG5cbi8vIDEuIFRoZW1lIE1hbmFnZW1lbnRcbmZ1bmN0aW9uIGFwcGx5VGhlbWUodGhlbWUpIHtcbiAgaWYgKHRoZW1lID09PSBcImF1dG9cIikge1xuICAgIGNvbnN0IGlzRGFyayA9IHdpbmRvdy5tYXRjaE1lZGlhKFwiKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKVwiKS5tYXRjaGVzO1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoXG4gICAgICBcImRhdGEtdGhlbWVcIixcbiAgICAgIGlzRGFyayA/IFwiZGFya1wiIDogXCJsaWdodFwiLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZShcImRhdGEtdGhlbWVcIiwgdGhlbWUpO1xuICB9XG59XG5cbmNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcnJlZFRoZW1lXCIsIChkYXRhKSA9PiB7XG4gIGNvbnN0IHNhdmVkID0gZGF0YS5wcmVmZXJyZWRUaGVtZSB8fCBcImF1dG9cIjtcbiAgaWYgKHRoZW1lU2VsZWN0KSB0aGVtZVNlbGVjdC52YWx1ZSA9IHNhdmVkO1xuICBhcHBseVRoZW1lKHNhdmVkKTtcbn0pO1xuXG50aGVtZVNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoZSkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRUaGVtZTogZS50YXJnZXQudmFsdWUgfSk7XG4gIGFwcGx5VGhlbWUoZS50YXJnZXQudmFsdWUpO1xufSk7XG5cbi8vIDIuIExvYWQgU2F2ZWQgUHJlZmVyZW5jZXMgKHZvaWNlLCBtb2RlbCwgc3BlZWQpXG5jaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXG4gIHsgcHJlZmVycmVkVm9pY2U6IFwiSmFzcGVyXCIsIHByZWZlcnJlZE1vZGVsOiBcIm5hbm9cIiwgcHJlZmVycmVkU3BlZWQ6IFwiMS4wXCIgfSxcbiAgKGl0ZW1zKSA9PiB7XG4gICAgaWYgKHZvaWNlU2VsZWN0KSB2b2ljZVNlbGVjdC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFZvaWNlO1xuICAgIGlmIChtb2RlbFNlbGVjdCkgbW9kZWxTZWxlY3QudmFsdWUgPSBpdGVtcy5wcmVmZXJyZWRNb2RlbDtcbiAgICBpZiAoc3BlZWRJbnB1dCkge1xuICAgICAgc3BlZWRJbnB1dC52YWx1ZSA9IGl0ZW1zLnByZWZlcnJlZFNwZWVkO1xuICAgICAgaWYgKHNwZWVkVmFsdWUpIHNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtpdGVtcy5wcmVmZXJyZWRTcGVlZH14YDtcbiAgICB9XG4gIH0sXG4pO1xuXG4vLyAzLiBTYXZlIFByZWZlcmVuY2VzIG9uIENoYW5nZVxudm9pY2VTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRWb2ljZTogdm9pY2VTZWxlY3QudmFsdWUgfSk7XG59KTtcblxubW9kZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcmVmZXJyZWRNb2RlbDogbW9kZWxTZWxlY3QudmFsdWUgfSk7XG59KTtcblxuY29uc3Qgc2F2ZVNwZWVkID0gZGVib3VuY2UoKHZhbHVlKSA9PiB7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByZWZlcnJlZFNwZWVkOiB2YWx1ZSB9KTtcbn0sIDUwMCk7XG5cbnNwZWVkSW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7XG4gIGlmIChzcGVlZFZhbHVlKSBzcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7c3BlZWRJbnB1dC52YWx1ZX14YDtcbiAgc2F2ZVNwZWVkKHNwZWVkSW5wdXQudmFsdWUpO1xufSk7XG5cbi8vIDQuIENoYXJhY3RlciBDb3VudCAmIENsZWFyIElucHV0XG5mdW5jdGlvbiB1cGRhdGVDaGFyQ291bnQoKSB7XG4gIGlmIChjaGFyQ291bnQgJiYgdGV4dElucHV0KSB7XG4gICAgY29uc3QgbGVuID0gdGV4dElucHV0LnZhbHVlLmxlbmd0aDtcbiAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICBjaGFyQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSb3VnaCBlc3RpbWF0ZTogfjIwMCBjaGFycyBwZXIgY2h1bmtcbiAgICAgIGNvbnN0IGVzdGltYXRlZENodW5rcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChsZW4gLyAyMDApKTtcbiAgICAgIGNoYXJDb3VudC50ZXh0Q29udGVudCA9IGAke2xlbi50b0xvY2FsZVN0cmluZygpfSBjaGFycyBcdTAwQjcgfiR7ZXN0aW1hdGVkQ2h1bmtzfSBjaHVuayR7ZXN0aW1hdGVkQ2h1bmtzID4gMSA/IFwic1wiIDogXCJcIn1gO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQgPSBkZWJvdW5jZSh1cGRhdGVDaGFyQ291bnQsIDMwMCk7XG50ZXh0SW5wdXQ/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCBkZWJvdW5jZWRVcGRhdGVDaGFyQ291bnQpO1xuXG5jbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgaWYgKHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IFwiXCI7XG4gICAgdGV4dElucHV0LmZvY3VzKCk7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gIH1cbn0pO1xuXG4vLyA1LiBTaWxlbnQgUHJlLVdhcm0gb24gUGFuZWwgTG9hZFxuKGFzeW5jICgpID0+IHtcbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICB0eXBlOiBcIlBSRVdBUk1fTU9ERUxcIixcbiAgICBtb2RlbDogbW9kZWxTZWxlY3Q/LnZhbHVlIHx8IFwibmFub1wiLFxuICB9KTtcbn0pKCk7XG5cbi8vIEhlbHBlciB0byBzdGFydCBwbGF5YmFja1xuYXN5bmMgZnVuY3Rpb24gc3RhcnRQbGF5YmFjayh0ZXh0VG9QbGF5KSB7XG4gIGNvbnN0IHRleHQgPSAodGV4dFRvUGxheSB8fCB0ZXh0SW5wdXQ/LnZhbHVlIHx8IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCF0ZXh0KSB7XG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJQbGVhc2UgZW50ZXIgdGV4dCBvciBleHRyYWN0IGFuIGFydGljbGUuXCI7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9PRkZTQ1JFRU5cIiB9KTtcbiAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgIHRhcmdldDogXCJvZmZzY3JlZW5cIixcbiAgICB0eXBlOiBcIlBMQVlfVEVYVFwiLFxuICAgIHRleHQsXG4gICAgdm9pY2U6IHZvaWNlU2VsZWN0Py52YWx1ZSB8fCBcIkphc3BlclwiLFxuICAgIHNwZWVkOiBwYXJzZUZsb2F0KHNwZWVkSW5wdXQ/LnZhbHVlIHx8IFwiMS4wXCIpLFxuICAgIG1vZGVsOiBtb2RlbFNlbGVjdD8udmFsdWUgfHwgXCJuYW5vXCIsXG4gIH0pO1xuXG4gIGlmIChwbGF5QnRuKSBwbGF5QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgaWYgKHN0b3BCdG4pIHN0b3BCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgaWYgKGRvd25sb2FkQnRuKSBkb3dubG9hZEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlN5bnRoZXNpemluZyB3aXRoIFdlYkdQVS4uLlwiO1xufVxuXG4vLyA2LiBTY2FuICYgQXV0by1QbGF5IEFydGljbGUgQWN0aW9uXG5leHRyYWN0QXJ0aWNsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIkNoZWNraW5nIHBhZ2UgYWNjZXNzIHBlcm1pc3Npb25zLi4uXCI7XG5cbiAgICBjb25zdCBncmFudGVkID0gYXdhaXQgY2hyb21lLnBlcm1pc3Npb25zLnJlcXVlc3Qoe1xuICAgICAgb3JpZ2luczogW1wiaHR0cDovLyovKlwiLCBcImh0dHBzOi8vKi8qXCJdLFxuICAgIH0pO1xuXG4gICAgaWYgKCFncmFudGVkKSB7XG4gICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUGVybWlzc2lvbiBkZW5pZWQuIENhbm5vdCBzY2FuIHBhZ2UuXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gXCJTY2FubmluZyBhY3RpdmUgdGFiIGZvciBhcnRpY2xlLi4uXCI7XG4gICAgaWYgKHN0YXR1c0RvdCkgc3RhdHVzRG90LmNsYXNzTmFtZSA9IFwic3RhdHVzLWRvdCBidXN5XCI7XG5cbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShcbiAgICAgIHsgdHlwZTogXCJFWFRSQUNUX0NVUlJFTlRfVEFCX0FSVElDTEVcIiB9LFxuICAgICAgYXN5bmMgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChyZXNwb25zZT8uZXJyb3IpIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBFcnJvcjogJHtyZXNwb25zZS5lcnJvcn1gO1xuICAgICAgICAgIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzcG9uc2U/LmFydGljbGU/LnRleHQpIHtcbiAgICAgICAgICBpZiAodGV4dElucHV0KSB0ZXh0SW5wdXQudmFsdWUgPSByZXNwb25zZS5hcnRpY2xlLnRleHQ7XG4gICAgICAgICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgICAgICAgY29uc3QgdGl0bGVTbmlwcGV0ID1cbiAgICAgICAgICAgIHJlc3BvbnNlLmFydGljbGUudGl0bGUgP1xuICAgICAgICAgICAgICByZXNwb25zZS5hcnRpY2xlLnRpdGxlLnNsaWNlKDAsIDI1KSArIFwiLi4uXCJcbiAgICAgICAgICAgIDogXCJBcnRpY2xlXCI7XG4gICAgICAgICAgaWYgKHN0YXR1c1RleHQpXG4gICAgICAgICAgICBzdGF0dXNUZXh0LnRleHRDb250ZW50ID0gYExvYWRlZCBcIiR7dGl0bGVTbmlwcGV0fVwiLiBSZWFkaW5nLi4uYDtcblxuICAgICAgICAgIC8vIEF1dG8tcGxheSBpbW1lZGlhdGVseVxuICAgICAgICAgIGF3YWl0IHN0YXJ0UGxheWJhY2socmVzcG9uc2UuYXJ0aWNsZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoc3RhdHVzVGV4dClcbiAgICAgICAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPVxuICAgICAgICAgICAgICBcIkNvdWxkIG5vdCBmaW5kIGEgc3RydWN0dXJlZCBhcnRpY2xlIG9uIHRoaXMgcGFnZS5cIjtcbiAgICAgICAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkV4dHJhY3Rpb24gZXJyb3I6XCIsIGVycik7XG4gICAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgICBpZiAoc3RhdHVzRG90KSBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90XCI7XG4gIH1cbn0pO1xuXG4vLyBTdG9yYWdlIExpc3RlbmVyc1xuY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwidHRzVGV4dFwiLCAoZGF0YSkgPT4ge1xuICBpZiAoZGF0YS50dHNUZXh0ICYmIHRleHRJbnB1dCkge1xuICAgIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudHRzVGV4dDtcbiAgICB1cGRhdGVDaGFyQ291bnQoKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoXCJ0dHNUZXh0XCIpO1xuICB9XG59KTtcblxuY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhKSA9PiB7XG4gIGlmIChhcmVhID09PSBcImxvY2FsXCIgJiYgY2hhbmdlcy50dHNUZXh0Py5uZXdWYWx1ZSAmJiB0ZXh0SW5wdXQpIHtcbiAgICB0ZXh0SW5wdXQudmFsdWUgPSBjaGFuZ2VzLnR0c1RleHQubmV3VmFsdWU7XG4gICAgdXBkYXRlQ2hhckNvdW50KCk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKFwidHRzVGV4dFwiKTtcbiAgfVxufSk7XG5cbi8vIDcuIFBsYXkgJiBTdG9wIExpc3RlbmVyc1xucGxheUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHN0YXJ0UGxheWJhY2soKSk7XG5cbnN0b3BCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIlNUT1BfQVVESU9cIiB9KTtcbiAgcmVzZXRDb250cm9scyhcIlN0b3BwZWQuXCIpO1xufSk7XG5cbmNvbnN0IGRvd25sb2FkQW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG5kb3dubG9hZEFuY2hvci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRvd25sb2FkQW5jaG9yKTtcblxuZG93bmxvYWRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKFxuICAgIHsgdGFyZ2V0OiBcIm9mZnNjcmVlblwiLCB0eXBlOiBcIkdFVF9ET1dOTE9BRF9CTE9CXCIgfSxcbiAgICAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzPy5kYXRhVXJsKSB7XG4gICAgICAgIGRvd25sb2FkQW5jaG9yLmhyZWYgPSByZXMuZGF0YVVybDtcbiAgICAgICAgZG93bmxvYWRBbmNob3IuZG93bmxvYWQgPSBcImtpdHRlbi10dHMtYXVkaW8ud2F2XCI7XG4gICAgICAgIGRvd25sb2FkQW5jaG9yLmNsaWNrKCk7XG4gICAgICB9XG4gICAgfSxcbiAgKTtcbn0pO1xuXG5mdW5jdGlvbiByZXNldENvbnRyb2xzKHN0YXR1c01zZykge1xuICBpZiAocGxheUJ0bikgcGxheUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICBpZiAoc3RvcEJ0bikgc3RvcEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gIGlmIChwcm9ncmVzc0NvbnRhaW5lcikgcHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAocHJvZ3Jlc3NGaWxsKSBwcm9ncmVzc0ZpbGwuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3RcIjtcbiAgaWYgKHN0YXR1c1RleHQpIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBzdGF0dXNNc2c7XG59XG5cbi8vIDguIFByb2dyZXNzIExpc3RlbmVyXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1zZykgPT4ge1xuICBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1BST0dSRVNTXCIpIHtcbiAgICBzdGF0dXNEb3QuY2xhc3NOYW1lID0gXCJzdGF0dXMtZG90IGJ1c3lcIjtcbiAgICBpZiAocHJvZ3Jlc3NDb250YWluZXIpIHByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgaWYgKHByb2dyZXNzRmlsbCkgcHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gYCR7bXNnLnBlcmNlbnR9JWA7XG4gICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IGBTeW50aGVzaXppbmcgYXVkaW8uLi4gJHttc2cucGVyY2VudH0lYDtcbiAgICBzdG9wQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwiVFRTX1NUQVRVU1wiKSB7XG4gICAgaWYgKG1zZy5zdGF0ZSA9PT0gXCJpZGxlXCIpIHtcbiAgICAgIHJlc2V0Q29udHJvbHMoXCJGaW5pc2hlZCBwbGF5aW5nLlwiKTtcbiAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJzdG9wcGVkXCIpIHtcbiAgICAgIHJlc2V0Q29udHJvbHMoXCJTdG9wcGVkLlwiKTtcbiAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJlcnJvclwiKSB7XG4gICAgICByZXNldENvbnRyb2xzKG1zZy5zdGF0dXMgfHwgXCJFcnJvciBvY2N1cnJlZFwiKTtcbiAgICB9IGVsc2UgaWYgKG1zZy5zdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcbiAgICAgIHN0YXR1c1RleHQudGV4dENvbnRlbnQgPSBcIlBsYXlpbmcgYXVkaW8uLi5cIjtcbiAgICAgIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgcGxheWluZ1wiO1xuICAgIH0gZWxzZSBpZiAobXNnLnN0YXRlID09PSBcImJ1c3lcIikge1xuICAgICAgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IG1zZy5zdGF0dXM7XG4gICAgfVxuICB9IGVsc2UgaWYgKG1zZy50eXBlID09PSBcIlRUU19BVURJT19SRUFEWVwiKSB7XG4gICAgZG93bmxvYWRCdG4uc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgfVxufSk7XG5cbi8vIDkuIFJlc2V0IEVuZ2luZSBBY3Rpb25cbnJlc2V0R3B1QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBpZiAoc3RhdHVzVGV4dCkgc3RhdHVzVGV4dC50ZXh0Q29udGVudCA9IFwiUmVzZXR0aW5nIEdQVSBwcm9jZXNzLi4uXCI7XG4gIGlmIChzdGF0dXNEb3QpIHN0YXR1c0RvdC5jbGFzc05hbWUgPSBcInN0YXR1cy1kb3QgYnVzeVwiO1xuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiUkVTRVRfR1BVX09GRlNDUkVFTlwiIH0sIChyZXMpID0+IHtcbiAgICByZXNldENvbnRyb2xzKHJlcz8ubWVzc2FnZSB8fCBcIkVuZ2luZSByZXNldC5cIik7XG4gIH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUFBLE1BQU0sY0FBYyxTQUFTLGVBQWUsYUFBYTtBQUN6RCxNQUFNLG9CQUFvQixTQUFTLGVBQWUsbUJBQW1CO0FBQ3JFLE1BQU0sY0FBYyxTQUFTLGVBQWUsYUFBYTtBQUN6RCxNQUFNLGNBQWMsU0FBUyxlQUFlLGFBQWE7QUFDekQsTUFBTSxhQUFhLFNBQVMsZUFBZSxZQUFZO0FBQ3ZELE1BQU0sYUFBYSxTQUFTLGVBQWUsWUFBWTtBQUN2RCxNQUFNLFlBQVksU0FBUyxlQUFlLFdBQVc7QUFDckQsTUFBTSxXQUFXLFNBQVMsZUFBZSxVQUFVO0FBQ25ELE1BQU0sVUFBVSxTQUFTLGVBQWUsU0FBUztBQUNqRCxNQUFNLFVBQVUsU0FBUyxlQUFlLFNBQVM7QUFDakQsTUFBTSxjQUFjLFNBQVMsZUFBZSxhQUFhO0FBQ3pELE1BQU0sWUFBWSxTQUFTLGVBQWUsV0FBVztBQUNyRCxNQUFNLGFBQWEsU0FBUyxlQUFlLFlBQVk7QUFDdkQsTUFBTSxvQkFBb0IsU0FBUyxlQUFlLG1CQUFtQjtBQUNyRSxNQUFNLGVBQWUsU0FBUyxlQUFlLGNBQWM7QUFDM0QsTUFBTSxjQUFjLFNBQVMsZUFBZSxhQUFhO0FBQ3pELE1BQU0sWUFBWSxTQUFTLGVBQWUsV0FBVztBQUdyRCxXQUFTLFNBQVMsTUFBTSxVQUFVLEtBQUs7QUFDckMsUUFBSTtBQUNKLFdBQU8sSUFBSSxTQUFTO0FBQ2xCLG1CQUFhLEtBQUs7QUFDbEIsY0FBUSxXQUFXLE1BQU07QUFBRSxhQUFLLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFBRyxHQUFHLE9BQU87QUFBQSxJQUMvRDtBQUFBLEVBQ0Y7QUFHQSxXQUFTLFdBQVcsT0FBTztBQUN6QixRQUFJLFVB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
