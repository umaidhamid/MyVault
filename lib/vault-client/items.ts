import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { fromB64, toB64 } from "@/lib/crypto/kdf";
import { open, seal } from "@/lib/crypto/envelope";
import { strengthBits } from "@/lib/crypto/generator";

export type Field = { label: string; value: string; secret: boolean };
export type Draft = { title: string; category: string; favorite: boolean; fields: Field[]; notes: string };
/** Searchable half. Decrypted on unlock; contains no secret values. */
export type Overview = {
  title: string;
  category: string;
  favorite: boolean;
  fields: { label: string; value: string }[];
  hasNotes: boolean;
  /** Labels of the secret fields (same order as the secret blob), so the UI can show masked rows before any decryption. */
  secretLabels: string[];
  /** Password fingerprint (keyed HMAC), strength and age, so warnings never need the secret blob. */
  pw?: { fp: string; bits: number; at: string };
  createdAt: string;
};
/** Sensitive half. Decrypted only when the user reveals, copies or edits. */
export type SecretData = { fields: { label: string; value: string }[]; notes: string };

const enc = new TextEncoder();
const dec = new TextDecoder();
const ctx = (userId: string, id: string, part: "overview" | "secret") => `mv1|item|${userId}|${id}|${part}`;
const json = (v: unknown) => enc.encode(JSON.stringify(v));

export async function encryptItem(vk: Uint8Array, userId: string, id: string, d: Draft, prev?: Overview) {
  const kept = d.fields.filter((f) => f.label.trim() || f.value);
  const secrets = kept.filter((f) => f.secret).map(({ label, value }) => ({ label, value }));
  const password = kept.find((f) => f.secret && /pass/i.test(f.label) && f.value);

  let pw: Overview["pw"];
  if (password) {
    const fp = toB64(hmac(sha256, hkdf(sha256, vk, undefined, enc.encode("myvault/v1/fingerprint"), 32), enc.encode(password.value)).slice(0, 16));
    pw = { fp, bits: strengthBits(password.value), at: prev?.pw?.fp === fp ? prev.pw.at : new Date().toISOString() };
  }
  const overview: Overview = {
    title: d.title.trim(),
    category: d.category,
    favorite: d.favorite,
    fields: kept.filter((f) => !f.secret).map(({ label, value }) => ({ label, value })),
    hasNotes: d.notes.trim().length > 0,
    secretLabels: secrets.map((f) => f.label),
    pw,
    createdAt: prev?.createdAt ?? new Date().toISOString(),
  };
  const secret: SecretData = { fields: secrets, notes: d.notes };
  return {
    overview,
    overviewB64: toB64(await seal(vk, json(overview), ctx(userId, id, "overview"))),
    secretB64: toB64(await seal(vk, json(secret), ctx(userId, id, "secret"))),
  };
}

export async function decryptOverview(vk: Uint8Array, userId: string, id: string, b64: string): Promise<Overview> {
  return JSON.parse(dec.decode(await open(vk, fromB64(b64), ctx(userId, id, "overview"))));
}

export async function decryptSecret(vk: Uint8Array, userId: string, id: string, b64: string): Promise<SecretData> {
  return JSON.parse(dec.decode(await open(vk, fromB64(b64), ctx(userId, id, "secret"))));
}

/** Rebuilds the editable form model from both halves. */
export const toDraft = (o: Overview, s: SecretData): Draft => ({
  title: o.title,
  category: o.category,
  favorite: o.favorite,
  notes: s.notes,
  fields: [...o.fields.map((f) => ({ ...f, secret: false })), ...s.fields.map((f) => ({ ...f, secret: true }))],
});
