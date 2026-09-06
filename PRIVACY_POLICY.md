# Privacy Policy for Kitten TTS WebGPU

**Effective Date:** August 31, 2026  
**Last Updated:** August 31, 2026

## Summary

Kitten TTS WebGPU is a privacy-centric extension that synthesizes speech entirely on your device using your local graphics hardware. **We do not collect, transmit, or store any user data.**

---

## What Data We Collect

**We collect zero personal data.** This extension:

- Does **not** send any text, audio, or personal information to external servers
- Does **not** use analytics, crash reporting, or telemetry services
- Does **not** store user input, preferences, or history on remote servers
- Does **not** track user behavior or activity

---

## How Your Data is Stored

All user data remains on your device:

- **Text Input:** Not transmitted; processed locally in your browser
- **Audio Output:** Generated locally; not sent anywhere
- **User Preferences:** Stored locally in chrome.storage.local
  - Selected voice, model quality, theme preference, playback speed
  - Accessible only to this extension
  - Can be cleared anytime via extension settings or Chrome site data management

---

## What We Don't Do

We explicitly do **not**:

- Collect or store your text for training AI models
- Log or track which websites you visit
- Transmit audio or transcripts to cloud services
- Use cookies for tracking or profiling
- Share data with third parties
- Install malware, adware, or spyware
- Make any network requests for text-to-speech synthesis, speech processing, or models

---

## Pre-Bundled Local Models (Zero Network Requests)

All three supported KittenTTS models (Nano, Micro, and Mini) and voice style embeddings are pre-bundled directly within the extension package:

- **Zero Remote Downloads:** The extension makes **zero** network requests to HuggingFace or any external CDN at runtime.
- **Immediate Offline Availability:** Speech synthesis is 100% available offline immediately upon installation with no initial setup delay.
- **Air-Gapped Privacy:** No IP address, browser metadata, or usage patterns are ever transmitted to remote servers.

---

## Required Permissions

### contextMenus
Allows right-click menu option. No data collected.

### sidePanel
Provides main UI. All activity is local.

### storage
Saves preferences in chrome.storage.local only. No transmission.

### offscreen
Runs WebGPU synthesis locally. No data collected.

### activeTab
Accesses current webpage for extraction only.

### scripting
Injects Mozilla Readability for local HTML parsing.

### tabs
Tracks tab state for UI lifecycle.

### notifications
Sends local notifications. No data collected.

### host_permissions
Optional permissions for web page access.

---

## Data You Control

**Clear Extension Data:**
1. Chrome Settings > Privacy and Security > Clear browsing data
2. Select "Cookies and other site data"
3. Check Kitten TTS WebGPU extension
4. Click "Clear data"

---

## Security

- No cloud uploads = zero remote breach risk
- Open-source GPL-3.0 code (anyone can audit)
- No obfuscated code or hidden requests
- Local processing only in browser sandbox

---

## Third-Party Dependencies

All dependencies run locally with no external data transmission:
- kitten-tts-webgpu (MIT) - TTS synthesis
- @mozilla/readability (Apache-2.0) - Article extraction
- espeak-ng (GPL-3.0) - Text phonemization
- phonemizer (Apache-2.0) - Phoneme conversion

---

## Open Source

Kitten TTS WebGPU is GPL-3.0 licensed:
- Source code: https://github.com/cinnavun/kitten-tts-webgpu-chrome
- Anyone can review, modify, and redistribute
- Reproducible builds available

---

## Changes to This Policy

Updates will be announced via GitHub releases with transparency about any changes.

---

## Contact

**Questions?** Open an issue on GitHub with the "privacy" label.

---

**Kitten TTS WebGPU respects your privacy completely. Your data never leaves your device.**
