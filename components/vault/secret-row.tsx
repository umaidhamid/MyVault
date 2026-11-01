"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { iconBtn } from "@/components/ui/styles";
import { toast } from "@/components/ui/toast";
import { copyPlain, copySecret } from "@/lib/vault-client/clipboard";
import { revealSecret } from "@/lib/vault-client/store";
import type { SecretData } from "@/lib/vault-client/items";

const HIDE_AFTER_MS = 15_000;

/** Holds a decrypted secret for a short time only, then drops the reference. */
export function useSecret(id: string) {
  const [secret, setSecret] = useState<SecretData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setSecret(null);
  }, []);
  useEffect(() => clear, [id, clear]);

  const load = useCallback(async () => {
    try {
      const s = await revealSecret(id);
      setSecret(s);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSecret(null), HIDE_AFTER_MS);
      return s;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not decrypt");
      return null;
    }
  }, [id]);

  return { secret, load, clear };
}

export function PlainRow({ label, value }: { label: string; value: string }) {
  return (
    <Row
      label={label}
      value={<span className="break-all">{value || "—"}</span>}
      actions={<button className={iconBtn} aria-label={`Copy ${label}`} onClick={() => copyPlain(value, label)}><Copy size={15} /></button>}
    />
  );
}

/** One secret value: hidden by default, revealed on demand, copied without being rendered. */
export function SecretRow({ label, index, secret, load, notes }: { label: string; index: number; secret: SecretData | null; load: () => Promise<SecretData | null>; notes?: boolean }) {
  const [shown, setShown] = useState(false);
  const value = secret ? (notes ? secret.notes : secret.fields[index]?.value) : undefined;
  useEffect(() => {
    if (!secret) setShown(false);
  }, [secret]);

  return (
    <Row
      label={label}
      value={
        shown && value !== undefined ? (
          <span className="whitespace-pre-wrap break-all font-mono text-[13px]">{value}</span>
        ) : (
          <span className="font-mono tracking-widest text-slate-400">••••••••••••</span>
        )
      }
      actions={
        <>
          <button
            className={iconBtn}
            aria-label={shown ? `Hide ${label}` : `Show ${label}`}
            onClick={async () => {
              if (shown) return setShown(false);
              if (await load()) setShown(true);
            }}
          >
            {shown ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button
            className={iconBtn}
            aria-label={`Copy ${label}`}
            onClick={async () => {
              const s = secret ?? (await load());
              if (s) await copySecret(notes ? s.notes : s.fields[index].value, label);
            }}
          >
            <Copy size={15} />
          </button>
        </>
      }
    />
  );
}

function Row({ label, value, actions }: { label: string; value: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-1 text-sm text-slate-900">{value}</div>
      </div>
      <div className="flex shrink-0 items-center">{actions}</div>
    </div>
  );
}
