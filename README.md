# 🐾 Kitten TTS WebGPU — Chrome Extension

A fast, private, 100% on-device Text-to-Speech Chrome extension powered by **WebGPU** and **KittenTTS**. Run lightweight, neural voice synthesis locally in your browser with zero server latency, zero API costs, and complete privacy.

\---

## ✨ Features

* **⚡ 100% Local WebGPU Inference:** Synthesizes speech directly on your local GPU via ONNX Runtime Web. No text is ever sent to cloud servers.
* **📰 Smart Article Extraction:** Extract readable text from any blog post, news article, or web page using `@mozilla/readability`.
* **🗣️ Multiple Natural Voices:** 8 unique voices across male and female options (Jasper, Bruno, Hugo, Leo, Kiki, Luna, Rosie, Bella).
* **🎚️ Model Quality Selection:** Switch between lightweight `nano` (\~24MB), balanced `micro` (\~41MB), and high-quality `mini` (\~78MB) models.
* **⌨️ Keyboard Shortcuts \& Context Menus:** Highlight any text on the web and press `Alt+Shift+K` or right-click to read aloud instantly.
* **💾 Smart Caching & Offline Export:** Instantly replay generated audio from the local cache, or download synthesized speech directly as a 24kHz `.wav` file.
* **🌗 Dark / Light Mode Support:** Automatic detection with manual theme override.

\---

## 📦 Models

Kitten TTS WebGPU includes **three model sizes**, optimized for different performance/quality tradeoffs. For maximum security, privacy, and true air-gapped reliability, **all three models are pre-bundled locally**:

| Model | Size | Speed | Quality | Bundled? | First Use |
|-------|------|-------|---------|----------|-----------|
| **Nano** | ~24MB | ⚡ Fast | Good | ✅ Yes | Instant (pre-bundled) |
| **Micro** | ~41MB | 🔋 Normal | Better | ✅ Yes | Instant (pre-bundled) |
| **Mini** | ~78MB | 🐢 Slower | Best | ✅ Yes | Instant (pre-bundled) |

**Security & Privacy by Design:**
1. **Pre-Bundled From the Jump:** All models are shipped inside the extension. Zero downloads from HuggingFace or any external CDN at runtime.
2. **Instant Playback:** No first-use download delay, stalls, or CDN rate limits.
3. **100% Offline & Air-Gapped:** Works immediately anywhere without an internet connection.
4. **Zero Network Requests:** Audio synthesis never contacts remote servers or leaks metadata.

---

## 🏗️ Architecture

┌─────────────────────────────────────────────────────────────┐
│                       Chrome Browser                        │
├───────────────────┬───────────────────┬─────────────────────┤
│    Side Panel     │  Service Worker   │  Offscreen Worker   │
│  (sidepanel.js)   │  (background.js)  │   (offscreen.js)    │
├───────────────────┼───────────────────┼─────────────────────┤
│ • UI & Theme      │ • Context Menus   │ • WebGPU Execution  │
│ • Voice Controls  │ • Tab Management  │ • Model Weights     │
│ • Text Input      │ • Script Injection│ • Sentence Chunker  │
│ • Audio Progress  │ • Life Cycle Mgmt │ • Web Audio Playback│
└───────────────────┴───────────────────┴─────────────────────┘

Due to Manifest V3 service worker constraints around Web Audio and WebGPU, synthesis and audio playback run in a dedicated **Chrome Offscreen Document**, ensuring uninterrupted playback across tabs.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- Chromium-based browser with WebGPU support (Chrome 113+, Brave, Edge)

### 2. Installation & Build

```bash
# Clone the repository
git clone [https://github.com/cinnavun/kitten-tts-webgpu-chrome.git](https://github.com/your-username/kitten-tts-webgpu-chrome.git)
cd kitten-tts-webgpu-chrome

# Install dependencies
npm install

# Build extension bundles
npm run build
```

### 3. Load Extension in Chrome
- Open Chrome and navigate to `chrome://extensions`.
- Enable **Developer mode** (toggle in the top-right corner).
- Click **Load unpacked**.
- Select the root folder of this project (where `manifest.json` is located).

## ⌨️ Shortcuts

**Alt + Shift + K**
Open the Kitten TTS Side Panel

**Alt + Shift + A**
Scan and read the current active tab article

*(Customizable at `chrome://extensions/shortcuts`)*

---

## 📚 Documentation

- [**Privacy Policy**](./PRIVACY_POLICY.md) — What data is collected (spoiler: none!)
- [**Security Policy**](./SECURITY.md) — How to report vulnerabilities
- [**Contributing**](./CONTRIBUTING.md) — How to contribute code and improvements
- [**Code of Conduct**](./CODE_OF_CONDUCT.md) — Community guidelines
- [**Attribution**](./ATTRIBUTION.md) — Third-party licenses and credits
- [**Changelog**](./CHANGELOG.md) — Version history and updates

---

```text
├── manifest.json         # Extension manifest (V3)
├── package.json          # Dependencies & esbuild scripts
├── background.js         # Service worker for commands, menus, & offscreen setup
├── sidepanel.html        # Side panel UI layout & styling
├── offscreen.html        # Offscreen document container for WebGPU audio
├── src/
│   ├── sidepanel.js      # Side panel UI interactions & settings storage
│   ├── offscreen.js      # Offscreen document host & HTML parsing delegation
│   ├── worker.js         # WebWorker for TTS synthesis and text chunking
│   ├── articleCleaner.js # Custom DOM walker for readable article extraction
│   ├── textpreprocessor.js # Text normalization pipeline (abbreviations, numbers)
│   └── extractor.js      # Content script for injecting reading capabilities
└── dist/                 # Bundled production output (generated by esbuild)
```

## ⚖️ Credits & Attributions

- kitten-tts-webgpu by Svenflow (MIT)
- Kitten TTS Models by KittenML (Apache-2.0)
- espeak-ng dictionary & rules (GPL-3.0)
- phonemizer by Xenova (Apache-2.0)
- @mozilla/readability by Mozilla (Apache-2.0)

## 📄 License

This extension is open source under the GPL-3.0 License.
