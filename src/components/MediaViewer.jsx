import React, { useState, useEffect, useCallback, useRef } from "react";
import { vaultFileUrl } from "../hooks/useThumbnails";

export default function MediaViewer({ file, files, onClose, onNavigate, onDelete }) {
  const [slideshow, setSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(3);
  const [imgLoaded, setImgLoaded] = useState(false);
  const timerRef = useRef(null);

  const isImage = file?.mime_hint === "image";
  const isVideo = file?.mime_hint === "video";
  const src = file ? vaultFileUrl(file.id) : null;

  // Reset loading state when file changes
  useEffect(() => {
    setImgLoaded(false);
  }, [file?.id]);

  // Keyboard
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setSlideshow(false); onClose(); }
      else if (e.key === "ArrowLeft") onNavigate(-1);
      else if (e.key === "ArrowRight") onNavigate(1);
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === " ") { e.preventDefault(); setSlideshow(p => !p); }
      else if (e.key === "Delete" && onDelete) { e.preventDefault(); onDelete(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onNavigate, onDelete]);

  // Slideshow timer
  useEffect(() => {
    if (slideshow) {
      timerRef.current = setInterval(() => onNavigate(1), slideshowInterval * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slideshow, slideshowInterval, onNavigate]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
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

      <div className="media-overlay-content" onClick={e => e.stopPropagation()}>
        {src && isImage ? (
          <>
            {!imgLoaded && (
              <div style={{ color: "var(--text3)", fontSize: 16, letterSpacing: 2 }}>LOADING...</div>
            )}
            <img
              key={file.id}
              src={src}
              alt={file.original_name}
              onLoad={() => setImgLoaded(true)}
              style={{ display: imgLoaded ? "block" : "none" }}
            />
          </>
        ) : src && isVideo ? (
          <video key={file.id} src={src} controls autoPlay />
        ) : (
          <div style={{ color: "var(--text3)", fontSize: 16 }}>PREVIEW UNAVAILABLE</div>
        )}
      </div>

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
