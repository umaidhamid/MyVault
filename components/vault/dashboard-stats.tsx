"use client";

import { KeyRound, ShieldAlert, Star, StickyNote, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { card } from "@/components/ui/styles";
import { CATEGORIES, categoryLabel } from "@/lib/vault-client/categories";
import { getState, loadItems, subscribe, type ListItem } from "@/lib/vault-client/store";
import { CategoryIcon } from "./category-icon";

const OLD_DAYS = 180;

function warnings(items: ListItem[]) {
  const out: { id: string; title: string; text: string }[] = [];
  const byFp = new Map<string, ListItem[]>();
  for (const i of items) {
    const o = i.overview;
    if (o.pw) byFp.set(o.pw.fp, [...(byFp.get(o.pw.fp) ?? []), i]);
    if (o.pw && o.pw.bits < 50) out.push({ id: i.id, title: o.title, text: "Weak password" });
    if (o.pw && Date.now() - new Date(o.pw.at).getTime() > OLD_DAYS * 864e5) out.push({ id: i.id, title: o.title, text: `Password older than ${OLD_DAYS} days` });
    if ((o.category === "email" || o.category === "social") && !o.fields.some((f) => /recovery/i.test(f.label) && f.value)) out.push({ id: i.id, title: o.title, text: "No recovery email or phone" });
  }
  for (const group of byFp.values())
    if (group.length > 1) group.forEach((i) => out.push({ id: i.id, title: i.overview.title, text: `Password reused on ${group.length - 1} other item${group.length > 2 ? "s" : ""}` }));
  return out;
}

export function DashboardStats() {
  const { status, items } = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    if (getState().status === "idle") void loadItems();
  }, []);

  const stats = useMemo(() => {
    const by = new Map<string, number>();
    items.forEach((i) => by.set(i.overview.category, (by.get(i.overview.category) ?? 0) + 1));
    return {
      by,
      passwords: items.filter((i) => i.overview.pw).length,
      apiKeys: by.get("api") ?? 0,
      notes: by.get("note") ?? 0,
      favorites: items.filter((i) => i.overview.favorite),
      recentAdded: [...items].sort((a, b) => b.overview.createdAt.localeCompare(a.overview.createdAt)).slice(0, 5),
      recentModified: items.slice(0, 5),
      warnings: warnings(items),
    };
  }, [items]);

  if (status === "loading" && !items.length) return <p className="text-sm text-slate-500">Decrypting your vault…</p>;

  const tiles = [
    { label: "Accounts & items", value: items.length, icon: Users },
    { label: "Passwords", value: stats.passwords, icon: KeyRound },
    { label: "API keys", value: stats.apiKeys, icon: KeyRound },
    { label: "Secure notes", value: stats.notes, icon: StickyNote },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <div key={label} className={`${card} flex items-center gap-4`}>
            <span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={20} /></span>
            <div><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-slate-500">{label}</p></div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><ShieldAlert size={17} className="text-amber-500" />Security warnings</h2>
          {stats.warnings.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {stats.warnings.slice(0, 8).map((w, i) => (
                <li key={i} className="flex justify-between gap-3 py-2"><span className="font-medium">{w.title}</span><span className="text-right text-slate-500">{w.text}</span></li>
              ))}
              {stats.warnings.length > 8 && <li className="pt-2 text-xs text-slate-400">+ {stats.warnings.length - 8} more</li>}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{items.length ? "No issues found. Checked locally; nothing left this device." : "Add items to get a security check."}</p>
          )}
        </section>

        <section className={card}>
          <h2 className="mb-3 font-semibold">By category</h2>
          <ul className="space-y-2 text-sm">
            {CATEGORIES.filter((c) => stats.by.has(c.id)).map((c) => (
              <li key={c.id}>
                <Link href={`/vault?category=${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <CategoryIcon id={c.id} size={16} className="text-slate-500" />
                  <span className="flex-1">{c.label}</span>
                  <span className="text-slate-500">{stats.by.get(c.id)}</span>
                </Link>
              </li>
            ))}
            {!items.length && <li className="text-slate-500">Nothing yet.</li>}
          </ul>
        </section>

        <List title="Recently added" items={stats.recentAdded} />
        <List title="Recently modified" items={stats.recentModified} />
        <section className={`${card} lg:col-span-2`}>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Star size={16} className="fill-amber-400 text-amber-400" />Favorites</h2>
          {stats.favorites.length ? (
            <div className="flex flex-wrap gap-2">
              {stats.favorites.map((i) => <Link key={i.id} href="/vault" className="rounded-full bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200">{i.overview.title}</Link>)}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Star an item to pin it here.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: ListItem[] }) {
  return (
    <section className={card}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {items.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate font-medium">{i.overview.title}</span>
              <span className="shrink-0 text-xs text-slate-500">{categoryLabel(i.overview.category)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nothing yet.</p>
      )}
    </section>
  );
}
