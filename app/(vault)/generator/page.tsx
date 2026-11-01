import { Generator } from "@/components/vault/generator";
import { PageShell } from "@/components/vault/page-shell";

export default function Page() {
  return (
    <PageShell title="Password generator" subtitle="Cryptographically secure, generated in your browser.">
      <Generator />
    </PageShell>
  );
}
