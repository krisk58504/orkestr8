import Link from "next/link";
import Image from "next/image";
import { APP_NAME } from "@/lib/constants";

export default function InviteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center"
          aria-label={APP_NAME}
        >
          <Image
            src="/logo-stacked.png"
            alt={APP_NAME}
            width={400}
            height={400}
            priority
            className="h-20 w-auto"
          />
        </Link>
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
