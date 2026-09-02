# Contributing to Kitten TTS WebGPU

Thank you for your interest in contributing! This document guides you through the development process.

## Code of Conduct

Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — all contributors must follow it.

## Getting Started

### Prerequisites
- Node.js v18 or higher
- Git
- A Chromium-based browser (Chrome 113+, Edge, Brave)

### Clone & Setup

```bash
git clone https://github.com/your-username/kitten-tts-webgpu-chrome.git
cd kitten-tts-webgpu-chrome
npm install
```

### Build the Extension

```bash
npm run build          # Build all bundles
npm run check          # TypeScript type-check
npm run check:watch   # Watch mode for development
```

### Load Unpacked in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the project root (where `manifest.json` is)

## Project Structure

- **background.js** — Service worker for context menus, tab management, offscreen setup
- **src/offscreen.js** — WebGPU TTS synthesis and audio playback
- **src/sidepanel.js** — Side panel UI and user preferences
- **src/extractor.js** — Mozilla Readability article parsing
- **src/textpreprocessor.js** — Text normalization and chunking
- **src/db.js** — Local storage and caching
- **manifest.json** — Extension manifest (Manifest V3)
- **assets/** — Language rules and espeak dictionary

## Development Workflow

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and rebuild:
   ```bash
   npm run build
   ```

3. Test thoroughly in Chrome (reload extension with Ctrl+R or via extensions page)

4. Type-check your code:
   ```bash
   npm run check
   ```

### Before Submitting a PR

- [ ] Code compiles without errors (`npm run check`)
- [ ] Code is tested in Chrome/Edge/Brave
- [ ] No hardcoded credentials or debug logs
- [ ] Changes don't break existing features
- [ ] Git history is clean (squash related commits if needed)
- [ ] Commit messages are descriptive (see guidelines below)

### Commit Message Guidelines

Follow conventional commit format:

```
type(scope): description

- Body with more details (optional)
- Bullet points explaining the change

Fixes #123  (if applicable)
```

**Types:** feat, fix, docs, style, refactor, perf, test, chore

**Examples:**
- `fix(offscreen): handle empty text input gracefully`
- `feat(sidepanel): add speed control slider`
- `docs(readme): clarify model bundle size`

## Areas for Contribution

### High Priority
- [ ] Firefox port (adapt manifest and test compatibility)
- [ ] Unit tests (Jest or similar)
- [ ] Screenshot and promotional graphics for store
- [ ] Localization (translations for other languages)

### Medium Priority
- [ ] Additional voices/models support
- [ ] Performance optimizations
- [ ] Enhanced error messages
- [ ] Keyboard shortcut customization UI

### Low Priority (Polish)
- [ ] UI/UX improvements
- [ ] Additional themes
- [ ] Extended documentation
- [ ] CI/CD GitHub Actions workflows

## Testing

### Manual Testing Checklist

- [ ] Open side panel with Alt+Shift+K
- [ ] Select text on any webpage, press Alt+Shift+K → speech plays
- [ ] Right-click text → "Read with Kitten TTS" works
- [ ] Press Alt+Shift+A to extract and read current article
- [ ] Voice/model/speed selections persist after reload
- [ ] Audio can be exported as .wav file
- [ ] Works offline (after models are cached)
- [ ] No errors in Chrome DevTools console

### Testing Different Browsers
- [ ] Chrome (primary)
- [ ] Edge (secondary)
- [ ] Brave with WebGPU flags enabled

## Reporting Issues

Found a bug? Please report it:

1. Check existing issues to avoid duplicates
2. Create a new issue with:
   - **Title:** Brief description
   - **Browser & Version:** (Chrome 115, Edge 115, etc.)
   - **Steps to Reproduce:** Clear reproduction steps
   - **Expected vs Actual:** What should happen vs what happens
   - **Screenshots/Logs:** Console errors, extension logs

## Review Process

When you submit a PR:

1. A maintainer will review your code
2. We may request changes or clarifications
3. Once approved, your PR will be merged
4. Your contribution will be credited

## Release Process

Releases follow semantic versioning (MAJOR.MINOR.PATCH):

- **PATCH** — Bug fixes (1.1.1)
- **MINOR** — New features (1.2.0)
- **MAJOR** — Breaking changes (2.0.0)

Changes are documented in [CHANGELOG.md](./CHANGELOG.md).

## GPL-3.0 License

By contributing, you agree that your contributions are licensed under GPL-3.0. This means:

- Your code will be copyleft (others can use/modify but must share improvements)
- You retain credit for your work
- The extension will remain open-source

## Questions?

- **GitHub Issues:** Use labels like `help-wanted`, `question`
- **Discussions:** Share ideas before opening PRs
- **Email:** (optional contact)

Thank you for helping make Kitten TTS WebGPU better!
