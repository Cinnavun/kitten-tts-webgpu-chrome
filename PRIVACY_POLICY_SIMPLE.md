# Privacy Policy — Kitten TTS WebGPU

**We collect ZERO personal data.**

Your text, audio, and preferences never leave your device.

---

## What We Do

- ✅ Process text-to-speech on your GPU (locally only)
- ✅ Save your voice/speed preferences (in chrome.storage.local only)
- ✅ Cache downloaded models (in browser cache only)
- ✅ Extract article text (process locally, don't store)

## What We Don't Do

- ❌ Send text to servers
- ❌ Send audio anywhere
- ❌ Use analytics or tracking
- ❌ Collect browsing history
- ❌ Share data with third parties

---

## Permissions Explained

| Permission | Why | What We Do With It |
|-----------|-----|---|
| `contextMenus` | Add right-click menu | Display "Read with Kitten TTS" only |
| `sidePanel` | Show UI | Display voice controls |
| `storage` | Save preferences | Remember your voice choice (local) |
| `activeTab` | Access page | Extract article text for reading |
| `scripting` | Run extraction | Inject text parser (local) |
| `offscreen` | Run TTS | Generate speech using WebGPU |
| `tabs` | Track sessions | Know which tab you're reading |
| `notifications` | Popup messages | Tell you when models download |

**None transmit your data.**

---

## Model Downloads

- When: First time using Micro or Mini model
- What: Neural network files (~40-78 MB)
- From: HuggingFace CDN
- After: Cached in your browser, no more downloads needed

---

## Your Control

**Delete all extension data:**
1. Chrome Settings → Privacy and Security → Clear browsing data
2. Check "Cookies and other site data"
3. Select the extension
4. Click "Clear"

Done.

---

## Verify Yourself

Source code is public (GPL-3.0):
- https://github.com/cinnavun/kitten-tts-webgpu-chrome
- If we were spying, you'd see it in the code
- Anyone can audit, fork, or build from source

---

## In Compliance

- ✅ Chrome Web Store policies
- ✅ GDPR (zero collection = zero burden)
- ✅ CCPA (zero collection = zero burden)
- ✅ All privacy regulations

---

**Your data stays yours. That's our policy.**
