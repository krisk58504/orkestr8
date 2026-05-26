import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Invite link missing" };

export default function InviteIndexPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Invite link missing
        </h1>
        <p className="text-sm text-muted-foreground">
          Looks like your invite link is missing the code. Check your email
          for the full invite, or contact the person who invited you.
        </p>
      </div>
      <div className="flex justify-center">
        <Button render={<Link href="/login" />}>Back to login</Button>
      </div>
    </div>
  );
}
