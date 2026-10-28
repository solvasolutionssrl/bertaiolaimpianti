import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight, Scale } from 'lucide-react';
import { Card, CardContent } from '@kommessa/ui';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import { formattaMargine, type EsitoGiorno } from '@kommessa/api/margine-ore';
import { tenantHasModule } from '@/app/_lib/modules';
import { caricaMonteOre } from './_lib/monte-ore';

export const dynamic = 'force-dynamic';

const MESE_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

function spostaMese(periodo: string, delta: number): string {
  const [a, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(a!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const nomeMese = (p: string) => `${MESI[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

/** Ore in h:mm, anche oltre le cento: e' un totale, non un orario. */
function oreHM(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function toneMargine(minuti: number): string {
  if (minuti > 0) return 'text-emerald-700 dark:text-emerald-400';
  if (minuti < 0) return 'text-rose-700 dark:text-rose-400';
  return 'text-muted-foreground';
}

const ESITO: Record<EsitoGiorno, string> = {
  lavorato: '',
  extra: 'Fuori orario',
  assente: 'Assenza',
  vuoto: 'Nessuna registrazione',
  riposo: 'Riposo',
};

export default async function MonteOrePage({
  searchParams,
}: {
  searchParams?: { mese?: string; dip?: string };
}) {
  const ctx = await requireTenantContext();
  if (ctx.role !== 'admin' && ctx.role !== 'office') notFound();
  if (!(await tenantHasModule('kantiere'))) notFound();

  const meseCorrente = romeDay(new Date()).slice(0, 7);
  const periodo = MESE_VALIDO.test(searchParams?.mese ?? '') ? searchParams!.mese! : meseCorrente;
  const dip = /^[0-9a-f-]{36}$/i.test(searchParams?.dip ?? '') ? searchParams!.dip! : null;

  const supabase = createServerSupabase();
  const { persone, dal, al } = await caricaMonteOre(supabase, ctx.tenantId, periodo, dip ? { dipendenteId: dip } : {});
  const persona = dip ? persone[0] ?? null : null;
  if (dip && !persona) notFound();

  const link = (p: string, d: string | null = dip) =>
    `/office/personale/monte-ore?mese=${p}${d ? `&dip=${d}` : ''}`;
  const futuro = periodo >= meseCorrente;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
            Monte ore{persona ? ` · ${persona.nome}` : ''}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quanto ciascuno è sopra o sotto l&apos;orario ordinario: nove ore oggi e sette domani fanno zero.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={link(spostaMese(periodo, -1))}
            aria-label="Mese precedente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted/50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize">{nomeMese(periodo)}</span>
          {futuro ? (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border opacity-40">
              <ChevronRight className="h-4 w-4" />
            </span>
          ) : (
            <Link
              href={link(spostaMese(periodo, 1))}
              aria-label="Mese successivo"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted/50"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        Dal {dal.slice(8, 10)}/{dal.slice(5, 7)} al {al.slice(8, 10)}/{al.slice(5, 7)}. Conta lavoro e viaggio dentro
        l&apos;orario più i permessi a ore; il viaggio oltre l&apos;orario si paga a parte e resta fuori. Sabati,
        domeniche e festivi sono tutti in più; le assenze di giornata intera non contano. I feriali senza nessuna
        registrazione non vengono contati come ore in meno: si segnalano a parte.
      </p>

      {persona ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={link(periodo, null)} className="text-primary hover:underline">
              ← Tutti i dipendenti
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link href={`/office/personale/dipendenti/${persona.id}`} className="text-primary hover:underline">
              Scheda di {persona.nome}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Riquadro titolo="Saldo del mese" valore={formattaMargine(persona.saldo.margine)} tono={toneMargine(persona.saldo.margine)} />
            <Riquadro titolo="Ore contate" valore={oreHM(persona.saldo.minutiContati)} />
            <Riquadro titolo="Ore teoriche" valore={oreHM(persona.saldo.minutiTeorici)} />
            <Riquadro titolo="Senza registrazioni" valore={`${persona.saldo.giorniVuoti} gg`} />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0 sm:p-0">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Giorno</th>
                    <th className="px-3 py-2 text-right font-medium">Contate</th>
                    <th className="px-3 py-2 text-right font-medium">Teoriche</th>
                    <th className="px-3 py-2 text-right font-medium">Margine</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {persona.saldo.giorni.map((g) => {
                    const dow = GIORNI[new Date(`${g.data}T12:00:00Z`).getUTCDay()];
                    const spento = g.esito === 'riposo' || g.esito === 'vuoto' || g.esito === 'assente';
                    return (
                      <tr key={g.data} className={spento ? 'text-muted-foreground' : ''}>
                        <td className="px-3 py-1.5 tabular-nums">
                          {dow} {g.data.slice(8, 10)}/{g.data.slice(5, 7)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{g.minutiContati ? oreHM(g.minutiContati) : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{g.minutiTeorici ? oreHM(g.minutiTeorici) : '—'}</td>
                        <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${toneMargine(g.margine)}`}>
                          {g.esito === 'lavorato' || g.esito === 'extra' ? formattaMargine(g.margine) : ''}
                        </td>
                        <td className="px-3 py-1.5 text-xs">{ESITO[g.esito]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : persone.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Nessun dipendente attivo in questo mese.
        </p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Dipendente</th>
                  <th className="px-3 py-2 text-right font-medium">Giorni lavorati</th>
                  <th className="px-3 py-2 text-right font-medium">Ore contate</th>
                  <th className="px-3 py-2 text-right font-medium">Ore teoriche</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-right font-medium">Senza registrazioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {persone.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={link(periodo, p.id)} className="font-medium text-foreground hover:text-primary hover:underline">
                        {p.nome}
                      </Link>
                      {p.mansione ? <span className="block text-xs text-muted-foreground">{p.mansione}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.saldo.giorniLavorati}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{oreHM(p.saldo.minutiContati)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{oreHM(p.saldo.minutiTeorici)}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${toneMargine(p.saldo.margine)}`}>
                      {formattaMargine(p.saldo.margine)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {p.saldo.giorniVuoti > 0 ? `${p.saldo.giorniVuoti} gg` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Riquadro({ titolo, valore, tono = '' }: { titolo: string; valore: string; tono?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{titolo}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tono}`}>{valore}</p>
    </div>
  );
}
