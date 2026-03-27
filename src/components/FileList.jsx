import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import SearchBar from "./SearchBar";
import VirtualGrid from "./VirtualGrid";
import { useThumbnails } from "../hooks/useThumbnails";

const TITLES = { image: "IMAGES", video: "VIDEOS", document: "DOCUMENTS", note: "NOTES", trash: "TRASH" };
const ICONS = { image: "◈", video: "▶", text: "✎", document: "◧" };

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
}

// Grid uses VirtualGrid + vault:// protocol for thumbnails

/* ── Category Popup ── */
function CategoryPopup({ category, tags, onTagCreated, onTagDeleted, onAssign, onClose, mode }) {
  const [creating, setCreating] = useState(tags.length === 0);
  const [deleting, setDeleting] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const handleCreate = async () => {
    const t = newName.trim();
    if (!t) return;
    try {
      await invoke("create_tag", { category, tag: t });
      setNewName("");
      setCreating(false);
      onTagCreated();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (tag) => {
    try {
      await invoke("delete_tag", { category, tag });
      onTagDeleted();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="cat-popup-overlay" onClick={onClose}>
      <div className="cat-popup" onClick={e => e.stopPropagation()}>
        <div className="cat-popup-title">
          {mode === "assign" ? "ASSIGN TO CATEGORY" : deleting ? "DELETE CATEGORIES" : "CATEGORIES"}
        </div>

        {creating && (
          <div className="cat-popup-input-row">
            <input
              ref={inputRef}
              className="cat-popup-input"
              placeholder="New category name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            />
            <button className="fl-btn fl-btn-primary" onClick={handleCreate}>ADD</button>
          </div>
        )}

        <div className="cat-popup-grid">
          {tags.map(t => (
            <div key={t} className="cat-popup-tag-wrap">
              <button
                className={`cat-popup-tag ${deleting ? "deletable" : ""}`}
                onClick={() => {
                  if (deleting) handleDelete(t);
                  else if (mode === "assign") onAssign(t);
                }}
              >
                {deleting && <span className="cat-popup-x">✕</span>}
                {t}
              </button>
            </div>
          ))}
          {!deleting && (
            <button className="cat-popup-tag create" onClick={() => setCreating(true)}>
              + CREATE
            </button>
          )}
        </div>

        <div className="cat-popup-actions">
          {mode === "assign" && (
            <button className="fl-btn fl-btn-muted" onClick={() => onAssign("")}>CLEAR TAG</button>
          )}
          {tags.length > 0 && (
            <button
              className={`fl-btn ${deleting ? "fl-btn-primary" : "fl-btn-danger"}`}
              onClick={() => setDeleting(!deleting)}
            >
              {deleting ? "DONE" : "DELETE"}
            </button>
          )}
          <button className="fl-btn fl-btn-muted" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

export default function FileList({ category, files, color, onChanged, onEditNote, onViewMedia }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } or null
  const [selected, setSelected] = useState(new Set());
  const [tags, setTags] = useState([]);
  const [activeTag, setActiveTag] = useState("");
  const [showCatPopup, setShowCatPopup] = useState(false);
  const [catMode, setCatMode] = useState("browse");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date-desc");
  const isGridView = category === "image" || category === "video";
  const showCategories = category !== "trash";

  // Thumbnail engine for grid view
  const { getThumbnail, generateForVisible } = useThumbnails();

  const refreshTags = useCallback(() => {
    invoke("list_tags", { category }).then(setTags).catch(() => setTags([]));
  }, [category]);

  useEffect(() => {
    refreshTags();
    setActiveTag("");
    setSelected(new Set());
  }, [category, files, refreshTags]);

  const filteredFiles = useMemo(() => {
    let result = activeTag === "__untagged"
      ? files.filter(f => !f.tag)
      : activeTag
      ? files.filter(f => f.tag === activeTag)
      : files;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f => f.original_name.toLowerCase().includes(q));
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "name-asc": return a.original_name.localeCompare(b.original_name);
        case "name-desc": return b.original_name.localeCompare(a.original_name);
        case "date-desc": return b.hidden_at.localeCompare(a.hidden_at);
        case "date-asc": return a.hidden_at.localeCompare(b.hidden_at);
        case "size-desc": return b.size - a.size;
        case "size-asc": return a.size - b.size;
        case "type": return a.mime_hint.localeCompare(b.mime_hint);
        default: return 0;
      }
    });

    return result;
  }, [files, activeTag, search, sort]);

  // Ctrl+A
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && isGridView) {
        e.preventDefault();
        if (selected.size === filteredFiles.length) setSelected(new Set());
        else setSelected(new Set(filteredFiles.map(f => f.id)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isGridView, filteredFiles, selected]);

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const BATCH_SIZE = 50;

  const handleAdd = async () => {
    try {
      const sel = await openDialog({ multiple: true });
      if (!sel) return;
      const paths = (Array.isArray(sel) ? sel : [sel]).map(f => f.path || f);
      if (paths.length === 0) return;

      setLoading(true);
      setProgress({ done: 0, total: paths.length });

      // Process in batches to keep UI responsive
      let done = 0;
      for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        const batch = paths.slice(i, i + BATCH_SIZE);
        const count = await invoke("hide_files_batch", { paths: batch, category });
        done += count;
        setProgress({ done, total: paths.length });
        // Yield to UI thread between batches
        await new Promise(r => setTimeout(r, 10));
      }

      setProgress(null);
      setLoading(false);
      onChanged();
    } catch (e) {
      console.error(e);
      setProgress(null);
      setLoading(false);
    }
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

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    try {
      await invoke("delete_files", { fileIds: [...selected] });
      setSelected(new Set());
      onChanged();
    } catch (e) { console.error(e); }
  };

  // Open category popup in browse mode (just view/create tags)
  const openCatBrowse = () => {
    setCatMode("browse");
    setShowCatPopup(true);
  };

  // Open category popup in assign mode (pick a tag for selected files)
  const openCatAssign = () => {
    setCatMode("assign");
    setShowCatPopup(true);
  };

  const handleAssignTag = async (tag) => {
    setShowCatPopup(false);
    try {
      await invoke("set_files_tag", { fileIds: [...selected], tag });
      setSelected(new Set());
      onChanged();
    } catch (e) { console.error(e); }
  };

  const handleTagCreated = () => {
    refreshTags();
  };

  return (
    <div className="filelist" style={{ "--list-color": color }}>
      {/* Toolbar */}
      <div className="fl-toolbar">
        <div className="fl-title">{TITLES[category]}</div>
        {showCategories && (
          <button className="fl-btn fl-btn-muted" onClick={openCatBrowse}>CATEGORY</button>
        )}
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

      {/* Progress bar */}
      {progress && (
        <div className="upload-progress">
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <span className="upload-progress-text">
            {progress.done} / {progress.total} ({Math.round((progress.done / progress.total) * 100)}%)
          </span>
        </div>
      )}

      {/* Search & Sort */}
      <SearchBar search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

      {/* Tag filter bar */}
      {tags.length > 0 && (
        <div className="tag-bar">
          <button className={`tag-chip ${activeTag === "" ? "active" : ""}`} onClick={() => setActiveTag("")}>
            ALL ({files.length})
          </button>
          {tags.map(t => (
            <button key={t} className={`tag-chip ${activeTag === t ? "active" : ""}`} onClick={() => setActiveTag(t)}>
              {t} ({files.filter(f => f.tag === t).length})
            </button>
          ))}
          {files.some(f => !f.tag) && (
            <button className={`tag-chip ${activeTag === "__untagged" ? "active" : ""}`} onClick={() => setActiveTag("__untagged")}>
              UNSORTED ({files.filter(f => !f.tag).length})
            </button>
          )}
        </div>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="select-bar">
          <span className="select-count">{selected.size} SELECTED</span>
          <button className="fl-btn fl-btn-primary" onClick={openCatAssign}>TAG</button>
          <button className="fl-btn fl-btn-danger" onClick={handleBatchDelete}>DELETE</button>
          <button className="fl-btn fl-btn-muted" onClick={() => setSelected(new Set())}>CANCEL</button>
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
            {activeTag ? "Try selecting a different category or ALL"
              : category === "note" ? "Create a note to get started"
              : category !== "trash" ? "Click + HIDE FILES to add files"
              : "Deleted files appear here"}
          </div>
        </div>
      ) : isGridView ? (
        <VirtualGrid
          files={filteredFiles}
          selected={selected}
          onToggleSelect={toggleSelect}
          onViewMedia={onViewMedia}
          onUnhide={handleUnhide}
          onDelete={handleDelete}
          getThumbnail={getThumbnail}
          generateForVisible={generateForVisible}
        />
      ) : (
        <div className="fl-rows">
          {filteredFiles.map((f) => (
            <div key={f.id} className="fl-row">
              <div className="fl-row-icon">{ICONS[f.mime_hint] || "◧"}</div>
              <div className="fl-row-info">
                <div className="fl-row-name">{f.original_name}</div>
                <div className="fl-row-meta">
                  {formatSize(f.size)} · {f.hidden_at}
                  {f.tag && <span className="grid-tile-tag">{f.tag}</span>}
                </div>
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

      {/* Category popup */}
      {showCatPopup && (
        <CategoryPopup
          category={category}
          tags={tags}
          onTagCreated={handleTagCreated}
          onTagDeleted={() => { refreshTags(); onChanged(); }}
          onAssign={handleAssignTag}
          onClose={() => setShowCatPopup(false)}
          mode={catMode}
        />
      )}
    </div>
  );
}
