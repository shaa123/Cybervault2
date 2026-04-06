import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { vaultFileUrl } from "./hooks/useThumbnails";
import TitleBar from "./components/TitleBar";
import NavTabs from "./components/NavTabs";
import Dashboard from "./components/Dashboard";
import FileList from "./components/FileList";
import NoteEditor from "./components/NoteEditor";
import MediaViewer from "./components/MediaViewer";
import Settings from "./components/Settings";
import LockScreen from "./components/LockScreen";
import "./styles/app.css";

const TABS = [
  { id: "home", label: "HOME", icon: "◇", color: "#8b1a2b" },
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
  const [bgSettings, setBgSettings] = useState(null);

  // Folder watcher (persists across tabs)
  const [watchFolder, setWatchFolder] = useState(null);
  const [watchStatus, setWatchStatus] = useState("");
  const watchRef = useRef(false);
  const watchTimerRef = useRef(null);
  const importedSetRef = useRef(new Set());

  // Load background settings (only when unlocked)
  useEffect(() => {
    if (!locked && !checkingPin) {
      invoke("get_settings").then(s => {
        if (s.bg_type && s.bg_data) setBgSettings(s);
        else setBgSettings(null);
      }).catch(() => {});
    }
  }, [locked, checkingPin]);

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
    try {
      const f = await invoke("list_files", { category });
      // Shuffle for image/video tabs
      if (category === "image" || category === "video") {
        for (let i = f.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [f[i], f[j]] = [f[j], f[i]];
        }
      }
      setFiles(f);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

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

  const startWatching = useCallback(async (folderPath) => {
    setWatchFolder(folderPath);
    watchRef.current = true;
    importedSetRef.current = new Set();
    setWatchStatus("Scanning...");

    const scanAndImport = async () => {
      if (!watchRef.current) return;
      try {
        const allFiles = await invoke("list_folder_files", { path: folderPath });
        const newFiles = allFiles.filter(f => !importedSetRef.current.has(f));

        if (newFiles.length > 0) {
          setWatchStatus(`Importing ${newFiles.length} new file${newFiles.length !== 1 ? "s" : ""}...`);
          const BATCH = 50;
          let imported = 0;
          for (let i = 0; i < newFiles.length; i += BATCH) {
            if (!watchRef.current) break;
            const batch = newFiles.slice(i, i + BATCH);
            const count = await invoke("hide_files_batch", { paths: batch, category: "auto" });
            imported += count;
            await new Promise(r => setTimeout(r, 10));
          }
          for (const f of newFiles) importedSetRef.current.add(f);
          if (imported > 0) refreshStats();
          setWatchStatus(`Watching · ${importedSetRef.current.size} files imported`);
        } else {
          setWatchStatus(`Watching · ${importedSetRef.current.size} files imported`);
        }
      } catch (e) {
        console.error("Watch scan error:", e);
        setWatchStatus("Error scanning — retrying...");
      }
    };

    await scanAndImport();
    watchTimerRef.current = setInterval(scanAndImport, 5000);
  }, [refreshStats]);

  const stopWatching = useCallback(() => {
    watchRef.current = false;
    if (watchTimerRef.current) {
      clearInterval(watchTimerRef.current);
      watchTimerRef.current = null;
    }
    setWatchFolder(null);
    setWatchStatus("");
    importedSetRef.current = new Set();
  }, []);

  // Cleanup watcher on unmount or lock
  useEffect(() => {
    if (locked && watchFolder) stopWatching();
  }, [locked, watchFolder, stopWatching]);

  useEffect(() => {
    return () => {
      watchRef.current = false;
      if (watchTimerRef.current) clearInterval(watchTimerRef.current);
    };
  }, []);

  const openEditor = (note = null) => { setEditingNote(note); setView("editor"); };
  const closeEditor = () => {
    setView("list"); setEditingNote(null);
    if (tab === "note") loadFiles("note");
    refreshStats();
  };

  const displayedListRef = useRef([]);
  const [lastViewedId, setLastViewedId] = useState(null);
  const openMedia = (file, displayedFiles) => {
    if (displayedFiles) displayedListRef.current = displayedFiles;
    setViewingMedia(file);
  };
  const closeMedia = () => {
    if (viewingMedia) setLastViewedId(viewingMedia.id);
    setViewingMedia(null);
  };

  const navigateMedia = useCallback((dir) => {
    if (!viewingMedia) return;
    const list = displayedListRef.current;
    const idx = list.findIndex(f => f.id === viewingMedia.id);
    if (idx === -1) return;
    const next = (idx + dir + list.length) % list.length;
    setViewingMedia(list[next]);
  }, [viewingMedia]);

  const deleteCurrentMedia = useCallback(async () => {
    if (!viewingMedia) return;
    const list = displayedListRef.current;
    const idx = list.findIndex(f => f.id === viewingMedia.id);
    try {
      await invoke("delete_file", { fileId: viewingMedia.id });
      const newList = list.filter(f => f.id !== viewingMedia.id);
      displayedListRef.current = newList;
      if (newList.length === 0) {
        setViewingMedia(null);
      } else {
        const nextIdx = Math.min(idx, newList.length - 1);
        setViewingMedia(newList[nextIdx]);
      }
      if (tab !== "home" && tab !== "settings") loadFiles(tab);
      refreshStats();
    } catch (e) { console.error(e); }
  }, [viewingMedia, tab, loadFiles, refreshStats]);

  // Load background as data URL
  const [bgSrc, setBgSrc] = useState(null);
  const [ssUrls, setSsUrls] = useState([]);
  const [ssIdx, setSsIdx] = useState(0);
  const ssTimerRef = useRef(null);

  // Load static BG and slideshow settings
  useEffect(() => {
    if (!locked && !checkingPin && tab !== "settings") {
      invoke("get_settings").then(async (s) => {
        setBgSettings(s);

        // Static BG
        if (s.bg_type && s.bg_data) {
          try {
            let dataUrl;
            if (s.bg_data.startsWith("vault:")) {
              dataUrl = await invoke("read_vault_file_as_data_url", { fileId: s.bg_data.slice(6) });
            } else {
              dataUrl = await invoke("read_bg_file", { path: s.bg_data });
            }
            setBgSrc(dataUrl);
          } catch (e) { setBgSrc(null); }
        } else {
          setBgSrc(null);
        }

        // Slideshow — just build protocol URLs, no file reading
        if (s.slideshow_enabled && s.slideshow_file_ids?.length > 0) {
          let ids = [...s.slideshow_file_ids];
          if (s.slideshow_shuffle) ids.sort(() => Math.random() - 0.5);
          setSsUrls(ids.map(id => vaultFileUrl(id)));
          setSsIdx(0);
        } else {
          setSsUrls([]);
        }
      }).catch(() => {});
    }
  }, [tab, locked, checkingPin]);

  // Slideshow timer — simple index rotation
  useEffect(() => {
    if (ssTimerRef.current) clearInterval(ssTimerRef.current);
    if (bgSettings?.slideshow_enabled && ssUrls.length > 1) {
      const ms = (bgSettings.slideshow_interval || 5) * 1000;
      ssTimerRef.current = setInterval(() => {
        setSsIdx(prev => (prev + 1) % ssUrls.length);
      }, ms);
    }
    return () => { if (ssTimerRef.current) clearInterval(ssTimerRef.current); };
  }, [bgSettings?.slideshow_enabled, bgSettings?.slideshow_interval, ssUrls.length]);

  if (checkingPin) return <div className="app" />;
  if (locked) return <LockScreen onUnlock={handleUnlock} />;

  return (
    <div className="app" style={{ animation: "app-reveal 0.4s ease" }}>
      {/* Static BG */}
      {bgSrc && bgSettings?.bg_type === "image" && !bgSettings?.slideshow_enabled && (
        <div className="app-bg" style={{ opacity: bgSettings.bg_opacity || 0.3 }}>
          <img src={bgSrc} alt="" style={{ objectFit: bgSettings.bg_fit || "cover" }} />
        </div>
      )}
      {bgSrc && bgSettings?.bg_type === "video" && !bgSettings?.slideshow_enabled && (
        <div className="app-bg" style={{ opacity: bgSettings.bg_opacity || 0.3 }}>
          <video src={bgSrc} autoPlay loop muted style={{ objectFit: bgSettings.bg_fit || "cover" }} />
        </div>
      )}
      {/* Slideshow BG */}
      {bgSettings?.slideshow_enabled && ssUrls.length > 0 && (
        <div className="app-bg" style={{ opacity: bgSettings.slideshow_opacity || 0.3 }}>
          <img src={ssUrls[ssIdx]} alt="" style={{ objectFit: bgSettings.slideshow_fit || "cover" }} />
        </div>
      )}
      <TitleBar />
      <NavTabs tabs={TABS} active={tab} onSelect={setTab} stats={stats} onLock={() => setLocked(true)} />
      <div className="content" key={tab}>
        {tab === "home" ? (
          <Dashboard stats={stats} onOpenCategory={setTab} />
        ) : tab === "settings" ? (
          <Settings stats={stats} onPurge={handleChanged}
            watchFolder={watchFolder} watchStatus={watchStatus}
            onStartWatching={startWatching} onStopWatching={stopWatching} />
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
            lastViewedId={!viewingMedia ? lastViewedId : null}
          />
        )}
      </div>

      {viewingMedia && (
        <MediaViewer
          file={viewingMedia}
          files={displayedListRef.current}
          onClose={closeMedia}
          onNavigate={navigateMedia}
          onDelete={deleteCurrentMedia}
        />
      )}

    </div>
  );
}
