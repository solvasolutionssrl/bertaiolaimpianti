import { Skeleton } from '@impiantixplus/ui';

export default function CommesseLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-7 p-4 pb-24">
      {/* Hero */}
      <div className="pt-2 space-y-2">
        <Skeleton className="h-2.5 w-44 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-3 w-52 rounded-full" />
      </div>

      {/* Section header + pills */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-3 w-32 rounded-full" />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </div>

      {/* Section header + list */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-3 w-20 rounded-full" />
          <Skeleton className="h-3 w-8 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
