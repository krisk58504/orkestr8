import { OpenChargesSection } from "@/components/portal/open-charges-section";
import { PaymentHistorySection } from "@/components/portal/payment-history-section";
import { RentSummaryCard } from "@/components/portal/rent-summary-card";
import type { TenantSelfRow } from "@/lib/data/tenant-self";
import type { TenantRentLedger } from "@/lib/data/tenant-rent";

export function TenantRentView({
  self,
  ledger,
}: {
  self: TenantSelfRow;
  ledger: TenantRentLedger;
}) {
  const noLease = self.lease === null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rent</h1>
        <p className="text-sm text-muted-foreground">
          What you owe and what you&apos;ve paid.
        </p>
      </div>

      {noLease ? (
        <div className="rounded-md border bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No lease on file yet. Your property manager will link one shortly —
            your rent charges and payments will appear here once they do.
          </p>
        </div>
      ) : (
        <>
          <RentSummaryCard
            balance={ledger.balance}
            monthlyRent={self.lease?.monthly_rent ?? null}
          />
          <OpenChargesSection charges={ledger.openCharges} />
          <PaymentHistorySection payments={ledger.paymentHistory} />
        </>
      )}
    </div>
  );
}
