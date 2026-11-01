"use client";

import { Pencil, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { btnDanger, btnGhost, card, iconBtn } from "@/components/ui/styles";
import { toast } from "@/components/ui/toast";
import { strengthLabel } from "@/lib/crypto/generator";
import { categoryLabel } from "@/lib/vault-client/categories";
import { toDraft, type Draft } from "@/lib/vault-client/items";
import { deleteItem, revealSecret, toggleFavorite, type ListItem } from "@/lib/vault-client/store";
import { CategoryIcon } from "./category-icon";
import { PlainRow, SecretRow, useSecret } from "./secret-row";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ItemDetail({ item, onEdit, onDeleted }: { item: ListItem; onEdit: (d: Draft) => void; onDeleted: () => void }) {
  const o = item.overview;
  const { secret, load } = useSecret(item.id);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const strength = o.pw ? strengthLabel(o.pw.bits) : null;

  async function edit() {
    setBusy(true);
    try {
      onEdit(toDraft(o, await revealSecret(item.id)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not decrypt");
    }
    setBusy(false);
  }

  async function remove() {
    try {
      await deleteItem(item.id);
      toast("Item deleted");
      onDeleted();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete");
      setConfirming(false);
    }
  }

  return (
    <article className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><CategoryIcon id={o.category} size={22} /></span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{o.title}</h2>
            <p className="text-sm text-slate-500">{categoryLabel(o.category)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <button className={iconBtn} aria-label={o.favorite ? "Remove favorite" : "Add favorite"} onClick={() => toggleFavorite(item).catch((e) => toast(e.message))}>
            <Star size={17} className={o.favorite ? "fill-amber-400 text-amber-400" : ""} />
          </button>
          <button className={iconBtn} aria-label="Edit" onClick={edit} disabled={busy}><Pencil size={16} /></button>
          <button className={iconBtn} aria-label="Delete" onClick={() => setConfirming(true)}><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="mt-4">
        {o.fields.map((f, i) => <PlainRow key={i} label={f.label || "Field"} value={f.value} />)}
        {o.secretLabels.map((l, i) => <SecretRow key={`${item.id}-${i}`} label={l || "Secret"} index={i} secret={secret} load={load} />)}
        {o.hasNotes && <SecretRow label="Notes" index={0} secret={secret} load={load} notes />}
      </div>

      {strength && o.pw && (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${strength.color}`} style={{ width: `${strength.pct}%` }} /></div>
          <span>Password strength: <b>{strength.text}</b> · changed {when(o.pw.at)}</span>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-400">Created {when(o.createdAt)} · Updated {when(item.updatedAt)}</p>

      {confirming && (
        <Modal title="Delete this item?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-slate-600">“{o.title}” will be removed from your vault. It stays recoverable in the database for 30 days, then is erased.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setConfirming(false)}>Cancel</button>
            <button className={btnDanger} onClick={remove}>Delete</button>
          </div>
        </Modal>
      )}
    </article>
  );
}
