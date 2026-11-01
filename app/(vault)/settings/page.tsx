import { AutolockSetting } from "@/components/vault/autolock-setting";
import { PageShell } from "@/components/vault/page-shell";
import { QuestionsForm } from "@/components/vault/questions-form";

export default function Page() {
  return (
    <PageShell title="Security settings" subtitle="Auto-lock and account recovery.">
      <div className="flex flex-col gap-4">
        <AutolockSetting />
        <QuestionsForm />
      </div>
    </PageShell>
  );
}
