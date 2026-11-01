import { Suspense } from "react";
import { PageShell } from "@/components/vault/page-shell";
import { UnlockGate } from "@/components/vault/unlock-gate";
import { VaultBrowser } from "@/components/vault/vault-browser";

export default function Page() {
  return (
    <PageShell title="All items" subtitle="Everything here is decrypted on this device only.">
      <UnlockGate>
        {/* useSearchParams (category filter from links) needs its own Suspense boundary */}
        <Suspense>
          <VaultBrowser />
        </Suspense>
      </UnlockGate>
    </PageShell>
  );
}
