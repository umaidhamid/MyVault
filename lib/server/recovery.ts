import "server-only";
import { audit, clientIp, dummyHash, fail, verifyKey } from "./guard";
import { getDb } from "./db";
import { blockedFor, clearFailures, recordFailure } from "./throttle";

/** Throttled check of the recovery-question answers. Returns the account, or an error Response to send back. */
export async function checkAnswers(req: Request, email: string, answersAuthKey: string) {
  const keys = [`recover:ip:${clientIp(req)}`, `recover:acct:${email}`];
  const wait = await blockedFor(keys);
  if (wait > 0) return fail(429, "Too many attempts. Try again later.", { "retry-after": String(wait) });

  const db = await getDb();
  const user = await db.collection("users").findOne({ email });
  const vault = user && (await db.collection("vaults").findOne({ userId: user._id }));
  const valid = await verifyKey(vault?.qa?.authHash ?? (await dummyHash), answersAuthKey);
  if (!user || !vault?.qa || !valid) {
    await Promise.all([...keys.map(recordFailure), audit("recover.answers", false, req, user?._id)]);
    return fail(401, "Incorrect answers");
  }
  await clearFailures(keys[1]);
  return { user, vault, db };
}
