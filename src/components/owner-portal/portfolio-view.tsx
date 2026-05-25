import { Briefcase, Building, DoorOpen } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import type { PortfolioProperty } from "@/lib/data/owner-portal";

function occupancyPct(occupied: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((occupied / total) * 100)}%`;
}

export function PortfolioView({
  portfolio,
}: {
  portfolio: PortfolioProperty[];
}) {
  if (portfolio.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No properties linked yet"
        description="Ask your property manager to grant ownership access. Once linked, you'll see each property's unit count, occupancy, and buildings here."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {portfolio.map((property) => (
        <Card key={property.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{property.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {PROPERTY_TYPE_LABELS[property.property_type]}
              {property.city ? ` · ${property.city}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <DoorOpen className="size-3" />
                  Units
                </div>
                <div className="text-base font-semibold tabular-nums">
                  {property.unit_count}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                <div className="text-xs text-muted-foreground">Occupied</div>
                <div className="text-base font-semibold tabular-nums">
                  {occupancyPct(property.occupied_count, property.unit_count)}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {property.occupied_count} / {property.unit_count}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building className="size-3" />
                  Buildings
                </div>
                <div className="text-base font-semibold tabular-nums">
                  {property.building_count}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
