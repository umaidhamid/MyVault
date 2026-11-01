// Re-derives keys from the password and unwraps the stored vault key (what the browser will do on login/unlock).
import { MongoClient } from "mongodb";
import { deriveKeys } from "../lib/crypto/kdf.ts";
import { open } from "../lib/crypto/envelope.ts";

const client = await new MongoClient(process.env.MONGODB_URI!).connect();
try {
  const db = client.db(process.env.MONGODB_DB);
  const user = await db.collection("users").findOne({ email: process.env.SEED_EMAIL!.toLowerCase() });
  const vault = await db.collection("vaults").findOne({ userId: user!._id });
  const { kek } = await deriveKeys(process.env.SEED_PASSWORD!, vault!.kdf.salt.buffer, vault!.kdf);
  const vk = await open(kek, vault!.wrappedVk.buffer, `mv1|vk|${user!._id.toHexString()}`);
  console.log("unwrap ok, VK bytes:", vk.length);
} finally {
  await client.close();
}
