import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { VendorInvoicesView } from "@/components/vendor-portal/vendor-invoices-view";
import type { InvoiceWorkOrderOption } from "@/components/vendor-portal/vendor-invoice-form-sheet";
import { getSessionContext } from "@/lib/auth/session";
import {
  listVendorInvoices,
  listVendorWorkOrders,
} from "@/lib/data/vendor-portal";

export const metadata: Metadata = { title: "Invoices" };

export default async function VendorInvoicesPage() {
  const context = await getSessionContext();
  if (!context?.vendorId) return null;

  const [invoices, workOrders] = await Promise.all([
    listVendorInvoices(context.vendorId),
    listVendorWorkOrders(context.vendorId),
  ]);

  const workOrderOptions: InvoiceWorkOrderOption[] = workOrders.map((w) => ({
    id: w.id,
    label: w.number ? `${w.number} · ${w.title}` : w.title,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Submit and track invoices for the property-management team."
      />
      <VendorInvoicesView
        invoices={invoices}
        workOrders={workOrderOptions}
      />
    </div>
  );
}
