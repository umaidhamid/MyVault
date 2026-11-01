import { createHmac } from "node:crypto";
import { z } from "zod";
import { RECOVERY_QUESTIONS } from "@/lib/crypto/kdf";
import { getDb } from "@/lib/server/db";
import { fail, ok, sameOrigin } from "@/lib/server/guard";

const Body = z.strictObject({ email: z.email().max(254) });

/** Returns the questions to ask. Accounts without questions get stable fake ones, so existence isn't revealed. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "Invalid request");
  const email = body.data.email.toLowerCase();

  const db = await getDb();
  const user = await db.collection("users").findOne({ email });
  const qa = user && (await db.collection("vaults").findOne({ userId: user._id }))?.qa;
  if (qa) {
    const { memKiB, iters, par } = qa.kdf;
    return ok({ questionIds: qa.questionIds, salt: qa.salt.buffer.toString("base64"), kdf: { memKiB, iters, par } });
  }
  const h = createHmac("sha256", process.env.PRELOGIN_HMAC_KEY!).update(`qa|${email}`).digest();
  const ids = [...new Set([...h.subarray(16)].map((x) => x % RECOVERY_QUESTIONS.length))].slice(0, 3);
  for (let i = 0; ids.length < 3; i++) if (!ids.includes(i)) ids.push(i);
  return ok({ questionIds: ids, salt: h.subarray(0, 16).toString("base64"), kdf: { memKiB: 65536, iters: 5, par: 1 } });
}
