import { Skeleton } from '@kommessa/ui';

/**
 * L'attesa della home del telefono.
 *
 * ⚠️ Serve a **entrambe** le shell — il tecnico e l'ufficio — quindi disegna
 * la forma che hanno in comune: intestazione scura, una card di azioni, e un
 * elenco. Modellarla su una delle due farebbe saltare il contenuto all'altra
 * nel momento in cui i dati arrivano.
 */
export default function MobileHomeLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      {/* Intestazione */}
      <div className="bg-primary px-4 pb-16 pt-5">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-48 rounded-full bg-primary-foreground/20" />
          <Skeleton className="h-8 w-52 rounded-md bg-primary-foreground/20" />
          <Skeleton className="h-3 w-44 rounded-full bg-primary-foreground/15" />
        </div>
      </div>

      <div className="flex flex-col gap-6 px-4 pt-4">
        {/* La card che si sovrappone all'intestazione */}
        <div className="-mt-12">
          <Skeleton className="h-[136px] w-full rounded-xl" />
        </div>

        {/* Ricerca e pastiglie */}
        <div className="space-y-3">
          <Skeleton className="h-11 w-full rounded-lg" />
          <div className="flex gap-1.5">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <Skeleton className="h-2.5 w-40 rounded-full" />
        </div>

        {/* L'elenco */}
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
