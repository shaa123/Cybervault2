import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const TITLES = { image: "IMAGES", video: "VIDEOS", document: "DOCUMENTS", note: "NOTES", trash: "TRASH" };
const ICONS = { image: "◈", video: "▶", text: "✎", document: "◧" };

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
}

export default function FileList({ category, files, color, onChanged, onEditNote }) {
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    try {
      const selected = await openDialog({ multiple: true });
      if (selected) {
        const paths = (Array.isArray(selected) ? selected : [selected]).map(f => f.path || f);
        if (paths.length > 0) {
          setLoading(true);
          await invoke("hide_files", { paths, category });
          onChanged();
          setLoading(false);
        }
      }
    } catch (e) { console.error(e); setLoading(false); }
  };

  const handleUnhide = async (id) => {
    try {
      const dest = await openDialog({ directory: true });
      if (dest) {
        await invoke("unhide_file", { fileId: id, destination: dest.path || dest });
        onChanged();
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    try { await invoke("delete_file", { fileId: id }); onChanged(); }
    catch (e) { console.error(e); }
  };

  const handleRestore = async (id) => {
    try { await invoke("restore_file", { fileId: id }); onChanged(); }
    catch (e) { console.error(e); }
  };

  const handlePurge = async () => {
    try { await invoke("purge_trash"); onChanged(); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="filelist" style={{ "--list-color": color }}>
      <div className="fl-toolbar">
        <div className="fl-title">{TITLES[category]}</div>
        {category === "note" && (
          <button className="fl-btn fl-btn-primary" onClick={() => onEditNote(null)}>+ NEW NOTE</button>
        )}
        {category !== "trash" && category !== "note" && (
          <button className="fl-btn fl-btn-primary" onClick={handleAdd} disabled={loading}>
            {loading ? "HIDING..." : "+ HIDE FILES"}
          </button>
        )}
        {category === "trash" && files.length > 0 && (
          <button className="fl-btn fl-btn-danger" onClick={handlePurge}>PURGE ALL</button>
        )}
      </div>

      <div className="fl-count">{files.length} FILE{files.length !== 1 ? "S" : ""}</div>

      {files.length === 0 ? (
        <div className="fl-empty">
          <div className="fl-empty-icon">◇</div>
          <div className="fl-empty-text">
            {category === "trash" ? "TRASH EMPTY" : "NO FILES YET"}
          </div>
          <div className="fl-empty-sub">
            {category === "note" ? "Create a note to get started"
              : category !== "trash" ? "Click + HIDE FILES to add files"
              : "Deleted files appear here"}
          </div>
        </div>
      ) : (
        <div className="fl-rows">
          {files.map((f) => (
            <div key={f.id} className="fl-row">
              <div className="fl-row-icon">
                {ICONS[f.mime_hint] || "◧"}
              </div>
              <div className="fl-row-info">
                <div className="fl-row-name">{f.original_name}</div>
                <div className="fl-row-meta">{formatSize(f.size)} · {f.hidden_at}</div>
              </div>
              <div className="fl-row-actions">
                {category === "trash" ? (
                  <button className="fl-row-btn restore" onClick={() => handleRestore(f.id)}>RESTORE</button>
                ) : (
                  <>
                    {category === "note" && (
                      <button className="fl-row-btn edit" onClick={() => onEditNote(f)}>EDIT</button>
                    )}
                    <button className="fl-row-btn reveal" onClick={() => handleUnhide(f.id)}>UNHIDE</button>
                    <button className="fl-row-btn del" onClick={() => handleDelete(f.id)}>DEL</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
