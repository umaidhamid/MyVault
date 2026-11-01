import { Sidebar } from "@/components/vault/sidebar";
import { Toaster } from "@/components/ui/toast";

// Static shell only: the session is checked per page (PageShell) and per API route, not here.
export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
