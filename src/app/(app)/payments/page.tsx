import type { Metadata } from "next";
import { RentChargesView } from "@/components/payments/rent-charges-view";
import { PageHeader } from "@/components/shared/page-header";
import { canWriteTenants } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import {
  listRentChargeFormOptions,
  listRentCharges,
} from "@/lib/data/rent-charges";
import { perfEnd, perfStart } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const supabase = await createClient();
  const perfT = perfStart();
  const [charges, formOptions, propertiesRes] = await Promise.all([
    listRentCharges(context.organization.id),
    listRentChargeFormOptions(context.organization.id),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", context.organization.id)
      .order("name"),
  ]);
  perfEnd("payments.page.data", perfT, "/payments");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Rent charges and the ledger for each lease."
      />
      <RentChargesView
        charges={charges}
        leases={formOptions.leases}
        tenants={formOptions.tenants}
        units={formOptions.units}
        properties={propertiesRes.data ?? []}
        canManage={canWriteTenants(context.roles)}
      />
    </div>
  );
}
