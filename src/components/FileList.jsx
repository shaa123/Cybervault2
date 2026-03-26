import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const CATEGORY_TITLES = {
  image: "IMAGE_ARCHIVE",
  video: "VIDEO_ARCHIVE",
  document: "DOCUMENT_ARCHIVE",
  note: "NOTE_ARCHIVE",
  trash: "TRASH_BIN",
};

const CATEGORY_COLORS = {
  image: "#00f0ff",
  video: "#ff00e5",
  document: "#ffe600",
  note: "#00ff8c",
  trash: "#ff3344",
};

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

export default function FileList({ category, files, onFilesChanged, onBack, onEditNote }) {
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAddFiles = async () => {
    try {
      const selected = await openDialog({
        multiple: true,
        directory: false,
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected.map(f => f.path || f) : [selected.path || selected];
        if (paths.length > 0) {
          setLoading(true);
          await invoke("hide_files", { paths, category });
          onFilesChanged();
          setLoading(false);
        }
      }
    } catch (e) {
      console.error("Failed to add files:", e);
      setLoading(false);
    }
  };

  const handleUnhide = async (fileId) => {
    try {
      const selected = await openDialog({
        directory: true,
      });
      if (selected) {
        const dest = selected.path || selected;
        await invoke("unhide_file", { fileId, destination: dest });
        onFilesChanged();
      }
    } catch (e) {
      console.error("Failed to unhide:", e);
    }
  };

  const handleDelete = async (fileId) => {
    try {
      await invoke("delete_file", { fileId });
      onFilesChanged();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const handleRestore = async (fileId) => {
    try {
      await invoke("restore_file", { fileId });
      onFilesChanged();
    } catch (e) {
      console.error("Failed to restore:", e);
    }
  };

  const handlePurge = async () => {
    try {
      await invoke("purge_trash");
      onFilesChanged();
    } catch (e) {
      console.error("Failed to purge:", e);
    }
  };

  const accent = CATEGORY_COLORS[category] || "#00f0ff";

  return (
    <div className="cv-filelist" style={{ "--list-accent": accent }}>
      <div className="cv-fl-header">
        <button className="cv-fl-back" onClick={onBack}>
          &#x25C0; BACK
        </button>
        <h2 className="cv-fl-title">{CATEGORY_TITLES[category] || "FILES"}</h2>
        <div className="cv-fl-actions">
          {category === "note" && (
            <button className="cv-fl-btn cv-btn-add" onClick={() => onEditNote(null)}>
              + NEW NOTE
            </button>
          )}
          {category !== "trash" && category !== "note" && (
            <button className="cv-fl-btn cv-btn-add" onClick={handleAddFiles} disabled={loading}>
              {loading ? "HIDING..." : "+ HIDE FILES"}
            </button>
          )}
          {category === "trash" && files.length > 0 && (
            <button className="cv-fl-btn cv-btn-purge" onClick={handlePurge}>
              ⌫ PURGE ALL
            </button>
          )}
        </div>
      </div>

      <div className="cv-fl-count">{files.length} FILE{files.length !== 1 ? "S" : ""} HIDDEN</div>

      {files.length === 0 ? (
        <div className="cv-fl-empty">
          <div className="cv-fl-empty-icon">◇</div>
          <div className="cv-fl-empty-text">
            {category === "trash" ? "TRASH IS EMPTY" : "NO FILES HIDDEN YET"}
          </div>
          <div className="cv-fl-empty-sub">
            {category === "note"
              ? "Create a new note to get started"
              : category !== "trash"
              ? "Click HIDE FILES to add files to this vault"
              : "Deleted files will appear here"}
          </div>
        </div>
      ) : (
        <div className="cv-fl-list">
          {files.map((file) => (
            <div key={file.id} className="cv-fl-item">
              <div className="cv-fl-item-icon">
                {file.mime_hint === "image" ? "◈" :
                 file.mime_hint === "video" ? "▶" :
                 file.mime_hint === "text" ? "✎" : "◧"}
              </div>
              <div className="cv-fl-item-info">
                <div className="cv-fl-item-name">{file.original_name}</div>
                <div className="cv-fl-item-meta">
                  {formatSize(file.size)} • {file.hidden_at}
                </div>
              </div>
              <div className="cv-fl-item-actions">
                {category === "trash" ? (
                  <button className="cv-fl-ibtn cv-ibtn-restore" onClick={() => handleRestore(file.id)}>
                    RESTORE
                  </button>
                ) : (
                  <>
                    {category === "note" && (
                      <button className="cv-fl-ibtn cv-ibtn-edit" onClick={() => onEditNote(file)}>
                        EDIT
                      </button>
                    )}
                    <button className="cv-fl-ibtn cv-ibtn-unhide" onClick={() => handleUnhide(file.id)}>
                      UNHIDE
                    </button>
                    <button className="cv-fl-ibtn cv-ibtn-del" onClick={() => handleDelete(file.id)}>
                      DEL
                    </button>
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
