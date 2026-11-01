"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { card } from "@/components/ui/styles";
import { CATEGORIES } from "@/lib/vault-client/categories";
import { getState, loadItems, subscribe } from "@/lib/vault-client/store";
import { CategoryIcon } from "./category-icon";

export function CategoriesView() {
  const { items } = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    if (getState().status === "idle") void loadItems();
  }, []);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORIES.map((c) => {
        const n = items.filter((i) => i.overview.category === c.id).length;
        return (
          <Link key={c.id} href={`/vault?category=${c.id}`} className={`${card} flex items-center gap-4 transition hover:border-indigo-300 hover:shadow-md`}>
            <span className="grid size-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><CategoryIcon id={c.id} size={22} /></span>
            <div>
              <p className="font-semibold">{c.label}</p>
              <p className="text-sm text-slate-500">{n} {n === 1 ? "item" : "items"}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
