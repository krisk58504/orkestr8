import type { Metadata } from "next";
import { PortfolioView } from "@/components/owner-portal/portfolio-view";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listOwnerPortfolio } from "@/lib/data/owner-portal";

export const metadata: Metadata = { title: "Owner Portal" };

export default async function OwnerPortalPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const portfolio = await listOwnerPortfolio(
    context.authUserId,
    context.organization.id,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Properties linked to your ownership."
      />
      <PortfolioView portfolio={portfolio} />
    </div>
  );
}
