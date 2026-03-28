import React from "react";

const STAT_MAP = { image: "images", video: "videos", document: "documents", note: "notes", trash: "trash" };

export default function NavTabs({ tabs, active, onSelect, stats, onLock }) {
  return (
    <nav className="nav">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`nav-tab ${active === t.id ? "active" : ""}`}
          style={active === t.id && t.color ? { color: t.color, "--tab-color": t.color } : { "--tab-color": t.color || "var(--text3)" }}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {STAT_MAP[t.id] !== undefined && stats[STAT_MAP[t.id]] > 0 && (
            <span className="badge" style={active === t.id && t.color ? { background: `${t.color}20`, color: t.color } : {}}>
              {stats[STAT_MAP[t.id]]}
            </span>
          )}
        </button>
      ))}
      <button className="nav-tab nav-lock" onClick={onLock}>
        🔒
      </button>
      <div className="nav-spacer" />
      <div className="nav-total">
        <strong>{stats.total_files}</strong> hidden
      </div>
    </nav>
  );
}
