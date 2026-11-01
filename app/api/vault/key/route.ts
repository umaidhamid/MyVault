import { getDb } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/guard";
import { getSession } from "@/lib/server/session";
import { material } from "@/lib/server/vault";

/** Key envelope for the signed-in user so the browser can unlock without logging in again. Ciphertext only. */
export async function GET() {
  const s = await getSession();
  if (!s) return fail(401, "Unauthorized");
  const vault = await (await getDb()).collection("vaults").findOne({ userId: s.userId });
  if (!vault) return fail(404, "Not found");
  return ok(material(s.userId, vault));
}
