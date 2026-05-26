import Link from 'next/link';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CircleDot,
  Clock,
  Flame,
  Plus,
  User,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { Badge, Card, CardContent, cn } from '@kommessa/ui';

import { SectionHeader } from '../../_components/section-header';
import { EmptyState } from '../../_components/empty-state';
import { elencaTecniciTenant } from '../../_actions/commessa-tecnici';
import { TodoGlobaleBoard } from './_components/todo-globale-board';

export const metadata = { title: 'Task' };
export const dynamic = 'force-dynamic';

type Stato = 'aperto' | 'in_corso' | 'completato' | 'annullato';
type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';

interface SearchParams {
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

  // ─── query principale ──────────────────────────────────────────────
  let q = supabase
    .from('commessa_todo' as never)
    .select(
      `id, titolo, descrizione, stato, priorita, assegnato_a, scadenza_at,
       sort_order, metadata, created_at, completato_at, commessa_id,
       commessa:commesse!commessa_todo_commessa_id_fkey (
         id, codice_interno, nome_cartella,
         cliente:clienti ( ragione_sociale )
       ),
       assegnato:users!commessa_todo_assegnato_a_fkey ( id, display_name )`,
    )
    .in('stato', statiFiltro);

  if (prioritaFiltro) q = q.eq('priorita', prioritaFiltro);
  if (assegnatoFiltro === 'nessuno') {
    q = q.is('assegnato_a', null);
  } else if (assegnatoFiltro) {
    q = q.eq('assegnato_a', assegnatoFiltro);
  }
  if (commessaFiltro) q = q.eq('commessa_id', commessaFiltro);
  if (qFiltro) {
    q = q.or(
      `titolo.ilike.%${qFiltro}%,descrizione.ilike.%${qFiltro}%`,
    );
  }

  const { data: todosRaw } = await q.limit(300);

  // ─── liste per filtri (commesse attive + tecnici) ──────────────────
  const [commesseRes, tecnici] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, codice_interno, nome_cartella')
      .in('stato', ['bozza', 'aperta', 'in_corso', 'collaudo'])
      .order('codice_interno', { ascending: false })
      .limit(200),
    elencaTecniciTenant(),
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
    scadenza_at: string | null;
    sort_order: number;
    metadata: Record<string, unknown> | null;
    commessa_id: string;
    codice_interno: string | null;
    cliente_nome: string | null;
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
    const fonte = (t.metadata as { fonte?: string } | null)?.fonte ?? '';
    return {
      id: t.id as string,
      titolo: t.titolo as string,
      descrizione: (t.descrizione as string | null) ?? null,
      stato: t.stato as Stato,
      priorita: t.priorita as Priorita,
      assegnato_a: (t.assegnato_a as string | null) ?? null,
      assegnato_nome: (ass?.display_name as string | undefined) ?? null,
      scadenza_at: (t.scadenza_at as string | null) ?? null,
      sort_order: t.sort_order as number,
      metadata: (t.metadata as Record<string, unknown> | null) ?? null,
      commessa_id: t.commessa_id as string,
      codice_interno: (comm?.codice_interno as string | undefined) ?? null,
      cliente_nome: (cli?.ragione_sociale as string | undefined) ?? null,
      isScaduto: t.scadenza_at
        ? new Date(t.scadenza_at as string).getTime() < now
        : false,
      fonteRiunione: typeof fonte === 'string' && fonte.startsWith('riunione:'),
    };
  });

  const priOrder: Record<Priorita, number> = {
    urgente: 0,
    alta: 1,
    media: 2,
    bassa: 3,
  };
  todos.sort((a, b) => {
    if (a.isScaduto !== b.isScaduto) return a.isScaduto ? -1 : 1;
    const pa = priOrder[a.priorita];
    const pb = priOrder[b.priorita];
    if (pa !== pb) return pa - pb;
    return a.titolo.localeCompare(b.titolo, 'it');
  });

  // ─── KPI sintetici ─────────────────────────────────────────────────
  const kpi = {
    aperti: todos.filter((t) => t.stato === 'aperto').length,
    inCorso: todos.filter((t) => t.stato === 'in_corso').length,
    urgenti: todos.filter((t) => t.priorita === 'urgente').length,
    scaduti: todos.filter((t) => t.isScaduto).length,
  };

  const commesseAttive = (commesseRes.data ?? []) as Array<{
    id: string;
    codice_interno: string;
    nome_cartella: string;
  }>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <SectionHeader
        eyebrow="Lavori"
        title="Task"
        description="Tutti i task da fare sul tenant — assegnabili, prioritizzabili, ordinabili. Click su un task per aprirlo nel contesto della commessa."
        icon={<CircleDot />}
      />

      {/* KPI sintetici */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon={<CircleDot />} label="Aperti" value={kpi.aperti} />
        <KpiTile icon={<Clock />} label="In corso" value={kpi.inCorso} tone="blue" />
        <KpiTile icon={<Flame />} label="Urgenti" value={kpi.urgenti} tone="red" />
        <KpiTile icon={<AlertCircle />} label="Scaduti" value={kpi.scaduti} tone="amber" />
      </div>

      {/* Board client: filtri + lista + dialog crea */}
      <TodoGlobaleBoard
        todos={todos}
        currentUserId={ctx.userId}
        canWrite={ctx.role === 'admin' || ctx.role === 'office'}
        tecnici={tecnici as Array<{ id: string; display_name: string | null }>}
        commesseAttive={commesseAttive}
        filtri={{
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

function KpiTile({
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
    default: 'border-border bg-card text-foreground',
    blue: 'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400',
    red: 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  }[tone];
  return (
    <div className={cn('rounded-lg border p-3', toneCls)}>
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] opacity-80">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
        {String(value).padStart(2, '0')}
      </p>
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
