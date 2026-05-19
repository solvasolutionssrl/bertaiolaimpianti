import { Skeleton } from '@impiantixplus/ui';

export default function CommessaDetailLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-7 p-4 pb-28">
      {/* Topbar */}
      <div className="flex items-center justify-between pt-1">
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="h-4 w-24 rounded-full" />
      </div>

      {/* 01 Commessa */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-32 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-36 rounded-md" />
          <Skeleton className="h-6 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      </div>

      {/* 02 Briefing */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-28 rounded-full" />
        <Skeleton className="h-24 rounded-lg" />
      </div>

      {/* 03 Documentazione */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-44 rounded-full" />
        <Skeleton className="h-10 rounded-lg" />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
