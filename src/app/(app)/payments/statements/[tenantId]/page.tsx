import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatementView } from "@/components/payments/statements/statement-view";
import { getSessionContext } from "@/lib/auth/session";
import { getTenantStatement } from "@/lib/data/tenant-statement";

export const metadata: Metadata = { title: "Statement" };

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const first = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
  return {
    from: first.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function isValidDate(s: string | undefined): boolean {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

export default async function StatementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [{ tenantId }, sp] = await Promise.all([params, searchParams]);
  const context = await getSessionContext();
  if (!context) return null;

  const defaults = defaultRange();
  const from = isValidDate(sp.from) ? sp.from! : defaults.from;
  const to = isValidDate(sp.to) ? sp.to! : defaults.to;

  const statement = await getTenantStatement(
    tenantId,
    context.organization.id,
    from,
    to,
  );
  if (!statement) notFound();

  const generatedBy =
    context.profile.full_name?.trim() || context.email || "Staff";
  const orgName = context.organization.name;

  return (
    <>
      {/* @page is the Tailwind-can't-express exception — half-inch margins for letter-size print. */}
      <style>{`@page { margin: 0.5in; }`}</style>
      <StatementView
        statement={statement}
        generatedBy={generatedBy}
        orgName={orgName}
      />
    </>
  );
}
