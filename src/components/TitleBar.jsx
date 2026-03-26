import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TitleBar() {
  const win = getCurrentWindow();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand">
        <div className="logo" />
        <span>CYBERVAULT</span>
      </div>
      <div className="titlebar-controls">
        <button onClick={() => win.minimize()}>─</button>
        <button onClick={() => win.toggleMaximize()}>□</button>
        <button className="close" onClick={() => win.close()}>✕</button>
      </div>
    </div>
  );
}
