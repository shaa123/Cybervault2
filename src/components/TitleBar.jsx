import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div className="cv-titlebar" data-tauri-drag-region>
      <div className="cv-titlebar-brand">
        <span className="cv-logo-glyph">&#9670;</span>
        <span className="cv-logo-text">CYBERVAULT</span>
        <span className="cv-logo-ver">v2.0</span>
      </div>
      <div className="cv-titlebar-controls">
        <button className="cv-tb-btn cv-tb-min" onClick={() => appWindow.minimize()}>
          <span>&#x2500;</span>
        </button>
        <button className="cv-tb-btn cv-tb-max" onClick={() => appWindow.toggleMaximize()}>
          <span>&#x25A1;</span>
        </button>
        <button className="cv-tb-btn cv-tb-close" onClick={() => appWindow.close()}>
          <span>&#x2715;</span>
        </button>
      </div>
    </div>
  );
}
