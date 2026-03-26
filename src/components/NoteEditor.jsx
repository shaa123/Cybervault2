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
        .then((text) => setContent(text))
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
      // If editing existing note, delete old one first
      if (note) {
        await invoke("delete_file", { fileId: note.id });
        await invoke("purge_trash");
      }
      await invoke("save_note", { title: title.trim(), content });
      onSave();
      onBack();
    } catch (e) {
      console.error("Failed to save note:", e);
    }
    setSaving(false);
  };

  return (
    <div className="cv-note-editor">
      <div className="cv-ne-header">
        <button className="cv-fl-back" onClick={onBack}>
          &#x25C0; BACK
        </button>
        <h2 className="cv-ne-title">{note ? "EDIT_NOTE" : "NEW_NOTE"}</h2>
        <button className="cv-fl-btn cv-btn-add" onClick={handleSave} disabled={saving}>
          {saving ? "SAVING..." : "SAVE"}
        </button>
      </div>
      <div className="cv-ne-body">
        <input
          className="cv-ne-input"
          type="text"
          placeholder="NOTE TITLE..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="cv-ne-textarea"
          placeholder="Enter your note content here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </div>
  );
}
