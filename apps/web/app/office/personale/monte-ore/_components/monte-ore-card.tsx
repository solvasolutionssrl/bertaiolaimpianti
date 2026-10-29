import Link from 'next/link';
import { Card, CardContent } from '@kommessa/ui';
import { formattaMargine } from '@kommessa/api/margine-ore';
import type { MonteOrePersona } from '../_lib/monte-ore';

/**
 * La card «Monte ore del mese», stretta e verticale: sta nella colonna di
 * destra di Analisi (la squadra) e della scheda di un dipendente (la persona).
 * Stesso componente e stessa lettura (`caricaMonteOre`), cosi' le due non
 * possono dire cose diverse. Il quadro completo sta in «Vedi tutti».
 */
export function MonteOreCard(
  props:
    | { periodo: string; persone: MonteOrePersona[]; persona?: undefined }
    | { periodo: string; persona: MonteOrePersona | null; persone?: undefined },
) {
  const { periodo } = props;
  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Monte ore del mese</h2>
        {props.persone ? <Squadra persone={props.persone} periodo={periodo} /> : <Persona persona={props.persona} periodo={periodo} />}
      </CardContent>
    </Card>
  );
}

const PER_PARTE = 8;

const tono = (m: number) =>
  m > 0 ? 'text-emerald-700 dark:text-emerald-400' : m < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground';

const oreHM = (minuti: number) => {
  const m = Math.max(0, Math.round(minuti));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

function Squadra({ persone, periodo }: { persone: MonteOrePersona[]; periodo: string }) {
  const conOre = persone.filter((p) => p.saldo.giorniLavorati > 0);
  const ordinate = [...conOre].sort((a, b) => b.saldo.margine - a.saldo.margine);
  // Otto per parte: la card e' alta quanto la colonna di Analisi e ci stanno.
  const sopra = ordinate.filter((p) => p.saldo.margine > 0).slice(0, PER_PARTE);
  const sotto = ordinate.filter((p) => p.saldo.margine < 0).reverse().slice(0, PER_PARTE);
  return (
    <>
      {conOre.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ancora nessuna giornata registrata questo mese.</p>
      ) : (
        <>
          <Elenco titolo="Più ore dell'orario" persone={sopra} periodo={periodo} />
          <Elenco titolo="Meno ore dell'orario" persone={sotto} periodo={periodo} />
        </>
      )}
      <Link href={`/office/personale/monte-ore?mese=${periodo}`} className="block text-sm font-medium text-primary hover:underline">
        Vedi tutti
      </Link>
    </>
  );
}

function Persona({ persona, periodo }: { persona: MonteOrePersona | null; periodo: string }) {
  if (!persona) return <p className="text-sm text-muted-foreground">Nessun dato per questo mese.</p>;
  const s = persona.saldo;
  return (
    <>
      <div>
        <p className="text-xs text-muted-foreground">Saldo</p>
        <p className={`text-2xl font-semibold tabular-nums ${tono(s.margine)}`}>{formattaMargine(s.margine)}</p>
      </div>
      <dl className="space-y-1 text-sm">
        <Riga etichetta="Ore contate" valore={oreHM(s.minutiContati)} />
        <Riga etichetta="Ore teoriche" valore={oreHM(s.minutiTeorici)} />
        <Riga etichetta="Giorni lavorati" valore={String(s.giorniLavorati)} />
        {s.giorniVuoti > 0 ? <Riga etichetta="Senza registrazioni" valore={`${s.giorniVuoti} gg`} /> : null}
      </dl>
      <Link
        href={`/office/personale/monte-ore?mese=${periodo}&dip=${persona.id}`}
        className="block text-sm font-medium text-primary hover:underline"
      >
        Dettaglio del mese
      </Link>
    </>
  );
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{etichetta}</dt>
      <dd className="font-medium tabular-nums">{valore}</dd>
    </div>
  );
}

function Elenco({ titolo, persone, periodo }: { titolo: string; persone: MonteOrePersona[]; periodo: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{titolo}</p>
      {persone.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuno.</p>
      ) : (
        <ul className="space-y-1">
          {persone.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <Link
                href={`/office/personale/monte-ore?mese=${periodo}&dip=${p.id}`}
                className="min-w-0 truncate hover:text-primary hover:underline"
                title={p.nome}
              >
                {p.nome}
              </Link>
              <span className={`shrink-0 font-semibold tabular-nums ${tono(p.saldo.margine)}`}>
                {formattaMargine(p.saldo.margine)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
