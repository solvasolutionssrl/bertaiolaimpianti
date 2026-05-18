import { Skeleton } from '@impiantixplus/ui';

export default function CommessaDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <Skeleton className="h-4 w-32 rounded-full" />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-7 w-60 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3 w-2/3 rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
      </div>

      <Skeleton className="h-10 w-full max-w-xl rounded-md" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
