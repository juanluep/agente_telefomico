import { requireSession } from "../../lib/auth/context";
import { Sidebar } from "../../components/shell/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  return (
    <div className="md:flex">
      <Sidebar businessName={ctx.businessName} />
      <div className="flex-1 min-w-0 md:pl-0">
        <main className="p-4 md:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}