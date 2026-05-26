import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Something went wrong" };

export default function ErrorPage() {
  return (
    <div className="dark flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        We couldn&apos;t complete that request. The link may have expired.
        Please try signing in again.
      </p>
      <Button render={<Link href="/login" />}>Back to sign in</Button>
    </div>
  );
}
