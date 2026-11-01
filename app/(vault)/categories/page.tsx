import { CategoriesView } from "@/components/vault/categories-view";
import { PageShell } from "@/components/vault/page-shell";
import { UnlockGate } from "@/components/vault/unlock-gate";

export default function Page() {
  return (
    <PageShell title="Categories" subtitle="Email, social media, banking, servers and more.">
      <UnlockGate>
        <CategoriesView />
      </UnlockGate>
    </PageShell>
  );
}
