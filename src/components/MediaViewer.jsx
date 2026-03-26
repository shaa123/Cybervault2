import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function MediaViewer({ file, files, onClose, onNavigate }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  const isImage = file?.mime_hint === "image";
  const isVideo = file?.mime_hint === "video";

  const loadPreview = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setSrc(null);
    try {
      const b64 = await invoke("get_file_preview", { fileId: file.id });
      const name = file.original_name.toLowerCase();
      let mime = "application/octet-stream";
      if (isImage) {
        if (name.endsWith(".png")) mime = "image/png";
        else if (name.endsWith(".gif")) mime = "image/gif";
        else if (name.endsWith(".webp")) mime = "image/webp";
        else if (name.endsWith(".svg")) mime = "image/svg+xml";
        else if (name.endsWith(".bmp")) mime = "image/bmp";
        else mime = "image/jpeg";
      } else if (isVideo) {
        if (name.endsWith(".webm")) mime = "video/webm";
        else if (name.endsWith(".mkv")) mime = "video/x-matroska";
        else if (name.endsWith(".avi")) mime = "video/x-msvideo";
        else if (name.endsWith(".mov")) mime = "video/quicktime";
        else mime = "video/mp4";
      }
      setSrc(`data:${mime};base64,${b64}`);
    } catch (e) {
      console.error("Failed to load preview:", e);
    }
    setLoading(false);
  }, [file, isImage, isVideo]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onNavigate(-1);
      else if (e.key === "ArrowRight") onNavigate(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onNavigate]);

  if (!file) return null;

  const currentIdx = files.findIndex(f => f.id === file.id);
  const total = files.length;

  return (
    <div className="media-overlay" onClick={onClose}>
      <div className="media-overlay-top" onClick={e => e.stopPropagation()}>
        <span className="media-overlay-name">{file.original_name}</span>
        <button className="media-overlay-close" onClick={onClose}>✕</button>
      </div>

      {total > 1 && (
        <>
          <button
            className="media-overlay-nav prev"
            onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
          >◀</button>
          <button
            className="media-overlay-nav next"
            onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
          >▶</button>
        </>
      )}

      <div onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ color: "var(--text3)", fontSize: "1rem", letterSpacing: "2px" }}>
            LOADING...
          </div>
        ) : src && isImage ? (
          <img src={src} alt={file.original_name} />
        ) : src && isVideo ? (
          <video src={src} controls autoPlay />
        ) : (
          <div style={{ color: "var(--text3)", fontSize: "1rem" }}>
            PREVIEW UNAVAILABLE
          </div>
        )}
      </div>

      {total > 1 && (
        <div className="media-overlay-counter">
          {currentIdx + 1} / {total}
        </div>
      )}
    </div>
  );
}
