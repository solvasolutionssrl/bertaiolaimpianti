import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { History } from 'lucide-react';

import { Card, CardContent } from '@kommessa/ui';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { leggiTutto } from '@kommessa/api/pagine';

import { tenantHasModule } from '@/app/_lib/modules';

export const metadata: Metadata = {
  title: 'Registro modifiche',
};

export const dynamic = 'force-dynamic';

/**
 * Registro modifiche: chi ha fatto cosa, e quando.
 *
 * Gli eventi esistevano gia' (`audit_events`) ma li vedeva solo il super
 * admin di piattaforma, cioe' qualcuno fuori dall'azienda: chi ha bisogno di
 * rispondere a «chi ha cambiato quel costo orario?» sta in ufficio. La
 * migration `20260923120000` apre la lettura al ruolo ufficio; questa pagina
 * e' il posto dove guardarli.
 *
 * Niente componente client: i filtri sono una form GET, quindi la pagina non
 * porta nessun JavaScript in piu'.
 */

type EventoRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before_data: unknown;
  after_data: unknown;
  metadata: Record<string, unknown> | null;
};

interface PageProps {
  searchParams: {
    from?: string;
    to?: string;
    tipo?: string;
    azione?: string;
    chi?: string;
  };
}

function isoGiorno(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

/** Periodo predefinito: ultimi 30 giorni, come nelle altre pagine Kantiere. */
function periodoDefault(): { from: string; to: string } {
  const oggi = new Date();
  const trentaFa = new Date(oggi);
  trentaFa.setDate(trentaFa.getDate() - 30);
  return { from: isoGiorno(trentaFa), to: isoGiorno(oggi) };
}

/** Le azioni si scrivono `entita.verbo`: a schermo si legge meglio a parole. */
function etichettaAzione(action: string): string {
  const pezzi = action.split('.');
  const verbo = pezzi[pezzi.length - 1] ?? action;
  const mappa: Record<string, string> = {
    crea: 'Creazione',
    modifica: 'Modifica',
    elimina: 'Eliminazione',
    genera: 'Generazione',
    rigenera: 'Rigenerazione',
    imposta: 'Impostata',
    annulla: 'Annullamento',
    decisione: 'Decisione',
    costo_orario: 'Costo orario',
    update: 'Modifica',
  };
  return mappa[verbo] ?? verbo;
}

function JsonBlocco({ etichetta, dati }: { etichetta: string; dati: unknown }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {etichetta}
      </p>
      <pre className="overflow-x-auto rounded-md border border-border bg-background px-2.5 py-2 text-[11px] leading-relaxed">
        {JSON.stringify(dati, null, 2)}
      </pre>
    </div>
  );
}

export default async function RegistroModifichePage({ searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  // Stessa porta delle altre pagine della sezione: il registro vive dentro
  // Kantiere, e senza il modulo la voce non esiste nemmeno nel menu.
  if (!(await tenantHasModule('kantiere'))) notFound();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) notFound();

  const supabase = createServerSupabase();
  const def = periodoDefault();
  const from = searchParams.from || def.from;
  const to = searchParams.to || def.to;
  const tipo = searchParams.tipo ?? '';
  const azione = searchParams.azione ?? '';
  const chi = searchParams.chi ?? '';

  // `created_at` e' un timestamp: il giorno finale si include fino a fine
  // giornata, altrimenti «fino a oggi» perderebbe tutto quello di oggi.
  const eventi = await leggiTutto<EventoRow>(
    (da, a) => {
      let q = supabase
        .from('audit_events')
        .select(
          'id, created_at, actor_user_id, actor_role, entity_type, entity_id, action, before_data, after_data, metadata',
        )
        .eq('tenant_id', ctx.tenantId)
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`);
      if (tipo) q = q.eq('entity_type', tipo);
      if (azione) q = q.eq('action', azione);
      if (chi) q = q.eq('actor_user_id', chi);
      return q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(da, a) as never;
    },
    { contesto: 'registro modifiche' },
  );

  // Chi ha agito: il nome sta su `users`, l'evento porta solo l'id.
  const attoriIds = [...new Set(eventi.map((e) => e.actor_user_id).filter((v): v is string => !!v))];
  const attori = new Map<string, string>();
  if (attoriIds.length > 0) {
    const { data } = (await supabase
      .from('users')
      .select('id, display_name')
      .in('id', attoriIds)) as { data: { id: string; display_name: string | null }[] | null };
    for (const u of data ?? []) attori.set(u.id, u.display_name ?? u.id.slice(0, 8));
  }

  // Le voci dei menu si ricavano da cio' che c'e' davvero nel periodo: un
  // elenco fisso mostrerebbe filtri che non selezionano niente.
  const tipiPresenti = [...new Set(eventi.map((e) => e.entity_type))].sort();
  const azioniPresenti = [...new Set(eventi.map((e) => e.action))].sort();
  const attoriPresenti = [...attori.entries()].sort((a, b) => a[1].localeCompare(b[1], 'it'));

  const campo =
    'rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <History className="h-5 w-5 text-primary" aria-hidden="true" />
          Registro modifiche
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chi ha fatto cosa, e quando. Il registro non si corregge: le voci restano come sono
          state scritte.
        </p>
      </header>

      {/* Filtri: form GET, nessun JavaScript */}
      <Card>
        <CardContent className="p-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">Dal</span>
              <input type="date" name="from" defaultValue={from} className={campo} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">Al</span>
              <input type="date" name="to" defaultValue={to} className={campo} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">Che cosa</span>
              <select name="tipo" defaultValue={tipo} className={campo}>
                <option value="">Tutto</option>
                {tipiPresenti.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">Azione</span>
              <select name="azione" defaultValue={azione} className={campo}>
                <option value="">Tutte</option>
                {azioniPresenti.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">Chi</span>
              <select name="chi" defaultValue={chi} className={campo}>
                <option value="">Tutti</option>
                {attoriPresenti.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              Applica
            </button>
            <span className="ml-auto self-center text-[11px] text-muted-foreground tabular-nums">
              {eventi.length} {eventi.length === 1 ? 'evento' : 'eventi'}
            </span>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {eventi.length === 0 ? (
            <p className="py-10 text-center text-sm italic text-muted-foreground">
              Nessuna modifica registrata nel periodo scelto.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {eventi.map((e) => {
                const chiHaFatto = e.actor_user_id
                  ? attori.get(e.actor_user_id) ?? e.actor_user_id.slice(0, 8)
                  : e.actor_role ?? '—';
                const dettagli =
                  e.before_data !== null ||
                  e.after_data !== null ||
                  (e.metadata != null && Object.keys(e.metadata).length > 0);
                return (
                  <li key={e.id}>
                    <details className="group">
                      <summary
                        className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${
                          dettagli ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'
                        }`}
                      >
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {e.entity_type}
                        </span>
                        <span className="shrink-0 font-medium tracking-tight">
                          {etichettaAzione(e.action)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                          {chiHaFatto}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {new Date(e.created_at).toLocaleString('it-IT', {
                            timeZone: 'Europe/Rome',
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </summary>
                      {dettagli ? (
                        <div className="space-y-2 border-t border-border/60 bg-muted/30 px-4 py-3">
                          {e.entity_id ? (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              id {e.entity_id}
                            </p>
                          ) : null}
                          {e.before_data !== null ? (
                            <JsonBlocco etichetta="Prima" dati={e.before_data} />
                          ) : null}
                          {e.after_data !== null ? (
                            <JsonBlocco etichetta="Dopo" dati={e.after_data} />
                          ) : null}
                          {e.metadata && Object.keys(e.metadata).length > 0 ? (
                            <JsonBlocco etichetta="Dettagli" dati={e.metadata} />
                          ) : null}
                        </div>
                      ) : null}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
