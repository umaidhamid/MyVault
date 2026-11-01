import { PageShell } from "@/components/vault/page-shell";
import { card } from "@/components/ui/styles";
import { getDb } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";

const NAMES: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  "secret.created": "Item created",
  "secret.updated": "Item updated",
  "secret.deleted": "Item deleted",
  "recover.answers": "Recovery answers checked",
  "recover.reset": "Password reset via recovery",
  "recover.questions.set": "Recovery questions changed",
};

async function Events() {
  const { userId } = await requireUser();
  const rows = await (await getDb()).collection("auditLogs").find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();
  if (!rows.length) return <p className={`${card} text-sm text-slate-500`}>No events yet.</p>;
  return (
    <div className={`${card} overflow-x-auto !p-0`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-4 py-3">When (UTC)</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">IP</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={String(r._id)}>
              <td className="whitespace-nowrap px-4 py-2 text-slate-500">{r.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
              <td className="px-4 py-2 font-medium">{NAMES[r.event] ?? r.event}</td>
              <td className={`px-4 py-2 ${r.success ? "text-emerald-600" : "text-red-600"}`}>{r.success ? "Success" : "Failed"}</td>
              <td className="px-4 py-2 text-slate-500">{r.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  return (
    <PageShell title="Audit log" subtitle="Server-side events for your account. Secret values are never logged. Kept 90 days.">
      <Events />
    </PageShell>
  );
}
