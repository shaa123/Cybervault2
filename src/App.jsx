import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import VaultGrid from "./components/VaultGrid";
import FileList from "./components/FileList";
import NoteEditor from "./components/NoteEditor";
import "./styles/app.css";

const CATEGORIES = [
  { id: "image", label: "IMAGES", icon: "IMG" },
  { id: "video", label: "VIDEOS", icon: "VID" },
  { id: "document", label: "DOCS", icon: "DOC" },
  { id: "note", label: "NOTES", icon: "TXT" },
  { id: "trash", label: "TRASH", icon: "DEL" },
];

export default function App() {
  const [view, setView] = useState("grid"); // grid | category | note-editor
  const [activeCategory, setActiveCategory] = useState(null);
  const [stats, setStats] = useState({ total_files: 0, images: 0, videos: 0, documents: 0, notes: 0, trash: 0 });
  const [files, setFiles] = useState([]);
  const [editingNote, setEditingNote] = useState(null);

  const refreshStats = useCallback(async () => {
    try {
      const s = await invoke("get_stats");
      setStats(s);
    } catch (e) {
      console.error("Failed to get stats:", e);
    }
  }, []);

  const loadFiles = useCallback(async (category) => {
    try {
      const f = await invoke("list_files", { category });
      setFiles(f);
    } catch (e) {
      console.error("Failed to list files:", e);
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const openCategory = (catId) => {
    setActiveCategory(catId);
    if (catId === "note") {
      setView("category");
    } else {
      setView("category");
    }
    loadFiles(catId);
  };

  const goHome = () => {
    setView("grid");
    setActiveCategory(null);
    refreshStats();
  };

  const openNoteEditor = (note = null) => {
    setEditingNote(note);
    setView("note-editor");
  };

  const handleFilesChanged = () => {
    if (activeCategory) loadFiles(activeCategory);
    refreshStats();
  };

  return (
    <div className="cv-app">
      <TitleBar />
      <div className="cv-body">
        <Sidebar
          categories={CATEGORIES}
          activeCategory={activeCategory}
          stats={stats}
          onSelect={openCategory}
          onHome={goHome}
          currentView={view}
        />
        <main className="cv-main">
          {view === "grid" && (
            <VaultGrid
              stats={stats}
              onOpenCategory={openCategory}
            />
          )}
          {view === "category" && (
            <FileList
              category={activeCategory}
              files={files}
              onFilesChanged={handleFilesChanged}
              onBack={goHome}
              onEditNote={openNoteEditor}
            />
          )}
          {view === "note-editor" && (
            <NoteEditor
              note={editingNote}
              onSave={handleFilesChanged}
              onBack={() => {
                setView("category");
                setActiveCategory("note");
                loadFiles("note");
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
