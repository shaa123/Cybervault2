import React from "react";

const CARDS = [
  { id: "image", label: "IMAGES", icon: "◈", color: "#00e5ff", stat: "images" },
  { id: "video", label: "VIDEOS", icon: "▶", color: "#e040fb", stat: "videos" },
  { id: "document", label: "DOCS", icon: "◧", color: "#ffd740", stat: "documents" },
  { id: "note", label: "NOTES", icon: "✎", color: "#69f0ae", stat: "notes" },
  { id: "trash", label: "TRASH", icon: "⌫", color: "#ff5252", stat: "trash" },
];

export default function Dashboard({ stats, onOpenCategory }) {
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
    </div>
  );
}
