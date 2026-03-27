import React, { useState, useEffect } from "react";

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!pin.trim()) return;
    setChecking(true);
    setError(false);
    const ok = await onUnlock(pin);
    if (!ok) {
      setError(true);
      setPin("");
    }
    setChecking(false);
  };

  const handleKey = (digit) => {
    if (pin.length < 8) setPin(prev => prev + digit);
  };

  const handleBackspace = () => setPin(prev => prev.slice(0, -1));

  useEffect(() => {
    const handler = (e) => {
      if (e.key >= "0" && e.key <= "9") handleKey(e.key);
      else if (e.key === "Backspace") handleBackspace();
      else if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="lock-screen">
      <div className="lock-box">
        <div className="lock-logo" />
        <h1 className="lock-title">CYBERVAULT</h1>
        <p className="lock-sub">ENTER PIN TO UNLOCK</p>

        <div className="lock-dots">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`lock-dot ${i < pin.length ? "filled" : ""}`} />
          ))}
        </div>

        {error && <div className="lock-error">INCORRECT PIN</div>}

        <div className="lock-keypad">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} className="lock-key" onClick={() => handleKey(String(n))}>{n}</button>
          ))}
          <button className="lock-key lock-key-fn" onClick={handleBackspace}>⌫</button>
          <button className="lock-key" onClick={() => handleKey("0")}>0</button>
          <button className="lock-key lock-key-fn lock-key-enter" onClick={handleSubmit}>
            {checking ? "..." : "→"}
          </button>
        </div>
      </div>
    </div>
  );
}
