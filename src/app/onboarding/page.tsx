import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getAuthUser, getSessionContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Set up your organization" };

export default async function OnboardingPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // Already onboarded — skip straight to the app.
  const context = await getSessionContext();
  if (context) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center">
          <Image
            src="/logo-stacked.png"
            alt={APP_NAME}
            width={400}
            height={400}
            priority
            className="h-20 w-auto"
          />
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Create your organization
            </h1>
            <p className="text-sm text-muted-foreground">
              One last step before you get started
            </p>
          </div>
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
