import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export default function TitleBar() {
  const handleMinimize = async () => {
    try { await appWindow.minimize(); }
    catch (e) { console.error("minimize failed:", e); }
  };

  const handleMaximize = async () => {
    try { await appWindow.toggleMaximize(); }
    catch (e) { console.error("maximize failed:", e); }
  };

  const handleClose = async () => {
    try { await appWindow.close(); }
    catch (e) { console.error("close failed:", e); }
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand">
        <div className="logo" />
        <span>CYBERVAULT</span>
      </div>
      <div className="titlebar-controls">
        <button onClick={handleMinimize}>─</button>
        <button onClick={handleMaximize}>□</button>
        <button className="close" onClick={handleClose}>✕</button>
      </div>
    </div>
  );
}
