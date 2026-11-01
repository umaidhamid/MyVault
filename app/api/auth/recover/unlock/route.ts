import { z } from "zod";
import { fail, ok, sameOrigin } from "@/lib/server/guard";
import { checkAnswers } from "@/lib/server/recovery";
import { authKeySchema } from "@/lib/server/vault";

const Body = z.strictObject({ email: z.email().max(254), answersAuthKey: authKeySchema });

/** Proves the answers, then hands back the answer-wrapped vault key (still encrypted). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Forbidden");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "Invalid request");
  const r = await checkAnswers(req, body.data.email.toLowerCase(), body.data.answersAuthKey);
  if (r instanceof Response) return r;
  return ok({ userId: r.user._id.toHexString(), wrappedVk: r.vault.qa.wrappedVk.buffer.toString("base64") });
}
