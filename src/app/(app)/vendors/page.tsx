import type { Metadata } from "next";
import { VendorsView } from "@/components/vendors/vendors-view";
import { PageHeader } from "@/components/shared/page-header";
import { isManager } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listVendors } from "@/lib/data/vendors";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const vendors = await listVendors(context.organization.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Every vendor in your directory."
      />
      <VendorsView
        vendors={vendors}
        canManage={isManager(context.roles)}
      />
    </div>
  );
}
