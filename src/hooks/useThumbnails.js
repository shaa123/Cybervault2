/**
 * CyberVault Thumbnail Engine
 * - Lazy viewport-only generation
 * - LRU eviction with configurable max
 * - IndexedDB persistence
 * - Serial video queue with canvas frame extraction
 * - Batched React state updates via requestAnimationFrame
 * - Cooldown/throttling between generations
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const DB_NAME = "cybervault_thumbnails";
const DB_STORE = "thumbs";
const DB_VERSION = 1;

// ── IndexedDB helpers ──────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function dbPut(key, value) {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
  } catch { /* ignore */ }
}

async function dbClear() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).clear();
  } catch { /* ignore */ }
}

// ── MIME helper ─────────────────────────────────
function getMime(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".svg")) return "image/svg+xml";
  if (n.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

function getVideoMime(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mkv")) return "video/x-matroska";
  if (n.endsWith(".avi")) return "video/x-msvideo";
  if (n.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

// ── Default settings ────────────────────────────
export const THUMB_DEFAULTS = {
  resolution: 256,
  maxThumbnails: 200,
  cooldownMs: 1000,
  fullscreenUnload: true,
  wipeCacheOnLock: true,
  cacheAll: false,
};

// ── Main hook ───────────────────────────────────
export function useThumbnails(settings = {}) {
  const config = { ...THUMB_DEFAULTS, ...settings };
  const cacheRef = useRef(new Map()); // id -> { url, lastAccess }
  const lruRef = useRef([]);          // ordered list of ids
  const pendingRef = useRef(new Set());
  const batchRef = useRef(new Map()); // id -> url (pending flush)
  const videoQueueRef = useRef([]);
  const videoProcessing = useRef(false);
  const lastGenTime = useRef(0);
  const [, forceUpdate] = useState(0);

  // Flush batched updates
  const flushBatch = useCallback(() => {
    if (batchRef.current.size === 0) return;
    const entries = [...batchRef.current.entries()];
    batchRef.current.clear();

    for (const [id, url] of entries) {
      cacheRef.current.set(id, { url, lastAccess: Date.now() });
      // Update LRU
      lruRef.current = lruRef.current.filter(x => x !== id);
      lruRef.current.push(id);
    }

    // Evict if over limit
    if (!config.cacheAll) {
      while (lruRef.current.length > config.maxThumbnails) {
        const evictId = lruRef.current.shift();
        const entry = cacheRef.current.get(evictId);
        if (entry?.url?.startsWith("blob:")) {
          URL.revokeObjectURL(entry.url);
        }
        cacheRef.current.delete(evictId);
      }
    }

    forceUpdate(n => n + 1);
  }, [config.maxThumbnails, config.cacheAll]);

  // Schedule flush via rAF
  const scheduleFlush = useCallback(() => {
    requestAnimationFrame(flushBatch);
  }, [flushBatch]);

  // ── Image thumbnail ───────────────────────────
  const loadImageThumb = useCallback(async (file) => {
    if (cacheRef.current.has(file.id) || pendingRef.current.has(file.id)) return;
    pendingRef.current.add(file.id);

    // Check IndexedDB cache first
    const cached = await dbGet(file.id);
    if (cached) {
      batchRef.current.set(file.id, cached);
      pendingRef.current.delete(file.id);
      scheduleFlush();
      return;
    }

    try {
      // Try pre-generated thumbnail first (small JPEG, ~5-15KB)
      let thumbUrl = null;
      try {
        const b64 = await invoke("get_thumbnail", { fileId: file.id });
        thumbUrl = `data:image/jpeg;base64,${b64}`;
      } catch {
        // No pre-generated thumb — fall back to full file + resize
        const b64 = await invoke("get_file_preview", { fileId: file.id });
        const mime = getMime(file.original_name);
        const url = `data:${mime};base64,${b64}`;

        const img = new Image();
        img.src = url;
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

        const canvas = document.createElement("canvas");
        const size = config.resolution;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        thumbUrl = canvas.toDataURL("image/webp", 0.7);
      }

      if (thumbUrl) {
        await dbPut(file.id, thumbUrl);
        batchRef.current.set(file.id, thumbUrl);
        scheduleFlush();
      }
    } catch { /* ignore */ }

    pendingRef.current.delete(file.id);
  }, [config.resolution, scheduleFlush]);

  // ── Video thumbnail (serial queue) ────────────
  const processVideoQueue = useCallback(async () => {
    if (videoProcessing.current || videoQueueRef.current.length === 0) return;
    videoProcessing.current = true;

    while (videoQueueRef.current.length > 0) {
      const file = videoQueueRef.current.shift();
      if (cacheRef.current.has(file.id)) continue;

      // Check IndexedDB
      const cached = await dbGet(file.id);
      if (cached) {
        batchRef.current.set(file.id, cached);
        scheduleFlush();
        continue;
      }

      try {
        const b64 = await invoke("get_file_preview", { fileId: file.id });
        const mime = getVideoMime(file.original_name);
        const blob = await fetch(`data:${mime};base64,${b64}`).then(r => r.blob());
        const videoUrl = URL.createObjectURL(blob);

        const thumbUrl = await new Promise((resolve) => {
          const video = document.createElement("video");
          video.muted = true;
          video.preload = "auto";
          video.src = videoUrl;

          const timeout = setTimeout(() => {
            URL.revokeObjectURL(videoUrl);
            resolve(null);
          }, 15000);

          video.onloadeddata = () => {
            video.currentTime = 0.5;
          };
          video.onseeked = () => {
            clearTimeout(timeout);
            const canvas = document.createElement("canvas");
            const size = config.resolution;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            const scale = Math.max(size / video.videoWidth, size / video.videoHeight);
            const w = video.videoWidth * scale;
            const h = video.videoHeight * scale;
            ctx.drawImage(video, (size - w) / 2, (size - h) / 2, w, h);
            URL.revokeObjectURL(videoUrl);
            resolve(canvas.toDataURL("image/webp", 0.7));
          };
          video.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(videoUrl);
            resolve(null);
          };
        });

        if (thumbUrl) {
          await dbPut(file.id, thumbUrl);
          batchRef.current.set(file.id, thumbUrl);
          scheduleFlush();
        }
      } catch { /* ignore */ }
    }

    videoProcessing.current = false;
  }, [config.resolution, scheduleFlush]);

  const queueVideoThumb = useCallback((file) => {
    if (cacheRef.current.has(file.id) || pendingRef.current.has(file.id)) return;
    pendingRef.current.add(file.id);
    videoQueueRef.current.push(file);
    processVideoQueue();
  }, [processVideoQueue]);

  // ── Generate thumbnails for visible files ─────
  const generateForVisible = useCallback((files) => {
    const now = Date.now();
    if (now - lastGenTime.current < config.cooldownMs) return;
    lastGenTime.current = now;

    for (const file of files) {
      if (cacheRef.current.has(file.id)) continue;
      if (file.mime_hint === "image") {
        loadImageThumb(file);
      } else if (file.mime_hint === "video") {
        queueVideoThumb(file);
      }
    }
  }, [config.cooldownMs, loadImageThumb, queueVideoThumb]);

  // ── Get cached thumbnail ──────────────────────
  const getThumbnail = useCallback((fileId) => {
    const entry = cacheRef.current.get(fileId);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.url;
    }
    return null;
  }, []);

  // ── Unload for fullscreen ─────────────────────
  const unloadBatch = useCallback((count = 10) => {
    if (!config.fullscreenUnload) return;
    for (let i = 0; i < count && lruRef.current.length > 0; i++) {
      const id = lruRef.current.shift();
      const entry = cacheRef.current.get(id);
      if (entry?.url?.startsWith("blob:")) URL.revokeObjectURL(entry.url);
      cacheRef.current.delete(id);
    }
  }, [config.fullscreenUnload]);

  // ── Clear all ─────────────────────────────────
  const clearAll = useCallback(() => {
    for (const entry of cacheRef.current.values()) {
      if (entry?.url?.startsWith("blob:")) URL.revokeObjectURL(entry.url);
    }
    cacheRef.current.clear();
    lruRef.current = [];
    pendingRef.current.clear();
    batchRef.current.clear();
    dbClear();
    forceUpdate(n => n + 1);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const entry of cacheRef.current.values()) {
        if (entry?.url?.startsWith("blob:")) URL.revokeObjectURL(entry.url);
      }
    };
  }, []);

  return {
    getThumbnail,
    generateForVisible,
    unloadBatch,
    clearAll,
    cacheSize: cacheRef.current.size,
  };
}

export { dbClear as clearThumbCache };
