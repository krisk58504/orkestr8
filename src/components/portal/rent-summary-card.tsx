import { Card, CardContent } from "@/components/ui/card";
import type { TenantBalance } from "@/lib/data/tenant-rent";

function formatAmount(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Top-of-tab summary. The headline shape varies with the balance sign:
 *   balance > 0  → "$X due" (the standard outstanding-balance case)
 *   balance == 0 → "$0.00 — All caught up" (no open charges OR fully paid)
 *   balance < 0  → "$X credit" (overpayment absorbed externally per
 *                  §0.5 decision 2 — rare; surfaces clearly so the
 *                  tenant knows they have an unallocated credit)
 *
 * Visual tone uses Card defaults; the headline text picks a tone token
 * (no custom colors) — destructive for "due", muted for "caught up",
 * success accent for "credit".
 */
export function RentSummaryCard({
  balance,
  monthlyRent,
}: {
  balance: TenantBalance;
  monthlyRent: number | null;
}) {
  const owed = balance.balance;

  let headlineText: string;
  let headlineClass: string;
  if (owed > 0) {
    headlineText = `${formatAmount(owed)} due`;
    headlineClass = "text-destructive";
  } else if (owed < 0) {
    headlineText = `${formatAmount(owed)} credit`;
    headlineClass = "text-emerald-600 dark:text-emerald-500";
  } else {
    headlineText = "$0.00 — All caught up";
    headlineClass = "text-muted-foreground";
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-5">
        <div className={`text-2xl font-semibold ${headlineClass}`}>
          {headlineText}
        </div>
        {monthlyRent != null ? (
          <p className="text-sm text-muted-foreground">
            Your monthly rent:{" "}
            <span className="font-medium text-foreground">
              ${monthlyRent.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        ) : null}
        {balance.open_charge_count > 0 ? (
          <p className="text-xs text-muted-foreground">
            Across {balance.open_charge_count} open charge
            {balance.open_charge_count === 1 ? "" : "s"}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
