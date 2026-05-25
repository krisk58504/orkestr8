"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileBarChart } from "lucide-react";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/payments/statements/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TenantOption = {
  id: string;
  name: string;
  email: string | null;
};

function defaultRange(): DateRange {
  const today = new Date();
  const first = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
  return {
    from: first.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

export function StatementPicker({ tenants }: { tenants: TenantOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(defaultRange);

  const selectedTenant = tenantId
    ? tenants.find((t) => t.id === tenantId)
    : null;

  const filtered = useMemo(() => {
    if (selectedTenant) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      // No query yet — show the first 10 alphabetically as a starter list.
      return tenants.slice(0, 10);
    }
    return tenants
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, tenants, selectedTenant]);

  function pickTenant(t: TenantOption) {
    setTenantId(t.id);
    setQuery(t.name);
  }

  function clearTenant() {
    setTenantId(null);
    setQuery("");
  }

  function generate() {
    if (!tenantId) return;
    router.push(
      `/payments/statements/${tenantId}?from=${range.from}&to=${range.to}`,
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileBarChart className="size-4" />
          Generate a statement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="tenant_search" className="text-sm font-medium">
            Tenant
          </label>
          <Input
            id="tenant_search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (tenantId) setTenantId(null);
            }}
          />
          {selectedTenant ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{selectedTenant.name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedTenant.email ?? "(no email)"}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearTenant}>
                Change
              </Button>
            </div>
          ) : filtered.length > 0 ? (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => pickTenant(t)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.email ?? "—"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim().length > 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              No tenants match &quot;{query}&quot;.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Period</p>
          <DateRangePicker value={range} onChange={setRange} />
        </div>

        <Button onClick={generate} disabled={!tenantId} className="w-full">
          Generate statement
        </Button>
      </CardContent>
    </Card>
  );
}
