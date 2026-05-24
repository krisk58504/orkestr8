import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MAINTENANCE_CATEGORY_LABELS,
  TENANT_MAINTENANCE_STATUS_META,
} from "@/lib/constants";
import type { TenantMaintenanceRow } from "@/lib/data/tenant-maintenance";

export function TenantMaintenanceCard({
  request,
}: {
  request: TenantMaintenanceRow;
}) {
  const meta = TENANT_MAINTENANCE_STATUS_META[request.status];
  const submitted = request.created_at.slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">{request.title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {MAINTENANCE_CATEGORY_LABELS[request.category]} · Submitted{" "}
            {submitted}
          </p>
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </CardHeader>
      {request.description ? (
        <CardContent>
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {request.description}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
