import React, { useState, useEffect, useCallback, useRef } from "react";
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
        .then((b64) => { if (!cancelled) setSrc(`data:${getMime(file.original_name)};base64,${b64}`); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [file.id, file.mime_hint, file.original_name]);
  if (src) return <img src={src} alt="" />;
  return <span className="grid-tile-icon">{ICONS[file.mime_hint] || "◧"}</span>;
}

export default function FileList({ category, files, color, onChanged, onEditNote, onViewMedia }) {
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [tags, setTags] = useState([]);
  const [activeTag, setActiveTag] = useState(""); // "" = all
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const tagInputRef = useRef(null);
  const isGridView = category === "image" || category === "video";

  // Load tags for this category
  useEffect(() => {
    if (category === "image" || category === "video") {
      invoke("list_tags", { category }).then(setTags).catch(() => setTags([]));
    } else {
      setTags([]);
    }
    setActiveTag("");
    setSelected(new Set());
  }, [category, files]);

  // Filter files by tag
  const filteredFiles = activeTag
    ? files.filter(f => f.tag === activeTag)
    : files;

  // Ctrl+A handler
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && isGridView) {
        e.preventDefault();
        if (selected.size === filteredFiles.length) {
          setSelected(new Set());
        } else {
          setSelected(new Set(filteredFiles.map(f => f.id)));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isGridView, filteredFiles, selected]);

  // Focus tag input when shown
  useEffect(() => {
    if (showTagInput && tagInputRef.current) tagInputRef.current.focus();
  }, [showTagInput]);

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    try {
      const sel = await openDialog({ multiple: true });
      if (sel) {
        const paths = (Array.isArray(sel) ? sel : [sel]).map(f => f.path || f);
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

  // Batch actions for selected
  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    try {
      await invoke("delete_files", { fileIds: [...selected] });
      setSelected(new Set());
      onChanged();
    } catch (e) { console.error(e); }
  };

  const handleBatchTag = async (tag) => {
    if (selected.size === 0) return;
    try {
      await invoke("set_files_tag", { fileIds: [...selected], tag });
      setSelected(new Set());
      setShowTagInput(false);
      setNewTag("");
      onChanged();
    } catch (e) { console.error(e); }
  };

  const handleCreateTag = () => {
    const t = newTag.trim();
    if (t) handleBatchTag(t);
  };

  const handleSingleTag = async (e, fileId, tag) => {
    e.stopPropagation();
    try {
      await invoke("set_file_tag", { fileId, tag });
      onChanged();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="filelist" style={{ "--list-color": color }}>
      {/* Toolbar */}
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

      {/* Tag filter bar for image/video */}
      {isGridView && (tags.length > 0 || files.length > 0) && (
        <div className="tag-bar">
          <button
            className={`tag-chip ${activeTag === "" ? "active" : ""}`}
            onClick={() => setActiveTag("")}
          >ALL ({files.length})</button>
          {tags.map(t => (
            <button
              key={t}
              className={`tag-chip ${activeTag === t ? "active" : ""}`}
              onClick={() => setActiveTag(t)}
            >{t} ({files.filter(f => f.tag === t).length})</button>
          ))}
          {files.some(f => !f.tag) && tags.length > 0 && (
            <button
              className={`tag-chip ${activeTag === "__untagged" ? "active" : ""}`}
              onClick={() => setActiveTag("__untagged")}
            >UNSORTED ({files.filter(f => !f.tag).length})</button>
          )}
        </div>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="select-bar">
          <span className="select-count">{selected.size} SELECTED</span>
          <button className="fl-btn fl-btn-primary" onClick={() => setShowTagInput(!showTagInput)}>
            TAG
          </button>
          <button className="fl-btn fl-btn-danger" onClick={handleBatchDelete}>DELETE</button>
          <button className="fl-btn fl-btn-muted" onClick={() => setSelected(new Set())}>CANCEL</button>
          {showTagInput && (
            <div className="select-tag-input">
              <input
                ref={tagInputRef}
                className="tag-input"
                placeholder="New category name..."
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreateTag(); if (e.key === "Escape") setShowTagInput(false); }}
              />
              <button className="fl-btn fl-btn-primary" onClick={handleCreateTag}>APPLY</button>
              {tags.map(t => (
                <button key={t} className="tag-chip small" onClick={() => handleBatchTag(t)}>{t}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="fl-count">
        {filteredFiles.length} FILE{filteredFiles.length !== 1 ? "S" : ""}
        {isGridView && <span className="fl-hint"> · CTRL+A SELECT ALL</span>}
      </div>

      {filteredFiles.length === 0 ? (
        <div className="fl-empty">
          <div className="fl-empty-icon">◇</div>
          <div className="fl-empty-text">
            {activeTag ? "NO FILES IN THIS CATEGORY" : category === "trash" ? "TRASH EMPTY" : "NO FILES YET"}
          </div>
          <div className="fl-empty-sub">
            {activeTag ? "Try selecting a different category or 'ALL'"
              : category === "note" ? "Create a note to get started"
              : category !== "trash" ? "Click + HIDE FILES to add files"
              : "Deleted files appear here"}
          </div>
        </div>
      ) : isGridView ? (
        <div className="grid-wrap">
          <div className="grid-tiles">
            {(activeTag === "__untagged" ? files.filter(f => !f.tag) : filteredFiles).map((f) => (
              <button
                key={f.id}
                className={`grid-tile ${selected.has(f.id) ? "selected" : ""}`}
                onClick={() => {
                  if (selected.size > 0) {
                    toggleSelect({ stopPropagation: () => {} }, f.id);
                  } else {
                    onViewMedia(f);
                  }
                }}
              >
                <div className="grid-tile-select" onClick={(e) => toggleSelect(e, f.id)}>
                  <div className={`grid-tile-checkbox ${selected.has(f.id) ? "checked" : ""}`}>
                    {selected.has(f.id) && "✓"}
                  </div>
                </div>
                <div className="grid-tile-thumb">
                  <Thumbnail file={f} />
                  {f.mime_hint === "video" && (
                    <div className="grid-tile-play">▶</div>
                  )}
                </div>
                <div className="grid-tile-info">
                  <div className="grid-tile-name">{f.original_name}</div>
                  <div className="grid-tile-meta">
                    {formatSize(f.size)}
                    {f.tag && <span className="grid-tile-tag">{f.tag}</span>}
                  </div>
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
        <div className="fl-rows">
          {filteredFiles.map((f) => (
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
