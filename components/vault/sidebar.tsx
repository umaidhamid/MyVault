"use client";

import { KeyRound, LayoutDashboard, Folder, Menu, ScrollText, Settings, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { iconBtn } from "@/components/ui/styles";
import { VaultBar } from "./vault-bar";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vault", label: "All items", icon: KeyRound },
  { href: "/categories", label: "Categories", icon: Folder },
  { href: "/generator", label: "Password generator", icon: Sparkles },
  { href: "/audit-log", label: "Audit log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Brand />
        <button className={iconBtn} onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Brand />
          <button className={`${iconBtn} lg:hidden`} onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <VaultBar />
      </aside>
    </>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white"><ShieldCheck size={18} /></span>
      MyVault
    </span>
  );
}
