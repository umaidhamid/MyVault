import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { audit, clientIp, dummyHash, fail, ok, sameOrigin, verifyKey } from "@/lib/server/guard";
import { createSession } from "@/lib/server/session";
import { blockedFor, clearFailures, recordFailure } from "@/lib/server/throttle";
import { authKeySchema, material } from "@/lib/server/vault";

const Body = z.strictObject({ email: z.email().max(254), authKey: authKeySchema });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "Invalid request");
  const email = body.data.email.toLowerCase();

  const keys = [`login:ip:${clientIp(req)}`, `login:acct:${email}`];
  const wait = await blockedFor(keys);
  if (wait > 0) return fail(429, "Too many attempts. Try again later.", { "retry-after": String(wait) });

  const db = await getDb();
  const user = await db.collection("users").findOne({ email });
  const valid = await verifyKey(user?.authHash ?? (await dummyHash), body.data.authKey);
  if (!user || !valid) {
    await Promise.all([...keys.map(recordFailure), audit("login", false, req, user?._id)]);
    return fail(401, "Invalid email or password");
  }

  const vault = await db.collection("vaults").findOne({ userId: user._id });
  if (!vault) return fail(500, "Account has no vault");
  await clearFailures(keys[1]);
  await createSession(user._id, clientIp(req), req.headers.get("user-agent"));
  await audit("login", true, req, user._id);
  return ok(material(user._id, vault));
}
