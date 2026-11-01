import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { audit, fail, ok, sameOrigin } from "@/lib/server/guard";
import { getSession } from "@/lib/server/session";
import { itemBlobSchema } from "@/lib/server/vault";

type Ctx = { params: Promise<{ id: string }> };
const Update = z.strictObject({ rev: z.int().min(1), overview: itemBlobSchema, secret: itemBlobSchema });

// Every query below filters by the session's userId, never by anything the client says about ownership.
const live = (id: string, userId: unknown) => ({ _id: id as never, userId, deletedAt: { $exists: false } });

export async function GET(_req: Request, { params }: Ctx) {
  const s = await getSession();
  const id = z.uuid().safeParse((await params).id);
  if (!s) return fail(401, "Unauthorized");
  if (!id.success) return fail(404, "Not found");
  const doc = await (await getDb()).collection("items").findOne(live(id.data, s.userId), { projection: { secret: 1, rev: 1 } });
  if (!doc) return fail(404, "Not found");
  return ok({ rev: doc.rev, secret: doc.secret.buffer.toString("base64") });
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const s = await getSession();
  const id = z.uuid().safeParse((await params).id);
  if (!s) return fail(401, "Unauthorized");
  const body = Update.safeParse(await req.json().catch(() => null));
  if (!id.success || !body.success) return fail(400, "Invalid request");
  const now = new Date();
  const r = await (await getDb())
    .collection("items")
    .updateOne({ ...live(id.data, s.userId), rev: body.data.rev }, { $set: { overview: body.data.overview, secret: body.data.secret, updatedAt: now }, $inc: { rev: 1 } });
  if (!r.matchedCount) return fail(409, "This item changed elsewhere. Reload and try again.");
  await audit("secret.updated", true, req, s.userId, { itemId: id.data });
  return ok({ rev: body.data.rev + 1, updatedAt: now });
}

/** Soft delete: the database drops it 30 days later (TTL index). */
export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const s = await getSession();
  const id = z.uuid().safeParse((await params).id);
  if (!s) return fail(401, "Unauthorized");
  if (!id.success) return fail(404, "Not found");
  const r = await (await getDb()).collection("items").updateOne(live(id.data, s.userId), { $set: { deletedAt: new Date() } });
  if (!r.matchedCount) return fail(404, "Not found");
  await audit("secret.deleted", true, req, s.userId, { itemId: id.data });
  return ok({});
}
