import { Binary } from "mongodb";
import { z } from "zod";
import { audit, fail, hashKey, ok, sameOrigin } from "@/lib/server/guard";
import { checkAnswers } from "@/lib/server/recovery";
import { authKeySchema, envelopeSchema, kdfSchema, saltSchema } from "@/lib/server/vault";

const Body = z.strictObject({
  email: z.email().max(254),
  answersAuthKey: authKeySchema,
  newAuthKey: authKeySchema,
  salt: saltSchema,
  kdf: kdfSchema,
  wrappedVk: envelopeSchema, // the same vault key, wrapped under the new password
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "Invalid request");
  const b = body.data;
  const r = await checkAnswers(req, b.email.toLowerCase(), b.answersAuthKey);
  if (r instanceof Response) return r;

  const authHash = await hashKey(b.newAuthKey);
  const session = r.db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      await r.db.collection("users").updateOne({ _id: r.user._id }, { $set: { authHash } }, { session });
      await r.db.collection("vaults").updateOne(
        { userId: r.user._id },
        { $set: { "kdf.salt": new Binary(Buffer.from(b.salt, "base64")), "kdf.memKiB": b.kdf.memKiB, "kdf.iters": b.kdf.iters, "kdf.par": b.kdf.par, wrappedVk: b.wrappedVk, updatedAt: now } },
        { session },
      );
      await r.db.collection("sessions").updateMany({ userId: r.user._id, revokedAt: null }, { $set: { revokedAt: now } }, { session });
    });
  } finally {
    await session.endSession();
  }
  await audit("recover.reset", true, req, r.user._id);
  return ok({});
}
