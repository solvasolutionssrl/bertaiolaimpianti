/**
 * L'attesa di «Task e Richieste».
 *
 * ⚠️ La pagina e' `force-dynamic` e **non aveva un `loading.tsx`**: al clic
 * sulla voce in barra non succedeva niente finche' il server non aveva finito
 * di leggere task, richieste e duecento commesse per il filtro. Sedici pagine
 * dell'area Kantiere sono state coperte il 07/10 e questa e' rimasta fuori.
 *
 * La forma e' quella della pagina: barra dei filtri a sinistra e **due
 * colonne**. Gli scheletri condivisi (`ScheletroTabella`, `ScheletroCard`)
 * sono a una colonna sola, e uno scheletro che non somiglia a cio' che arriva
 * fa saltare il contenuto appena compare.
 */
function Barretta({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function ColonnaFinta({ righe, tono }: { righe: number; tono: 'task' | 'richiesta' }) {
  const eRichiesta = tono === 'richiesta';
  return (
    <div
      className={
        'overflow-hidden rounded-lg border ' +
        (eRichiesta
          ? 'border-amber-500/25 bg-amber-500/[0.035]'
          : 'border-primary/20 bg-primary/[0.025]')
      }
    >
      <div
        className={
          'flex items-center gap-3 border-b px-4 py-2.5 ' +
          (eRichiesta ? 'border-amber-500/20' : 'border-primary/15')
        }
      >
        <Barretta className="h-6 w-6 shrink-0 rounded-md" />
        <div className="space-y-1.5">
          <Barretta className="h-3 w-24" />
          <Barretta className="h-2.5 w-36" />
        </div>
        <Barretta className="ml-auto h-10 w-28 rounded-md" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: righe }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <Barretta className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Barretta className="h-3.5 w-2/3" />
              <Barretta className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CaricamentoTaskERichieste() {
  return (
    <div className="w-full space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-2">
          <Barretta className="h-2.5 w-16" />
          <Barretta className="h-6 w-56" />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Barretta key={i} className="h-7 w-28 rounded-md" />
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
        <aside className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Barretta className="h-2.5 w-20" />
              <Barretta className="h-6 w-full" />
              <Barretta className="h-6 w-full" />
              <Barretta className="h-6 w-4/5" />
            </div>
          ))}
        </aside>

        <div className="min-w-0 space-y-3">
          <Barretta className="h-10 w-full rounded-md" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[65fr_35fr]">
            <ColonnaFinta righe={5} tono="task" />
            <ColonnaFinta righe={3} tono="richiesta" />
          </div>
        </div>
      </div>
    </div>
  );
}
