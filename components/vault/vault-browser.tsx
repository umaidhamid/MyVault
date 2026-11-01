"use client";

import { Plus, RefreshCw, Search, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { btn, btnGhost, card, input } from "@/components/ui/styles";
import { CATEGORIES, categoryLabel } from "@/lib/vault-client/categories";
import type { Draft } from "@/lib/vault-client/items";
import { getState, loadItems, subscribe, type ListItem } from "@/lib/vault-client/store";
import { CategoryIcon } from "./category-icon";
import { ItemDetail } from "./item-detail";
import { ItemForm } from "./item-form";

type FormState = null | { item?: ListItem; draft?: Draft };

export function VaultBrowser() {
  const params = useSearchParams();
  const { status, items, error, skipped } = useSyncExternalStore(subscribe, getState, getState);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(params.get("category") ?? "all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);

  useEffect(() => {
    if (getState().status === "idle") void loadItems();
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => m.set(i.overview.category, (m.get(i.overview.category) ?? 0) + 1));
    return m;
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const o = i.overview;
      if (category !== "all" && o.category !== category) return false;
      if (onlyFav && !o.favorite) return false;
      if (!q) return true;
      return [o.title, categoryLabel(o.category), ...o.fields.flatMap((f) => [f.label, f.value])].some((s) => s.toLowerCase().includes(q));
    });
  }, [items, query, category, onlyFav]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${input} pl-9`} placeholder="Search by title, email, username…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        </div>
        <button className={btnGhost} onClick={() => setOnlyFav(!onlyFav)} aria-pressed={onlyFav}>
          <Star size={14} className={onlyFav ? "fill-amber-400 text-amber-400" : ""} />Favorites
        </button>
        <button className={btnGhost} onClick={() => loadItems()} aria-label="Reload"><RefreshCw size={14} className={status === "loading" ? "animate-spin" : ""} /></button>
        <button className={btn} onClick={() => setForm({})}><Plus size={16} />New item</button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>All <small>{items.length}</small></Chip>
        {CATEGORIES.filter((c) => counts.has(c.id) || c.id === category).map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{c.label} <small>{counts.get(c.id) ?? 0}</small></Chip>
        ))}
      </div>

      {status === "error" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {skipped > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{skipped} item(s) failed integrity checks and were skipped. They may have been tampered with.</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <ul className={`${card} divide-y divide-slate-100 !p-0`}>
          {status === "loading" && !items.length && <li className="p-6 text-center text-sm text-slate-500">Decrypting…</li>}
          {status === "ready" && !shown.length && (
            <li className="p-8 text-center text-sm text-slate-500">
              {items.length ? "Nothing matches your filters." : "Your vault is empty."}
              {!items.length && <div className="mt-3"><button className={btn} onClick={() => setForm({})}><Plus size={16} />Add your first item</button></div>}
            </li>
          )}
          {shown.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => setSelectedId(i.id)}
                aria-current={i.id === selectedId}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${i.id === selectedId ? "bg-indigo-50/60" : ""}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><CategoryIcon id={i.overview.category} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.overview.title}</span>
                  <span className="block truncate text-xs text-slate-500">{i.overview.fields[0]?.value || categoryLabel(i.overview.category)}</span>
                </span>
                {i.overview.favorite && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />}
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <ItemDetail key={selected.id} item={selected} onEdit={(draft) => setForm({ item: selected, draft })} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className={`${card} hidden py-16 text-center text-sm text-slate-500 lg:block`}>Select an item to view its details.</div>
        )}
      </div>

      {form && (
        <ItemForm
          item={form.item}
          draft={form.draft}
          defaultCategory={category !== "all" ? category : undefined}
          onClose={() => setForm(null)}
          onSaved={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm transition [&_small]:ml-1 [&_small]:text-xs [&_small]:opacity-60 ${
        active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
