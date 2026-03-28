import React, { useState, useEffect, useRef } from "react";

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const dotsRef = useRef(null);

  const handleSubmit = async () => {
    if (!pin.trim() || checking) return;
    setChecking(true);
    setError(false);
    const ok = await onUnlock(pin);
    if (ok) {
      setUnlocking(true);
    } else {
      setError(true);
      if (dotsRef.current) {
        dotsRef.current.style.animation = "pin-shake 0.5s ease";
        setTimeout(() => {
          if (dotsRef.current) dotsRef.current.style.animation = "";
        }, 500);
      }
      setPin("");
    }
    setChecking(false);
  };

  const handleKey = (digit) => {
    if (pin.length < 8 && !unlocking) setPin(prev => prev + digit);
  };

  const handleBackspace = () => setPin(prev => prev.slice(0, -1));

  useEffect(() => {
    const handler = (e) => {
      if (unlocking) return;
      if (e.key >= "0" && e.key <= "9") handleKey(e.key);
      else if (e.key === "Backspace") handleBackspace();
      else if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className={`lock-screen ${unlocking ? "unlocking" : ""}`}>
      <div className="lock-flash" />
      <div className="lock-box">
        <div className="lock-logo" />
        <h1 className="lock-title">CYBERVAULT</h1>
        <p className="lock-sub">ENTER PIN TO UNLOCK</p>

        <div className="lock-dots" ref={dotsRef}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`lock-dot ${i < pin.length ? "filled" : ""}`} />
          ))}
        </div>

        {error && <div className="lock-error">INCORRECT PIN</div>}

        <div className="lock-keypad">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} className="lock-key" onClick={(e) => {
              handleKey(String(n));
              e.currentTarget.style.animation = "key-press 0.25s ease, key-glow-flash 0.4s ease";
              const el = e.currentTarget;
              setTimeout(() => { el.style.animation = ""; }, 400);
            }}>{n}</button>
          ))}
          <button className="lock-key lock-key-fn" onClick={(e) => {
            handleBackspace();
            e.currentTarget.style.animation = "key-press 0.25s ease";
            const el = e.currentTarget;
            setTimeout(() => { el.style.animation = ""; }, 250);
          }}>⌫</button>
          <button className="lock-key" onClick={(e) => {
            handleKey("0");
            e.currentTarget.style.animation = "key-press 0.25s ease, key-glow-flash 0.4s ease";
            const el = e.currentTarget;
            setTimeout(() => { el.style.animation = ""; }, 400);
          }}>0</button>
          <button className="lock-key lock-key-fn lock-key-enter" onClick={(e) => {
            handleSubmit();
            e.currentTarget.style.animation = "key-press 0.25s ease";
            const el = e.currentTarget;
            setTimeout(() => { el.style.animation = ""; }, 250);
          }}>
            {checking ? "..." : "→"}
          </button>
        </div>
      </div>
    </div>
  );
}
