import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, MapPin, Play } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import { quoteDaRiga, COLONNE_QUOTE, type RigaRapportinoLetta } from '@kommessa/api/kantiere-quote';
import { formattaOreTotale } from '@kommessa/api/kantiere-ore';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { categoriaLabel, codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import { Intestazione } from '../../_components/intestazione';
import { mioDipendente, spostaGiorno } from '../../_lib/me';

export const dynamic = 'force-dynamic';

interface CantiereRow {
  id: string;
  codice: string;
  codice_commessa: string | null;
  nome: string;
  cliente_nome: string | null;
  indirizzo: string | null;
  indirizzo_lat: number | null;
  indirizzo_lng: number | null;
  categoria: string | null;
  stato: string;
  note: string | null;
}

/** La scheda di un cantiere per il tecnico: sola lettura, e un tasto per iniziare la giornata. */
export default async function CantiereMioPage({ params }: { params: { id: string } }) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const { data: cRaw } = await supabase
    .from('cantieri' as never)
    .select('id, codice, codice_commessa, nome, cliente_nome, indirizzo, indirizzo_lat, indirizzo_lng, categoria, stato, note')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', params.id)
    .maybeSingle();
  const c = cRaw as CantiereRow | null;
  if (!c) notFound();

  const me = await mioDipendente(supabase, ctx.tenantId, ctx.userId);
  const oggi = romeDay(new Date());
  const [squadraRes, fasiRes, oreRes] = await Promise.all([
    supabase
      .from('cantiere_squadra' as never)
      .select('dipendente_id, ruolo, dipendente:dipendenti(nome, cognome)')
      .eq('cantiere_id', c.id),
    supabase
      .from('sottocantieri' as never)
      .select('id, nome, codice, descrizione, stato')
      .eq('cantiere_id', c.id)
      .eq('stato', 'attivo')
      .order('codice')
      .order('nome'),
    me
      ? supabase
          .from('rapportino_righe' as never)
          .select(`${COLONNE_QUOTE}, rapportino:rapportini!inner(data, dipendente_id)`)
          .eq('cantiere_id', c.id)
          .eq('rapportino.dipendente_id', me.dipendenteId)
          .gte('rapportino.data', spostaGiorno(oggi, -30))
      : Promise.resolve({ data: null }),
  ]);
  const squadra = ((squadraRes.data as { dipendente_id: string; ruolo: string; dipendente: { nome: string; cognome: string } | { nome: string; cognome: string }[] | null }[] | null) ?? []).map((r) => {
    const d = Array.isArray(r.dipendente) ? r.dipendente[0] : r.dipendente;
    return { id: r.dipendente_id, nome: d ? `${d.nome} ${d.cognome}`.trim() : '—', capo: r.ruolo === 'capo' };
  });
  const fasi = (fasiRes.data as { id: string; nome: string; codice: string | null; descrizione: string | null }[] | null) ?? [];
  let minutiMiei = 0;
  for (const r of (oreRes.data as RigaRapportinoLetta[] | null) ?? []) minutiMiei += quoteDaRiga(r).minutiLavoro;
  const mappa = c.indirizzo_lat != null && c.indirizzo_lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${c.indirizzo_lat},${c.indirizzo_lng}`
    : c.indirizzo
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.indirizzo)}`
      : null;

  return (
    <>
      <Link href="/office/mio/cantieri" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Cantieri
      </Link>
      <Intestazione
        titolo={c.nome}
        sotto={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{codiceCantiereMostrato(c)}</span>
            {c.cliente_nome ? <span>· {c.cliente_nome}</span> : null}
            <span className={c.stato === 'attivo' ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800' : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'}>{c.stato === 'attivo' ? 'Attivo' : c.stato === 'sospeso' ? 'Sospeso' : 'Chiuso'}</span>
          </span>
        }
        destra={
          c.stato === 'attivo' ? (
            <Button size="sm" asChild>
              <Link href="/office/mio">
                <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Inizia giornata
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Anagrafica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{c.indirizzo ?? 'Indirizzo non indicato'}</span>
              {mappa ? (
                <a href={mappa} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Apri mappa <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </p>
            <p className="text-muted-foreground">Tipologia: {c.categoria ? categoriaLabel(c.categoria) : '—'}</p>
            {c.note ? <p className="whitespace-pre-wrap text-muted-foreground">{c.note}</p> : null}
            {me ? (
              <p className="border-t border-border pt-2">
                Le mie ore negli ultimi 30 giorni: <span className="font-medium tabular-nums">{formattaOreTotale(minutiMiei)}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Squadra</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {squadra.length === 0 ? (
              <p className="text-muted-foreground">Nessuna squadra assegnata.</p>
            ) : (
              <ul className="divide-y divide-border">
                {squadra.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-1.5">
                    <span className={s.id === me?.dipendenteId ? 'font-medium' : ''}>{s.nome}</span>
                    {s.capo ? <span className="text-xs text-muted-foreground">Capo squadra</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sottocantieri</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {fasi.length === 0 ? (
              <p className="text-muted-foreground">Nessun sottocantiere: le ore vanno sul cantiere intero.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-32 py-1 font-medium">Codice</th>
                    <th className="py-1 font-medium">Nome</th>
                    <th className="py-1 font-medium">Descrizione</th>
                  </tr>
                </thead>
                <tbody>
                  {fasi.map((f) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="py-1.5 font-mono text-xs">{f.codice ?? '—'}</td>
                      <td className="py-1.5 font-medium">{f.nome}</td>
                      <td className="py-1.5 text-muted-foreground">{f.descrizione ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
