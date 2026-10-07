import Link from 'next/link';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CircleDot,
  Clock,
  Flame,
  Phone,
  Plus,
  UserPlus,
  User,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { Badge, Card, CardContent, cn } from '@kommessa/ui';

import { EmptyState } from '../../_components/empty-state';
import { elencaAssegnabiliTenant } from '../../_actions/commessa-tecnici';
import { TodoGlobaleBoard } from './_components/todo-globale-board';
import { confrontaPriorita, type Priorita } from '@kommessa/api/priorita';
import { leggiTutto } from '@kommessa/api/pagine';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

/** Una commessa come serve a chi la deve scegliere da una tendina. */
type ComessaPicker = {
  id: string;
  codice_interno: string;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  cliente: { ragione_sociale: string | null } | null;
};

export const metadata = { title: 'Task' };
export const dynamic = 'force-dynamic';

type Stato = 'aperto' | 'in_corso' | 'completato' | 'annullato';


interface SearchParams {
  /** 'richieste' = solo quelle senza commessa; 'commessa' = solo quelle con. */
  tipo?: string;
  stato?: string;
  priorita?: string;
  assegnato?: string;
  commessa?: string;
  q?: string;
}

const STATI_DEFAULT: Stato[] = ['aperto', 'in_corso'];

/**
 * Vista globale TODO cross-commessa.
 *
 * Sostituisce concettualmente la vecchia tab "Tickets". Mostra tutti i
 * TODO del tenant con filtri: stato, priorità, assegnatario, commessa,
 * testo. Default = aperti + in_corso ordinati per priorità+scadenza.
 *
 * Click su un TODO → atterra in /office/commesse/<id>/lavori per
 * gestirlo nel contesto della commessa (completa, note, etc).
 *
 * "Nuovo TODO" qui apre dialog con commessa picker → crea via server
 * action commessa-todo.
 */
export default async function TodoGlobalePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // ─── parse filtri ──────────────────────────────────────────────────
  const statiFiltro: Stato[] = searchParams.stato
    ? ([searchParams.stato] as Stato[])
    : STATI_DEFAULT;
  const prioritaFiltro = (searchParams.priorita as Priorita | undefined) ?? null;
  const assegnatoFiltro = searchParams.assegnato ?? null;
  const commessaFiltro = searchParams.commessa ?? null;
  const qFiltro = (searchParams.q ?? '').trim();
  const tipoFiltro =
    searchParams.tipo === 'richieste' || searchParams.tipo === 'commessa'
      ? searchParams.tipo
      : null;

  // ─── query principale ──────────────────────────────────────────────
  let q = supabase
    .from('commessa_todo' as never)
    .select(
      `id, titolo, descrizione, stato, priorita, assegnato_a, scadenza_at,
       sort_order, metadata, created_at, completato_at, commessa_id,
       cliente_id, cliente_testo, contatto,
       richiedente:clienti!commessa_todo_cliente_id_fkey ( ragione_sociale ),
       commessa:commesse!commessa_todo_commessa_id_fkey (
         id, codice_interno, nome_cartella,
         cliente:clienti ( ragione_sociale )
       ),
       assegnato:users!commessa_todo_assegnato_a_fkey ( id, display_name ),
       squadra:commessa_todo_squadra (
         user_id,
         persona:users!commessa_todo_squadra_user_id_fkey ( id, display_name )
       )`,
    )
    .in('stato', statiFiltro);

  if (prioritaFiltro) q = q.eq('priorita', prioritaFiltro);
  if (assegnatoFiltro === 'nessuno') {
    q = q.is('assegnato_a', null);
  } else if (assegnatoFiltro) {
    q = q.eq('assegnato_a', assegnatoFiltro);
  }
  if (commessaFiltro) q = q.eq('commessa_id', commessaFiltro);
  // `.is()` e non `.eq(..., null)`: quest'ultimo non trova i NULL.
  if (tipoFiltro === 'richieste') q = q.is('commessa_id', null);
  else if (tipoFiltro === 'commessa') q = q.not('commessa_id', 'is', null);
  if (qFiltro) {
    q = q.or(
      `titolo.ilike.%${qFiltro}%,descrizione.ilike.%${qFiltro}%`,
    );
  }

  const { data: todosRaw } = await q.limit(300);

  // ─── liste per filtri (commesse attive + tecnici) ──────────────────
  const [commesseRighe, assegnabili] = await Promise.all([
    // ⚠️ Lettura **completa**, non `.limit(200)`: su Bertaiola le commesse
    // attive sono 202, e le ultime due non comparivano ne' nel filtro ne' nel
    // modulo — senza nessun segnale. E' lo stesso difetto dei clienti di
    // settembre: un tetto scelto a occhio diventa un dato invisibile appena i
    // dati crescono.
    leggiTutto<ComessaPicker>(
      (da, a) =>
        supabase
          .from('commesse')
          .select(
            'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, cliente:clienti(ragione_sociale)',
          )
          .in('stato', ['bozza', 'aperta', 'in_corso', 'collaudo'])
          .order('codice_interno', { ascending: false })
          .order('id')
          .range(da, a),
      { contesto: 'commesse per il filtro dei task' },
    ),
    // Un task o una richiesta si dà a CHIUNQUE della squadra, non solo ai
    // tecnici: «chiama il fornitore» è roba d'ufficio, «passa a vedere la
    // caldaia» è roba da capo.
    elencaAssegnabiliTenant(),
  ]);

  // ─── trasforma + ordina ────────────────────────────────────────────
  type Row = {
    id: string;
    titolo: string;
    descrizione: string | null;
    stato: Stato;
    priorita: Priorita;
    assegnato_a: string | null;
    assegnato_nome: string | null;
    /**
     * Chi ci va: mandati da chi l'ha in mano. Vuoto = nessuno, per ora.
     * ⚠️ **Solo sulle richieste.** L'embed qui sotto legge comunque tutte le
     * righe, ma la tabella non accetta cose da fare di commessa (policy
     * `commessa_todo_squadra_write`): per quelle torna sempre vuoto.
     */
    squadra: Array<{ id: string; nome: string }>;
    scadenza_at: string | null;
    sort_order: number;
    metadata: Record<string, unknown> | null;
    /** null = richiesta: arrivata al telefono, non ancora un lavoro. */
    commessa_id: string | null;
    codice_interno: string | null;
    cliente_nome: string | null;
    /** Solo sulle richieste: come richiamare. */
    contatto: string | null;
    cliente_id: string | null;
    eRichiesta: boolean;
    isScaduto: boolean;
    fonteRiunione: boolean;
  };

  const now = Date.now();
  const todos: Row[] = ((todosRaw ?? []) as Array<any>).map((t) => {
    const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
    const cli = comm
      ? Array.isArray(comm.cliente)
        ? comm.cliente[0]
        : comm.cliente
      : null;
    const ass = Array.isArray(t.assegnato) ? t.assegnato[0] : t.assegnato;
    const richiedente = Array.isArray(t.richiedente) ? t.richiedente[0] : t.richiedente;
    const fonte = (t.metadata as { fonte?: string } | null)?.fonte ?? '';
    const eRichiesta = (t.commessa_id ?? null) === null;
    return {
      id: t.id as string,
      titolo: t.titolo as string,
      descrizione: (t.descrizione as string | null) ?? null,
      stato: t.stato as Stato,
      priorita: t.priorita as Priorita,
      assegnato_a: (t.assegnato_a as string | null) ?? null,
      assegnato_nome: (ass?.display_name as string | undefined) ?? null,
      squadra: ((t.squadra ?? []) as Array<any>)
        .map((s) => {
          const pr = Array.isArray(s.persona) ? s.persona[0] : s.persona;
          return {
            id: (pr?.id as string | undefined) ?? (s.user_id as string),
            nome: (pr?.display_name as string | undefined) ?? '—',
          };
        })
        .sort((x, y) => x.nome.localeCompare(y.nome, 'it')),
      scadenza_at: (t.scadenza_at as string | null) ?? null,
      sort_order: t.sort_order as number,
      metadata: (t.metadata as Record<string, unknown> | null) ?? null,
      commessa_id: (t.commessa_id as string | null) ?? null,
      codice_interno: (comm?.codice_interno as string | undefined) ?? null,
      // Sulle richieste il cliente è quello della telefonata: in anagrafica se
      // c'era, altrimenti il nome così come è stato detto.
      cliente_nome: eRichiesta
        ? ((richiedente?.ragione_sociale as string | undefined) ??
          (t.cliente_testo as string | null) ??
          null)
        : ((cli?.ragione_sociale as string | undefined) ?? null),
      contatto: (t.contatto as string | null) ?? null,
      cliente_id: (t.cliente_id as string | null) ?? null,
      eRichiesta,
      isScaduto: t.scadenza_at
        ? new Date(t.scadenza_at as string).getTime() < now
        : false,
      fonteRiunione: typeof fonte === 'string' && fonte.startsWith('riunione:'),
    };
  });

  todos.sort((a, b) => {
    // Le richieste prima: sono le uniche che aspettano una decisione (va in
    // sopralluogo? si butta?), il resto è lavoro già incanalato.
    if (a.eRichiesta !== b.eRichiesta) return a.eRichiesta ? -1 : 1;
    if (a.isScaduto !== b.isScaduto) return a.isScaduto ? -1 : 1;
    const dPri = confrontaPriorita(a.priorita, b.priorita);
    if (dPri !== 0) return dPri;
    return a.titolo.localeCompare(b.titolo, 'it');
  });

  // ─── KPI sintetici ─────────────────────────────────────────────────
  const kpi = {
    richieste: todos.filter((t) => t.eRichiesta).length,
    // Il mucchio da smistare: aperte e senza nessuno che ci stia dietro.
    daAssegnare: todos.filter(
      (t) => !t.assegnato_a && t.stato !== 'completato' && t.stato !== 'annullato',
    ).length,
    aperti: todos.filter((t) => t.stato === 'aperto').length,
    inCorso: todos.filter((t) => t.stato === 'in_corso').length,
    urgenti: todos.filter((t) => t.priorita === 'urgente').length,
    scaduti: todos.filter((t) => t.isScaduto).length,
  };

  // ⚠️ Il titolo si compone qui, non a schermo: `nome_cartella` e' la directory
  // su Nextcloud (`{codice}_{cliente}_{lavoro}`) e non si mostra mai grezza.
  // Prima la tendina del modulo e il filtro della barra la stampavano tale e
  // quale, uno dei due troncata a trenta caratteri.
  const commesseAttive = commesseRighe.map((c) => ({
    id: c.id,
    codice: c.codice_interno,
    titolo: risolviTitoloCommessa({
      descrizione_ai_finale: c.descrizione_ai_finale,
      descrizione_ai_proposta: c.descrizione_ai_proposta,
      note_iniziali: c.note_iniziali,
      nome_cartella: c.nome_cartella,
      codice_interno: c.codice_interno,
      cliente_nome: c.cliente?.ragione_sociale ?? null,
    }),
    cliente: c.cliente?.ragione_sociale ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 lg:p-6">
      {/* Header compatto: titolo + KPI inline */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Lavori
          </p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight">Task e richieste</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {kpi.richieste > 0 ? (
            <KpiChip icon={<Phone />} label="Richieste" value={kpi.richieste} tone="amber" />
          ) : null}
          {kpi.daAssegnare > 0 ? (
            <KpiChip
              icon={<UserPlus />}
              label="Da assegnare"
              value={kpi.daAssegnare}
              tone="amber"
            />
          ) : null}
          <KpiChip icon={<CircleDot />} label="Aperti" value={kpi.aperti} />
          <KpiChip icon={<Clock />} label="In corso" value={kpi.inCorso} tone="blue" />
          <KpiChip icon={<Flame />} label="Urgenti" value={kpi.urgenti} tone="red" />
          <KpiChip icon={<AlertCircle />} label="Scaduti" value={kpi.scaduti} tone="amber" />
        </div>
      </header>

      {/* Board: sidebar filtri + lista */}
      <TodoGlobaleBoard
        todos={todos}
        currentUserId={ctx.userId}
        canWrite={ctx.role === 'admin' || ctx.role === 'office'}
        assegnabili={assegnabili}
        commesseAttive={commesseAttive}
        filtri={{
          tipo: tipoFiltro,
          stato: searchParams.stato ?? null,
          priorita: prioritaFiltro,
          assegnato: assegnatoFiltro,
          commessa: commessaFiltro,
          q: qFiltro,
        }}
      />
    </div>
  );
}

function KpiChip({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'blue' | 'red' | 'amber';
}) {
  const toneCls = {
    default: 'border-border text-foreground',
    blue: 'border-blue-500/30 text-blue-700 dark:text-blue-400',
    red: 'border-red-500/30 text-red-700 dark:text-red-400',
    amber: 'border-amber-500/30 text-amber-700 dark:text-amber-400',
  }[tone];
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1',
        toneCls,
      )}
    >
      <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
        {label}
      </span>
      <span className="font-mono text-sm font-bold tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
    </div>
  );
}

// suppress unused — usato sopra
void Plus;
void Calendar;
void User;
void CheckCircle2;
void Badge;
void Card;
void CardContent;
void EmptyState;
void Link;
