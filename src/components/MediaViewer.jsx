import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function MediaViewer({ file, files, onClose, onNavigate }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slideshow, setSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(3);
  const timerRef = useRef(null);

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

  // Keyboard
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setSlideshow(false); onClose(); }
      else if (e.key === "ArrowLeft") onNavigate(-1);
      else if (e.key === "ArrowRight") onNavigate(1);
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === " ") { e.preventDefault(); setSlideshow(p => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onNavigate]);

  // Slideshow timer
  useEffect(() => {
    if (slideshow) {
      timerRef.current = setInterval(() => {
        onNavigate(1);
      }, slideshowInterval * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slideshow, slideshowInterval, onNavigate]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  if (!file) return null;
  const currentIdx = files.findIndex(f => f.id === file.id);
  const total = files.length;

  return (
    <div className="media-overlay" onClick={onClose}>
      <div className="media-overlay-top" onClick={e => e.stopPropagation()}>
        <span className="media-overlay-name">{file.original_name}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="media-overlay-close" onClick={toggleFullscreen} style={{ background: "var(--surface)" }}>⛶</button>
          <button className="media-overlay-close" onClick={() => { setSlideshow(false); onClose(); }}>✕</button>
        </div>
      </div>

      {total > 1 && (
        <>
          <button className="media-overlay-nav prev"
            onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}>◀</button>
          <button className="media-overlay-nav next"
            onClick={(e) => { e.stopPropagation(); onNavigate(1); }}>▶</button>
        </>
      )}

      <div onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ color: "var(--text3)", fontSize: 16, letterSpacing: 2 }}>LOADING...</div>
        ) : src && isImage ? (
          <img src={src} alt={file.original_name} />
        ) : src && isVideo ? (
          <video src={src} controls autoPlay />
        ) : (
          <div style={{ color: "var(--text3)", fontSize: 16 }}>PREVIEW UNAVAILABLE</div>
        )}
      </div>

      {/* Slideshow controls */}
      {total > 1 && (
        <div className="slideshow-bar" onClick={e => e.stopPropagation()}>
          <button onClick={() => setSlideshow(p => !p)} className={slideshow ? "active" : ""}>
            {slideshow ? "⏸" : "▶"}
          </button>
          <span className="slideshow-timer">{slideshowInterval}s</span>
          <button onClick={() => setSlideshowInterval(p => Math.max(1, p - 1))}>−</button>
          <button onClick={() => setSlideshowInterval(p => Math.min(30, p + 1))}>+</button>
          <span className="slideshow-timer">{currentIdx + 1}/{total}</span>
        </div>
      )}
    </div>
  );
}
