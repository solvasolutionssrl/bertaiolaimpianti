import { Skeleton } from '@kommessa/ui';

export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <Skeleton className="mt-2 h-6 w-48" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
