import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-6" />
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button render={<Link href="/signup" />}>Get started</Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          AI-first property management
        </span>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {APP_TAGLINE}
        </h1>
        <p className="mt-4 max-w-xl text-balance text-muted-foreground">
          Unify properties, leasing, maintenance, vendors, and communication in
          one operating system built for multifamily teams.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" render={<Link href="/signup" />}>
            Create your organization
            <ArrowRight className="size-4" />
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>
      </main>

      <footer className="flex items-center justify-center gap-2 px-6 py-6 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Multi-tenant · Row-level security · Safe-by-default automation
      </footer>
    </div>
  );
}
