/**
 * CyberVault Thumbnail Engine
 * - Uses vault://localhost/thumb/{id} protocol URLs (no base64, no invoke)
 * - LRU eviction with configurable max
 * - IndexedDB persistence for URL mapping
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

// ── Default settings ────────────────────────────
export const THUMB_DEFAULTS = {
  resolution: 256,
  maxThumbnails: 200,
  cooldownMs: 300,
  fullscreenUnload: true,
  wipeCacheOnLock: true,
  cacheAll: false,
};

// ── URL helpers ─────────────────────────────────
// Tauri 2 on Windows/Android: http://<scheme>.localhost/path
// Tauri 2 on macOS/Linux: <scheme>://localhost/path
const IS_WINDOWS = navigator.userAgent.includes("Windows");

export function vaultFileUrl(fileId) {
  return IS_WINDOWS
    ? `http://vault.localhost/file/${fileId}`
    : `vault://localhost/file/${fileId}`;
}

export function vaultThumbUrl(fileId) {
  return IS_WINDOWS
    ? `http://vault.localhost/thumb/${fileId}`
    : `vault://localhost/thumb/${fileId}`;
}

// ── Main hook ───────────────────────────────────
export function useThumbnails(settings = {}) {
  const config = { ...THUMB_DEFAULTS, ...settings };
  const cacheRef = useRef(new Map()); // id -> { url, lastAccess }
  const lruRef = useRef([]);
  const pendingRef = useRef(new Set());
  const noThumbRef = useRef(new Set()); // IDs that have no thumbnail — don't retry
  const batchRef = useRef(new Map());
  const lastGenTime = useRef(0);
  const [, forceUpdate] = useState(0);

  // Flush batched updates
  const flushBatch = useCallback(() => {
    if (batchRef.current.size === 0) return;
    const entries = [...batchRef.current.entries()];
    batchRef.current.clear();

    for (const [id, url] of entries) {
      cacheRef.current.set(id, { url, lastAccess: Date.now() });
      lruRef.current = lruRef.current.filter(x => x !== id);
      lruRef.current.push(id);
    }

    // Evict if over limit
    if (!config.cacheAll) {
      while (lruRef.current.length > config.maxThumbnails) {
        const evictId = lruRef.current.shift();
        cacheRef.current.delete(evictId);
      }
    }

    forceUpdate(n => n + 1);
  }, [config.maxThumbnails, config.cacheAll]);

  const scheduleFlush = useCallback(() => {
    requestAnimationFrame(flushBatch);
  }, [flushBatch]);

  // ── Load thumbnail via invoke (base64 in memory, no protocol requests) ──
  const loadThumb = useCallback(async (file) => {
    if (cacheRef.current.has(file.id) || pendingRef.current.has(file.id)) return;
    if (noThumbRef.current.has(file.id)) return;
    // Skip if we know there's no cached thumb for this file
    if (hasCachedThumb.current.size > 0 && !hasCachedThumb.current.has(file.id)) {
      noThumbRef.current.add(file.id);
      return;
    }
    pendingRef.current.add(file.id);

    try {
      const b64 = await invoke("get_thumbnail", { fileId: file.id });
      const dataUrl = `data:image/jpeg;base64,${b64}`;
      batchRef.current.set(file.id, dataUrl);
      scheduleFlush();
    } catch {
      noThumbRef.current.add(file.id);
    }
    pendingRef.current.delete(file.id);
  }, [scheduleFlush]);

  // ── Generate thumbnails for visible files ─────
  const generateForVisible = useCallback((files) => {
    const now = Date.now();
    if (now - lastGenTime.current < config.cooldownMs) return;
    lastGenTime.current = now;

    // Load up to 4 per batch via invoke to avoid overwhelming IPC
    let loaded = 0;
    for (const file of files) {
      if (loaded >= 4) break;
      if (cacheRef.current.has(file.id) || pendingRef.current.has(file.id)) continue;
      loadThumb(file);
      loaded++;
    }
  }, [config.cooldownMs, loadThumb]);

  // ── Get cached thumbnail URL ──────────────────
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
      cacheRef.current.delete(id);
    }
  }, [config.fullscreenUnload]);

  // ── Clear all ─────────────────────────────────
  const clearAll = useCallback(() => {
    cacheRef.current.clear();
    lruRef.current = [];
    pendingRef.current.clear();
    noThumbRef.current.clear();
    batchRef.current.clear();
    dbClear();
    forceUpdate(n => n + 1);
  }, []);

  // ── Preload: mark which IDs have cached thumbs (don't load data yet) ──
  const hasCachedThumb = useRef(new Set());
  const preloaded = useRef(false);
  useEffect(() => {
    if (preloaded.current) return;
    preloaded.current = true;
    invoke("get_cached_thumb_ids").then((ids) => {
      hasCachedThumb.current = new Set(ids);
    }).catch(() => {});
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
