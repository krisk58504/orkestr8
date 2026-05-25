import type { Metadata } from "next";
import { TenantRentView } from "@/components/portal/tenant-rent-view";
import { getSessionContext } from "@/lib/auth/session";
import { getTenantSelf } from "@/lib/data/tenant-self";
import { getTenantRentLedger } from "@/lib/data/tenant-rent";

export const metadata: Metadata = { title: "Rent" };

export default async function PortalRentPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const self = await getTenantSelf(context.authUserId);

  if (!self) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-2xl font-semibold">Your portal isn&apos;t set up yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn&apos;t linked to a tenant record. Contact your property
          manager so they can finish setting up your access.
        </p>
      </div>
    );
  }

  const ledger = await getTenantRentLedger(
    self.tenant.id,
    context.organization.id,
  );

  return <TenantRentView self={self} ledger={ledger} />;
}
