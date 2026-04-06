import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
/** Vault file picker — file name list with category filter */
function VaultFilePicker({ mode, onSelect, onClose }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      invoke("list_files", { category: "image" }),
      invoke("list_files", { category: "video" }),
    ]).then(([imgs, vids]) => {
      setFiles([...imgs.map(f => ({ ...f, cat: "image" })), ...vids.map(f => ({ ...f, cat: "video" }))]);
    }).catch(() => {});
  }, []);

  const filtered = files.filter(f => {
    if (filter !== "all" && f.cat !== filter) return false;
    if (search && !f.original_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggle = (id) => {
    if (mode === "bg") {
      setSelected(new Set([id]));
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
  };

  const selectAll = () => setSelected(new Set(filtered.map(f => f.id)));
  const selectNone = () => setSelected(new Set());

  return (
    <div className="cat-popup-overlay" onClick={onClose}>
      <div className="cat-popup" onClick={e => e.stopPropagation()} style={{ minWidth: 500, maxWidth: 650, maxHeight: "75vh", display: "flex", flexDirection: "column" }}>
        <div className="cat-popup-title">
          {mode === "bg" ? "SELECT BACKGROUND FILE" : "SELECT SLIDESHOW FILES"}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select className="sort-select" value={filter} onChange={e => setFilter(e.target.value)} style={{ minWidth: 90 }}>
            <option value="all">ALL</option>
            <option value="image">IMAGES</option>
            <option value="video">VIDEOS</option>
          </select>
          <input className="search-input" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
          {mode === "slideshow" && (
            <>
              <button className="fl-btn fl-btn-muted" onClick={selectAll}>ALL</button>
              <button className="fl-btn fl-btn-muted" onClick={selectNone}>NONE</button>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text4)", marginBottom: 6 }}>
          {filtered.length} files · {selected.size} selected
        </div>
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          {filtered.slice(0, 500).map(f => (
            <button key={f.id} onClick={() => toggle(f.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                background: selected.has(f.id) ? "rgba(0, 229, 255, 0.1)" : "transparent",
                border: "none", borderRadius: 4, textAlign: "left", width: "100%",
                borderLeft: selected.has(f.id) ? "3px solid var(--cyan)" : "3px solid transparent",
              }}>
              <span style={{ fontSize: 14, color: f.cat === "video" ? "var(--magenta)" : "var(--cyan)", width: 20, textAlign: "center" }}>
                {f.cat === "video" ? "▶" : "◈"}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text)", fontFamily: "var(--font-file)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.original_name}
              </span>
              <span style={{ fontSize: 11, color: "var(--text4)", textTransform: "uppercase" }}>
                {f.cat}
              </span>
            </button>
          ))}
          {filtered.length > 500 && (
            <div style={{ padding: 10, textAlign: "center", fontSize: 12, color: "var(--text4)" }}>
              Showing first 500 of {filtered.length} — use search to narrow down
            </div>
          )}
        </div>
        <div className="cat-popup-actions" style={{ marginTop: 10 }}>
          <button className="fl-btn fl-btn-primary" onClick={() => onSelect([...selected])}
            disabled={selected.size === 0}>
            {mode === "bg" ? "SET AS BACKGROUND" : `SELECT ${selected.size} FILES`}
          </button>
          <button className="fl-btn fl-btn-muted" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

/** Capture first frame of a video via invoke (avoids protocol deadlock) */
async function captureVideoFrame(fileId) {
  try {
    console.log(`[THUMB] Starting video capture for ${fileId}`);
    const b64 = await invoke("get_file_preview_chunk", { fileId, maxBytes: 8 * 1024 * 1024 });
    console.log(`[THUMB] Got ${b64.length} bytes of base64 data`);

    // Try multiple mime types — WebM needs different mime
    const mimeTypes = ["video/mp4", "video/webm", "video/x-matroska"];

    for (const mime of mimeTypes) {
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const blobUrl = URL.createObjectURL(blob);

        const result = await new Promise((resolve) => {
          const video = document.createElement("video");
          video.muted = true;
          video.preload = "auto";
          video.src = blobUrl;

          const timeout = setTimeout(() => {
            console.log(`[THUMB] Timeout with mime ${mime}`);
            URL.revokeObjectURL(blobUrl);
            video.src = "";
            resolve(null);
          }, 10000);

          video.onloadeddata = () => {
            console.log(`[THUMB] Loaded with mime ${mime}, dimensions: ${video.videoWidth}x${video.videoHeight}`);
            video.currentTime = 0.1;
          };

          video.onseeked = () => {
            clearTimeout(timeout);
            console.log(`[THUMB] Seeked, capturing frame`);
            try {
              const canvas = document.createElement("canvas");
              canvas.width = 256;
              canvas.height = 256;
              const ctx = canvas.getContext("2d");
              const scale = Math.max(256 / video.videoWidth, 256 / video.videoHeight);
              const w = video.videoWidth * scale;
              const h = video.videoHeight * scale;
              ctx.drawImage(video, (256 - w) / 2, (256 - h) / 2, w, h);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
              URL.revokeObjectURL(blobUrl);
              video.src = "";
              resolve(dataUrl.split(",")[1]);
            } catch (e) {
              console.log(`[THUMB] Canvas error: ${e}`);
              URL.revokeObjectURL(blobUrl);
              video.src = "";
              resolve(null);
            }
          };

          video.onerror = (e) => {
            clearTimeout(timeout);
            console.log(`[THUMB] Video error with mime ${mime}: ${e?.message || e}`);
            URL.revokeObjectURL(blobUrl);
            video.src = "";
            resolve(null);
          };
        });

        if (result) {
          console.log(`[THUMB] Success with mime ${mime}`);
          return result;
        }
      } catch (e) {
        console.log(`[THUMB] Failed with mime ${mime}: ${e}`);
      }
    }

    console.log(`[THUMB] All mime types failed for ${fileId}`);
    return null;
  } catch (e) {
    console.log(`[THUMB] Invoke error: ${e}`);
    return null;
  }
}

export default function Settings({ stats, onPurge }) {
  const [debugText, setDebugText] = useState("");
  const [caching, setCaching] = useState(false);
  const [cacheProgress, setCacheProgress] = useState(null); // { done, total } or null
  const cachingRef = useRef(false);
  const [purging, setPurging] = useState(false);
  const [openTab, setOpenTab] = useState(null);

  // PIN
  const [hasPin, setHasPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  // Auto-lock
  const [autoLock, setAutoLock] = useState(0);

  // Auto Import
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { done, total, images, videos, documents }
  const importingRef = useRef(false);

  // Backup
  const [restoreMsg, setRestoreMsg] = useState("");

  // Static Background
  const [bgType, setBgType] = useState("");
  const [bgData, setBgData] = useState("");
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [bgFit, setBgFit] = useState("cover");
  // Slideshow
  const [ssEnabled, setSsEnabled] = useState(false);
  const [ssFileIds, setSsFileIds] = useState([]);
  const [ssInterval, setSsInterval] = useState(5);
  const [ssShuffle, setSsShuffle] = useState(false);
  const [ssOpacity, setSsOpacity] = useState(0.3);
  const [ssFit, setSsFit] = useState("cover");
  // Vault picker
  const [showVaultPicker, setShowVaultPicker] = useState(null);
  // Dropdown toggles
  const [secOpen, setSecOpen] = useState(null);

  useEffect(() => {
    invoke("debug_info").then(setDebugText).catch(e => setDebugText("Error: " + e));
    invoke("has_pin").then(setHasPin).catch(() => {});
    invoke("get_settings").then(s => {
      setAutoLock(s.auto_lock_secs || 0);
      setBgType(s.bg_type || "");
      setBgData(s.bg_data || "");
      setBgOpacity(s.bg_opacity || 0.3);
      setBgFit(s.bg_fit || "cover");
      setSsEnabled(s.slideshow_enabled || false);
      setSsFileIds(s.slideshow_file_ids || []);
      setSsInterval(s.slideshow_interval || 5);
      setSsShuffle(s.slideshow_shuffle || false);
      setSsOpacity(s.slideshow_opacity || 0.3);
      setSsFit(s.slideshow_fit || "cover");
    }).catch(() => {});
  }, []);

  const toggle = (tab) => setOpenTab(openTab === tab ? null : tab);

  const handleSetPin = async () => {
    if (pinInput.length < 4) { setPinMsg("PIN must be at least 4 digits"); return; }
    try {
      await invoke("set_pin", { pin: pinInput });
      setHasPin(true);
      setPinInput("");
      setPinMsg("PIN set successfully!");
    } catch (e) { setPinMsg("Error: " + e); }
  };

  const handleRemovePin = async () => {
    try {
      await invoke("remove_pin");
      setHasPin(false);
      setPinMsg("PIN removed.");
    } catch (e) { setPinMsg("Error: " + e); }
  };

  const handleAutoLockChange = async (secs) => {
    setAutoLock(secs);
    try {
      const s = await invoke("get_settings");
      s.auto_lock_secs = secs;
      await invoke("update_settings", { settings: s });
    } catch (e) { console.error(e); }
  };

  const saveBgSettings = async (type, data, opacity, fit) => {
    try {
      const s = await invoke("get_settings");
      s.bg_type = type; s.bg_data = data; s.bg_opacity = opacity; s.bg_fit = fit;
      await invoke("update_settings", { settings: s });
    } catch (e) { console.error(e); }
  };

  const saveSlideshowSettings = async (enabled, fileIds, interval, shuffle, opacity, fit) => {
    try {
      const s = await invoke("get_settings");
      s.slideshow_enabled = enabled;
      s.slideshow_file_ids = fileIds;
      s.slideshow_interval = interval;
      s.slideshow_shuffle = shuffle;
      s.slideshow_opacity = opacity;
      s.slideshow_fit = fit;
      await invoke("update_settings", { settings: s });
    } catch (e) { console.error(e); }
  };

  const handlePurgeTrash = async () => {
    setPurging(true);
    try {
      await invoke("purge_trash");
      onPurge();
      setDebugText(await invoke("debug_info"));
    } catch (e) { console.error(e); }
    setPurging(false);
  };

  const handleAutoImport = async () => {
    try {
      const folder = await openDialog({ directory: true, title: "Select folder to auto-import" });
      if (!folder) return;
      const folderPath = folder.path || folder;

      setImporting(true);
      importingRef.current = true;
      setImportProgress({ done: 0, total: 0, images: 0, videos: 0, documents: 0 });

      // Get all files in the folder recursively
      const allFiles = await invoke("list_folder_files", { path: folderPath });
      if (allFiles.length === 0) {
        setImportProgress(null);
        setImporting(false);
        importingRef.current = false;
        return;
      }

      // Categorize files for the progress display
      const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff)$/i;
      const VIDEO_EXTS = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i;

      let imgCount = 0, vidCount = 0, docCount = 0;
      for (const f of allFiles) {
        if (IMAGE_EXTS.test(f)) imgCount++;
        else if (VIDEO_EXTS.test(f)) vidCount++;
        else docCount++;
      }

      setImportProgress({ done: 0, total: allFiles.length, images: imgCount, videos: vidCount, documents: docCount });

      // Import in batches of 50 using "auto" category (Rust auto-detects type)
      const BATCH = 50;
      let done = 0;
      for (let i = 0; i < allFiles.length; i += BATCH) {
        if (!importingRef.current) break;
        const batch = allFiles.slice(i, i + BATCH);
        const count = await invoke("hide_files_batch", { paths: batch, category: "auto" });
        done += count;
        setImportProgress(prev => ({ ...prev, done }));
        await new Promise(r => setTimeout(r, 10));
      }

      setImporting(false);
      importingRef.current = false;
      onPurge(); // refresh stats
    } catch (e) {
      console.error("Auto import error:", e);
      setImporting(false);
      importingRef.current = false;
      setImportProgress(null);
    }
  };

  const handleBackupToFile = async () => {
    try {
      const data = await invoke("create_backup");
      const dest = await openDialog({
        save: true,
        defaultPath: "cybervault_backup.cvb",
        filters: [{ name: "CyberVault Backup", extensions: ["cvb"] }],
      });
      if (dest) {
        const path = dest.path || dest;
        // Write via Rust
        await invoke("write_file", { path, content: data });
        setRestoreMsg("Backup saved to " + path);
      }
    } catch (e) { setRestoreMsg("Error: " + e); }
  };

  const handleRestoreFromFile = async () => {
    try {
      const sel = await openDialog({
        multiple: false,
        filters: [{ name: "CyberVault Backup", extensions: ["cvb"] }],
      });
      if (sel) {
        const path = sel.path || sel;
        const data = await invoke("read_file", { path });
        const msg = await invoke("restore_backup", { backupData: data });
        setRestoreMsg(msg);
        onPurge();
      }
    } catch (e) { setRestoreMsg("Error: " + e); }
  };

  const toggleCaching = async () => {
    if (caching) {
      // Stop
      cachingRef.current = false;
      setCaching(false);
      setCacheProgress(null);
      return;
    }
    cachingRef.current = true;
    setCaching(true);

    const cachedIds = await invoke("get_cached_thumb_ids");
    const totalFiles = (stats.images || 0) + (stats.videos || 0);
    let done = cachedIds.length;
    console.log(`[CACHE] Starting. Cached: ${done}, Total: ${totalFiles}, Images: ${stats.images}, Videos: ${stats.videos}`);
    setCacheProgress({ done, total: totalFiles });

    // Phase 1: Cache image thumbnails (Rust backend, parallel)
    console.log("[CACHE] Phase 1: Images");
    while (cachingRef.current) {
      try {
        const generated = await invoke("generate_thumbs_batch", { batchSize: 20 });
        if (generated === 0) break;
        done += generated;
        setCacheProgress({ done: Math.min(done, totalFiles), total: totalFiles });
        await new Promise(r => setTimeout(r, 10));
      } catch (e) {
        console.error("[CACHE] Image batch error:", e);
        break;
      }
    }
    console.log(`[CACHE] Phase 1 done. Generated ${done - cachedIds.length} image thumbs`);

    // Phase 2: Cache video thumbnails (frontend, one at a time)
    if (cachingRef.current) {
      console.log("[CACHE] Phase 2: Videos");
      try {
        const videoIds = await invoke("get_missing_video_thumb_ids");
        console.log(`[CACHE] Found ${videoIds.length} videos without thumbnails`);
        for (const vid of videoIds) {
          if (!cachingRef.current) break;
          console.log(`[CACHE] Processing video: ${vid}`);
          try {
            const thumbData = await captureVideoFrame(vid);
            if (thumbData) {
              console.log(`[CACHE] Got frame for ${vid}, saving (${thumbData.length} bytes b64)`);
              await invoke("save_thumb_data", { fileId: vid, thumbBase64: thumbData });
              done++;
              setCacheProgress({ done: Math.min(done, totalFiles), total: totalFiles });
            } else {
              console.log(`[CACHE] No frame captured for ${vid}`);
            }
          } catch (e) {
            console.error(`[CACHE] Video ${vid} error:`, e);
          }
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (e) { console.error("[CACHE] Video phase error:", e); }
    } else {
      console.log("[CACHE] Skipped phase 2 (stopped)");
    }

    console.log("[CACHE] Complete");
    setCacheProgress({ done: totalFiles, total: totalFiles });
    cachingRef.current = false;
    setCaching(false);
  };

  // Stop caching/importing on unmount
  useEffect(() => {
    return () => { cachingRef.current = false; importingRef.current = false; };
  }, []);

  const AUTO_LOCK_OPTIONS = [
    { label: "OFF", value: 0 },
    { label: "30s", value: 30 },
    { label: "1m", value: 60 },
    { label: "5m", value: 300 },
    { label: "10m", value: 600 },
    { label: "30m", value: 1800 },
  ];

  return (
    <div className="settings">
      <div className="settings-header">
        <h2 className="settings-title">SETTINGS</h2>
      </div>

      <div className="st-tabs">
        <button className={`st-tab ${openTab === "appearance" ? "active" : ""}`} onClick={() => toggle("appearance")}>
          APPEARANCE <span className="st-tab-arrow">{openTab === "appearance" ? "▲" : "▼"}</span>
        </button>
        <button className={`st-tab ${openTab === "tools" ? "active" : ""}`} onClick={() => toggle("tools")}>
          TOOLS <span className="st-tab-arrow">{openTab === "tools" ? "▲" : "▼"}</span>
        </button>
        <button className={`st-tab ${openTab === "help" ? "active" : ""}`} onClick={() => toggle("help")}>
          HELP / INFO <span className="st-tab-arrow">{openTab === "help" ? "▲" : "▼"}</span>
        </button>
      </div>

      <div className="settings-body">
        {/* ── APPEARANCE ── */}
        {openTab === "appearance" && (
          <>
            {/* Static Background */}
            <div className="settings-section">
              <div className="settings-section-title">STATIC BACKGROUND</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">SOURCE</span>
                  <span className="settings-about-value">{bgType ? (bgData.startsWith("vault:") ? "VAULT FILE" : "LOCAL FILE") : "NONE"}</span>
                </div>
                <div className="settings-about-row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className="fl-btn fl-btn-primary" onClick={async () => {
                    const sel = await openDialog({ multiple: false, filters: [
                      { name: "Image", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] },
                      { name: "Video", extensions: ["mp4", "webm", "mkv", "avi", "mov"] },
                    ]});
                    if (sel) {
                      const p = sel.path || sel;
                      const isVid = /\.(mp4|webm|mkv|avi|mov)$/i.test(p);
                      setBgType(isVid ? "video" : "image");
                      setBgData(p);
                      saveBgSettings(isVid ? "video" : "image", p, bgOpacity, bgFit);
                    }
                  }}>FROM COMPUTER</button>
                  <button className="fl-btn fl-btn-muted" onClick={() => setShowVaultPicker("bg")}
                    style={{ background: "rgba(255, 215, 64, 0.12)", color: "#ffd740", borderColor: "rgba(255, 215, 64, 0.3)" }}>
                    FROM VAULT
                  </button>
                  {bgType && (
                    <button className="fl-btn fl-btn-danger" onClick={() => {
                      setBgType(""); setBgData("");
                      saveBgSettings("", "", bgOpacity, bgFit);
                    }}>REMOVE</button>
                  )}
                </div>
                {bgData && (
                  <div style={{ fontSize: 11, color: "var(--text4)", wordBreak: "break-all", padding: "2px 0" }}>
                    {bgData.startsWith("vault:") ? "Vault file: " + bgData.slice(6) : bgData}
                  </div>
                )}
                <div className="settings-about-row">
                  <span className="settings-about-label">OPACITY</span>
                  <input type="range" min="0" max="1" step="0.05" value={bgOpacity}
                    onChange={e => { const v = parseFloat(e.target.value); setBgOpacity(v); saveBgSettings(bgType, bgData, v, bgFit); }}
                    style={{ width: 120 }} />
                  <span className="settings-about-value">{Math.round(bgOpacity * 100)}%</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FIT</span>
                  <select className="sort-select" value={bgFit} onChange={e => { setBgFit(e.target.value); saveBgSettings(bgType, bgData, bgOpacity, e.target.value); }}
                    style={{ minWidth: 100 }}>
                    <option value="cover">COVER</option>
                    <option value="contain">CONTAIN</option>
                    <option value="fill">FILL</option>
                    <option value="stretch">STRETCH</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Slideshow Wallpaper */}
            <div className="settings-section">
              <div className="settings-section-title">SLIDESHOW WALLPAPER</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">STATUS</span>
                  <span className="settings-about-value" style={{ color: ssEnabled ? "var(--green)" : "var(--text4)" }}>
                    {ssEnabled ? `ON (${ssFileIds.length} files)` : "OFF"}
                  </span>
                </div>
                <div className="settings-about-row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className="fl-btn fl-btn-primary" onClick={() => setShowVaultPicker("slideshow")}>
                    SELECT FROM VAULT
                  </button>
                  <button className={`fl-btn ${ssEnabled ? "fl-btn-danger" : "fl-btn-primary"}`}
                    onClick={() => { const v = !ssEnabled; setSsEnabled(v); saveSlideshowSettings(v, ssFileIds, ssInterval, ssShuffle, ssOpacity, ssFit); }}>
                    {ssEnabled ? "DISABLE" : "ENABLE"}
                  </button>
                </div>
                {ssFileIds.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text4)", padding: "2px 0" }}>
                    {ssFileIds.length} vault files selected
                  </div>
                )}
                <div className="settings-about-row">
                  <span className="settings-about-label">INTERVAL</span>
                  <select className="sort-select" value={ssInterval} onChange={e => { const v = parseInt(e.target.value); setSsInterval(v); saveSlideshowSettings(ssEnabled, ssFileIds, v, ssShuffle, ssOpacity, ssFit); }}
                    style={{ minWidth: 120 }}>
                    <option value={1}>1 SECOND</option>
                    <option value={3}>3 SECONDS</option>
                    <option value={5}>5 SECONDS</option>
                    <option value={10}>10 SECONDS</option>
                    <option value={30}>30 SECONDS</option>
                    <option value={60}>1 MINUTE</option>
                    <option value={300}>5 MINUTES</option>
                    <option value={600}>10 MINUTES</option>
                  </select>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">SHUFFLE</span>
                  <button className={`fl-btn ${ssShuffle ? "fl-btn-primary" : "fl-btn-muted"}`}
                    onClick={() => { const v = !ssShuffle; setSsShuffle(v); saveSlideshowSettings(ssEnabled, ssFileIds, ssInterval, v, ssOpacity, ssFit); }}>
                    {ssShuffle ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">OPACITY</span>
                  <input type="range" min="0" max="1" step="0.05" value={ssOpacity}
                    onChange={e => { const v = parseFloat(e.target.value); setSsOpacity(v); saveSlideshowSettings(ssEnabled, ssFileIds, ssInterval, ssShuffle, v, ssFit); }}
                    style={{ width: 120 }} />
                  <span className="settings-about-value">{Math.round(ssOpacity * 100)}%</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FIT</span>
                  <select className="sort-select" value={ssFit} onChange={e => { setSsFit(e.target.value); saveSlideshowSettings(ssEnabled, ssFileIds, ssInterval, ssShuffle, ssOpacity, e.target.value); }}
                    style={{ minWidth: 100 }}>
                    <option value="cover">COVER</option>
                    <option value="contain">CONTAIN</option>
                    <option value="fill">FILL</option>
                    <option value="stretch">STRETCH</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Vault File Picker Modal */}
            {showVaultPicker && (
              <VaultFilePicker
                mode={showVaultPicker}
                onSelect={async (ids) => {
                  if (showVaultPicker === "bg" && ids.length > 0) {
                    const id = ids[0];
                    setBgType("image"); setBgData("vault:" + id);
                    saveBgSettings("image", "vault:" + id, bgOpacity, bgFit);
                  } else if (showVaultPicker === "slideshow") {
                    setSsFileIds(ids);
                    saveSlideshowSettings(ssEnabled, ids, ssInterval, ssShuffle, ssOpacity, ssFit);
                  }
                  setShowVaultPicker(null);
                }}
                onClose={() => setShowVaultPicker(null)}
              />
            )}
          </>
        )}

        {/* ── TOOLS ── */}
        {openTab === "tools" && (
          <>
            {/* PIN — dropdown select */}
            <div className="settings-section">
              <div className="settings-section-title" style={{ color: "var(--cyan)" }}>SECURITY</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">PIN</span>
                  <select className="sort-select" value={hasPin ? "on" : "off"} onChange={async (e) => {
                    if (e.target.value === "off") { await handleRemovePin(); }
                  }}>
                    <option value="off">DISABLED</option>
                    <option value="on">ENABLED</option>
                  </select>
                </div>
                <div className="settings-about-row">
                  <input
                    className="search-input"
                    type="password"
                    placeholder={hasPin ? "Change PIN..." : "Set PIN (4+ digits)"}
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => { if (e.key === "Enter") handleSetPin(); }}
                    style={{ maxWidth: 200 }}
                  />
                  <button className="fl-btn fl-btn-primary" onClick={handleSetPin}>SET</button>
                </div>
                {pinMsg && <div style={{ fontSize: 13, color: "var(--cyan)", padding: "4px 0" }}>{pinMsg}</div>}
                <div className="settings-about-row">
                  <span className="settings-about-label">AUTO-LOCK</span>
                  <select className="sort-select" value={autoLock} onChange={e => handleAutoLockChange(parseInt(e.target.value))}>
                    {AUTO_LOCK_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="settings-section">
              <div className="settings-section-title">ACTIONS</div>
              <div className="settings-actions">
                <div className="settings-action-row">
                  <div className="settings-action-info">
                    <div className="settings-action-name">EMPTY TRASH</div>
                    <div className="settings-action-desc">Permanently delete ({stats.trash} files)</div>
                  </div>
                  <button className="fl-btn fl-btn-danger" onClick={handlePurgeTrash}
                    disabled={purging || stats.trash === 0}>
                    {purging ? "..." : "PURGE"}
                  </button>
                </div>
                <div className="settings-action-row">
                  <div className="settings-action-info">
                    <div className="settings-action-name">CACHE ALL THUMBNAILS</div>
                    <div className="settings-action-desc">
                      {cacheProgress
                        ? `${cacheProgress.done} / ${cacheProgress.total} cached`
                        : "Generate thumbnails for all images in the background"}
                    </div>
                    {cacheProgress && (
                      <div className="upload-progress-bar" style={{ marginTop: 6 }}>
                        <div className="upload-progress-fill"
                          style={{ width: `${cacheProgress.total > 0 ? Math.round((cacheProgress.done / cacheProgress.total) * 100) : 0}%` }} />
                      </div>
                    )}
                  </div>
                  <button className={`fl-btn ${caching ? "fl-btn-danger" : "fl-btn-primary"}`} onClick={toggleCaching}>
                    {caching ? "STOP" : "START"}
                  </button>
                </div>
              </div>
            </div>

            {/* Auto Import Folder */}
            <div className="settings-section">
              <div className="settings-section-title">AUTO IMPORT FOLDER</div>
              <div className="settings-actions">
                <div className="settings-action-row">
                  <div className="settings-action-info">
                    <div className="settings-action-name">IMPORT FROM FOLDER</div>
                    <div className="settings-action-desc">
                      {importProgress && importProgress.total > 0
                        ? `${importProgress.done} / ${importProgress.total} imported (${importProgress.images} images, ${importProgress.videos} videos, ${importProgress.documents} docs)`
                        : "Select a folder — files auto-sort to Images, Videos, or Docs by type"}
                    </div>
                    {importProgress && importProgress.total > 0 && (
                      <div className="upload-progress-bar" style={{ marginTop: 6 }}>
                        <div className="upload-progress-fill"
                          style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  {importing ? (
                    <button className="fl-btn fl-btn-danger" onClick={() => { importingRef.current = false; }}>
                      STOP
                    </button>
                  ) : (
                    <button className="fl-btn fl-btn-primary" onClick={handleAutoImport}>
                      SELECT FOLDER
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Backup / Restore — file-based */}
            <div className="settings-section">
              <div className="settings-section-title">BACKUP / RESTORE</div>
              <div className="settings-about">
                <div className="settings-about-row" style={{ gap: 6 }}>
                  <button className="fl-btn fl-btn-primary" onClick={handleBackupToFile}>SAVE BACKUP</button>
                  <button className="fl-btn fl-btn-muted" onClick={handleRestoreFromFile}>RESTORE FROM FILE</button>
                </div>
                {restoreMsg && <div style={{ fontSize: 13, color: "var(--text2)", padding: "4px 0" }}>{restoreMsg}</div>}
              </div>
            </div>
          </>
        )}

        {/* ── HELP / INFO ── */}
        {openTab === "help" && (
          <>
            <div className="settings-section">
              <div className="settings-section-title">VAULT STORAGE</div>
              <div className="settings-cards">
                <div className="settings-card">
                  <div className="settings-card-label">TOTAL</div>
                  <div className="settings-card-value cyan">{stats.total_files}</div>
                </div>
                <div className="settings-card">
                  <div className="settings-card-label">IMAGES</div>
                  <div className="settings-card-value">{stats.images}</div>
                </div>
                <div className="settings-card">
                  <div className="settings-card-label">VIDEOS</div>
                  <div className="settings-card-value">{stats.videos}</div>
                </div>
                <div className="settings-card">
                  <div className="settings-card-label">DOCS</div>
                  <div className="settings-card-value">{stats.documents}</div>
                </div>
                <div className="settings-card">
                  <div className="settings-card-label">NOTES</div>
                  <div className="settings-card-value">{stats.notes}</div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">ABOUT</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">APPLICATION</span>
                  <span className="settings-about-value">CyberVault v2.0</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">ENGINE</span>
                  <span className="settings-about-value">Tauri 2 + React</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">PROTECTION</span>
                  <span className="settings-about-value">Deep-root obfuscation + hidden attrs</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">HOW IT WORKS</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">HIDING</span>
                  <span className="settings-about-value">Files in deep nested system-like folders</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FILENAMES</span>
                  <span className="settings-about-value">Disguised as system files</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">ATTRIBUTES</span>
                  <span className="settings-about-value">+Hidden +System</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">INDEX</span>
                  <span className="settings-about-value">Base64 encoded</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">KEYBOARD SHORTCUTS</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">CTRL+A</span>
                  <span className="settings-about-value">Select all in grid</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">ESC</span>
                  <span className="settings-about-value">Close viewer</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">← →</span>
                  <span className="settings-about-value">Navigate media</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">F</span>
                  <span className="settings-about-value">Toggle fullscreen in viewer</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">SPACE</span>
                  <span className="settings-about-value">Start/stop slideshow</span>
                </div>
              </div>
            </div>
          </>
        )}

        {openTab === null && (
          <div className="fl-empty">
            <div className="fl-empty-icon">⚙</div>
            <div className="fl-empty-text">SELECT A TAB ABOVE</div>
            <div className="fl-empty-sub">Choose Appearance, Tools, or Help / Info</div>
          </div>
        )}
      </div>
    </div>
  );
}
