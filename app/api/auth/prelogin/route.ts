import { createHmac } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { fail, ok, sameOrigin } from "@/lib/server/guard";

const Body = z.strictObject({ email: z.email().max(254) });
const DEFAULT = { memKiB: 65536, iters: 3, par: 1 };

// shortcut: prelogin is not rate limited; it is cheap and leaks nothing (unknown emails get a fake salt). Add if abused.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "Invalid request");
  const email = body.data.email.toLowerCase();

  const db = await getDb();
  const user = await db.collection("users").findOne({ email });
  const vault = user && (await db.collection("vaults").findOne({ userId: user._id }));
  if (vault) {
    const { salt, memKiB, iters, par } = vault.kdf;
    return ok({ salt: salt.buffer.toString("base64"), kdf: { memKiB, iters, par } });
  }
  // Unknown email: deterministic fake salt so the response doesn't reveal whether the account exists.
  const salt = createHmac("sha256", process.env.PRELOGIN_HMAC_KEY!).update(email).digest().subarray(0, 16);
  return ok({ salt: salt.toString("base64"), kdf: DEFAULT });
}
