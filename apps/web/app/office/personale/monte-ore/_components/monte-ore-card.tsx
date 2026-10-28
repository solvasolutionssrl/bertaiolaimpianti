import Link from 'next/link';
import { Scale } from 'lucide-react';
import { Card, CardContent } from '@kommessa/ui';
import { formattaMargine } from '@kommessa/api/margine-ore';
import type { MonteOrePersona } from '../_lib/monte-ore';

/**
 * La card «Monte ore» della pagina Analisi: il saldo del mese in corso, chi e'
 * piu' sopra e chi piu' sotto. Il quadro completo sta in «Vedi tutti».
 */
export function MonteOreCard({ persone, periodo }: { persone: MonteOrePersona[]; periodo: string }) {
  const conOre = persone.filter((p) => p.saldo.giorniLavorati > 0);
  const ordinate = [...conOre].sort((a, b) => b.saldo.margine - a.saldo.margine);
  const sopra = ordinate.filter((p) => p.saldo.margine > 0).slice(0, 3);
  const sotto = ordinate.filter((p) => p.saldo.margine < 0).reverse().slice(0, 3);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Scale className="h-4 w-4 text-primary" aria-hidden="true" /> Monte ore del mese
          </h2>
          <Link
            href={`/office/personale/monte-ore?mese=${periodo}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Vedi tutti
          </Link>
        </div>
        {conOre.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ancora nessuna giornata registrata questo mese.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Elenco titolo="Più ore dell'orario" persone={sopra} periodo={periodo} tono="text-emerald-700 dark:text-emerald-400" />
            <Elenco titolo="Meno ore dell'orario" persone={sotto} periodo={periodo} tono="text-rose-700 dark:text-rose-400" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Elenco({
  titolo,
  persone,
  periodo,
  tono,
}: {
  titolo: string;
  persone: MonteOrePersona[];
  periodo: string;
  tono: string;
}) {
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
                className="truncate hover:text-primary hover:underline"
              >
                {p.nome}
              </Link>
              <span className={`shrink-0 font-semibold tabular-nums ${tono}`}>{formattaMargine(p.saldo.margine)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
