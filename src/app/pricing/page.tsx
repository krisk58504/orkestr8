import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Footer } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/landing-header";

export const metadata: Metadata = {
  title: "Pricing — Orkestr8",
  description:
    "Transparent per-unit pricing for property management software that thinks alongside you. Starter, Growth, and Enterprise tiers with add-ons.",
};

type Feature = { label: string; comingSoon?: boolean };

type Tier = {
  name: string;
  unitRange: string;
  price: string;
  priceUnit: string;
  minimum: string;
  tagline: string;
  bestFor: string;
  features: Feature[];
  cta: { label: string; href: string };
  popular?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Starter",
    unitRange: "1–100 units",
    price: "$3",
    priceUnit: "/ unit / month",
    minimum: "$199 / month minimum",
    tagline: "For smaller operators and independent owners.",
    bestFor: "Pilot customers, independent owners, smaller operators.",
    features: [
      { label: "Dashboard" },
      { label: "Properties, buildings & units" },
      { label: "Tenant portal" },
      { label: "Maintenance requests & work orders" },
      { label: "Communications hub & announcements" },
      { label: "Document storage" },
      { label: "Basic reporting" },
      { label: "AI suggestions" },
      { label: "Email support" },
      { label: "Inspections", comingSoon: true },
    ],
    cta: { label: "Start with Starter", href: "/signup" },
  },
  {
    name: "Growth",
    unitRange: "101–1,000 units",
    price: "$5",
    priceUnit: "/ unit / month",
    minimum: "$599 / month minimum",
    tagline: "For mid-market operators and growing portfolios.",
    bestFor: "Third-party PMs, mid-market apartment operators, growing portfolios.",
    popular: true,
    features: [
      { label: "Everything in Starter" },
      { label: "Vendor portal & vendor compliance" },
      { label: "Leasing CRM" },
      { label: "Advanced reporting" },
      { label: "Owner portal" },
      { label: "Workflow automations & custom notifications" },
      { label: "AI maintenance triage" },
      { label: "AI summaries (drafts + suggestions)" },
      { label: "Role-based permissions" },
      { label: "Priority support" },
    ],
    cta: { label: "Start with Growth", href: "/signup" },
  },
  {
    name: "Enterprise",
    unitRange: "1,000+ units",
    price: "Custom",
    priceUnit: "",
    minimum: "Custom contract",
    tagline: "For regional operators and ownership groups.",
    bestFor: "Enterprise portfolios, regional operators, ownership groups.",
    features: [
      { label: "Everything in Growth" },
      { label: "Portfolio reporting & enterprise reporting" },
      { label: "API access" },
      { label: "SSO" },
      { label: "Custom integrations" },
      { label: "Advanced security" },
      { label: "White-glove onboarding" },
      { label: "Dedicated support" },
      { label: "Investor portal", comingSoon: true },
      { label: "AI automation approvals", comingSoon: true },
    ],
    cta: { label: "Contact sales", href: "mailto:hello@orkestr8.ai" },
  },
];

type AddOn = {
  name: string;
  price: string;
  description: string;
  comingSoon?: boolean;
};

const ADD_ONS: AddOn[] = [
  {
    name: "AI Automation Package",
    price: "+$1 / unit / month",
    description:
      "Predictive maintenance, AI leasing assistant, AI reporting, AI workflow recommendations, AI inbox drafting, AI executive summaries.",
    comingSoon: true,
  },
  {
    name: "Premium Vendor Network",
    price: "+$500 / month",
    description:
      "Vendor marketplace, preferred vendor recommendations, vendor performance scoring.",
  },
  {
    name: "Additional Storage",
    price: "+$50 / month per tier",
    description: "Extra document and media storage capacity.",
  },
  {
    name: "Priority Support",
    price: "+$250 / month",
    description:
      "Faster response SLAs and named support contact (included with Growth).",
  },
  {
    name: "Migration / Onboarding",
    price: "$3,000 – $20,000 one-time",
    description: "Guided data migration and team onboarding, sized to portfolio.",
  },
  {
    name: "Custom Integrations",
    price: "Custom quote",
    description: "Bespoke integrations into accounting, CRM, or back-office systems.",
  },
  {
    name: "White Label",
    price: "Enterprise only",
    description: "Branded tenant, owner, and vendor portals under your domain.",
  },
];

function isExternal(href: string) {
  return href.startsWith("mailto:") || href.startsWith("http");
}

function TierCta({ cta }: { cta: Tier["cta"] }) {
  const className = "w-full";
  if (isExternal(cta.href)) {
    return (
      <Button className={className} render={<a href={cta.href} />}>
        {cta.label}
      </Button>
    );
  }
  return (
    <Button className={className} render={<Link href={cta.href} />}>
      {cta.label}
    </Button>
  );
}

export default function PricingPage() {
  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Pricing built for the size you actually are.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
              Per-unit pricing that scales with your portfolio — not your
              contract length. Start small, grow into Growth, graduate to
              Enterprise when it makes sense.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              All prices in USD.
            </p>
          </div>
        </section>

        {/* Tier cards */}
        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
            {TIERS.map((tier) => (
              <Card
                key={tier.name}
                className={
                  tier.popular
                    ? "flex h-full flex-col border-primary ring-1 ring-primary"
                    : "flex h-full flex-col"
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-xl">{tier.name}</CardTitle>
                    {tier.popular ? <Badge>Most popular</Badge> : null}
                  </div>
                  <CardDescription>{tier.unitRange}</CardDescription>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      {tier.price}
                    </span>
                    {tier.priceUnit ? (
                      <span className="text-sm text-muted-foreground">
                        {tier.priceUnit}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tier.minimum}
                  </p>
                  <p className="mt-4 text-sm text-foreground">{tier.tagline}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Best for: {tier.bestFor}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="space-y-2 text-sm">
                    {tier.features.map((feature) => (
                      <li
                        key={feature.label}
                        className="flex items-start gap-2"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>
                          {feature.label}
                          {feature.comingSoon ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (coming soon)
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 pt-2">
                    <TierCta cta={tier.cta} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Add-ons */}
        <section className="border-t bg-muted/20 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Add-ons
              </h2>
              <p className="mt-3 text-muted-foreground">
                Stack on what you need. Most operators start with the base tier
                and layer add-ons as their portfolio grows.
              </p>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-2">
              {ADD_ONS.map((addon) => (
                <div
                  key={addon.name}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-card/50 p-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium text-foreground">
                      {addon.name}
                      {addon.comingSoon ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (coming soon)
                        </span>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-sm font-medium text-primary">
                      {addon.price}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {addon.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Founding Partner callout */}
        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 px-6 py-12 sm:px-12">
              <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="size-3.5" />
                    Founding Partner Program
                  </div>
                  <h2 className="mt-4 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
                    Shape Orkestr8 with us.
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    We&apos;re working with a select group of founding customers
                    to shape Orkestr8. Founding partners receive locked pricing
                    for 24 months, onboarding included, and direct product
                    feedback access. Limited spots available.
                  </p>
                </div>
                <div className="shrink-0">
                  <Button
                    size="lg"
                    render={<a href="mailto:hello@orkestr8.ai" />}
                  >
                    Apply to founding program
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
