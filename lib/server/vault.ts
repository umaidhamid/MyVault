import "server-only";
import { Binary, type Document, type ObjectId } from "mongodb";
import { z } from "zod";
import { RECOVERY_QUESTIONS } from "@/lib/crypto/kdf";

/** Key envelope the browser needs to unlock. Ciphertext and public KDF parameters only. */
export function material(userId: ObjectId, vault: Document) {
  const { salt, memKiB, iters, par } = vault.kdf;
  return {
    userId: userId.toHexString(),
    wrappedVk: vault.wrappedVk.buffer.toString("base64"),
    salt: salt.buffer.toString("base64"),
    kdf: { memKiB, iters, par },
  };
}

export const authKeySchema = z.base64().length(44); // base64 of 32 bytes
export const saltSchema = z.base64().length(24); // base64 of 16 bytes
export const kdfSchema = z.strictObject({
  memKiB: z.int().min(19456).max(1 << 20),
  iters: z.int().min(2).max(20),
  par: z.int().min(1).max(8),
});
// Envelope v1: suite byte 1, 12 B IV, at least one 256 B padded block plus the 16 B tag.
const envelope = (maxBytes: number) =>
  z
    .base64()
    .max(Math.ceil((maxBytes * 4) / 3) + 4)
    .transform((s) => Buffer.from(s, "base64"))
    .refine((b) => b[0] === 1 && b.length >= 285 && b.length <= maxBytes, "Bad envelope")
    .transform((b) => new Binary(b));
export const envelopeSchema = envelope(1536);
export const itemBlobSchema = envelope(64 * 1024);
export const questionIdsSchema = z
  .array(z.int().min(0).max(RECOVERY_QUESTIONS.length - 1))
  .length(3)
  .refine((a) => new Set(a).size === 3, "Pick three different questions");
