import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

function Dropdown({ label, open, onToggle, children }) {
  return (
    <div className="st-dropdown">
      <button className={`st-dropdown-toggle ${open ? "open" : ""}`} onClick={onToggle}>
        {label}
        <span className="st-dropdown-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="st-dropdown-body">{children}</div>}
    </div>
  );
}

export default function Settings({ stats, onPurge }) {
  const [debugText, setDebugText] = useState("");
  const [purging, setPurging] = useState(false);
  const [openTab, setOpenTab] = useState(null); // "appearance" | "tools" | "help" | null

  useEffect(() => {
    invoke("debug_info").then(setDebugText).catch(e => setDebugText("Error: " + e));
  }, []);

  const toggle = (tab) => setOpenTab(openTab === tab ? null : tab);

  const handlePurgeTrash = async () => {
    setPurging(true);
    try {
      await invoke("purge_trash");
      onPurge();
      setDebugText(await invoke("debug_info"));
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

      {/* Horizontal dropdown tabs */}
      <div className="st-tabs">
        <button
          className={`st-tab ${openTab === "appearance" ? "active" : ""}`}
          onClick={() => toggle("appearance")}
        >
          APPEARANCE <span className="st-tab-arrow">{openTab === "appearance" ? "▲" : "▼"}</span>
        </button>
        <button
          className={`st-tab ${openTab === "tools" ? "active" : ""}`}
          onClick={() => toggle("tools")}
        >
          TOOLS <span className="st-tab-arrow">{openTab === "tools" ? "▲" : "▼"}</span>
        </button>
        <button
          className={`st-tab ${openTab === "help" ? "active" : ""}`}
          onClick={() => toggle("help")}
        >
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
                  <span className="settings-about-label">ACCENT COLOR</span>
                  <span className="settings-about-value" style={{ color: "var(--cyan)" }}>CYAN</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FONT (UI)</span>
                  <span className="settings-about-value">Corptic</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FONT (FILES)</span>
                  <span className="settings-about-value" style={{ fontFamily: "var(--font-file)" }}>Noto Sans</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">LAYOUT</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">GRID COLUMNS</span>
                  <span className="settings-about-value">5 × 5</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">WINDOW</span>
                  <span className="settings-about-value">FRAMELESS + CUSTOM TITLEBAR</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── TOOLS ── */}
        {openTab === "tools" && (
          <>
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
              </div>
            </div>

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
                  <span className="settings-about-value">Deep-root obfuscation + hidden attributes</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">HOW IT WORKS</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">HIDING</span>
                  <span className="settings-about-value">Files moved to deep nested system-like folders</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">FILENAMES</span>
                  <span className="settings-about-value">Disguised as system files (ntoskrnl.sys, etc.)</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">ATTRIBUTES</span>
                  <span className="settings-about-value">+Hidden +System (invisible to Explorer)</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">INDEX</span>
                  <span className="settings-about-value">Base64 encoded vault index</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">KEYBOARD SHORTCUTS</div>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">CTRL + A</span>
                  <span className="settings-about-value">Select all files in grid view</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">ESC</span>
                  <span className="settings-about-value">Close media viewer</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">← →</span>
                  <span className="settings-about-value">Navigate between media files</span>
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
