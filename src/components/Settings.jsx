import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
// vaultFileUrl no longer needed — video frame capture uses invoke

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

export default function Settings({ stats, onPurge, onOpenAudit }) {
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

  // Backup
  const [backupData, setBackupData] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const [restoreMsg, setRestoreMsg] = useState("");

  // Background
  const [bgType, setBgType] = useState("");
  const [bgData, setBgData] = useState("");
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [bgFit, setBgFit] = useState("cover");
  const [bgInterval, setBgInterval] = useState(0);

  useEffect(() => {
    invoke("debug_info").then(setDebugText).catch(e => setDebugText("Error: " + e));
    invoke("has_pin").then(setHasPin).catch(() => {});
    invoke("get_settings").then(s => {
      setAutoLock(s.auto_lock_secs || 0);
      setBgType(s.bg_type || "");
      setBgData(s.bg_data || "");
      setBgOpacity(s.bg_opacity || 0.3);
      setBgFit(s.bg_fit || "cover");
      setBgInterval(s.slideshow_interval || 0);
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

  const handleSaveBg = async (type, data, opacity, fit, interval) => {
    try {
      const s = await invoke("get_settings");
      s.bg_type = type;
      s.bg_data = data;
      s.bg_opacity = opacity;
      s.bg_fit = fit;
      s.slideshow_interval = interval;
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

  const handleBackup = async () => {
    try {
      const data = await invoke("create_backup");
      setBackupData(data);
    } catch (e) { setBackupData("Error: " + e); }
  };

  const handleRestore = async () => {
    if (!restoreInput.trim()) return;
    try {
      const msg = await invoke("restore_backup", { backupData: restoreInput.trim() });
      setRestoreMsg(msg);
      setRestoreInput("");
      onPurge();
    } catch (e) { setRestoreMsg("Error: " + e); }
  };

  const handleCopyBackup = () => {
    navigator.clipboard.writeText(backupData);
    setBackupData("Copied to clipboard!");
    setTimeout(() => setBackupData(""), 2000);
  };

  const refreshDebug = async () => {
    try { setDebugText(await invoke("debug_info")); }
    catch (e) { setDebugText("Error: " + e); }
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

  // Stop caching on unmount
  useEffect(() => {
    return () => { cachingRef.current = false; };
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
            <div className="settings-section">
              <div className="settings-section-title">THEME</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">COLOR SCHEME</span>
                  <span className="settings-about-value">CYBERPUNK DARK</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FONT (UI)</span>
                  <span className="settings-about-value">Corptic</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FONT (FILES)</span>
                  <span className="settings-about-value" style={{ fontFamily: "var(--font-file)" }}>Noto Sans</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">GRID</span>
                  <span className="settings-about-value">5 × 5</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">CUSTOM BACKGROUND</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">TYPE</span>
                  <span className="settings-about-value">{bgType || "NONE"}</span>
                </div>
                <div className="settings-about-row">
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
                      handleSaveBg(isVid ? "video" : "image", p, bgOpacity, bgFit, bgInterval);
                    }
                  }}>SELECT FILE</button>
                  {bgType && (
                    <button className="fl-btn fl-btn-danger" onClick={() => {
                      setBgType(""); setBgData("");
                      handleSaveBg("", "", bgOpacity, bgFit, bgInterval);
                    }}>REMOVE</button>
                  )}
                </div>
                {bgData && (
                  <div style={{ fontSize: 12, color: "var(--text3)", wordBreak: "break-all", padding: "2px 0" }}>
                    {bgData}
                  </div>
                )}
                <div className="settings-about-row">
                  <span className="settings-about-label">OPACITY</span>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={bgOpacity}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setBgOpacity(v);
                      handleSaveBg(bgType, bgData, v, bgFit, bgInterval);
                    }}
                    style={{ width: 120 }}
                  />
                  <span className="settings-about-value">{Math.round(bgOpacity * 100)}%</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FIT</span>
                  <select className="sort-select" value={bgFit} onChange={e => {
                    setBgFit(e.target.value);
                    handleSaveBg(bgType, bgData, bgOpacity, e.target.value, bgInterval);
                  }} style={{ minWidth: 100 }}>
                    <option value="cover">COVER</option>
                    <option value="contain">CONTAIN</option>
                    <option value="fill">FILL</option>
                    <option value="stretch">STRETCH</option>
                  </select>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">SLIDESHOW INTERVAL</span>
                  <select className="sort-select" value={bgInterval} onChange={e => {
                    const v = parseInt(e.target.value);
                    setBgInterval(v);
                    handleSaveBg(bgType, bgData, bgOpacity, bgFit, v);
                  }} style={{ minWidth: 120 }}>
                    <option value={0}>OFF</option>
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
              </div>
            </div>
          </>
        )}

        {/* ── TOOLS ── */}
        {openTab === "tools" && (
          <>
            {/* PIN */}
            <div className="settings-section">
              <div className="settings-section-title">PIN AUTHENTICATION</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">STATUS</span>
                  <span className="settings-about-value" style={{ color: hasPin ? "var(--green)" : "var(--text4)" }}>
                    {hasPin ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <div className="settings-about-row">
                  <input
                    className="search-input"
                    type="password"
                    placeholder={hasPin ? "Enter new PIN..." : "Set a PIN (4+ digits)..."}
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => { if (e.key === "Enter") handleSetPin(); }}
                    style={{ maxWidth: 220 }}
                  />
                  <button className="fl-btn fl-btn-primary" onClick={handleSetPin}>SET PIN</button>
                  {hasPin && (
                    <button className="fl-btn fl-btn-danger" onClick={handleRemovePin}>REMOVE</button>
                  )}
                </div>
                {pinMsg && <div style={{ fontSize: 13, color: "var(--text2)", padding: "4px 0" }}>{pinMsg}</div>}
              </div>
            </div>

            {/* Auto-lock */}
            <div className="settings-section">
              <div className="settings-section-title">AUTO-LOCK TIMEOUT</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">LOCK AFTER</span>
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
                    <div className="settings-action-name">AUDIT LOG</div>
                    <div className="settings-action-desc">View all vault actions with timestamps</div>
                  </div>
                  <button className="fl-btn fl-btn-primary" onClick={onOpenAudit}>VIEW</button>
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
                        <div
                          className="upload-progress-fill"
                          style={{ width: `${cacheProgress.total > 0 ? Math.round((cacheProgress.done / cacheProgress.total) * 100) : 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    className={`fl-btn ${caching ? "fl-btn-danger" : "fl-btn-primary"}`}
                    onClick={toggleCaching}
                  >
                    {caching ? "STOP" : "START"}
                  </button>
                </div>
              </div>
            </div>

            {/* Backup / Restore */}
            <div className="settings-section">
              <div className="settings-section-title">BACKUP / RESTORE</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <button className="fl-btn fl-btn-primary" onClick={handleBackup}>CREATE BACKUP</button>
                  {backupData && !backupData.startsWith("Error") && (
                    <button className="fl-btn fl-btn-muted" onClick={handleCopyBackup}>COPY</button>
                  )}
                </div>
                {backupData && (
                  <div style={{ fontSize: 12, color: "var(--cyan)", wordBreak: "break-all", maxHeight: 60, overflow: "auto", padding: "4px 0" }}>
                    {backupData.slice(0, 200)}{backupData.length > 200 ? "..." : ""}
                  </div>
                )}
                <div className="settings-about-row" style={{ marginTop: 8 }}>
                  <input
                    className="search-input"
                    placeholder="Paste backup data to restore..."
                    value={restoreInput}
                    onChange={e => setRestoreInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="fl-btn fl-btn-danger" onClick={handleRestore}>RESTORE</button>
                </div>
                {restoreMsg && (
                  <div style={{ fontSize: 13, color: "var(--text2)", padding: "4px 0" }}>{restoreMsg}</div>
                )}
              </div>
            </div>

            {/* Diagnostics */}
            <div className="settings-section">
              <div className="settings-section-title">
                DIAGNOSTICS
                <button className="settings-refresh-btn" onClick={refreshDebug}>REFRESH</button>
              </div>
              <pre className="settings-debug">{debugText}</pre>
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
