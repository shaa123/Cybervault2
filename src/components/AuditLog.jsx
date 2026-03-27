import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function AuditLog({ open, onClose }) {
  const [log, setLog] = useState([]);

  useEffect(() => {
    if (open) {
      invoke("get_audit_log").then(setLog).catch(() => setLog([]));
    }
  }, [open]);

  const handleClear = async () => {
    await invoke("clear_audit_log");
    setLog([]);
  };

  if (!open) return null;

  return (
    <div className="audit-overlay" onClick={onClose}>
      <div className="audit-panel" onClick={e => e.stopPropagation()}>
        <div className="audit-header">
          <span className="audit-title">AUDIT LOG</span>
          <div className="audit-actions">
            <button className="fl-btn fl-btn-danger" onClick={handleClear}>CLEAR</button>
            <button className="audit-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="audit-list">
          {log.length === 0 ? (
            <div className="audit-empty">No actions recorded yet.</div>
          ) : (
            [...log].reverse().map((entry, i) => (
              <div key={i} className="audit-row">
                <span className="audit-time">{entry.timestamp}</span>
                <span className="audit-action">{entry.action}</span>
                <span className="audit-detail">{entry.detail}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
