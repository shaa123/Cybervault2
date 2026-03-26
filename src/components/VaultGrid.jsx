import React from "react";

const GRID_ITEMS = [
  { id: "image", label: "IMAGES", icon: "◈", desc: "Hidden photographs & graphics", color: "#00f0ff" },
  { id: "video", label: "VIDEOS", icon: "▶", desc: "Concealed video files", color: "#ff00e5" },
  { id: "document", label: "DOCUMENTS", icon: "◧", desc: "Buried documents & PDFs", color: "#ffe600" },
  { id: "note", label: "NOTES", icon: "✎", desc: "Encrypted text entries", color: "#00ff8c" },
  { id: "trash", label: "TRASH", icon: "⌫", desc: "Marked for destruction", color: "#ff3344" },
  { id: "stats", label: "SYSTEM", icon: "◉", desc: "Vault diagnostics", color: "#8855ff" },
  { id: "info1", label: "PROTOCOL", icon: "⚡", desc: "Deep-root obfuscation", color: "#ff8800" },
  { id: "info2", label: "STATUS", icon: "◎", desc: "All systems nominal", color: "#00f0ff" },
  { id: "info3", label: "SHIELD", icon: "⬡", desc: "Anti-detection active", color: "#ff00e5" },
];

export default function VaultGrid({ stats, onOpenCategory }) {
  const getCount = (id) => {
    switch (id) {
      case "image": return stats.images;
      case "video": return stats.videos;
      case "document": return stats.documents;
      case "note": return stats.notes;
      case "trash": return stats.trash;
      case "stats": return stats.total_files;
      default: return null;
    }
  };

  const isClickable = (id) => ["image", "video", "document", "note", "trash"].includes(id);

  return (
    <div className="cv-grid-view">
      <div className="cv-grid-header">
        <h1 className="cv-grid-title">VAULT_INTERFACE</h1>
        <p className="cv-grid-subtitle">// SELECT MODULE TO ACCESS</p>
      </div>
      <div className="cv-grid">
        {GRID_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`cv-grid-cell ${isClickable(item.id) ? "clickable" : "info-cell"}`}
            style={{ "--cell-accent": item.color }}
            onClick={() => isClickable(item.id) && onOpenCategory(item.id)}
          >
            <div className="cv-cell-top">
              <span className="cv-cell-icon">{item.icon}</span>
              {getCount(item.id) !== null && (
                <span className="cv-cell-count">{getCount(item.id)}</span>
              )}
            </div>
            <div className="cv-cell-label">{item.label}</div>
            <div className="cv-cell-desc">{item.desc}</div>
            <div className="cv-cell-corner-tl" />
            <div className="cv-cell-corner-br" />
          </button>
        ))}
      </div>
    </div>
  );
}
