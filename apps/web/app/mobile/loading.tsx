import { Skeleton } from '@impiantixplus/ui';

export default function MobileHomeLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-7 p-4 pb-24">
      {/* Hero */}
      <div className="pt-2 space-y-2">
        <Skeleton className="h-2.5 w-56 rounded-full" />
        <Skeleton className="h-8 w-44 rounded-md" />
        <Skeleton className="h-3 w-60 rounded-full" />
      </div>

      {/* Metriche card */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-[112px] w-full rounded-lg" />
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-28 rounded-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-[88px] rounded-lg" />
          <Skeleton className="h-[88px] rounded-lg" />
        </div>
      </div>

      {/* Ultime commesse */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-3 w-36 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
