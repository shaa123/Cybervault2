import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const CARDS = [
  { id: "image", label: "IMAGES", icon: "◈", color: "#00e5ff", stat: "images" },
  { id: "video", label: "VIDEOS", icon: "▶", color: "#e040fb", stat: "videos" },
  { id: "document", label: "DOCS", icon: "◧", color: "#ffd740", stat: "documents" },
  { id: "note", label: "NOTES", icon: "✎", color: "#69f0ae", stat: "notes" },
  { id: "trash", label: "TRASH", icon: "⌫", color: "#ff5252", stat: "trash" },
];

export default function Dashboard({ stats, onOpenCategory }) {
  const [debugText, setDebugText] = useState(null);

  const showDebug = async () => {
    try {
      const info = await invoke("debug_info");
      setDebugText(info);
    } catch (e) {
      setDebugText("Error: " + e);
    }
  };

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <h1>VAULT</h1>
          <p>SELECT A CATEGORY TO VIEW HIDDEN FILES</p>
        </div>
      </div>

      <div className="dash-cards">
        {CARDS.map((c) => (
          <button
            key={c.id}
            className="dash-card"
            style={{ "--card-color": c.color }}
            onClick={() => onOpenCategory(c.id)}
          >
            <span className="dash-card-icon">{c.icon}</span>
            <div className="dash-card-count">{stats[c.stat] || 0}</div>
            <div className="dash-card-label">{c.label}</div>
            <div className="dash-card-bar" />
          </button>
        ))}
      </div>

      <div className="dash-status">
        <div className="dash-status-item">
          <div className="dash-status-dot" />
          <span className="dash-status-text">DEEP-ROOT OBFUSCATION ACTIVE</span>
        </div>
        <div className="dash-status-item">
          <div className="dash-status-dot" />
          <span className="dash-status-text">ANTI-DETECTION ENABLED</span>
        </div>
        <div className="dash-status-item" onClick={showDebug} style={{ cursor: "pointer" }}>
          <div className="dash-status-dot" />
          <span className="dash-status-text">{stats.total_files} FILES SECURED</span>
        </div>
      </div>

      {debugText && (
        <pre style={{
          marginTop: 12, padding: 14, background: "#111118", border: "1px solid #1a1a2e",
          borderRadius: 8, fontSize: "0.75rem", color: "#00e5ff", whiteSpace: "pre-wrap",
          fontFamily: "var(--mono)", lineHeight: 1.6
        }}>
          {debugText}
        </pre>
      )}
    </div>
  );
}
