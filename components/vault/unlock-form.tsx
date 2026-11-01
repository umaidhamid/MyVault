"use client";

import { useState } from "react";
import { unlockWithPassword } from "@/lib/vault-client/unlock";
import { btn, input } from "@/components/ui/styles";

/** Re-derives the vault key from the master password (the session is already signed in). */
export function UnlockForm({ compact }: { compact?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const password = String(new FormData(form).get("password"));
    setBusy(true);
    setError(null);
    try {
      await unlockWithPassword(password);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input className={input} name="password" type="password" placeholder="Master password" autoComplete="current-password" required />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button className={btn} disabled={busy}>{busy ? "Unlocking…" : compact ? "Unlock" : "Unlock vault"}</button>
    </form>
  );
}
