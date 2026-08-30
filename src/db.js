// src/db.js

const DB_NAME = "kitten-tts-cache";
const STORE_NAME = "audio-blobs";
const DB_VERSION = 1;

export async function generateCacheKey(text, voice, speed, model) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify({ text, voice, speed, model }));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const target = /** @type {IDBRequest} */ (e.target);
      const db = target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => {
      const target = /** @type {IDBRequest} */ (e.target);
      resolve(target.result);
    };
    request.onerror = (e) => {
      const target = /** @type {IDBRequest} */ (e.target);
      reject(target.error);
    };
  });
}

export async function saveAudio(key, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(blob, key);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getAudio(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
