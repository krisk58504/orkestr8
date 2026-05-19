import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VendorDetailSections } from "@/components/vendors/vendor-detail-sections";
import { getSessionContext } from "@/lib/auth/session";
import { isManager } from "@/lib/auth/roles";
import { VENDOR_STATUS_META } from "@/lib/constants";
import { getVendorDetail } from "@/lib/data/vendors";

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getSessionContext();
  if (!context) return null;

  const detail = await getVendorDetail(context.organization.id, id);
  if (!detail) notFound();

  const { vendor, contacts, documents, invoices, ratings } = detail;
  const canManage = isManager(context.roles);
  const statusMeta = VENDOR_STATUS_META[vendor.status];

  const addressParts = [
    vendor.address_line1,
    [vendor.city, vendor.state].filter(Boolean).join(", "),
    vendor.postal_code,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link href="/vendors" />}
        >
          <ArrowLeft className="size-4" />
          Vendors
        </Button>
        <PageHeader
          title={vendor.name}
          description={vendor.trade ?? "Vendor"}
        >
          <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
        </PageHeader>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Trade</p>
            <p>{vendor.trade ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Rating</p>
            <p>
              {vendor.rating_avg != null ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  {vendor.rating_avg.toFixed(1)} ({vendor.rating_count}{" "}
                  {vendor.rating_count === 1 ? "review" : "reviews"})
                </span>
              ) : (
                "No ratings yet"
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p>{vendor.email ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p>{vendor.phone ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Website</p>
            <p>{vendor.website ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Address</p>
            <p>{addressParts.length ? addressParts.join(", ") : "Not set"}</p>
          </div>
          {vendor.notes ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{vendor.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <VendorDetailSections
        vendorId={vendor.id}
        contacts={contacts}
        documents={documents}
        invoices={invoices}
        ratings={ratings}
        canManage={canManage}
      />
    </div>
  );
}
