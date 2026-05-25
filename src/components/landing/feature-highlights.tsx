import { BarChart3, Building2, Truck, Wrench, type LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: Wrench,
    title: "Maintenance triage",
    body: "AI reads every incoming maintenance request and suggests priority + category. Staff confirms in one click.",
  },
  {
    icon: Building2,
    title: "Property summaries",
    body: "AI explains each property's last 30 days to owners and investors — occupancy, maintenance, payments, lease activity.",
  },
  {
    icon: BarChart3,
    title: "Report insights",
    body: "AI surfaces trends and anomalies across rent roll, occupancy, maintenance, leasing, and vendor reports.",
  },
  {
    icon: Truck,
    title: "Vendor suggestions",
    body: "AI ranks vendors for each maintenance request — trade match, recent performance, ratings.",
  },
];

export function FeatureHighlights() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            AI where it earns its keep.
          </h2>
          <p className="mt-4 text-balance text-muted-foreground">
            Four shipped surfaces — built on Claude Sonnet, gated by SPEC&apos;s
            AI safety controls, every call logged and rate-limited.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="h-full">
                <CardHeader>
                  <div className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription className="text-base">
                    {feature.body}
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
