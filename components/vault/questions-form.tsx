"use client";

import { PasswordInput } from "@/components/ui/password-input";
import { useEffect, useState } from "react";
import { ANSWERS_KDF, RECOVERY_QUESTIONS, deriveAnswerKeys, toB64 } from "@/lib/crypto/kdf";
import { seal } from "@/lib/crypto/envelope";
import { post, unlockWithPassword } from "@/lib/vault-client/unlock";
import { btn, card, input } from "@/components/ui/styles";

export function QuestionsForm() {
  const [current, setCurrent] = useState<number[] | null | undefined>(undefined);
  const [picked, setPicked] = useState([0, 1, 2]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/vault/recovery-questions")
      .then((r) => r.json())
      .then((d) => setCurrent(d.questionIds ?? null))
      .catch(() => setCurrent(null));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const answers = [0, 1, 2].map((i) => String(fd.get(`a${i}`)));
    const password = String(fd.get("password"));
    if (new Set(picked).size !== 3) return setStatus({ ok: false, text: "Pick three different questions." });
    if (answers.some((a) => a.trim().length < 5)) return setStatus({ ok: false, text: "Each answer needs at least 5 characters." });
    setBusy(true);
    setStatus(null);
    try {
      const { authKey, vk, material } = await unlockWithPassword(password);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const qa = await deriveAnswerKeys(answers, salt);
      const wrapped = await seal(qa.kek, vk, `mv1|vk-qa|${material.userId}`);
      const res = await post("/api/vault/recovery-questions", {
        authKey: toB64(authKey),
        questionIds: picked,
        salt: toB64(salt),
        kdf: ANSWERS_KDF,
        wrappedVk: toB64(wrapped),
        answersAuthKey: toB64(qa.authKey),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
      form.reset();
      setCurrent(picked);
      setStatus({ ok: true, text: "Recovery questions saved." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className={`${card} flex max-w-xl flex-col gap-4`}>
      <div>
        <h2 className="text-lg font-medium">Recovery questions</h2>
        <p className="text-sm text-slate-500">
          {current === undefined ? "Checking…" : current ? "Set. Saving again replaces them." : "Not set."}
        </p>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        These answers become a second way to open your vault, and they are easier to guess than a password. Anyone who gets the
        database and guesses all three can read everything. Use long made-up answers (a random phrase), not real facts, and
        remember them exactly, since case and extra spaces are ignored but spelling is not.
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <select
            className={input}
            value={picked[i]}
            onChange={(e) => setPicked(picked.map((p, j) => (j === i ? Number(e.target.value) : p)))}
          >
            {RECOVERY_QUESTIONS.map((q, id) => (
              <option key={id} value={id}>{q}</option>
            ))}
          </select>
          <PasswordInput name={`a${i}`} placeholder="Answer" autoComplete="off" required />
        </div>
      ))}
      <PasswordInput name="password" placeholder="Master password (to confirm)" autoComplete="current-password" required />
      {status && <p role="alert" className={`text-sm ${status.ok ? "text-emerald-600" : "text-red-600"}`}>{status.text}</p>}
      <button className={btn} disabled={busy}>{busy ? "Working… (takes a few seconds)" : "Save recovery questions"}</button>
    </form>
  );
}
