import type { Metadata } from "next";
import { PaymentsTabs } from "@/components/payments/payments-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { canWriteTenants } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listPayments } from "@/lib/data/payments";
import {
  listRentChargeFormOptions,
  listRentCharges,
} from "@/lib/data/rent-charges";
import { listTenants } from "@/lib/data/tenants";
import { perfEnd, perfStart } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) return null;

  const supabase = await createClient();
  const perfT = perfStart();
  const [charges, payments, formOptions, propertiesRes, allTenants] =
    await Promise.all([
      listRentCharges(context.organization.id),
      listPayments(context.organization.id),
      listRentChargeFormOptions(context.organization.id),
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", context.organization.id)
        .order("name"),
      listTenants(context.organization.id),
    ]);
  perfEnd("payments.page.data", perfT, "/payments");

  const params = await searchParams;
  const initialTab: "charges" | "payments" | "statements" =
    params.tab === "payments"
      ? "payments"
      : params.tab === "statements"
        ? "statements"
        : "charges";

  // Slim tenant shape for the statement picker — name + email only.
  const statementTenants = allTenants.map((t) => ({
    id: t.id,
    name: `${t.first_name} ${t.last_name}`.trim(),
    email: t.email,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Rent charges and the ledger for each lease."
      />
      <PaymentsTabs
        charges={charges}
        payments={payments}
        leases={formOptions.leases}
        tenants={formOptions.tenants}
        units={formOptions.units}
        properties={propertiesRes.data ?? []}
        statementTenants={statementTenants}
        canManage={canWriteTenants(context.roles)}
        initialTab={initialTab}
      />
    </div>
  );
}
