# Firefox Port Roadmap - Kitten TTS WebGPU

## Overview
The extension is currently built for Chrome/Edge (Manifest V3). Firefox requires Manifest V2.
This document outlines the steps needed to port to Firefox after the Chrome Web Store launch.

## Key Differences: Manifest V2 vs V3

| Feature | Manifest V3 (Chrome) | Manifest V2 (Firefox) |
|---------|-------------------|---------------------|
| Service Workers | Background service worker | Background scripts (persistent) |
| Permissions | Explicit host permissions | activeTab model |
| Message API | chrome.runtime.sendMessage | browser.runtime.sendMessage |
| Storage API | chrome.storage | browser.storage (same API) |
| Offscreen API | chrome.offscreen.createDocument | N/A - doesn't exist |
| WebGPU | Supported | Supported (Firefox 113+) |

## Firefox Port Checkpoints

### Phase 1: Environment Setup (1 day)
- [ ] Install Firefox Developer Edition (v113+)
- [ ] Set up firefox-specific build config in package.json
- [ ] Create web-ext configuration file

### Phase 2: Manifest Migration (2-3 days)
- [ ] Create manifest.json for Firefox (v2)
- [ ] Remove chrome.offscreen.createDocument (no equivalent)
- [ ] Adapt background script (persistent vs service worker)
- [ ] Update permission model
- [ ] Change chrome.* to browser.* APIs

### Phase 3: Audio Architecture Rework (3-5 days)
**Critical:** Firefox doesn't have offscreen documents
- [ ] Move audio playback to background script (persistent)
- [ ] Potentially use background page instead of service worker
- [ ] Test WebGPU synthesis in different context
- [ ] Handle concurrent TTS playback/cancellation

### Phase 4: Code Changes (3-5 days)
Files to adapt:
- background.js → Change chrome.* to browser.*
- src/offscreen.js → Merge functionality into background.js
- manifest.json → Create Firefox v2 manifest
- Build scripts → Add Firefox build target

### Phase 5: Testing & QA (2-3 days)
- [ ] Load unpacked in Firefox
- [ ] Test all features (TTS, article extraction, caching)
- [ ] Verify audio playback works
- [ ] Test model downloads and caching
- [ ] Verify performance on various GPUs

### Phase 6: Firefox Store Submission (1 day)
- [ ] Create Firefox Add-ons Developer Account (AMO)
- [ ] Write Firefox-specific store listing
- [ ] Create screenshots (if different from Chrome)
- [ ] Submit for review

## Estimated Timeline
Total: **2-3 weeks** after Chrome launch

## Known Challenges

1. **Offscreen Documents** - Firefox doesn't have this feature
   - Solution: Use persistent background page or dedicated content script
   - May require refactoring audio playback logic

2. **WebGPU Support** - Firefox added WebGPU in v113
   - Solution: Require Firefox 113+ (current as of 2026)
   - May need fallback for earlier versions

3. **API Compatibility** - Most chrome.* APIs have browser.* equivalents
   - Storage, contextMenus, scripting, tabs all work
   - Need to test message passing thoroughly

4. **Model Caching** - Browser cache works the same in Firefox
   - Should work without changes
   - Test thoroughly

## Recommended Approach

### Option 1: Single Codebase (Recommended)
- Create conditional builds
- `npm run build:chrome` and `npm run build:firefox`
- Share 90% of code, diverge only where needed
- Use feature detection for WebGPU/API availability

### Option 2: Separate Codebases
- Fork repo or create separate branch
- Full control over Firefox implementation
- Higher maintenance burden

## Files to Create/Modify for Firefox

New files:
- manifest-firefox.json
- firefox-build.config.js
- src/firefox-background.js (if different)
- firefox-specific docs

Existing files to adapt:
- package.json (add firefox build scripts)
- background.js (API abstraction)
- src/offscreen.js (merge to background)
- Build configuration (esbuild)

## Success Criteria

Firefox version should:
- ✅ Generate speech from selected text
- ✅ Extract and read articles
- ✅ Support all 8 voices
- ✅ Cache models for offline use
- ✅ Export audio as .wav
- ✅ Have persistent user preferences
- ✅ Work with GPU acceleration (WebGPU)
- ✅ Have no console errors
- ✅ Meet Firefox Add-ons policies

## Resources

- [Firefox Manifest V2 Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)
- [Firefox Browser APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- [web-ext Tool](https://github.com/mozilla/web-ext) - Local testing
- [Firefox Add-ons Submit](https://addons.mozilla.org/en-US/firefox/)

## Next Steps (Post-Chrome Launch)

1. Gather user feedback on Chrome version
2. Assess Firefox demand/priority
3. Plan Firefox sprint
4. Create feature branch (based on working Chrome version)
5. Begin Manifest V2 migration
6. Iterate through testing phases

---

This can be tackled after successful Chrome Web Store launch.
