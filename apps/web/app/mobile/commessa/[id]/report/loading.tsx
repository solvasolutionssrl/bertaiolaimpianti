import { Skeleton } from '@impiantixplus/ui';

export default function ReportLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Hero placeholder */}
      <div
        className="bg-primary px-5 pb-8"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24 rounded-full bg-primary-foreground/10" />
          <Skeleton className="h-4 w-20 rounded-full bg-primary-foreground/10" />
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-40 rounded-full bg-primary-foreground/10" />
          <Skeleton className="h-8 w-40 rounded-md bg-primary-foreground/10" />
          <Skeleton className="h-3 w-52 rounded-full bg-primary-foreground/10" />
        </div>
        <Skeleton className="mt-4 h-12 w-full rounded-lg bg-primary-foreground/10" />
      </div>

      <div className="px-4 pt-6 space-y-6">
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-40 rounded-md" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-md" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-md" />
      </div>
    </div>
  );
}
