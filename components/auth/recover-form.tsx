"use client";

import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  DEFAULT_KDF,
  RECOVERY_QUESTIONS,
  assertSafeKdf,
  deriveAnswerKeys,
  deriveKeys,
  fromB64,
  toB64,
  type KdfParams,
} from "@/lib/crypto/kdf";
import { open, seal } from "@/lib/crypto/envelope";
import { post, vkContext } from "@/lib/vault-client/unlock";
import { btn, input } from "@/components/ui/styles";

type Step = "email" | "answers" | "password" | "done";

export function RecoverForm() {
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<number[]>([]);
  // Secrets stay in refs, not state, so they are never rendered or kept in React's tree.
  const ctx = useRef<{ email: string; salt: string; kdf: KdfParams; userId: string; vk: Uint8Array; answersAuthKey: string }>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  const askQuestions = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim().toLowerCase();
    return run(async () => {
      const res = await post("/api/auth/recover/questions", { email });
      if (!res.ok) throw new Error("Invalid request");
      const d = await res.json();
      assertSafeKdf(d.kdf);
      ctx.current = { email, salt: d.salt, kdf: d.kdf, userId: "", vk: new Uint8Array(), answersAuthKey: "" };
      setQuestions(d.questionIds);
      setStep("answers");
    });
  };

  const checkAnswers = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers = questions.map((_, i) => String(fd.get(`a${i}`)));
    return run(async () => {
      const c = ctx.current!;
      const { authKey, kek } = await deriveAnswerKeys(answers, fromB64(c.salt), c.kdf);
      const res = await post("/api/auth/recover/unlock", { email: c.email, answersAuthKey: toB64(authKey) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Incorrect answers");
      c.userId = d.userId;
      c.answersAuthKey = toB64(authKey);
      c.vk = await open(kek, fromB64(d.wrappedVk), `mv1|vk-qa|${d.userId}`).catch(() => {
        throw new Error("Incorrect answers");
      });
      setStep("password");
    });
  };

  const resetPassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get("password"));
    if (pw.length < 12) return setError("Use at least 12 characters.");
    if (pw !== String(fd.get("confirm"))) return setError("Passwords don't match.");
    return run(async () => {
      const c = ctx.current!;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const { authKey, kek } = await deriveKeys(pw, salt, DEFAULT_KDF);
      const wrappedVk = await seal(kek, c.vk, vkContext(c.userId));
      const res = await post("/api/auth/recover/reset", {
        email: c.email,
        answersAuthKey: c.answersAuthKey,
        newAuthKey: toB64(authKey),
        salt: toB64(salt),
        kdf: DEFAULT_KDF,
        wrappedVk: toB64(wrappedVk),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reset failed");
      c.vk.fill(0);
      ctx.current = null;
      setStep("done");
    });
  };

  const wrap = "flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm";
  const err = error && <p role="alert" className="text-sm text-red-600">{error}</p>;

  if (step === "done")
    return (
      <div className={wrap}>
        <h1 className="text-2xl font-semibold">Password changed</h1>
        <p className="text-sm">All other sessions were signed out.</p>
        <Link href="/login" className={btn + " text-center"}>Log in</Link>
      </div>
    );

  return (
    <div className={wrap}>
      <h1 className="text-2xl font-semibold">Recover your vault</h1>
      {step === "email" && (
        <form onSubmit={askQuestions} className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">Needs the recovery questions you set up in Settings. If you never set them, your vault can&apos;t be recovered.</p>
          <input className={input} name="email" type="email" placeholder="Email" required />
          {err}
          <button className={btn} disabled={busy}>{busy ? "…" : "Continue"}</button>
        </form>
      )}
      {step === "answers" && (
        <form onSubmit={checkAnswers} className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <label key={i} className="flex flex-col gap-1 text-sm">
              {RECOVERY_QUESTIONS[q]}
              <PasswordInput name={`a${i}`} autoComplete="off" required />
            </label>
          ))}
          {err}
          <button className={btn} disabled={busy}>{busy ? "Checking… (takes a few seconds)" : "Verify answers"}</button>
        </form>
      )}
      {step === "password" && (
        <form onSubmit={resetPassword} className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">Answers accepted. Choose a new master password.</p>
          <PasswordInput name="password" placeholder="New master password" autoComplete="new-password" required />
          <PasswordInput name="confirm" placeholder="Confirm" autoComplete="new-password" required />
          {err}
          <button className={btn} disabled={busy}>{busy ? "Saving…" : "Set new password"}</button>
        </form>
      )}
    </div>
  );
}
