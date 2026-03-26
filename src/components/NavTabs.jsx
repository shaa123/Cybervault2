import React from "react";

const STAT_MAP = { image: "images", video: "videos", document: "documents", note: "notes", trash: "trash" };

export default function NavTabs({ tabs, active, onSelect, stats }) {
  return (
    <nav className="nav">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`nav-tab ${active === t.id ? "active" : ""}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {STAT_MAP[t.id] !== undefined && stats[STAT_MAP[t.id]] > 0 && (
            <span className="badge">{stats[STAT_MAP[t.id]]}</span>
          )}
        </button>
      ))}
      <div className="nav-spacer" />
      <div className="nav-total">
        <strong>{stats.total_files}</strong> hidden
      </div>
    </nav>
  );
}
