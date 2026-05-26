import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PricingTier = {
  name: string;
  price: string;
  priceUnit: string;
  subhead: string;
  features: string[];
  popular?: boolean;
};

const TIERS: PricingTier[] = [
  {
    name: "Starter",
    price: "$3",
    priceUnit: "/ unit / month",
    subhead: "Up to 100 units",
    features: [
      "Tenant portal + maintenance + work orders",
      "Communications hub + reporting",
      "Document storage + inspections",
      "AI suggestions",
    ],
  },
  {
    name: "Growth",
    price: "$5",
    priceUnit: "/ unit / month",
    subhead: "Up to 1,000 units",
    popular: true,
    features: [
      "Everything in Starter",
      "AI maintenance triage + summaries",
      "Vendor portal + leasing CRM",
      "Owner portal + workflow automation",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceUnit: "",
    subhead: "1,000+ units",
    features: [
      "Everything in Growth",
      "Investor portal + portfolio reporting",
      "API access + SSO + custom integrations",
      "AI automation approvals",
      "White-glove onboarding",
    ],
  },
];

export function PricingTeaser() {
  return (
    <section
      id="pricing-teaser"
      className="border-y bg-muted/40 px-4 py-24 sm:px-6 lg:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Pricing built for operators.
          </h2>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="size-3.5" />
            Founding partners: 25-35% off, locked for 24 months. Limited spots.
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <Card
              key={tier.name}
              className={
                tier.popular
                  ? "h-full border-primary shadow-md ring-1 ring-primary"
                  : "h-full"
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  {tier.popular ? <Badge>Most popular</Badge> : null}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">
                    {tier.price}
                  </span>
                  {tier.priceUnit ? (
                    <span className="text-sm text-muted-foreground">
                      {tier.priceUnit}
                    </span>
                  ) : null}
                </div>
                <CardDescription>{tier.subhead}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-10 text-center text-sm text-muted-foreground">
          <Link
            href="/pricing"
            className="underline underline-offset-4 hover:text-foreground"
          >
            See full pricing →
          </Link>
        </div>
      </div>
    </section>
  );
}
