"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { btn, btnGhost, card, iconBtn, input } from "@/components/ui/styles";
import { DEFAULT_GEN, generatePassword, strengthBits, strengthLabel, type GenOptions } from "@/lib/crypto/generator";
import { copySecret } from "@/lib/vault-client/clipboard";

const TYPES = [
  ["lower", "Lowercase (a-z)"],
  ["upper", "Uppercase (A-Z)"],
  ["digits", "Numbers (0-9)"],
  ["symbols", "Symbols (!@#…)"],
] as const;

export function Generator() {
  const [o, setO] = useState<GenOptions>(DEFAULT_GEN);
  const [count, setCount] = useState(5);
  const [list, setList] = useState<string[]>(() => []);
  const [error, setError] = useState<string | null>(null);

  const run = (opts = o, n = count) => {
    try {
      setList(Array.from({ length: n }, () => generatePassword(opts)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate");
    }
  };
  const update = (patch: Partial<GenOptions>) => {
    const next = { ...o, ...patch };
    setO(next);
    run(next);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
      <div className={`${card} flex flex-col gap-4`}>
        <label className="flex flex-col gap-2 text-sm font-medium">
          <span className="flex justify-between">Length <b>{o.length}</b></span>
          <input type="range" min={8} max={64} value={o.length} onChange={(e) => update({ length: Number(e.target.value) })} className="accent-indigo-600" />
        </label>
        {TYPES.map(([k, text]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o[k]} onChange={(e) => update({ [k]: e.target.checked })} />{text}</label>
        ))}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.noAmbiguous} onChange={(e) => update({ noAmbiguous: e.target.checked })} />Avoid ambiguous (I l 1 O 0 o)</label>
        <label className="flex items-center gap-2 text-sm">
          How many
          <input className={`${input} !w-20`} type="number" min={1} max={20} value={count} onChange={(e) => { const n = Math.min(20, Math.max(1, Number(e.target.value) || 1)); setCount(n); run(o, n); }} />
        </label>
        <button className={btn} onClick={() => run()}><RefreshCw size={15} />Generate</button>
        <p className="text-xs text-slate-500">Uses your browser&apos;s cryptographic random generator. Nothing is sent or stored.</p>
      </div>

      <div className={`${card} !p-0`}>
        {error && <p role="alert" className="p-4 text-sm text-red-600">{error}</p>}
        {!list.length && !error && <p className="p-8 text-center text-sm text-slate-500">Press Generate to create passwords.</p>}
        <ul className="divide-y divide-slate-100">
          {list.map((pw, i) => {
            const s = strengthLabel(strengthBits(pw));
            return (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <code className="min-w-0 flex-1 break-all font-mono text-sm">{pw}</code>
                <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full ${s.color}`} style={{ width: `${s.pct}%` }} /></span>
                  {s.text}
                </span>
                <button className={iconBtn} aria-label="Copy password" onClick={() => copySecret(pw, "Password")}><Copy size={15} /></button>
              </li>
            );
          })}
        </ul>
        {list.length > 0 && <div className="border-t border-slate-100 p-3"><button className={btnGhost} onClick={() => setList([])}>Clear</button></div>}
      </div>
    </div>
  );
}
