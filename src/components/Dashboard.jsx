import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const CARDS = [
  { id: "image", label: "IMAGES", icon: "◈", color: "#00e5ff", stat: "images" },
  { id: "video", label: "VIDEOS", icon: "▶", color: "#e040fb", stat: "videos" },
  { id: "document", label: "DOCS", icon: "◧", color: "#ffd740", stat: "documents" },
  { id: "note", label: "NOTES", icon: "✎", color: "#69f0ae", stat: "notes" },
  { id: "trash", label: "TRASH", icon: "⌫", color: "#ff5252", stat: "trash" },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes < 1099511627776) return (bytes / 1073741824).toFixed(1) + " GB";
  return (bytes / 1099511627776).toFixed(2) + " TB";
}

export default function Dashboard({ stats, onOpenCategory }) {
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    invoke("get_storage_info").then(setStorage).catch(() => {});
  }, []);

  const usedPct = storage && storage.total > 0 ? Math.round((storage.used / storage.total) * 100) : 0;

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

      {/* Storage info */}
      {storage && storage.total > 0 && (
        <div className="dash-storage">
          <div className="dash-storage-header">
            <span className="dash-storage-title">STORAGE</span>
            <span className="dash-storage-text">
              {formatBytes(storage.free)} free of {formatBytes(storage.total)}
            </span>
          </div>
          <div className="dash-storage-bar">
            <div
              className="dash-storage-fill"
              style={{
                width: `${usedPct}%`,
                background: usedPct > 90 ? "var(--red)" : usedPct > 70 ? "var(--yellow)" : "var(--cyan)",
              }}
            />
          </div>
          <div className="dash-storage-detail">
            <span>{formatBytes(storage.used)} used ({usedPct}%)</span>
          </div>
        </div>
      )}
    </div>
  );
}
