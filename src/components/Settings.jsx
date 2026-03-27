import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

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
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [bgFit, setBgFit] = useState("cover");

  useEffect(() => {
    invoke("debug_info").then(setDebugText).catch(e => setDebugText("Error: " + e));
    invoke("has_pin").then(setHasPin).catch(() => {});
    invoke("get_settings").then(s => {
      setAutoLock(s.auto_lock_secs || 0);
      setBgType(s.bg_type || "");
      setBgOpacity(s.bg_opacity || 0.3);
      setBgFit(s.bg_fit || "cover");
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
    // Start background caching
    cachingRef.current = true;
    setCaching(true);

    // Count total missing
    const cachedIds = await invoke("get_cached_thumb_ids");
    const totalImages = stats.images || 0;
    const alreadyCached = cachedIds.length;
    let done = alreadyCached;
    setCacheProgress({ done, total: totalImages });

    // Process in batches of 5
    while (cachingRef.current) {
      try {
        const generated = await invoke("generate_thumbs_batch", { batchSize: 20 });
        if (generated === 0) {
          // All done
          setCacheProgress({ done: totalImages, total: totalImages });
          break;
        }
        done += generated;
        setCacheProgress({ done: Math.min(done, totalImages), total: totalImages });
        // Brief yield between batches
        await new Promise(r => setTimeout(r, 10));
      } catch (e) {
        console.error("Cache batch error:", e);
        break;
      }
    }
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
                  <span className="settings-about-label">OPACITY</span>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={bgOpacity}
                    onChange={e => setBgOpacity(parseFloat(e.target.value))}
                    style={{ width: 120 }}
                  />
                  <span className="settings-about-value">{Math.round(bgOpacity * 100)}%</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FIT</span>
                  <select className="sort-select" value={bgFit} onChange={e => setBgFit(e.target.value)}
                    style={{ minWidth: 100 }}>
                    <option value="cover">COVER</option>
                    <option value="contain">CONTAIN</option>
                    <option value="fill">FILL</option>
                    <option value="stretch">STRETCH</option>
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
                <div className="settings-about-row" style={{ gap: 6 }}>
                  {AUTO_LOCK_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      className={`tag-chip ${autoLock === o.value ? "active" : ""}`}
                      onClick={() => handleAutoLockChange(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Vault Storage */}
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
