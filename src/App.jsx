import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import NavTabs from "./components/NavTabs";
import Dashboard from "./components/Dashboard";
import FileList from "./components/FileList";
import NoteEditor from "./components/NoteEditor";
import MediaViewer from "./components/MediaViewer";
import Settings from "./components/Settings";
import LockScreen from "./components/LockScreen";
import DiagBot from "./components/DiagBot";
import AuditLog from "./components/AuditLog";
import "./styles/app.css";

const TABS = [
  { id: "home", label: "HOME", icon: "◇" },
  { id: "image", label: "IMAGES", icon: "◈", color: "#00e5ff" },
  { id: "video", label: "VIDEOS", icon: "▶", color: "#e040fb" },
  { id: "document", label: "DOCS", icon: "◧", color: "#ffd740" },
  { id: "note", label: "NOTES", icon: "✎", color: "#69f0ae" },
  { id: "trash", label: "TRASH", icon: "⌫", color: "#ff5252" },
  { id: "settings", label: "SETTINGS", icon: "⚙", color: "#7c4dff" },
];

export default function App() {
  const [locked, setLocked] = useState(false);
  const [checkingPin, setCheckingPin] = useState(true);
  const [tab, setTab] = useState("home");
  const [stats, setStats] = useState({ total_files: 0, images: 0, videos: 0, documents: 0, notes: 0, trash: 0 });
  const [files, setFiles] = useState([]);
  const [editingNote, setEditingNote] = useState(null);
  const [view, setView] = useState("list");
  const [viewingMedia, setViewingMedia] = useState(null);
  const [diagBotOpen, setDiagBotOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Check if PIN is set on startup
  useEffect(() => {
    invoke("has_pin").then(has => {
      setLocked(has);
      setCheckingPin(false);
    }).catch(() => setCheckingPin(false));
  }, []);

  // Auto-lock: lock after inactivity
  const autoLockSecs = useRef(0);

  // Load auto-lock setting once on unlock
  useEffect(() => {
    if (!locked) {
      invoke("get_settings")
        .then(s => { autoLockSecs.current = s.auto_lock_secs || 0; })
        .catch(() => {});
    }
  }, [locked]);

  useEffect(() => {
    if (locked) return;

    let lastActivity = Date.now();

    const onActivity = () => { lastActivity = Date.now(); };

    const checkIdle = setInterval(async () => {
      const secs = autoLockSecs.current;
      if (secs <= 0) return;
      const idle = (Date.now() - lastActivity) / 1000;
      if (idle >= secs) {
        try {
          const has = await invoke("has_pin");
          if (has) setLocked(true);
        } catch (e) { /* ignore */ }
      }
    }, 5000); // Check every 5 seconds

    const events = ["mousemove", "keydown", "click", "scroll", "mousedown"];
    events.forEach(ev => window.addEventListener(ev, onActivity));
    return () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity));
      clearInterval(checkIdle);
    };
  }, [locked]);

  const handleUnlock = async (pin) => {
    try {
      const ok = await invoke("verify_pin", { pin });
      if (ok) { setLocked(false); return true; }
      return false;
    } catch (e) { return false; }
  };

  const refreshStats = useCallback(async () => {
    try { setStats(await invoke("get_stats")); } catch (e) { console.error(e); }
  }, []);

  const loadFiles = useCallback(async (category) => {
    try { setFiles(await invoke("list_files", { category })); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  useEffect(() => {
    if (tab !== "home" && tab !== "settings") {
      loadFiles(tab);
      setView("list");
      setEditingNote(null);
      setViewingMedia(null);
    }
  }, [tab, loadFiles]);

  const handleChanged = () => {
    if (tab !== "home" && tab !== "settings") loadFiles(tab);
    refreshStats();
  };

  const openEditor = (note = null) => { setEditingNote(note); setView("editor"); };
  const closeEditor = () => {
    setView("list"); setEditingNote(null);
    if (tab === "note") loadFiles("note");
    refreshStats();
  };

  const openMedia = (file) => setViewingMedia(file);
  const closeMedia = () => setViewingMedia(null);

  const navigateMedia = useCallback((dir) => {
    if (!viewingMedia) return;
    const mediaFiles = files.filter(f => f.mime_hint === "image" || f.mime_hint === "video");
    const idx = mediaFiles.findIndex(f => f.id === viewingMedia.id);
    if (idx === -1) return;
    const next = (idx + dir + mediaFiles.length) % mediaFiles.length;
    setViewingMedia(mediaFiles[next]);
  }, [viewingMedia, files]);

  const mediaFiles = files.filter(f => f.mime_hint === "image" || f.mime_hint === "video");

  if (checkingPin) return <div className="app" />;
  if (locked) return <LockScreen onUnlock={handleUnlock} />;

  return (
    <div className="app">
      <TitleBar />
      <NavTabs tabs={TABS} active={tab} onSelect={setTab} stats={stats} />
      <div className="content">
        {tab === "home" ? (
          <Dashboard stats={stats} onOpenCategory={setTab} />
        ) : tab === "settings" ? (
          <Settings stats={stats} onPurge={handleChanged} onOpenAudit={() => setAuditOpen(true)} />
        ) : view === "editor" ? (
          <NoteEditor note={editingNote} onSave={handleChanged} onBack={closeEditor} />
        ) : (
          <FileList
            category={tab}
            files={files}
            color={TABS.find(t => t.id === tab)?.color}
            onChanged={handleChanged}
            onEditNote={openEditor}
            onViewMedia={openMedia}
          />
        )}
      </div>

      {viewingMedia && (
        <MediaViewer
          file={viewingMedia}
          files={mediaFiles}
          onClose={closeMedia}
          onNavigate={navigateMedia}
        />
      )}

      {/* DiagBot FAB + Panel */}
      {!diagBotOpen && (
        <button className="diagbot-fab" onClick={() => setDiagBotOpen(true)}>◆</button>
      )}
      <DiagBot open={diagBotOpen} onClose={() => setDiagBotOpen(false)} />

      {/* Audit Log */}
      <AuditLog open={auditOpen} onClose={() => setAuditOpen(false)} />
    </div>
  );
}
