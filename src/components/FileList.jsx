import React, { useState, useEffect } from "react";
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

function getMime(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".svg")) return "image/svg+xml";
  if (n.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

function Thumbnail({ file }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (file.mime_hint === "image") {
      invoke("get_file_preview", { fileId: file.id })
        .then((b64) => {
          if (!cancelled) setSrc(`data:${getMime(file.original_name)};base64,${b64}`);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [file.id, file.mime_hint, file.original_name]);

  if (src) return <img src={src} alt="" />;
  return <span className="grid-tile-icon">{ICONS[file.mime_hint] || "◧"}</span>;
}

export default function FileList({ category, files, color, onChanged, onEditNote, onViewMedia }) {
  const [loading, setLoading] = useState(false);
  const isGridView = category === "image" || category === "video";

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

  const handleUnhide = async (e, id) => {
    e.stopPropagation();
    try {
      const dest = await openDialog({ directory: true });
      if (dest) {
        await invoke("unhide_file", { fileId: id, destination: dest.path || dest });
        onChanged();
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try { await invoke("delete_file", { fileId: id }); onChanged(); }
    catch (err) { console.error(err); }
  };

  const handleRestore = async (id) => {
    try { await invoke("restore_file", { fileId: id }); onChanged(); }
    catch (e) { console.error(e); }
  };

  const handlePurge = async () => {
    try { await invoke("purge_trash"); onChanged(); }
    catch (e) { console.error(e); }
  };

  const isMedia = (f) => f.mime_hint === "image" || f.mime_hint === "video";

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
      ) : isGridView ? (
        /* ── 5x5 GRID for images & videos ── */
        <div className="grid-wrap">
          <div className="grid-tiles">
            {files.map((f) => (
              <button
                key={f.id}
                className="grid-tile"
                onClick={() => onViewMedia(f)}
              >
                <div className="grid-tile-thumb">
                  <Thumbnail file={f} />
                  {f.mime_hint === "video" && (
                    <div className="grid-tile-play">▶</div>
                  )}
                </div>
                <div className="grid-tile-info">
                  <div className="grid-tile-name">{f.original_name}</div>
                  <div className="grid-tile-meta">{formatSize(f.size)}</div>
                </div>
                <div className="grid-tile-actions">
                  <span className="fl-row-btn reveal" onClick={(e) => handleUnhide(e, f.id)}>UNHIDE</span>
                  <span className="fl-row-btn del" onClick={(e) => handleDelete(e, f.id)}>DEL</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── LIST for docs, notes, trash ── */
        <div className="fl-rows">
          {files.map((f) => (
            <div key={f.id} className="fl-row">
              <div className="fl-row-icon">{ICONS[f.mime_hint] || "◧"}</div>
              <div className="fl-row-info">
                <div className="fl-row-name">{f.original_name}</div>
                <div className="fl-row-meta">{formatSize(f.size)} · {f.hidden_at}</div>
              </div>
              <div className="fl-row-actions" onClick={e => e.stopPropagation()}>
                {category === "trash" ? (
                  <button className="fl-row-btn restore" onClick={() => handleRestore(f.id)}>RESTORE</button>
                ) : (
                  <>
                    {category === "note" && (
                      <button className="fl-row-btn edit" onClick={() => onEditNote(f)}>EDIT</button>
                    )}
                    <button className="fl-row-btn reveal" onClick={(e) => handleUnhide(e, f.id)}>UNHIDE</button>
                    <button className="fl-row-btn del" onClick={(e) => handleDelete(e, f.id)}>DEL</button>
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
