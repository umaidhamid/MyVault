import Link from "next/link";
import { PageShell } from "@/components/vault/page-shell";
import { DashboardStats } from "@/components/vault/dashboard-stats";
import { UnlockGate } from "@/components/vault/unlock-gate";
import { card } from "@/components/ui/styles";
import { getDb } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";

async function Account() {
  const { userId, email } = await requireUser();
  const vault = await (await getDb()).collection("vaults").findOne({ userId }, { projection: { "qa.questionIds": 1 } });
  return (
    <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
      <p className="text-sm text-slate-500">Signed in as <b className="text-slate-900">{email}</b></p>
      {vault?.qa ? (
        <p className="text-sm text-emerald-600">Recovery questions are set</p>
      ) : (
        <p className="text-sm text-amber-700">
          No recovery questions. <Link href="/settings" className="underline">Add them</Link> so a forgotten password isn&apos;t fatal.
        </p>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <PageShell title="Dashboard" subtitle="Counts and warnings only. No secret is ever shown here.">
      <div className="flex flex-col gap-4">
        <Account />
        <UnlockGate>
          <DashboardStats />
        </UnlockGate>
      </div>
    </PageShell>
  );
}
