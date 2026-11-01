import "server-only";
import { getDb } from "./db";

const col = async () => (await getDb()).collection<{ _id: string; count: number; blockedUntil?: Date; expiresAt: Date }>("rateLimits");

/** Seconds until the key may try again, or 0. */
export async function blockedFor(keys: string[]) {
  const docs = await (await col()).find({ _id: { $in: keys } }).toArray();
  const now = Date.now();
  return Math.max(0, ...docs.map((d) => Math.ceil(((d.blockedUntil?.getTime() ?? 0) - now) / 1000)));
}

/** First 5 failures are free, then exponential backoff (2s, 4s, ... capped at 15 min). No hard lockout. */
export async function recordFailure(key: string) {
  const c = await col();
  const d = await c.findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 }, $set: { expiresAt: new Date(Date.now() + 3_600_000) } },
    { upsert: true, returnDocument: "after" },
  );
  if (d && d.count > 5) {
    const wait = Math.min(900, 2 ** (d.count - 5));
    await c.updateOne({ _id: key }, { $set: { blockedUntil: new Date(Date.now() + wait * 1000) } });
  }
}

export async function clearFailures(key: string) {
  await (await col()).deleteOne({ _id: key });
}
