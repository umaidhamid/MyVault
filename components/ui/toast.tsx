"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; text: string };
const listeners = new Set<(t: Toast) => void>();
let n = 0;

/** Fire-and-forget notification; rendered by <Toaster /> in the layout. */
export const toast = (text: string) => listeners.forEach((f) => f({ id: ++n, text }));

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3500);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{t.text}</div>
      ))}
    </div>
  );
}
