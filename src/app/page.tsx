import { redirect } from "next/navigation";
import { FeatureHighlights } from "@/components/landing/feature-highlights";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { LandingHeader } from "@/components/landing/landing-header";
import { PricingTeaser } from "@/components/landing/pricing-teaser";
import { WhyNow } from "@/components/landing/why-now";
import { getSessionContext } from "@/lib/auth/session";

export default async function LandingPage() {
  // Signed-in users bounce to /dashboard; (app)/layout.tsx then cascades to
  // the correct identity landing for tenant / vendor / investor users.
  const context = await getSessionContext();
  if (context) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex-1">
        <Hero />
        <WhyNow />
        <FeatureHighlights />
        <PricingTeaser />
      </main>
      <Footer />
    </div>
  );
}
