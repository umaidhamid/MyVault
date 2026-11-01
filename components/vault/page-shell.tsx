import { Suspense } from "react";
import { requireUser } from "@/lib/server/session";

// Every vault page renders through this, so no page can forget the session check.
async function Guard({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

export function PageShell({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <Guard>{children}</Guard>
      </Suspense>
    </section>
  );
}
