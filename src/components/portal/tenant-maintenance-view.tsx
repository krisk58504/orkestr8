"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench } from "lucide-react";
import { TenantMaintenanceCard } from "@/components/portal/tenant-maintenance-card";
import { TenantMaintenanceFormSheet } from "@/components/portal/tenant-maintenance-form-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { TenantMaintenanceRow } from "@/lib/data/tenant-maintenance";

export function TenantMaintenanceView({
  requests,
  canSubmit,
}: {
  requests: TenantMaintenanceRow[];
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground">
            Submit a new request or check on the ones you've already sent.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={() => setSheetOpen(true)} disabled={!canSubmit}>
            <Plus className="size-4" />
            New request
          </Button>
          {!canSubmit ? (
            <p className="text-xs text-muted-foreground">
              Your residence isn't set up yet — contact your property manager.
            </p>
          ) : null}
        </div>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No requests yet"
          description={
            canSubmit
              ? "Submit a request when something needs attention."
              : "Once your residence is set up, you can submit your first request here."
          }
          action={
            canSubmit ? (
              <Button onClick={() => setSheetOpen(true)}>
                <Plus className="size-4" />
                New request
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <TenantMaintenanceCard key={r.id} request={r} />
          ))}
        </div>
      )}

      <TenantMaintenanceFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
