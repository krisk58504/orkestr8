"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PaymentsView } from "@/components/payments/payments-view";
import { RentChargesView } from "@/components/payments/rent-charges-view";
import { StatementPicker } from "@/components/payments/statements/statement-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaymentRow } from "@/lib/data/payments";
import type { RentChargeRow } from "@/lib/data/rent-charges";

type LeaseOption = {
  id: string;
  unit_id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: number;
  primary_tenant_id: string | null;
  primary_tenant_name: string | null;
};

type PaymentsTab = "charges" | "payments" | "statements";

export function PaymentsTabs({
  charges,
  payments,
  leases,
  tenants,
  units,
  properties,
  statementTenants,
  canManage,
  initialTab,
}: {
  charges: RentChargeRow[];
  payments: PaymentRow[];
  leases: LeaseOption[];
  tenants: {
    id: string;
    first_name: string;
    last_name: string;
    lease_id: string | null;
  }[];
  units: { id: string; unit_number: string }[];
  properties: { id: string; name: string }[];
  statementTenants: { id: string; name: string; email: string | null }[];
  canManage: boolean;
  initialTab: PaymentsTab;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<PaymentsTab>(initialTab);

  function handleTabChange(value: string) {
    const next: PaymentsTab =
      value === "payments"
        ? "payments"
        : value === "statements"
          ? "statements"
          : "charges";
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "charges") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `/payments?${qs}` : "/payments", { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="charges">Charges</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="statements">Statements</TabsTrigger>
      </TabsList>
      <TabsContent value="charges" className="pt-4">
        <RentChargesView
          charges={charges}
          leases={leases}
          tenants={tenants}
          units={units}
          properties={properties}
          canManage={canManage}
        />
      </TabsContent>
      <TabsContent value="payments" className="pt-4">
        <PaymentsView
          payments={payments}
          charges={charges}
          canManage={canManage}
        />
      </TabsContent>
      <TabsContent value="statements" className="pt-4">
        <StatementPicker tenants={statementTenants} />
      </TabsContent>
    </Tabs>
  );
}
