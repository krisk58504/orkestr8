import type { Metadata } from "next";
import { StatementPicker } from "@/components/payments/statements/statement-picker";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listTenants } from "@/lib/data/tenants";

export const metadata: Metadata = { title: "Statements" };

export default async function StatementsPickerPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const tenants = await listTenants(context.organization.id);

  // Slim shape for the client picker — full TenantRow is heavy and the
  // picker only needs id + display name + email.
  const tenantOptions = tenants.map((t) => ({
    id: t.id,
    name: `${t.first_name} ${t.last_name}`.trim(),
    email: t.email,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statements"
        description="Pick a tenant and a date range to generate a printable statement."
      />
      <StatementPicker tenants={tenantOptions} />
    </div>
  );
}
