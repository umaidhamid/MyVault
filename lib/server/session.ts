import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Binary, type ObjectId } from "mongodb";
import { getDb } from "./db";

export const COOKIE = "__Host-mv_session"; // keep in sync with proxy.ts
const DAY = 86_400_000;
const hashToken = (t: string) => new Binary(createHash("sha256").update(t).digest());

export async function createSession(userId: ObjectId, ip: string, userAgent: string | null) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const db = await getDb();
  await db.collection("sessions").insertOne({
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date(now),
    lastSeenAt: new Date(now),
    expiresAt: new Date(now + 7 * DAY), // idle limit, extended on use (see getSession)
    absoluteExpiresAt: new Date(now + 30 * DAY),
    ip,
    userAgent,
    revokedAt: null,
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: true, // browsers accept Secure cookies on http://localhost
    sameSite: "strict",
    path: "/",
    expires: new Date(now + 30 * DAY),
  });
}

/** Current session + user, or null. The only place a cookie is turned into an identity. */
export const getSession = cache(async () => {
  await connection(); // session state is per-request: never prerender it
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const now = new Date();
  const s = await db
    .collection("sessions")
    .findOne({ tokenHash: hashToken(token), revokedAt: null, expiresAt: { $gt: now }, absoluteExpiresAt: { $gt: now } });
  if (!s) return null;
  const user = await db.collection("users").findOne({ _id: s.userId });
  if (!user) return null;
  if (now.getTime() - s.lastSeenAt.getTime() > 3_600_000) {
    await db.collection("sessions").updateOne({ _id: s._id }, { $set: { lastSeenAt: now, expiresAt: new Date(now.getTime() + 7 * DAY) } });
  }
  return { sessionId: s._id, userId: user._id, email: user.email as string };
});

/** Use at the top of every protected page. API handlers use getSession and answer 401 instead. */
export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function destroySession() {
  const s = await getSession();
  if (s) await (await getDb()).collection("sessions").updateOne({ _id: s.sessionId }, { $set: { revokedAt: new Date() } });
  (await cookies()).delete(COOKIE);
}
