import { Binary } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { audit, fail, hashKey, ok, sameOrigin, verifyKey } from "@/lib/server/guard";
import { getSession } from "@/lib/server/session";
import { blockedFor, clearFailures, recordFailure } from "@/lib/server/throttle";
import { authKeySchema, envelopeSchema, kdfSchema, questionIdsSchema, saltSchema } from "@/lib/server/vault";

const Body = z.strictObject({
  authKey: authKeySchema, // current password, re-proved because this adds a second way into the vault
  questionIds: questionIdsSchema,
  salt: saltSchema,
  kdf: kdfSchema,
  wrappedVk: envelopeSchema, // vault key wrapped by a key derived from the answers (never sent)
  answersAuthKey: authKeySchema,
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const s = await getSession();
  if (!s) return fail(401, "Unauthorized");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "Invalid request");
  const b = body.data;

  const key = `reauth:acct:${s.userId.toHexString()}`;
  const wait = await blockedFor([key]);
  if (wait > 0) return fail(429, "Too many attempts. Try again later.", { "retry-after": String(wait) });

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: s.userId });
  if (!user || !(await verifyKey(user.authHash, b.authKey))) {
    await recordFailure(key);
    await audit("recover.questions.set", false, req, s.userId);
    return fail(401, "Incorrect password");
  }
  await clearFailures(key);
  await db.collection("vaults").updateOne(
    { userId: s.userId },
    {
      $set: {
        qa: {
          questionIds: b.questionIds,
          salt: new Binary(Buffer.from(b.salt, "base64")),
          kdf: b.kdf,
          wrappedVk: b.wrappedVk,
          authHash: await hashKey(b.answersAuthKey),
        },
        updatedAt: new Date(),
      },
    },
  );
  await audit("recover.questions.set", true, req, s.userId);
  return ok({});
}

/** Which questions are set (ids only), so settings can show the current state. */
export async function GET() {
  const s = await getSession();
  if (!s) return fail(401, "Unauthorized");
  const vault = await (await getDb()).collection("vaults").findOne({ userId: s.userId }, { projection: { "qa.questionIds": 1 } });
  return ok({ questionIds: (vault?.qa?.questionIds as number[] | undefined) ?? null });
}
