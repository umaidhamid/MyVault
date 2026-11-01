// Creates the first account exactly as the browser will: the password never leaves this process
// except as derived keys. Usage: SEED_EMAIL=.. SEED_PASSWORD=.. node --env-file=.env scripts/seed-admin.ts
import { randomBytes } from "node:crypto";
import { Binary, MongoClient, ObjectId } from "mongodb";
import { hash } from "@node-rs/argon2";
import { DEFAULT_KDF, deriveKeys, deriveRecoveryKeys } from "../lib/crypto/kdf.ts";
import { seal } from "../lib/crypto/envelope.ts";


const email = process.env.SEED_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_PASSWORD;
if (!email || !password || !process.env.MONGODB_URI) throw new Error("SEED_EMAIL, SEED_PASSWORD, MONGODB_URI required");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32 = (b: Uint8Array) => {
  let bits = 0, v = 0, s = "";
  for (const x of b) for (v = (v << 8) | x, bits += 8; bits >= 5; bits -= 5) s += B32[(v >>> (bits - 5)) & 31];
  return s.match(/.{1,4}/g)!.join("-");
};
const bin = (u: Uint8Array) => new Binary(Buffer.from(u));
// authKey is already 256-bit random, so server hashing only needs to be non-reversible; argon2id anyway.
const hashAuth = (k: Uint8Array) => hash(Buffer.from(k).toString("base64"), { memoryCost: 19456, timeCost: 2, parallelism: 1 });

const userId = new ObjectId();
const salt = randomBytes(16);
const vk = randomBytes(32);
const rk = randomBytes(20);
const { authKey, kek } = await deriveKeys(password, salt, DEFAULT_KDF);
const rec = deriveRecoveryKeys(rk);
const ctx = `mv1|vk|${userId.toHexString()}`;

const client = await new MongoClient(process.env.MONGODB_URI).connect();
try {
  const db = client.db(process.env.MONGODB_DB ?? "myvault");
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("vaults").createIndex({ userId: 1 }, { unique: true });
  if (await db.collection("users").findOne({ email })) throw new Error(`${email} already exists`);
  const now = new Date();
  await db.collection("users").insertOne({ _id: userId, email, authHash: await hashAuth(authKey), createdAt: now });
  await db.collection("vaults").insertOne({
    userId,
    kdf: { algo: "argon2id", salt: bin(salt), ...DEFAULT_KDF },
    wrappedVk: bin(await seal(kek, vk, ctx)),
    recoveryWrappedVk: bin(await seal(rec.kek, vk, ctx)),
    recoveryAuthHash: await hashAuth(rec.authKey),
    keyVersion: 1,
    updatedAt: now,
  });
  console.log(`Created ${email} (${userId}).\nRECOVERY KEY (shown once, store offline): ${base32(rk)}`);
} finally {
  await client.close();
}
