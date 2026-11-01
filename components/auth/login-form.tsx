"use client";

import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { assertSafeKdf, deriveKeys, fromB64, toB64 } from "@/lib/crypto/kdf";
import { openVault, post } from "@/lib/vault-client/unlock";
import { btn, input } from "@/components/ui/styles";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email")).trim().toLowerCase();
    const password = String(fd.get("password"));
    setBusy(true);
    setError(null);
    try {
      const pre = await post("/api/auth/prelogin", { email });
      if (!pre.ok) throw new Error("Invalid email or password");
      const { salt, kdf } = await pre.json();
      assertSafeKdf(kdf);
      // shortcut: Argon2id runs on the main thread (UI pauses ~1-3 s); move to a Web Worker.
      const { authKey, kek } = await deriveKeys(password, fromB64(salt), kdf);
      const res = await post("/api/auth/login", { email, authKey: toB64(authKey) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      await openVault(kek, data);
      form.reset();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div><h1 className="text-2xl font-semibold">MyVault</h1><p className="text-sm text-slate-500">Log in to unlock your encrypted vault.</p></div>
      <input className={input} name="email" type="email" placeholder="Email" autoComplete="username" required />
      <PasswordInput name="password" placeholder="Master password" autoComplete="current-password" required />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className={btn} disabled={busy}>{busy ? "Unlocking…" : "Log in"}</button>
      <Link href="/recover" className="text-sm text-indigo-600 underline">Forgot password?</Link>
    </form>
  );
}
