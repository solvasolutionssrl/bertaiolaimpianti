import { Skeleton } from '@kommessa/ui';

export default function NotificheLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4 pb-24">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-2.5 w-48 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
