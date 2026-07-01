import { Skeleton } from '@kommessa/ui';

/**
 * Mattoncini skeleton riusabili per i `loading.tsx` della PWA. Compaiono
 * ISTANTANEAMENTE al tap di una tab (mentre il server component carica i dati
 * live) → la navigazione "cambia subito" invece di restare ferma sul vecchio.
 */

/** Intestazione pagina: eyebrow + titolo + sottotitolo. */
export function SkelHeader() {
  return (
    <div className="space-y-2 pt-2">
      <Skeleton className="h-2.5 w-40 rounded-full" />
      <Skeleton className="h-8 w-52 rounded-md" />
      <Skeleton className="h-3 w-64 rounded-full" />
    </div>
  );
}

/** Barra di ricerca (lista cantieri/spese). */
export function SkelSearch() {
  return <Skeleton className="h-11 w-full rounded-xl" />;
}

/** Riga di 3 KPI (cruscotto). */
export function SkelKpiRow() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-xl" />
      ))}
    </div>
  );
}

/** Lista di card (presenze, cantieri, spese, ore…). */
export function SkelCardList({
  count = 5,
  className = 'h-[76px]',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`w-full rounded-xl ${className}`} />
      ))}
    </div>
  );
}
