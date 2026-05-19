import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { VendorDocumentsView } from "@/components/vendor-portal/vendor-documents-view";
import { getSessionContext } from "@/lib/auth/session";
import { listVendorDocuments } from "@/lib/data/vendor-portal";

export const metadata: Metadata = { title: "Documents" };

export default async function VendorDocumentsPage() {
  const context = await getSessionContext();
  if (!context?.vendorId) return null;

  const documents = await listVendorDocuments(context.vendorId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Insurance, licenses, and compliance documents for your company."
      />
      <VendorDocumentsView documents={documents} />
    </div>
  );
}
