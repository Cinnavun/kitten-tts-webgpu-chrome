# Chrome Web Store Listing — Kitten TTS WebGPU

> Last Updated: 2026-08-30

## Store Listing

**Extension Name** [REQUIRED]
Kitten TTS WebGPU

**Short Description** [REQUIRED]
On-device Text-to-Speech using KittenTTS WebGPU and Mozilla Readability. Listen to articles with complete privacy.

**Detailed Description** [REQUIRED]
Listen to articles, blogs, and web pages without sacrificing your privacy. Kitten TTS WebGPU runs lightweight, neural text-to-speech completely on your device using your local graphics card.

Features:
- Fast, 100% on-device speech synthesis via WebGPU. No audio or text is ever sent to a cloud server.
- Smart article extraction grabs only the readable content from web pages, stripping out clutter.
- Choose from 8 unique, high-quality voices (male and female).
- Highlight any text and press Alt+Shift+K, or right-click to read aloud instantly.
- Export your synthesized audio directly to a .wav file for offline listening.

Kitten TTS provides a completely private, zero-latency way to consume web content audibly.

**Category** [REQUIRED]
Accessibility

**Single Purpose** [REQUIRED]
Extracts readable text from web pages and synthesizes it to speech entirely on-device using WebGPU.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | 🟡 Needs update | |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |


## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `contextMenus` | permissions | Allows the user to select text on any webpage and right-click to instantly synthesize it to speech using the "Read with Kitten TTS" context menu option. |
| `sidePanel` | permissions | Provides the primary user interface where the user can control playback, select voices, adjust model quality, and type manual text. |
| `storage` | permissions | Saves the user's preferences, such as their selected voice, model quality, theme settings, and UI state across sessions. |
| `offscreen` | permissions | Required to run the WebGPU ONNX Runtime text-to-speech inference and Web Audio playback in the background, ensuring audio continues playing without interruption even when the user switches tabs. |
| `activeTab` | permissions | Allows the extension to extract the article text of the currently active tab when the user clicks the side panel trigger or presses the shortcut, without requiring broad host permissions by default. |
| `scripting` | permissions | Used to inject the Mozilla Readability script into the active tab to extract cleanly formatted article content free of ads and navigation elements. |
| `tabs` | permissions | Required to track when the active tab is closed or navigated away from, allowing the extension to properly halt the current reading session or manage UI state. |
| `notifications` | permissions | Alerts the user when a large TTS model has finished downloading and is ready for use, or to display critical errors during inference. |
| `http://*/*, https://*/*` | host_permissions | Optional host permissions requested at runtime to allow the text extraction and highlighting scripts to function on any web page the user wants to read aloud. |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
[To be created]

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
[Your Name]

**Contact Email** [REQUIRED]
[Your Email]

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1 | 2026-08-30 | Initial Store Submission | Draft |
