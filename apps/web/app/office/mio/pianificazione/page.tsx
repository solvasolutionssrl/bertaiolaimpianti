import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@kommessa/ui';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import { LABEL_FASCIA } from '@kommessa/api/pianificazione';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { tenantHasModule } from '@/app/_lib/modules';
import { leggiConfigDipendenti } from '@/app/_lib/dipendenti-config';
import { caricaBlocchiRange } from '@/app/office/personale/pianificazione/_lib/query';
import { Intestazione } from '../_components/intestazione';
import { SenzaScheda } from '../_components/senza-scheda';
import { mioDipendente, spostaGiorno } from '../_lib/me';

export const dynamic = 'force-dynamic';

/** Il lunedi' della settimana di un giorno (AAAA-MM-GG). */
function lunediDi(giorno: string): string {
  const d = new Date(`${giorno}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return spostaGiorno(giorno, -dow);
}
const fmtGiorno = (g: string) => {
  const [y, m, d] = g.split('-').map(Number);
  const s = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** «La mia settimana»: i soli blocchi pubblicati in cui sono tra i membri. */
export default async function PianificazioneMiaPage({ searchParams }: { searchParams: { settimana?: string } }) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  if (!(await tenantHasModule('dipendenti'))) notFound();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (cfg && cfg.pianificazioneAttiva === false) notFound();
  const me = await mioDipendente(supabase, ctx.tenantId, ctx.userId);
  if (!me) {
    return (
      <>
        <Intestazione titolo="La mia settimana" />
        <SenzaScheda />
      </>
    );
  }
  const oggi = romeDay(new Date());
  const base = searchParams.settimana && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.settimana) ? searchParams.settimana : oggi;
  const lunedi = lunediDi(base);
  const domenica = spostaGiorno(lunedi, 6);
  const blocchi = (await caricaBlocchiRange(supabase, ctx.tenantId, lunedi, domenica)).filter(
    (b) => b.stato === 'pubblicato' && b.membri.includes(me.dipendenteId),
  );
  const giorni = Array.from({ length: 7 }, (_, i) => spostaGiorno(lunedi, i));

  return (
    <>
      <Intestazione
        titolo="La mia settimana"
        sotto={`Dal ${fmtGiorno(lunedi)} al ${fmtGiorno(domenica)}`}
        destra={
          <>
            <Link href={`/office/mio/pianificazione?settimana=${spostaGiorno(lunedi, -7)}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted" aria-label="Settimana precedente">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Precedente
            </Link>
            <Link href="/office/mio/pianificazione" className="inline-flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted">
              Questa settimana
            </Link>
            <Link href={`/office/mio/pianificazione?settimana=${spostaGiorno(lunedi, 7)}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted" aria-label="Settimana successiva">
              Successiva <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {giorni.map((g) => {
          const del = blocchi.filter((b) => b.data === g);
          return (
            <Card key={g} className={g === oggi ? 'border-primary' : undefined} data-giorno={g}>
              <CardContent className="pt-4 text-sm">
                <p className="mb-2 font-medium">{fmtGiorno(g)}</p>
                {del.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Niente in programma.</p>
                ) : (
                  <ul className="space-y-2">
                    {del.map((b) => (
                      <li key={b.id} className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                        <p className="font-medium">
                          {b.tipo === 'cantiere'
                            ? `${b.cantiereNome ?? 'Cantiere'}${b.sottocantiereNome ? ` › ${b.sottocantiereNome}` : ''}`
                            : b.titolo ?? (b.tipo === 'formazione' ? 'Formazione' : 'Evento')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {b.fascia === 'custom' ? `${b.oraInizio} – ${b.oraFine}` : LABEL_FASCIA[b.fascia]}
                          {b.luogo ? ` · ${b.luogo}` : ''}
                        </p>
                        {b.note ? <p className="mt-0.5 text-xs text-muted-foreground">{b.note}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
