import React, { useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const ICONS = { image: "◈", video: "▶", text: "✎", document: "◧" };
const COLS = 5;

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
}

export default function VirtualGrid({
  files, selected, onToggleSelect, onViewMedia, onUnhide, onDelete,
  getThumbnail, generateForVisible,
}) {
  const parentRef = useRef(null);
  const rowCount = Math.ceil(files.length / COLS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 3,
  });

  // Generate thumbnails for visible rows
  const visibleItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const visibleFiles = [];
    for (const vRow of visibleItems) {
      const start = vRow.index * COLS;
      for (let c = 0; c < COLS; c++) {
        const idx = start + c;
        if (idx < files.length) visibleFiles.push(files[idx]);
      }
    }
    if (visibleFiles.length > 0) {
      generateForVisible(visibleFiles);
    }
  }, [visibleItems, files, generateForVisible]);

  // Throttle scroll for thumbnail generation
  const scrollRAF = useRef(null);
  const handleScroll = useCallback(() => {
    if (scrollRAF.current) return;
    scrollRAF.current = requestAnimationFrame(() => {
      scrollRAF.current = null;
      const visFiles = [];
      for (const vRow of virtualizer.getVirtualItems()) {
        const start = vRow.index * COLS;
        for (let c = 0; c < COLS; c++) {
          const idx = start + c;
          if (idx < files.length) visFiles.push(files[idx]);
        }
      }
      if (visFiles.length > 0) generateForVisible(visFiles);
    });
  }, [files, virtualizer, generateForVisible]);

  return (
    <div
      ref={parentRef}
      className="vgrid-scroll"
      onScroll={handleScroll}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {visibleItems.map((vRow) => {
          const start = vRow.index * COLS;
          return (
            <div
              key={vRow.key}
              className="vgrid-row"
              style={{
                position: "absolute",
                top: vRow.start,
                left: 0,
                right: 0,
                height: vRow.size,
              }}
            >
              {Array.from({ length: COLS }, (_, c) => {
                const idx = start + c;
                if (idx >= files.length) return <div key={c} className="vgrid-cell-empty" />;
                const f = files[idx];
                const thumb = getThumbnail(f.id);
                const isSel = selected.has(f.id);

                return (
                  <button
                    key={f.id}
                    className={`grid-tile ${isSel ? "selected" : ""}`}
                    onClick={() => {
                      if (selected.size > 0) onToggleSelect({ stopPropagation: () => {} }, f.id);
                      else onViewMedia(f);
                    }}
                  >
                    <div className="grid-tile-select" onClick={(e) => onToggleSelect(e, f.id)}>
                      <div className={`grid-tile-checkbox ${isSel ? "checked" : ""}`}>
                        {isSel && "✓"}
                      </div>
                    </div>
                    <div className="grid-tile-thumb">
                      {thumb ? (
                        <img src={thumb} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="grid-tile-icon">
                          {ICONS[f.mime_hint] || "◧"}
                        </span>
                      )}
                      {f.mime_hint === "video" && !thumb && (
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
                      <span className="fl-row-btn reveal" onClick={(e) => onUnhide(e, f.id)}>UNHIDE</span>
                      <span className="fl-row-btn del" onClick={(e) => onDelete(e, f.id)}>DEL</span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
