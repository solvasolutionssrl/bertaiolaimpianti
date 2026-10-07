import { Skeleton } from '@kommessa/ui';

/**
 * L'attesa della scheda richiesta.
 *
 * ⚠️ Disegna **l'intestazione arancione**, non una pagina bianca: lo scheletro
 * serve a dire «sta arrivando quella cosa lì», e se il colore cambia all'
 * arrivo si vede un lampo. (Quello della scheda commessa è disallineato dalla
 * sua pagina per questo stesso motivo, al contrario: disegna il layout di
 * prima dell'intestazione.)
 */
export default function LoadingRichiesta() {
  return (
    <div className="flex min-h-[100dvh] flex-col pb-28">
      <div className="bg-accent px-5 pb-12 pt-[1.15rem]">
        <Skeleton className="h-10 w-28 rounded-full bg-accent-foreground/15" />
        <Skeleton className="mt-4 h-3 w-24 bg-accent-foreground/10" />
        <Skeleton className="mt-2 h-6 w-3/4 bg-accent-foreground/15" />
        <Skeleton className="mt-3 h-5 w-1/2 bg-accent-foreground/10" />
        <Skeleton className="mt-2 h-5 w-2/3 bg-accent-foreground/10" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Skeleton className="h-[60px] rounded-xl bg-accent-foreground/10" />
          <Skeleton className="h-[60px] rounded-xl bg-accent-foreground/10" />
        </div>
      </div>
      <div className="flex flex-col gap-4 px-4 pt-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
