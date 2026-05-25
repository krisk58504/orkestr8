import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

export function LandingHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link
        href="/"
        className="flex items-center"
        aria-label={APP_NAME}
      >
        <Image
          src="/logo-horizontal.png"
          alt={APP_NAME}
          width={1055}
          height={347}
          priority
          className="h-24 w-auto"
        />
      </Link>
      <div className="flex items-center gap-2">
        <Button variant="ghost" render={<Link href="/login" />}>
          Sign in
        </Button>
        <Button render={<Link href="/signup" />}>Get started</Button>
      </div>
    </header>
  );
}
