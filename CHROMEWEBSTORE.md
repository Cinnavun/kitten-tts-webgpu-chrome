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

## Developer Info

**Publisher Name** [REQUIRED]
[YOUR NAME OR ORGANIZATION NAME]
Example: "John Smith" or "Kitten TTS Contributors"

**Contact Email** [REQUIRED]
[YOUR EMAIL ADDRESS]
This should be an email you monitor regularly for Chrome Web Store communications.

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/your-username/kitten-tts-webgpu-chrome/blob/master/PRIVACY_POLICY.md

This can link directly to the GitHub PRIVACY_POLICY.md file, or you can host it separately. The Chrome Web Store requires this link.

---

## Graphics & Assets — REQUIRED FOR SUBMISSION

| Asset | Dimensions | Type | Purpose | Status |
|-------|-----------|------|---------|--------|
| Extension Icon | 128×128 PNG | Branding | Shown in Chrome Web Store | Use `icons/icon128.png` |
| Screenshot 1 | 1280×800 or 640×400 | Required | Main feature showcase | ⬜ Create |
| Screenshot 2 | 1280×800 or 640×400 | Recommended | Secondary feature | ⬜ Create |
| Screenshot 3 | 1280×800 or 640×400 | Recommended | Additional feature | ⬜ Create |
| Small Promo Tile | 440×280 | Recommended | Search results | ⬜ Create (optional) |
| Marquee Promo Tile | 1400×560 | Optional | Featured display | ⬜ Create (optional) |

### How to Create Screenshots

1. **Screenshot 1 — Main Features:**
   - Open a news article in Chrome
   - Show Kitten TTS side panel open on the right
   - Display: Text selection, voice choices, play button
   - Suggested caption: "Read any article with a single click"

2. **Screenshot 2 — Context Menu:**
   - Screenshot of right-click menu with "Read with Kitten TTS" option
   - Some text highlighted on page
   - Caption: "Highlight any text and instantly read it aloud"

3. **Screenshot 3 — Audio Export:**
   - Show side panel with "Download" button highlighted
   - Caption: "Export synthesized audio as .wav files for offline listening"

### Tips for Chrome Web Store Screenshots

- Use readable fonts (minimum 12pt)
- Show key UI elements clearly
- Include captions or text overlays
- Capture on 1280×800 resolution if possible
- Keep text/controls visible (avoid small UI elements)
- Consider adding arrow/highlight overlays to draw attention

---

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

| Version | Date | Status | Changes |
|---------|------|--------|---------|
| 1.1.0 | 2026-08-31 | Ready for Store | Fixed sentence spacing, improved audio buffering, added replay cache, model quality selection |
| 1.0.0 | 2026-08-28 | Initial | Extension first published |

---

## Pre-Submission Checklist

Before submitting to Chrome Web Store:

- [ ] All version numbers aligned (package.json, manifest.json, CHANGELOG.md)
- [ ] Privacy Policy URL filled in and verified
- [ ] Publisher Name and Contact Email entered
- [ ] 2-4 screenshots created and tested
- [ ] Icons verified (128×128 PNG looks good)
- [ ] Extension builds without errors: `npm run build`
- [ ] Extension tested in Chrome and Edge
- [ ] No errors in Chrome DevTools console
- [ ] Manifest.json is valid Manifest V3
- [ ] All permissions are justified in documentation
- [ ] LICENSE file is GPL-3.0 and complete
- [ ] PRIVACY_POLICY.md is public and accessible
- [ ] CONTRIBUTING.md and CODE_OF_CONDUCT.md exist

---

## Submission Instructions

1. **Create Developer Account**
   - Visit https://chrome.google.com/webstore/devconsole
   - Pay $5 one-time developer fee
   - Verify your email

2. **Create New Extension**
   - Click "New item"
   - Upload ZIP file (or drag build folder)
   - ZIP should contain: manifest.json, icons/, models/, dist/, src/, etc.

3. **Fill Store Listing**
   - Use values from this file
   - Upload screenshots
   - Add banner/promo images if desired
   - Set category to "Accessibility"

4. **Review & Publish**
   - Chrome Web Store team reviews (typically 24-72 hours)
   - Address any feedback
   - Once approved, extension goes live

5. **Monitor Reviews**
   - Check Chrome Web Store for user ratings
   - Respond to reviews/questions
   - Fix bugs quickly

---

## After Publishing

- Monitor Chrome Web Store for reviews and ratings
- Check GitHub Issues for bug reports
- Plan Firefox version (requires manifest adaptation)
- Consider adding features based on user feedback
- Keep extension updated with security patches
- Promote on social media, GitHub, developer communities

---

**This extension is ready for store submission once screenshots are created and developer account is set up.**
**Estimated submission timeline: 1 business day after account setup.**
