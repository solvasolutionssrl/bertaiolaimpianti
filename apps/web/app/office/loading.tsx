import { Skeleton } from '@impiantixplus/ui';

/**
 * Loading skeleton per /office (dashboard).
 * Mantiene la struttura: hero greeting + 4 KPI + sezione risk + timeline.
 * Niente spinner — solo placeholder coerenti col design Operative Modern.
 */
export default function OfficeLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-10 p-6">
      {/* Hero greeting */}
      <div className="rounded-2xl border border-border bg-aurora-brand p-6 shadow-soft sm:p-8">
        <Skeleton className="h-3 w-40 rounded-full" />
        <Skeleton className="mt-3 h-8 w-72 rounded-md" />
        <Skeleton className="mt-3 h-3 w-2/3 rounded-full" />
      </div>

      {/* KPI */}
      <div className="space-y-4">
        <Skeleton className="h-3 w-44 rounded-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Risk + timeline */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-48 rounded-md" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
