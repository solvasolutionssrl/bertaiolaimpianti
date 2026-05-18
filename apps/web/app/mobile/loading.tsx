import { Skeleton } from '@impiantixplus/ui';

export default function MobileLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      {/* Header skeleton */}
      <div className="pt-2">
        <Skeleton className="h-2.5 w-40 rounded-full" />
        <Skeleton className="mt-2 h-7 w-16 rounded-md" />
        <Skeleton className="mt-1.5 h-3 w-32 rounded-full" />
      </div>

      {/* QuickActions skeleton */}
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-[90px] rounded-xl" />
        <Skeleton className="h-[90px] rounded-xl" />
      </div>

      {/* Commessa cards skeleton */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
