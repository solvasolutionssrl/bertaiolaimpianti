import { Skeleton } from '@impiantixplus/ui';

export default function CartellaLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      {/* Hero placeholder */}
      <div className="-mx-0 bg-primary px-4 pb-12 pt-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24 rounded-full bg-primary-foreground/10" />
          <Skeleton className="h-5 w-20 rounded-full bg-primary-foreground/10" />
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-44 rounded-full bg-primary-foreground/10" />
          <Skeleton className="h-8 w-36 rounded-md bg-primary-foreground/10" />
          <Skeleton className="h-3 w-52 rounded-full bg-primary-foreground/10" />
        </div>
      </div>

      <div className="flex flex-col gap-5 px-4 pt-4">
        {/* Breadcrumb */}
        <Skeleton className="-mt-10 h-16 rounded-xl" />

        {/* Lista */}
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
