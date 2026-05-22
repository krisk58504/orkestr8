import type { Metadata } from "next";
import { LeasesView } from "@/components/leases/leases-view";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listLeases } from "@/lib/data/leases";

export const metadata: Metadata = { title: "Leases" };

export default async function LeasesPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const leases = await listLeases(context.organization.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leases"
        description="Every lease across your portfolio."
      />
      <LeasesView leases={leases} />
    </div>
  );
}
