import { Skeleton } from '@impiantixplus/ui';

export default function ImpostazioniLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-8">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-7 w-80 rounded-md" />
        <Skeleton className="h-3 w-2/3 rounded-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    </div>
  );
}
