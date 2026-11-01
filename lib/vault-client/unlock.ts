import { assertSafeKdf, deriveKeys, fromB64, type KdfParams } from "@/lib/crypto/kdf";
import { open } from "@/lib/crypto/envelope";
import { setVault } from "./keys";

export type Material = { userId: string; wrappedVk: string; salt: string; kdf: KdfParams };

export const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-mv-csrf": "1" }, body: JSON.stringify(body) });

export const vkContext = (userId: string) => `mv1|vk|${userId}`;

/** Unwraps the vault key; an AES-GCM tag failure means the password was wrong. */
export async function openVault(kek: Uint8Array, m: Material) {
  try {
    const vk = await open(kek, fromB64(m.wrappedVk), vkContext(m.userId));
    setVault(vk, m.userId);
    return vk;
  } catch {
    throw new Error("Incorrect password");
  }
}

/** Re-derives keys from the password for an already signed-in user. */
export async function unlockWithPassword(password: string) {
  const res = await fetch("/api/vault/key");
  if (!res.ok) throw new Error("Session expired. Log in again.");
  const material: Material = await res.json();
  assertSafeKdf(material.kdf);
  const { authKey, kek } = await deriveKeys(password, fromB64(material.salt), material.kdf);
  const vk = await openVault(kek, material);
  return { authKey, vk, material };
}
