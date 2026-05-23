import type { Metadata } from "next";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import { LEASE_STATUS_META } from "@/lib/constants";
import { getTenantSelf } from "@/lib/data/tenant-self";

export const metadata: Metadata = { title: "Welcome" };

function formatRent(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function WelcomePage() {
  const context = await getSessionContext();
  if (!context) return null;

  const self = await getTenantSelf(context.authUserId);

  if (!self) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-2xl font-semibold">Your portal isn't set up yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn't linked to a tenant record. Contact your property
          manager so they can finish setting up your access.
        </p>
      </div>
    );
  }

  const { tenant, unit, property, lease } = self;
  const greetingName = tenant.first_name;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {greetingName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's a snapshot of your residence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your residence</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Tenant</dt>
            <dd>
              {tenant.first_name} {tenant.last_name}
            </dd>
            <dt className="text-muted-foreground">Property</dt>
            <dd>{property?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Unit</dt>
            <dd>{unit?.unit_number ?? "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your lease</CardTitle>
        </CardHeader>
        <CardContent>
          {lease ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge tone={LEASE_STATUS_META[lease.status].tone}>
                  {LEASE_STATUS_META[lease.status].label}
                </StatusBadge>
              </dd>
              <dt className="text-muted-foreground">Start date</dt>
              <dd>{lease.start_date}</dd>
              <dt className="text-muted-foreground">End date</dt>
              <dd>{lease.end_date ?? "—"}</dd>
              <dt className="text-muted-foreground">Monthly rent</dt>
              <dd>{formatRent(lease.monthly_rent)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              No lease is on file for you yet. Your property manager will link
              one shortly.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
