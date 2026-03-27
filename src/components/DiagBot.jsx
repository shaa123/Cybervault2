import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const RESPONSES = {
  help: "Available commands:\n• status — vault health check\n• stats — file counts\n• log — recent actions\n• storage — vault path info\n• pin — PIN auth status\n• clear — clear chat",
  hello: "Hello, operator. CyberVault systems online. Type 'help' for commands.",
  hi: "Hey. Systems nominal. How can I help?",
};

export default function DiagBot({ open, onClose }) {
  const [messages, setMessages] = useState([
    { from: "bot", text: "CyberVault DiagBot v2.0 initialized.\nType 'help' for available commands." }
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMsg = (from, text) => setMessages(prev => [...prev, { from, text }]);

  const handleSend = async () => {
    const cmd = input.trim().toLowerCase();
    if (!cmd) return;
    setInput("");
    addMsg("user", input.trim());

    if (cmd === "clear") {
      setMessages([{ from: "bot", text: "Chat cleared. Type 'help' for commands." }]);
      return;
    }

    if (RESPONSES[cmd]) {
      setTimeout(() => addMsg("bot", RESPONSES[cmd]), 300);
      return;
    }

    try {
      if (cmd === "status") {
        const info = await invoke("debug_info");
        addMsg("bot", "VAULT STATUS:\n" + info);
      } else if (cmd === "stats") {
        const stats = await invoke("get_stats");
        addMsg("bot", `FILE COUNTS:\n• Images: ${stats.images}\n• Videos: ${stats.videos}\n• Documents: ${stats.documents}\n• Notes: ${stats.notes}\n• Total: ${stats.total_files}`);
      } else if (cmd === "log") {
        const log = await invoke("get_audit_log");
        if (log.length === 0) {
          addMsg("bot", "No audit log entries yet.");
        } else {
          const recent = log.slice(-10).reverse();
          const text = recent.map(e => `[${e.timestamp}] ${e.action}: ${e.detail}`).join("\n");
          addMsg("bot", "RECENT ACTIONS:\n" + text);
        }
      } else if (cmd === "storage") {
        const info = await invoke("debug_info");
        const lines = info.split("\n").filter(l => l.startsWith("vault_root") || l.startsWith("index_path") || l.startsWith("write_test"));
        addMsg("bot", "STORAGE INFO:\n" + lines.join("\n"));
      } else if (cmd === "pin") {
        const has = await invoke("has_pin");
        addMsg("bot", has ? "PIN authentication is ENABLED." : "PIN authentication is DISABLED. Set one in Settings → Tools.");
      } else {
        addMsg("bot", `Unknown command: '${cmd}'\nType 'help' for available commands.`);
      }
    } catch (e) {
      addMsg("bot", `Error: ${e}`);
    }
  };

  if (!open) return null;

  return (
    <div className="diagbot">
      <div className="diagbot-header">
        <span className="diagbot-title">◆ DIAGBOT</span>
        <button className="diagbot-close" onClick={onClose}>✕</button>
      </div>
      <div className="diagbot-messages">
        {messages.map((m, i) => (
          <div key={i} className={`diagbot-msg ${m.from}`}>
            <pre>{m.text}</pre>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="diagbot-input-row">
        <input
          className="diagbot-input"
          placeholder="Type a command..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
          autoFocus
        />
        <button className="diagbot-send" onClick={handleSend}>→</button>
      </div>
    </div>
  );
}
