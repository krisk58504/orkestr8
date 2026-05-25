import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building, DoorOpen } from "lucide-react";
import { PropertyOwnersSection } from "@/components/properties/property-owners-section";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { isManager } from "@/lib/auth/roles";
import {
  listEligibleOwnerCandidates,
  listPropertyOwners,
} from "@/lib/data/property-owners";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSessionContext } from "@/lib/auth/session";
import {
  BUILDING_STATUS_META,
  OCCUPIED_UNIT_STATUSES,
  PROPERTY_TYPE_LABELS,
  UNIT_STATUS_META,
} from "@/lib/constants";
import { getProperty } from "@/lib/data/properties";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getSessionContext();
  if (!context) return null;

  const property = await getProperty(context.organization.id, id);
  if (!property) notFound();

  const canManage = isManager(context.roles);

  const supabase = await createClient();
  const [buildingsResult, unitsResult, owners, eligibleCandidates] =
    await Promise.all([
      supabase
        .from("buildings")
        .select("*")
        .eq("organization_id", context.organization.id)
        .eq("property_id", id)
        .order("name"),
      supabase
        .from("units")
        .select("*")
        .eq("organization_id", context.organization.id)
        .eq("property_id", id)
        .order("unit_number"),
      listPropertyOwners(context.organization.id, id),
      canManage
        ? listEligibleOwnerCandidates(context.organization.id)
        : Promise.resolve(
            [] as { id: string; full_name: string | null; email: string }[],
          ),
    ]);
  const buildings = buildingsResult.data ?? [];
  const units = unitsResult.data ?? [];
  const occupied = units.filter((u) =>
    OCCUPIED_UNIT_STATUSES.includes(u.status),
  ).length;
  const occupancy =
    units.length > 0 ? Math.round((occupied / units.length) * 100) : 0;

  const addressParts = [
    property.address_line1,
    property.address_line2,
    [property.city, property.state].filter(Boolean).join(", "),
    property.postal_code,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link href="/properties" />}
        >
          <ArrowLeft className="size-4" />
          Properties
        </Button>
        <PageHeader
          title={property.name}
          description={`${PROPERTY_TYPE_LABELS[property.property_type]}${
            property.city ? ` · ${property.city}` : ""
          }`}
        >
          <StatusBadge tone={property.is_active ? "success" : "neutral"}>
            {property.is_active ? "Active" : "Inactive"}
          </StatusBadge>
        </PageHeader>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Units" value={units.length} icon={DoorOpen} />
        <StatCard
          label="Occupancy"
          value={`${occupancy}%`}
          icon={DoorOpen}
          hint={`${occupied} of ${units.length} occupied`}
        />
        <StatCard label="Buildings" value={buildings.length} icon={Building} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Address</p>
            <p>{addressParts.length ? addressParts.join(", ") : "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Year built</p>
            <p>{property.year_built ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Planned units</p>
            <p>{property.planned_units}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Type</p>
            <p>{PROPERTY_TYPE_LABELS[property.property_type]}</p>
          </div>
          {property.description ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap">{property.description}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <PropertyOwnersSection
        propertyId={id}
        propertyName={property.name}
        owners={owners}
        eligibleCandidates={eligibleCandidates}
        canManage={canManage}
      />

      <Card>
        <CardHeader>
          <CardTitle>Buildings</CardTitle>
          <CardDescription>
            Buildings belonging to this property
          </CardDescription>
        </CardHeader>
        <CardContent>
          {buildings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No buildings recorded for this property.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Floors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildings.map((building) => {
                  const meta = BUILDING_STATUS_META[building.status];
                  return (
                    <TableRow key={building.id}>
                      <TableCell className="font-medium">
                        {building.name}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={meta.tone}>
                          {meta.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {building.floors ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
          <CardDescription>All units at this property</CardDescription>
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No units recorded for this property.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Beds</TableHead>
                  <TableHead className="text-right">Baths</TableHead>
                  <TableHead className="text-right">Market rent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => {
                  const meta = UNIT_STATUS_META[unit.status];
                  return (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">
                        {unit.unit_number}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={meta.tone}>
                          {meta.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {unit.bedrooms}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {unit.bathrooms}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {unit.market_rent != null
                          ? `$${unit.market_rent.toLocaleString()}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
