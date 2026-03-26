import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function Settings({ stats, onPurge }) {
  const [debugText, setDebugText] = useState("");
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    invoke("debug_info").then(setDebugText).catch(e => setDebugText("Error: " + e));
  }, []);

  const handlePurgeTrash = async () => {
    setPurging(true);
    try {
      await invoke("purge_trash");
      onPurge();
      // Refresh debug info
      const info = await invoke("debug_info");
      setDebugText(info);
    } catch (e) { console.error(e); }
    setPurging(false);
  };

  const refreshDebug = async () => {
    try { setDebugText(await invoke("debug_info")); }
    catch (e) { setDebugText("Error: " + e); }
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <h2 className="settings-title">SETTINGS</h2>
      </div>

      <div className="settings-body">
        {/* Vault Info */}
        <div className="settings-section">
          <div className="settings-section-title">VAULT STORAGE</div>
          <div className="settings-cards">
            <div className="settings-card">
              <div className="settings-card-label">TOTAL FILES</div>
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
              <div className="settings-card-label">DOCUMENTS</div>
              <div className="settings-card-value">{stats.documents}</div>
            </div>
            <div className="settings-card">
              <div className="settings-card-label">NOTES</div>
              <div className="settings-card-value">{stats.notes}</div>
            </div>
            <div className="settings-card">
              <div className="settings-card-label">TRASH</div>
              <div className="settings-card-value red">{stats.trash}</div>
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
                <div className="settings-action-desc">Permanently delete all files in trash ({stats.trash} files)</div>
              </div>
              <button
                className="fl-btn fl-btn-danger"
                onClick={handlePurgeTrash}
                disabled={purging || stats.trash === 0}
              >
                {purging ? "PURGING..." : "PURGE"}
              </button>
            </div>
          </div>
        </div>

        {/* About */}
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
              <span className="settings-about-value">Deep-root obfuscation + hidden attributes</span>
            </div>
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
      </div>
    </div>
  );
}
