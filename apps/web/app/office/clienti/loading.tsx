import { Skeleton } from '@impiantixplus/ui';

export default function ClientiLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-3 w-72 rounded-full" />
        </div>
        <Skeleton className="h-11 w-40 rounded-md" />
      </div>

      <Skeleton className="h-10 w-full max-w-md rounded-md" />

      <Skeleton className="h-[480px] w-full rounded-xl" />
    </div>
  );
}
