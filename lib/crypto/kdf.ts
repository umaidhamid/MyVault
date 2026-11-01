import { argon2idAsync } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export type KdfParams = { memKiB: number; iters: number; par: number };
export const DEFAULT_KDF: KdfParams = { memKiB: 65536, iters: 3, par: 1 };
/** Answers are low-entropy, so they get a more expensive KDF than the password. */
export const ANSWERS_KDF: KdfParams = { memKiB: 65536, iters: 5, par: 1 };

const enc = new TextEncoder();
const sub = (key: Uint8Array, info: string) => hkdf(sha256, key, undefined, enc.encode(info), 32);

// prefix keeps the password's HKDF labels ("myvault/v1/auth", ".../kek") stable: existing accounts depend on them.
async function stretch(secret: string, salt: Uint8Array, p: KdfParams, prefix: string) {
  const master = await argon2idAsync(enc.encode(secret), salt, { m: p.memKiB, t: p.iters, p: p.par, dkLen: 32 });
  const keys = { authKey: sub(master, `myvault/v1/${prefix}auth`), kek: sub(master, `myvault/v1/${prefix}kek`) };
  master.fill(0);
  return keys;
}

/** masterKey -> { authKey (sent to server), kek (wraps the vault key, never sent) } */
export const deriveKeys = (password: string, salt: Uint8Array, p: KdfParams = DEFAULT_KDF) =>
  stretch(password.normalize("NFKC"), salt, p, "");

/** Recovery-question answers (order matters) -> { authKey, kek }. Case and spacing are ignored. */
export const deriveAnswerKeys = (answers: string[], salt: Uint8Array, p: KdfParams = ANSWERS_KDF) =>
  stretch(answers.map((a) => a.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")).join("\n"), salt, p, "qa-");

/** Recovery key (random, high entropy) -> { authKey, kek }; no Argon2 needed. */
export function deriveRecoveryKeys(recoveryKey: Uint8Array) {
  return { authKey: sub(recoveryKey, "myvault/v1/rk-auth"), kek: sub(recoveryKey, "myvault/v1/rk-kek") };
}

/** Reject KDF params from the server that are weak enough to speed up offline guessing. */
export function assertSafeKdf(p: KdfParams) {
  if (p.memKiB < 19456 || p.iters < 2 || p.par < 1 || p.memKiB > 1 << 20 || p.iters > 20 || p.par > 8) throw new Error("Unsafe KDF parameters");
}

export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const RECOVERY_QUESTIONS = [
  "What was the name of your first pet?",
  "In what city did your parents meet?",
  "What was the name of your first school?",
  "What was your childhood nickname?",
  "What was the make of your first vehicle?",
  "What is your oldest cousin's first name?",
  "What was the street you grew up on?",
  "What was your favorite teacher's name?",
] as const;
