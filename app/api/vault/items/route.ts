import { MongoServerError } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { audit, fail, ok, sameOrigin } from "@/lib/server/guard";
import { getSession } from "@/lib/server/session";
import { itemBlobSchema } from "@/lib/server/vault";

const Create = z.strictObject({ id: z.uuid(), overview: itemBlobSchema, secret: itemBlobSchema });

/** All overview blobs (ciphertext). Secrets are fetched one at a time on reveal. */
export async function GET() {
  const s = await getSession();
  if (!s) return fail(401, "Unauthorized");
  const docs = await (await getDb())
    .collection("items")
    .find({ userId: s.userId, deletedAt: { $exists: false } }, { projection: { secret: 0 } })
    .sort({ updatedAt: -1 })
    .toArray();
  return ok({
    items: docs.map((d) => ({ id: d._id, rev: d.rev, updatedAt: d.updatedAt, overview: d.overview.buffer.toString("base64") })),
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const s = await getSession();
  if (!s) return fail(401, "Unauthorized");
  const body = Create.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "Invalid request");
  const now = new Date();
  try {
    await (await getDb())
      .collection("items")
      .insertOne({ _id: body.data.id as never, userId: s.userId, overview: body.data.overview, secret: body.data.secret, rev: 1, createdAt: now, updatedAt: now });
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000) return fail(409, "Conflict");
    throw e;
  }
  await audit("secret.created", true, req, s.userId, { itemId: body.data.id });
  return ok({ rev: 1, updatedAt: now });
}
