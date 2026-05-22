import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading skeleton for every (app) route — shown via the Suspense
 * boundary Next.js creates from this file while a page segment streams in.
 * Shaped for the list-page rhythm (PageHeader + DataTable) since 8 of 9
 * (app) routes are list pages; detail routes show a brief, harmless mismatch.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* DataTable toolbar — search + status facet */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Skeleton className="h-9 w-full sm:max-w-xs sm:flex-1" />
        <Skeleton className="h-9 w-full sm:w-48" />
      </div>

      {/* DataTable */}
      <div className="rounded-xl border">
        {/* header strip — matches TableHead (h-10 px-2) */}
        <div className="flex h-10 items-center gap-4 border-b px-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        {/* body rows — match TableCell (p-2); last row drops its border */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b p-2 last:border-b-0"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
