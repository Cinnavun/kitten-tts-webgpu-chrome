import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.resolve(__dirname, '..', 'models');

const MODELS_TO_DOWNLOAD = [
  {
    name: 'micro',
    fileName: 'kitten_tts_micro_v0_8.onnx',
    url: 'https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/main/kitten_tts_micro_v0_8.onnx',
    expectedMinSize: 35 * 1024 * 1024 // ~41 MB
  },
  {
    name: 'mini',
    fileName: 'kitten_tts_mini_v0_8.onnx',
    url: 'https://huggingface.co/KittenML/kitten-tts-mini-0.8/resolve/main/kitten_tts_mini_v0_8.onnx',
    expectedMinSize: 70 * 1024 * 1024 // ~78 MB
  }
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const tempPath = `${destPath}.tmp`;
    const file = fs.createWriteStream(tempPath);

    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 10) {
        reject(new Error(`Too many redirects for ${url}`));
        return;
      }

      https.get(currentUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`  ↪ Following redirect to ${response.headers.location}...`);
          get(response.headers.location, redirectCount + 1);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} while fetching ${currentUrl}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastReport = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReport > 1000) {
            lastReport = now;
            const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
            const totalMb = totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) : '?';
            process.stdout.write(`  ⏳ ${mb} MB / ${totalMb} MB\r`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            console.log(`\n  ✓ Download complete (${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB)`);
            fs.renameSync(tempPath, destPath);
            resolve();
          });
        });
      }).on('error', (err) => {
        fs.unlink(tempPath, () => {});
        reject(err);
      });
    }

    get(url);
  });
}

async function main() {
  console.log('🐾 Downloading KittenTTS models to models/ ...');
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  for (const model of MODELS_TO_DOWNLOAD) {
    const targetFile = path.join(MODELS_DIR, model.fileName);
    if (fs.existsSync(targetFile)) {
      const stat = fs.statSync(targetFile);
      if (stat.size >= model.expectedMinSize) {
        console.log(`✓ ${model.fileName} already exists (${(stat.size / (1024 * 1024)).toFixed(2)} MB), skipping download.`);
        continue;
      } else {
        console.log(`⚠️ ${model.fileName} exists but is undersized (${stat.size} bytes). Re-downloading...`);
      }
    }

    console.log(`\n📥 Fetching ${model.name} (${model.fileName}) from ${model.url}...`);
    await downloadFile(model.url, targetFile);

    const stat = fs.statSync(targetFile);
    console.log(`  File size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);

    // Compute SHA256
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(targetFile);
    await new Promise((res, rej) => {
      stream.on('data', d => hash.update(d));
      stream.on('end', () => {
        console.log(`  SHA-256: ${hash.digest('hex')}`);
        res();
      });
      stream.on('error', rej);
    });
  }

  console.log('\n🎉 All models downloaded and verified successfully.');
}

main().catch((err) => {
  console.error('❌ Model download failed:', err);
  process.exit(1);
});
