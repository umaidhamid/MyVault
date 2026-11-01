"use client";

import { Lock, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isUnlocked, lockVault, subscribe } from "@/lib/vault-client/keys";
import { post } from "@/lib/vault-client/unlock";
import { btnGhost } from "@/components/ui/styles";
import { UnlockForm } from "./unlock-form";

export const AUTOLOCK_KEY = "mv-autolock-minutes";
const readMinutes = () => {
  try {
    return Number(localStorage.getItem(AUTOLOCK_KEY)) || 15;
  } catch {
    return 15;
  }
};

/** Lock status, unlock, log out, and idle auto-lock. Lives in the sidebar. */
export function VaultBar({ email }: { email?: string }) {
  const router = useRouter();
  const unlocked = useSyncExternalStore(subscribe, isUnlocked, () => false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(lockVault, readMinutes() * 60_000);
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [unlocked]);

  async function logout() {
    setLoggingOut(true);
    lockVault();
    await post("/api/auth/logout", {}).catch(() => {});
    router.replace("/login");
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 p-4">
      {email && <p className="truncate text-xs text-slate-500" title={email}>{email}</p>}
      {unlocked ? (
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-600"><span className="size-2 rounded-full bg-emerald-500" />Unlocked</span>
          <button className={btnGhost} onClick={lockVault}><Lock size={14} />Lock</button>
        </div>
      ) : (
        <>
          <span className="flex items-center gap-2 text-sm font-medium text-amber-600"><span className="size-2 rounded-full bg-amber-500" />Locked</span>
          <UnlockForm compact />
        </>
      )}
      <button className={btnGhost} onClick={logout} disabled={loggingOut}><LogOut size={14} />Log out</button>
    </div>
  );
}
