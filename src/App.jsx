import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import NavTabs from "./components/NavTabs";
import Dashboard from "./components/Dashboard";
import FileList from "./components/FileList";
import NoteEditor from "./components/NoteEditor";
import MediaViewer from "./components/MediaViewer";
import "./styles/app.css";

const TABS = [
  { id: "home", label: "HOME", icon: "◇" },
  { id: "image", label: "IMAGES", icon: "◈", color: "#00e5ff" },
  { id: "video", label: "VIDEOS", icon: "▶", color: "#e040fb" },
  { id: "document", label: "DOCS", icon: "◧", color: "#ffd740" },
  { id: "note", label: "NOTES", icon: "✎", color: "#69f0ae" },
  { id: "trash", label: "TRASH", icon: "⌫", color: "#ff5252" },
];

export default function App() {
  const [tab, setTab] = useState("home");
  const [stats, setStats] = useState({ total_files: 0, images: 0, videos: 0, documents: 0, notes: 0, trash: 0 });
  const [files, setFiles] = useState([]);
  const [editingNote, setEditingNote] = useState(null);
  const [view, setView] = useState("list"); // list | editor
  const [viewingMedia, setViewingMedia] = useState(null);

  const refreshStats = useCallback(async () => {
    try { setStats(await invoke("get_stats")); } catch (e) { console.error(e); }
  }, []);

  const loadFiles = useCallback(async (category) => {
    try { setFiles(await invoke("list_files", { category })); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  useEffect(() => {
    if (tab !== "home") {
      loadFiles(tab);
      setView("list");
      setEditingNote(null);
      setViewingMedia(null);
    }
  }, [tab, loadFiles]);

  const handleChanged = () => {
    if (tab !== "home") loadFiles(tab);
    refreshStats();
  };

  const openEditor = (note = null) => { setEditingNote(note); setView("editor"); };

  const closeEditor = () => {
    setView("list");
    setEditingNote(null);
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

  return (
    <div className="app">
      <TitleBar />
      <NavTabs tabs={TABS} active={tab} onSelect={setTab} stats={stats} />
      <div className="content">
        {tab === "home" ? (
          <Dashboard stats={stats} onOpenCategory={setTab} />
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
    </div>
  );
}
