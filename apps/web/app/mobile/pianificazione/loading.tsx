import { Skeleton } from '@kommessa/ui';

export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <div className="mt-2 space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-9 w-full" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-3">
          <Skeleton className="mb-2 h-4 w-28" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}
