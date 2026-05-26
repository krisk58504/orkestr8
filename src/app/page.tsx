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

  // Force dark scope on the landing tree only. Tailwind's `dark` variant
  // resolves up the DOM, so wrapping with `dark` here scopes the styling
  // to this subtree without touching the global next-themes ThemeProvider
  // — /login, /signup, /onboarding, and the authenticated app continue to
  // respect the user's system / theme-toggle preference.
  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
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
