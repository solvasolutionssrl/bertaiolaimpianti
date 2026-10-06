import { Skeleton } from '@kommessa/ui';

/**
 * Gli scheletri delle pagine d'ufficio.
 *
 * ## Perché esistono
 *
 * Senza un `loading.tsx` accanto a una pagina `force-dynamic`, al clic **non
 * succede niente**: la pagina vecchia resta ferma finché il server non ha
 * finito, e chi ha cliccato non sa se ha cliccato. Sulla PWA l'abbiamo
 * sistemato il 06/10 (undici pagine); l'area Kantiere dell'ufficio — lo
 * strumento quotidiano di FPM — **non ne aveva nemmeno uno**, e il banco di
 * prova misurava «nessun segno nei primi 500 ms» su Cantieri, Presenze e ore,
 * Ore e costi.
 *
 * Due forme bastano per quasi tutto: una pagina con una tabella e una pagina
 * con delle card. Non si imita il contenuto nel dettaglio — si tiene
 * l'ingombro, così quando arriva il vero niente salta.
 */

/** Intestazione: un titolo e una riga di spiegazione. */
function Testa() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-6 w-56 rounded-md" />
      <Skeleton className="h-3 w-80 rounded-full" />
    </div>
  );
}

/** Pagina con una tabella: intestazione, eventuali numeri in alto, righe. */
export function ScheletroTabella({
  numeri = 0,
  righe = 8,
}: {
  /** Quante caselle di riepilogo ci sono sopra la tabella. */
  numeri?: number;
  righe?: number;
}) {
  return (
    <div className="w-full space-y-5">
      <Testa />
      {numeri > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: numeri }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="divide-y divide-border">
          {Array.from({ length: righe }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-1/4 rounded-full" />
              <Skeleton className="h-4 w-1/5 rounded-full" />
              <Skeleton className="ml-auto h-4 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Pagina fatta di riquadri: intestazione e una griglia. */
export function ScheletroCard({
  numeri = 0,
  card = 6,
}: {
  numeri?: number;
  card?: number;
}) {
  return (
    <div className="w-full space-y-5">
      <Testa />
      {numeri > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: numeri }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: card }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
