"use client";

import { useState } from "react";
import { card, input } from "@/components/ui/styles";
import { AUTOLOCK_KEY } from "./vault-bar";

const OPTIONS = [5, 15, 30, 60];

export function AutolockSetting() {
  const [minutes, setMinutes] = useState(() => {
    try {
      return Number(localStorage.getItem(AUTOLOCK_KEY)) || 15;
    } catch {
      return 15;
    }
  });
  return (
    <div className={`${card} flex max-w-xl flex-col gap-3`}>
      <div>
        <h2 className="text-lg font-medium">Auto-lock</h2>
        <p className="text-sm text-slate-500">Lock the vault (forget the decryption key) after this much inactivity. A page reload always locks it.</p>
      </div>
      <select
        className={`${input} !w-48`}
        value={minutes}
        onChange={(e) => {
          const m = Number(e.target.value);
          setMinutes(m);
          try {
            localStorage.setItem(AUTOLOCK_KEY, String(m)); // not a secret; stays per-browser
          } catch {}
        }}
      >
        {OPTIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : "1 hour"}</option>)}
      </select>
    </div>
  );
}
