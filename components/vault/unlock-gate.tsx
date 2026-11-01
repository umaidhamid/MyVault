"use client";

import { Lock } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isUnlocked, subscribe } from "@/lib/vault-client/keys";
import { card } from "@/components/ui/styles";
import { UnlockForm } from "./unlock-form";

/** Renders children only while the vault key is in memory; otherwise a lock screen. */
export function UnlockGate({ children }: { children: React.ReactNode }) {
  const unlocked = useSyncExternalStore(subscribe, isUnlocked, () => false);
  if (unlocked) return children;
  return (
    <div className={`${card} mx-auto flex max-w-sm flex-col items-center gap-4 py-10 text-center`}>
      <span className="grid size-12 place-items-center rounded-full bg-amber-50 text-amber-600"><Lock size={22} /></span>
      <div>
        <h2 className="text-lg font-semibold">Vault is locked</h2>
        <p className="text-sm text-slate-500">Enter your master password to decrypt your items on this device.</p>
      </div>
      <div className="w-full"><UnlockForm /></div>
    </div>
  );
}
