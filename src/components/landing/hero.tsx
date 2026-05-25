import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Property management software that thinks alongside you.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
          Orkestr8 brings AI to the operational moments that matter — triaging
          maintenance, summarizing properties for owners, surfacing trends in
          your reports, suggesting the right vendor for the job.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Button size="lg" render={<Link href="/login" />}>
            Sign in
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
