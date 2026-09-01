// content.js
if (!window["__kittenTTSInjected"]) {
  window["__kittenTTSInjected"] = true;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SHOW_TOAST") {
      showToast(msg.payload);
      sendResponse({ success: true });
    }
    return true;
  });
let lastToastTime = 0;

function showToast(payload) {
  const now = Date.now();
  if (now - lastToastTime < 200 && payload.action !== "remove") return;
  lastToastTime = now;

  let toast = document.getElementById("__kitten_tts_toast");
  
  if (payload.action === "remove") {
    if (toast) {
      toast.style.opacity = "0";
      setTimeout(() => toast?.remove(), 300);
    }
    return;
  }

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "__kitten_tts_toast";
    toast.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif;
      font-size: 12px; font-weight: 500; padding: 8px 14px; border-radius: 20px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 10px;
      border: 1px solid rgba(255,255,255,0.1); transition: opacity 0.2s ease, transform 0.2s ease;
    `;
    if (document.body) document.body.appendChild(toast);
  }

  toast.style.opacity = "1";
  toast.innerHTML = "";
  
  const textSpan = document.createElement("span");
  textSpan.innerHTML = "🐾 <strong>Kitten TTS:</strong> ";
  textSpan.appendChild(document.createTextNode(payload.text || ""));
  
  const stopBtn = document.createElement("button");
  stopBtn.id = "__kitten_stop_btn";
  stopBtn.textContent = "⏹ Stop";
  stopBtn.style.cssText = `
    background: #ef4444; border: none; color: white; padding: 2px 8px;
    border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 600;
  `;
  
  toast.appendChild(textSpan);
  toast.appendChild(stopBtn);

  document.getElementById("__kitten_stop_btn")?.addEventListener("click", () => {
    chrome.runtime?.sendMessage?.({ target: "offscreen", type: "STOP_AUDIO" });
    toast.remove();
  });
}
}
