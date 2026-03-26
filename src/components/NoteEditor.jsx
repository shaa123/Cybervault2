import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function NoteEditor({ note, onSave, onBack }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (note) {
      setTitle(note.original_name.replace(/\.txt$/, ""));
      invoke("read_note", { fileId: note.id })
        .then(setContent)
        .catch(() => setContent(""));
    } else {
      setTitle("");
      setContent("");
    }
  }, [note]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (note) {
        await invoke("delete_file", { fileId: note.id });
        await invoke("purge_trash");
      }
      await invoke("save_note", { title: title.trim(), content });
      onSave();
      onBack();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div className="note-editor">
      <div className="ne-toolbar">
        <button className="fl-btn fl-btn-primary" onClick={onBack}>← BACK</button>
        <div className="ne-title">{note ? "EDIT NOTE" : "NEW NOTE"}</div>
        <button className="fl-btn fl-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "SAVING..." : "SAVE"}
        </button>
      </div>
      <div className="ne-body">
        <input
          className="ne-input"
          placeholder="Note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="ne-textarea"
          placeholder="Write your note here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </div>
  );
}
