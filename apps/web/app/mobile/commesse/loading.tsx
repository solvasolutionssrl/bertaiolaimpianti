import { Skeleton } from '@impiantixplus/ui';

export default function CommesseLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <div className="pt-2">
        <Skeleton className="h-2.5 w-24 rounded-full" />
        <Skeleton className="mt-2 h-7 w-28 rounded-md" />
        <Skeleton className="mt-1.5 h-3 w-36 rounded-full" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
