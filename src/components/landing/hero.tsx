import Link from "next/link";
import Image from "next/image";
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

      {/* Hero visual — manager dashboard in a Mac-style browser frame.
          Frame chrome is pure HTML/CSS so screenshot swaps are cheap and
          the bar + dots stay crisp on retina. */}
      <div className="mx-auto mt-16 max-w-6xl px-2 sm:mt-20 sm:px-0">
        <div className="overflow-hidden rounded-xl ring-1 ring-border shadow-[0_25px_70px_-15px_rgba(0,0,0,0.7),0_0_80px_-20px_rgba(124,58,237,0.25)]">
          {/* Browser bar */}
          <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-red-400" />
              <span className="size-3 rounded-full bg-yellow-400" />
              <span className="size-3 rounded-full bg-green-400" />
            </div>
            <div className="rounded-md bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
              app.orkestr8.ai/dashboard
            </div>
            {/* Spacer matches traffic-light width (3 dots × 12px + 2 gaps × 8px = 52px) so the pill stays centered. */}
            <div className="w-[52px]" aria-hidden="true" />
          </div>
          {/* Screenshot — light-mode dashboard pops against the dark hero. */}
          <Image
            src="/screenshots/hero-dashboard-light.png"
            alt="Orkestr8 manager dashboard"
            width={2926}
            height={1568}
            priority
            className="block h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
