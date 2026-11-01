"use client";

import { Eye, EyeOff, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { btn, btnGhost, iconBtn, input, label as labelCls } from "@/components/ui/styles";
import { toast } from "@/components/ui/toast";
import { DEFAULT_GEN, generatePassword, strengthBits, strengthLabel } from "@/lib/crypto/generator";
import { CATEGORIES } from "@/lib/vault-client/categories";
import type { Draft, Field } from "@/lib/vault-client/items";
import { createItem, updateItem, type ListItem } from "@/lib/vault-client/store";

const blank = (category: string): Draft => ({
  title: "",
  category,
  favorite: false,
  notes: "",
  fields: (CATEGORIES.find((c) => c.id === category)?.fields ?? []).map((f) => ({ label: f.label, value: "", secret: !!f.secret })),
});

export function ItemForm({ item, draft, defaultCategory, onClose, onSaved }: { item?: ListItem; draft?: Draft; defaultCategory?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const [d, setD] = useState<Draft>(draft ?? blank(defaultCategory ?? "email"));
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (i: number, patch: Partial<Field>) => setD((x) => ({ ...x, fields: x.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const touched = d.fields.some((f) => f.value) || d.notes;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) return setError("Give it a title.");
    if (d.fields.length > 40) return setError("Too many fields (max 40).");
    setBusy(true);
    setError(null);
    try {
      if (item) {
        await updateItem(item, d);
        onSaved?.(item.id);
      } else {
        onSaved?.(await createItem(d));
      }
      toast(item ? "Changes saved" : "Item saved and encrypted");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <Modal title={item ? "Edit item" : "New item"} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Title</span>
            <input className={input} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Gmail, Instagram, Hostinger" maxLength={100} autoFocus required />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Category</span>
            <select
              className={input}
              value={d.category}
              onChange={(e) => {
                const category = e.target.value;
                // Only swap in the new category's template if nothing has been typed yet.
                setD(touched ? { ...d, category } : { ...blank(category), title: d.title, favorite: d.favorite });
              }}
            >
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className={labelCls}>Fields</span>
          {d.fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[170px_1fr_auto]">
              <input className={input} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Label" maxLength={60} aria-label="Field label" />
              <div className="order-last col-span-2 flex items-center gap-1 sm:order-none sm:col-span-1">
                <input
                  className={`${input} ${f.secret ? "font-mono" : ""}`}
                  type={f.secret && !revealed.has(i) ? "password" : "text"}
                  value={f.value}
                  onChange={(e) => setField(i, { value: e.target.value })}
                  placeholder="Value"
                  maxLength={4000}
                  autoComplete="off"
                  aria-label={`${f.label || "Field"} value`}
                />
                {f.secret && (
                  <>
                    <button type="button" className={iconBtn} aria-label="Show or hide" onClick={() => setRevealed((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}>
                      {revealed.has(i) ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button type="button" className={iconBtn} aria-label="Generate password" title="Generate a strong password" onClick={() => { setField(i, { value: generatePassword(DEFAULT_GEN) }); setRevealed((s) => new Set(s).add(i)); }}>
                      <Sparkles size={15} />
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-600" title="Secret fields are stored in the encrypted secret blob and hidden until revealed">
                  <input type="checkbox" checked={f.secret} onChange={(e) => setField(i, { secret: e.target.checked })} /> Secret
                </label>
                <button type="button" className={iconBtn} aria-label="Remove field" onClick={() => setD({ ...d, fields: d.fields.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
              </div>
              {f.secret && f.value && /pass/i.test(f.label) && <Strength value={f.value} />}
            </div>
          ))}
          <button type="button" className={`${btnGhost} self-start`} onClick={() => setD({ ...d, fields: [...d.fields, { label: "", value: "", secret: false }] })}>
            <Plus size={14} />Add field
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Notes (encrypted)</span>
          <textarea className={input} rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} maxLength={20000} placeholder="Recovery codes, security answers, anything private" />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.favorite} onChange={(e) => setD({ ...d, favorite: e.target.checked })} /> Favorite</label>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btn} disabled={busy}>{busy ? "Encrypting…" : item ? "Save changes" : "Save item"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Strength({ value }: { value: string }) {
  const s = strengthLabel(strengthBits(value));
  return (
    <div className="col-span-full flex items-center gap-2 px-1 text-xs text-slate-500">
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${s.color}`} style={{ width: `${s.pct}%` }} /></div>
      {s.text}
    </div>
  );
}
