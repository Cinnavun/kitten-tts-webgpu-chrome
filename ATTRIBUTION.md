# Attribution & Third-Party Licenses

Kitten TTS WebGPU builds upon the excellent work of many open-source projects. This document provides complete attribution and licensing information.

## Direct Dependencies

### kitten-tts-webgpu
- **Author:** Svenflow
- **License:** MIT
- **Repository:** https://github.com/Svenflow/kitten-tts-webgpu
- **Purpose:** WebGPU-accelerated ONNX Runtime TTS inference
- **License Text:**
  ```
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
  ```

### Kitten TTS Models
- **Author:** KittenML
- **License:** Apache-2.0
- **What:** Pre-trained neural voice synthesis models (nano, micro, mini)
- **Purpose:** ONNX model weights for text-to-speech
- **Note:** Models are pre-bundled (nano) and downloaded from HuggingFace (micro/mini)

### @mozilla/readability
- **Author:** Mozilla Corporation
- **License:** Apache-2.0
- **Repository:** https://github.com/mozilla/readability
- **Purpose:** Extracts readable article content from web pages
- **Use Case:** Clean extraction of blog posts, news articles, documentation

### espeak-ng dictionary & rules
- **Author:** eSpeak NG project
- **License:** GPL-3.0
- **Purpose:** English phoneme dictionary and text-to-speech rules
- **Files:**
  - `assets/espeak-en-dict.tsv`
  - `assets/en_rules`
- **Note:** Used for text phonemization in the TTS pipeline

### phonemizer
- **Author:** Xenova
- **License:** Apache-2.0
- **Repository:** https://huggingface.co/Xenova/multilingual-e5-small
- **Purpose:** Converts text to phonemes for TTS synthesis
- **Use in Extension:** Bundled via kitten-tts-webgpu

### ONNX Runtime Web
- **Author:** Microsoft
- **License:** MIT
- **Repository:** https://github.com/microsoft/onnxruntime
- **Purpose:** Executes ONNX model inference in browser via WebGPU
- **Note:** Used indirectly through kitten-tts-webgpu

## Build & Development Tools

### esbuild
- **Author:** Evan Wallace
- **License:** MIT
- **Repository:** https://github.com/evanw/esbuild
- **Purpose:** Fast TypeScript/JavaScript bundler for extension assets

### TypeScript
- **Author:** Microsoft
- **License:** Apache-2.0
- **Repository:** https://github.com/microsoft/TypeScript
- **Purpose:** Type safety and development-time checking

### Node.js
- **Author:** OpenJS Foundation
- **License:** MIT, Apache-2.0 (various dependencies)
- **Repository:** https://nodejs.org/
- **Purpose:** Runtime for build scripts and package management

## License Compatibility

This extension is licensed under **GPL-3.0** (copyleft).

**Compatibility Summary:**

| Dependency | License | Compatible? | Notes |
|-----------|---------|---|---|
| kitten-tts-webgpu | MIT | ✅ | Permissive, can be used in GPL-3.0 projects |
| Kitten TTS Models | Apache-2.0 | ✅ | Permissive, can be used in GPL-3.0 projects |
| @mozilla/readability | Apache-2.0 | ✅ | Permissive, compatible with GPL-3.0 |
| espeak-ng | GPL-3.0 | ✅ | Same license; fully compatible |
| phonemizer | Apache-2.0 | ✅ | Permissive, can be used in GPL-3.0 projects |
| esbuild | MIT | ✅ | Dev tool, permissive |
| TypeScript | Apache-2.0 | ✅ | Dev tool, permissive |

**Summary:** All dependencies are compatible with GPL-3.0. This extension can be freely used, modified, and redistributed under GPL-3.0 terms.

## How to Use This Information

### For Users
Your use of this extension includes these open-source components. You can:
- Review the source code of any component
- Modify components under GPL-3.0 terms
- Use models and code in your own projects (respecting licenses)

### For Contributors & Derivative Works
If you create a fork or derivative:
1. Include this attribution document
2. Maintain GPL-3.0 license for code
3. Respect individual licenses of dependencies
4. Add your own attribution for changes

### For Compliance
This extension is fully open-source and compliant with:
- GPL-3.0 (code)
- Apache-2.0 (dependencies)
- MIT (build tools)
- Open Source Definition
- Chrome Web Store privacy requirements

## Acknowledgments

Special thanks to:
- **Svenflow** for kitten-tts-webgpu, enabling efficient local TTS
- **Mozilla** for Readability, making content extraction accessible
- **KittenML** for public model releases
- **Microsoft** for TypeScript and ONNX Runtime
- All open-source maintainers whose work makes projects like this possible

---

**Questions about licensing or attribution?**
- Open an issue with the `licensing` label
- Email maintainers
- Consult the individual license texts (linked above)
