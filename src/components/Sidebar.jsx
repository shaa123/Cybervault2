import React from "react";

const ICON_MAP = {
  image: "◈",
  video: "▶",
  document: "◧",
  note: "✎",
  trash: "⌫",
};

const STAT_KEY = {
  image: "images",
  video: "videos",
  document: "documents",
  note: "notes",
  trash: "trash",
};

export default function Sidebar({ categories, activeCategory, stats, onSelect, onHome, currentView }) {
  return (
    <aside className="cv-sidebar">
      <button
        className={`cv-side-item cv-side-home ${currentView === "grid" ? "active" : ""}`}
        onClick={onHome}
      >
        <span className="cv-side-icon">⬡</span>
        <span className="cv-side-label">VAULT</span>
      </button>
      <div className="cv-side-divider" />
      {categories.map((cat) => (
        <button
          key={cat.id}
          className={`cv-side-item ${activeCategory === cat.id ? "active" : ""}`}
          onClick={() => onSelect(cat.id)}
        >
          <span className="cv-side-icon">{ICON_MAP[cat.id]}</span>
          <span className="cv-side-label">{cat.label}</span>
          <span className="cv-side-count">{stats[STAT_KEY[cat.id]] || 0}</span>
        </button>
      ))}
      <div className="cv-side-divider" />
      <div className="cv-side-footer">
        <div className="cv-side-stat">
          <span className="cv-stat-num">{stats.total_files}</span>
          <span className="cv-stat-label">TOTAL<br />FILES</span>
        </div>
      </div>
    </aside>
  );
}
