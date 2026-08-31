# Security Policy

## Supported Versions

Only the latest version is actively maintained and receives security updates.

| Version | Supported |
|---------|-----------|
| 1.1.x   | ✅ Current |
| 1.0.x   | ❌ Outdated |
| < 1.0   | ❌ Outdated |

**Recommendation:** Always update to the latest version available in the Chrome Web Store or GitHub Releases.

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, **please report it responsibly**—do not open a public GitHub issue.

### How to Report

1. **Email:** Send details to your-email@example.com
   - Subject: `[SECURITY] Kitten TTS WebGPU - <brief description>`
   - Include:
     - Description of the vulnerability
     - Steps to reproduce (if possible)
     - Potential impact
     - Your suggested fix (optional)

2. **Private GitHub Report** (if available):
   - Visit the Security tab on GitHub
   - Click "Report a vulnerability"
   - Fill in the security advisory form

### What to Include

```
Title: Brief description
Description: Detailed explanation of the vulnerability
Type: (e.g., XSS, Data Leakage, RCE, etc.)
Severity: (Critical/High/Medium/Low)
Reproduction: Steps to reproduce
Impact: What could happen if exploited
Suggested Fix: (optional)
```

### Response Timeline

- **Within 48 hours:** Acknowledgment of receipt
- **Within 7 days:** Initial assessment and plan
- **Within 14 days:** Patch released or timeline communicated
- **Public disclosure:** Only after patch is available

## Security Considerations

### By Design

This extension is inherently secure because:

- ✅ **No remote processing:** All TTS happens locally on your device
- ✅ **No server communication:** No text, audio, or metadata is transmitted
- ✅ **No data collection:** Extension stores data locally only
- ✅ **Open source:** Code is auditable by anyone
- ✅ **No obfuscation:** Source is readable and transparent

### What You Should Know

- ⚠️ **Model downloads:** Micro/mini models download from HuggingFace CDN on first use. Verify file integrity if security is critical.
- ⚠️ **WebGPU sandbox:** Relies on browser WebGPU sandbox. Browser vulnerabilities could theoretically be exploited.
- ⚠️ **Extension permissions:** Extension requires several permissions. Review in `manifest.json` or Chrome settings.

### Best Practices

1. **Keep Chrome updated:** Security patches in Chrome protect WebGPU/JavaScript runtime
2. **Verify downloads:** Check extension SHA-256 hash from GitHub releases
3. **Review code changes:** Check CHANGELOG.md before updating
4. **Report issues early:** If something seems suspicious, report it
5. **Audit if needed:** Source is public; audit or have someone audit if needed

## Security Patches

Critical security updates are released as:

1. **GitHub Release:** https://github.com/your-username/kitten-tts-webgpu-chrome/releases
   - Download source code to verify
   - Includes SHA-256 checksums

2. **Chrome Web Store:** Automatic updates (Chrome handles)
   - Version appears in store listing
   - Check version in `chrome://extensions`

3. **GitHub Security Advisory:** If severity warrants
   - Public notification after fix is released

## Known Limitations

### Current
- Only English text supported (espeak-ng English dictionary included)
- WebGPU requires Chrome 113+, Edge, or Brave (not Safari or Firefox yet)
- Large articles (>5000 words) may be slow on older GPUs

### Planned
- [ ] Multi-language support (requires additional dictionaries)
- [ ] Firefox support (manifest port required)
- [ ] Streaming synthesis (reduce memory usage for very long texts)

## Dependencies & Trust

We depend on:
- **kitten-tts-webgpu** — Maintained by Svenflow
- **@mozilla/readability** — Maintained by Mozilla
- **ONNX Runtime** — Maintained by Microsoft
- **eSpeak NG** — Community-maintained

All are established, widely-used projects. If you have concerns about any dependency, please raise them.

## Cryptographic Signatures (Future)

Once GitHub releases mature, signed releases may be provided. Track this in GitHub releases.

## Contact

- **Security Email:** Cinnavun@icloud.com
- **GitHub Issues:** Use label `security` for non-critical items
- **Discussions:** Use `security` category for general questions

---

**Thank you for helping keep Kitten TTS WebGPU secure.**
