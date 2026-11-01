import "server-only";
import { hash, verify } from "@node-rs/argon2";
import type { ObjectId } from "mongodb";
import { getDb } from "./db";

/** CSRF defence for state-changing requests: exact Origin match + custom header (forces a CORS preflight). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || req.headers.get("x-mv-csrf") !== "1") return false;
  try {
    // Either the configured production origin, or the host this request was actually sent to (so localhost dev works
    // with the production APP_URL). A cross-site page can't forge its Origin header, so it can't match either.
    return origin === new URL(process.env.APP_URL!).origin || new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

// shortcut: trusts x-forwarded-for, which is spoofable unless a proxy overwrites it; the per-account throttle still holds.
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

/** Never pass secret values here: meta is for ids/counts only. */
export async function audit(event: string, success: boolean, req: Request, userId?: ObjectId, meta?: Record<string, unknown>) {
  await (await getDb()).collection("auditLogs").insertOne({
    userId: userId ?? null,
    event,
    success,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
    meta: meta ?? null,
    createdAt: new Date(),
  });
}

// authKeys are already 256-bit random, so server-side hashing only needs to be non-reversible.
export const hashKey = (b64: string) => hash(b64, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyKey = (stored: string, b64: string) => verify(stored, b64).catch(() => false);
/** Verified against when the account is unknown so response time doesn't reveal whether it exists. */
export const dummyHash = hashKey("dummy");

const json = (body: unknown, status: number, headers?: HeadersInit) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
export const fail = (status: number, error: string, headers?: HeadersInit) => json({ error }, status, headers);
export const ok = (body: unknown) => json(body, 200);
