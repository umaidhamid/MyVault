import { audit, fail, ok, sameOrigin } from "@/lib/server/guard";
import { destroySession, getSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const s = await getSession();
  await destroySession();
  if (s) await audit("logout", true, req, s.userId);
  return ok({});
}
