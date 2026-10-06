import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import {
  Briefcase,
  ChevronRight,
  Clock,
  MapPin,
  Mic,
  Plus,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { StatoLed } from '@kommessa/ui';
import type { StatoCommessa } from '@kommessa/api/types';
import { getMobileShell } from '@kommessa/api/types';
import { STATI_COMMESSA_SU_MOBILE } from '@kommessa/api/stato-lavoro';

import { guardMobile } from './_lib/guard';
import { tenantHasModule } from '../_lib/modules';
import { getAppModeCached } from '../_lib/app-mode';
import { titoloCase } from './_lib/display-case';
import { SectionNumber, MetaLine, Stagger, CornerTicks, Hero, HeroMeta } from './_components/blueprint';
import { BozzeDaCompletare } from '../_components/bozze-da-completare';
import type { Priorita } from '@kommessa/api/priorita';
import { possoAprireLavori } from '../_lib/capacita-server';
import { CampanellaHero } from './_components/campanella-hero';
import { ElencoLavoro, type VoceLavoro } from './_components/elenco-lavoro';

/**
 * Dati dell'utente, quindi sempre freschi. Next lo dedurrebbe comunque dalla
 * lettura dei cookie, ma dichiararlo rende la regola la stessa su tutte le
 * rotte dell'app invece di dipendere da cosa capita di leggere.
 */
export const dynamic = 'force-dynamic';


export const metadata: Metadata = {
  title: 'Kommessa mobile',
};

interface CommessaRow {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: StatoCommessa;
  is_critica: boolean;
  cliente_indirizzo_cantiere: string | null;
  data_apertura: string;
  /** Descrizione del lavoro — è IL titolo della commessa, mostrato come h1. */
  titolo: string | null;
  cliente: { id: string; ragione_sociale: string } | null;
}

export default async function MobileHomePage() {
  const ctx = await guardMobile();

  // Tenant puro-Kantiere (es. FPM): non esiste una "home commessa". Subito dopo
  // il login si atterra a seconda del ruolo: admin/ufficio sul Cruscotto
  // (dashboard gestionale), i tecnici/capi sulla lista Cantieri. Bertaiola
  // (app_mode kommessa) resta invariata.
  const appMode = await getAppModeCached();
  if (appMode === 'kantiere') {
    const isManager = ctx.role === 'admin' || ctx.role === 'office';
    redirect(isManager ? '/mobile/kantiere/cruscotto' : '/mobile/kantiere/cantieri');
  }

  const shell = getMobileShell(ctx.role);

  return shell === 'gestione' ? <GestioneDashboard ctx={ctx} /> : <CampoOggi ctx={ctx} />;
}

// ─── GESTIONE DASHBOARD ──────────────────────────────────────────────────────

/**
 * Quante notifiche non lette ha chi sta guardando.
 *
 * Il conteggio lo fa gia' il guscio per il pallino sulla barra in basso, ma
 * questa e' una pagina e non puo' leggerlo da li': una domanda indicizzata in
 * piu' (`notifiche_user_unread_idx`) costa meno che passare un dato lungo
 * tutto l'albero dei componenti.
 */
async function contaNonLette(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from('notifiche')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .eq('user_id', userId);
  return count ?? 0;
}

async function GestioneDashboard({
  ctx,
}: {
  ctx: Awaited<ReturnType<typeof guardMobile>>;
}) {
  const supabase = createServerSupabase();
  const nonLette = await contaNonLette(supabase, ctx.userId);


  const recenti = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella, stato, is_critica,
        cliente_indirizzo_cantiere, data_apertura,
        descrizione_ai_finale, descrizione_ai_proposta, note_iniziali,
        cliente:clienti ( id, ragione_sociale )
      `,
    )
    // Le completate restano: per il tecnico questa lista e' l'unico modo di
    // riaprire da telefono il lavoro di ieri. Fuori le archiviate (la regola
    // sta in `commessaVisibileSuMobile`) e le bozze, che hanno la loro
    // sezione qui sotto.
    .in('stato', STATI_COMMESSA_SU_MOBILE.filter((s) => s !== 'bozza'))
    .order('data_apertura', { ascending: false })
    .order('codice_interno', { ascending: false })
    .limit(5);

  const recentRows: CommessaRow[] = ((recenti.data ?? []) as any[]).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
    nome_cartella: r.nome_cartella,
    stato: r.stato as StatoCommessa,
    is_critica: Boolean(r.is_critica),
    cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
    data_apertura: r.data_apertura,
    titolo: pickTitolo(r),
    cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
  }));

  const roleLabel: Record<string, string> = {
    admin: 'Amministratore',
    office: 'Ufficio',
    tecnico: 'Tecnico',
  };

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col pb-24">
      {/* Hero dark */}
      <Hero>
        <div className="flex items-start justify-between gap-3">
          <HeroMeta>
            {greeting()} · {formatToday()}
          </HeroMeta>
          <CampanellaHero
            userId={ctx.userId}
            tenantId={ctx.tenantId}
            initialCount={nonLette}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1 className="font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
            DASHBOARD
          </h1>
          <span className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/90">
            {roleLabel[ctx.role] ?? ctx.role}
          </span>
        </div>
        <p className="mt-2 text-sm text-primary-foreground/70">
          Riepilogo operativo del tenant.
        </p>
      </Hero>

      <div className="flex flex-col gap-7 px-4 pt-4">
        {/* ── CREA NUOVA COMMESSA — card bianca in risalto, overlap sull'hero ── */}
        <section className="-mt-12 animate-fade-up [animation-delay:40ms]">
          <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft-lg">
            <CornerTicks />
            {/* Grid pattern decorativo sullo sfondo */}
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.18]" aria-hidden="true" />
            <div className="relative">
              <h2 className="mb-4 text-sm font-semibold text-foreground">Crea nuova commessa</h2>
              <div className="grid grid-cols-2 gap-2.5">
                <QuickAction
                  href="/mobile/voice-intake"
                  icon={Mic}
                  label="Voce"
                  hint="detta e crea"
                  tone="primary"
                  tag="REC"
                  highlighted
                />
                <QuickAction
                  href="/mobile/sopralluogo"
                  icon={Plus}
                  label="Sopralluogo"
                  hint="step guidati"
                  tone="primary"
                />
              </div>
            </div>
          </div>
        </section>

      {/* Bozze da completare (solo se presenti) — resume del dettato/form */}
      <BozzeDaCompletare resumeBase="/mobile/voice-intake" variant="mobile" />

      {/* ── ULTIME COMMESSE ────────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:120ms]">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Ultime commesse</h2>
          {/* Bersaglio da 44px: scritto piccolo ma con l'area di tocco piena,
              altrimenti col dito (e coi guanti) si manca. */}
          <Link
            href="/mobile/commesse"
            className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-primary active:bg-primary/10"
          >
            Tutte →
          </Link>
        </div>
        {recentRows.length === 0 ? (
          <EmptyState />
        ) : (
          <Stagger className="flex flex-col gap-2">
            {recentRows.map((c, idx) => (
              <CommessaCard key={c.id} commessa={c} index={idx + 1} />
            ))}
          </Stagger>
        )}
      </section>
      </div>
    </div>
  );
}

// ─── CAMPO TODAY VIEW ────────────────────────────────────────────────────────

async function CampoOggi({
  ctx,
}: {
  ctx: Awaited<ReturnType<typeof guardMobile>>;
}) {
  const supabase = createServerSupabase();
  const nonLette = await contaNonLette(supabase, ctx.userId);

  // Un tecnico vede le commesse a cui è assegnato. ⚠️ Si legge anche
  // `assegnato_at`: è *l'ordine in cui le cose gli sono state affidate*, che
  // è il criterio con cui si ordina ciò che non ha una scadenza. Prima si
  // leggeva solo l'id e quell'informazione, che era già in tabella, si
  // buttava via.
  const { data: assegnazioni } = await supabase
    .from('commessa_tecnici')
    .select('commessa_id, assegnato_at')
    .eq('user_id', ctx.userId);

  const affidataIl = new Map<string, string | null>();
  for (const r of (assegnazioni ?? []) as Array<{ commessa_id: string; assegnato_at: string | null }>) {
    if (r.commessa_id) affidataIl.set(r.commessa_id, r.assegnato_at ?? null);
  }
  const assignedIds = [...affidataIl.keys()];

  // Un sentinella che non combacia con niente: serve perché una RICHIESTA
  // assegnata non dipende dalle commesse, e chi non ne ha nessuna deve vederla
  // comunque. Prima qui si usciva subito, e un capo con una richiesta in mano
  // vedeva «nessuna commessa assegnata».
  const idsCommesse =
    assignedIds.length > 0 ? assignedIds : ['00000000-0000-0000-0000-000000000000'];

  const [commesseRes, todosRes, richiesteRes] = await Promise.all([
    supabase
      .from('commesse')
      .select(
        `
          id, codice_interno, nome_cartella, stato, is_critica,
          cliente_indirizzo_cantiere, data_apertura,
          descrizione_ai_finale, descrizione_ai_proposta, note_iniziali,
          cliente:clienti ( id, ragione_sociale )
        `,
      )
      .in('id', idsCommesse)
      // Le completate restano: per il tecnico questa lista e' l'unico modo di
      // riaprire da telefono il lavoro di ieri. Fuori le archiviate (la regola
      // sta in `commessaVisibileSuMobile`) e le bozze, che non sono lavoro
      // assegnato.
      .in('stato', STATI_COMMESSA_SU_MOBILE.filter((s) => s !== 'bozza'))
      .limit(200),

    // Le cose da fare delle MIE commesse.
    //
    // ⚠️ La regola è **la stessa** della scheda commessa: le sue, quelle
    // assegnate a lui, e quelle di nessuno — non quelle date a un collega.
    // Scritta identica di proposito: se l'elenco e la scheda usassero due
    // predicati diversi, una cosa da fare comparirebbe in un posto e non
    // nell'altro, e nessuno saprebbe quale dei due ha ragione. Prima qui si
    // guardava solo `assegnato_a = me`, quindi le cose da fare «di chiunque
    // passi» — quelle che i tecnici si scrivono fra loro — non comparivano
    // affatto in questa pagina.
    supabase
      .from('commessa_todo' as never)
      .select(
        `id, titolo, descrizione, priorita, scadenza_at, created_at, assegnato_a, commessa_id,
         commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno )`,
      )
      .in('commessa_id', idsCommesse)
      .in('stato', ['aperto', 'in_corso'])
      .or(`assegnato_a.eq.${ctx.userId},assegnato_a.is.null,created_by.eq.${ctx.userId}`)
      .limit(200),

    // Le RICHIESTE assegnate a me: non hanno una commessa, quindi non possono
    // passare dal filtro qui sopra. Queste sì solo le mie: una richiesta senza
    // assegnatario è un mucchio dell'ufficio, non lavoro di questo tecnico.
    supabase
      .from('commessa_todo' as never)
      .select(
        `id, titolo, descrizione, priorita, scadenza_at, created_at, commessa_id, contatto, cliente_testo,
         richiedente:clienti!commessa_todo_cliente_id_fkey ( ragione_sociale )`,
      )
      .eq('assegnato_a', ctx.userId)
      .is('commessa_id', null)
      .in('stato', ['aperto', 'in_corso'])
      .limit(100),
  ]);

  if (commesseRes.error) {
    return <ErrorState title="Impossibile caricare le commesse" detail={commesseRes.error.message} />;
  }

  // Modulo Kantiere (FPM): mostra l'accesso al rapportino giornaliero.
  // Gated → per Bertaiola (modulo off) la card non compare.
  const hasKantiere = await tenantHasModule('kantiere');

  // Aprire un lavoro nuovo e' da capo squadra. Finora «Sopralluogo» e «Voce»
  // comparivano a tutti e portavano a un flusso che un tecnico non puo'
  // chiudere: si registrava, si aspettava la trascrizione, e all'ultimo tocco
  // arrivava «permessi insufficienti».
  const apreLavori = await possoAprireLavori();

  // ── Tutto in un elenco solo ────────────────────────────────────────────
  //
  // Le commesse e le cose da fare diventano voci della stessa forma. Filtro,
  // ricerca e ordine stanno nel modulo puro `@kommessa/api/elenco-lavoro`:
  // qui si traduce soltanto una riga di database in una voce a schermo.
  const commesse = (commesseRes.data ?? []) as any[];

  const vociCommesse: VoceLavoro[] = commesse.map((r) => {
    const cliente = Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente;
    const nomeCliente: string | null = cliente?.ragione_sociale ?? null;
    const lavoro = pickTitolo(r) ?? r.nome_cartella ?? null;
    return {
      tipo: 'commessa',
      id: r.id as string,
      titolo: nomeCliente || lavoro || r.codice_interno,
      // Tutto ciò su cui si lascia trovare: «rossi valeggio» deve bastare,
      // anche se il cognome sta nel cliente e il paese nell'indirizzo.
      cerca: [r.codice_interno, nomeCliente, lavoro, r.cliente_indirizzo_cantiere]
        .filter(Boolean)
        .join(' '),
      // Una commessa non ha una data entro cui va fatta: il suo posto
      // nell'elenco lo decide quando è stata affidata.
      scadenza: null,
      affidataIl: affidataIl.get(r.id as string) ?? r.data_apertura ?? null,
      codice: r.codice_interno as string,
      stato: r.stato as StatoCommessa,
      critica: Boolean(r.is_critica),
      cliente: nomeCliente,
      lavoro,
      indirizzo: (r.cliente_indirizzo_cantiere as string | null) ?? null,
    };
  });

  const vociTodo: VoceLavoro[] = ((todosRes.data ?? []) as any[]).map((t) => {
    const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
    const codice = (comm?.codice_interno as string | undefined) ?? null;
    return {
      tipo: 'todo',
      id: t.id as string,
      titolo: t.titolo as string,
      cerca: [codice, t.descrizione].filter(Boolean).join(' '),
      scadenza: (t.scadenza_at as string | null) ?? null,
      // ⚠️ `created_at` e non il momento dell'assegnazione: su
      // `commessa_todo` quel momento non è registrato da nessuna parte. È il
      // dato più vicino che esiste, e vale solo per le voci senza scadenza.
      affidataIl: (t.created_at as string | null) ?? null,
      priorita: t.priorita as Priorita,
      commessaId: t.commessa_id as string,
      codiceCommessa: codice,
    };
  });

  const vociRichieste: VoceLavoro[] = ((richiesteRes.data ?? []) as any[]).map((t) => {
    const chi = Array.isArray(t.richiedente) ? t.richiedente[0] : t.richiedente;
    const nome =
      (chi?.ragione_sociale as string | undefined) ?? (t.cliente_testo as string | null) ?? null;
    return {
      tipo: 'richiesta',
      id: t.id as string,
      titolo: t.titolo as string,
      cerca: [nome, t.contatto, t.descrizione].filter(Boolean).join(' '),
      scadenza: (t.scadenza_at as string | null) ?? null,
      affidataIl: (t.created_at as string | null) ?? null,
      priorita: t.priorita as Priorita,
      cliente: nome,
      contatto: (t.contatto as string | null) ?? null,
    };
  });

  const voci = [...vociCommesse, ...vociTodo, ...vociRichieste];
  const quanteCommesse = vociCommesse.length;
  const quanteDaFare = vociTodo.length + vociRichieste.length;

  // Niente commesse E niente da fare: allora sì, non c'è nulla da mostrare.
  if (voci.length === 0) {
    return (
      <CampoVuoto
        title="Nessuna commessa assegnata"
        body="Quando l'ufficio o l'amministratore ti assegna una commessa o una richiesta, la vedrai qui."
      />
    );
  }

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col pb-24">
      <Hero>
        <div className="flex items-start justify-between gap-3">
          <HeroMeta>
            {greeting()} · {formatToday()}
          </HeroMeta>
          <CampanellaHero
            userId={ctx.userId}
            tenantId={ctx.tenantId}
            initialCount={nonLette}
          />
        </div>
        {/* «OGGI» prometteva una giornata e mostrava tutto; e il nome non
            corrispondeva a nessuna delle tab in basso. Questa pagina è
            l'elenco di cosa si ha in mano, e si chiama come la tab che la
            apre e come la sezione che l'ufficio guarda. */}
        <h1 className="mt-2 font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
          COMMESSE
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/70">
          {[
            quanteCommesse > 0
              ? `${quanteCommesse} ${quanteCommesse === 1 ? 'commessa' : 'commesse'} in carico`
              : null,
            quanteDaFare > 0 ? `${quanteDaFare} da fare` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Nessuna commessa attiva.'}
        </p>
      </Hero>

      <div className="flex flex-col gap-6 px-4 pt-4">
        {/* Azioni rapide. Se non ne resta nessuna la card non si disegna: una
            scatola vuota col titolo «Azioni rapide» e' peggio di niente. */}
        {apreLavori || hasKantiere ? (
          <section className="-mt-12 space-y-3 animate-fade-up [animation-delay:40ms]">
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft-lg">
              <SectionNumber n={1} title="Azioni rapide" className="mb-3" />
              <div className="grid grid-cols-2 gap-2">
                {apreLavori ? (
                  <>
                    <QuickAction
                      href="/mobile/sopralluogo"
                      icon={Plus}
                      label="Sopralluogo"
                      hint="guidato · foto/video"
                      tone="primary"
                      dataTour="sopralluogo"
                    />
                    <QuickAction
                      href="/mobile/voice-intake"
                      icon={Mic}
                      label="Voce"
                      hint="detta nota"
                      tone="primary"
                      tag="REC"
                      dataTour="vocale"
                    />
                  </>
                ) : null}
                {hasKantiere ? (
                  <QuickAction
                    href="/mobile/kantiere/ore"
                    icon={Clock}
                    label="Le mie ore"
                    hint="rapportino di oggi"
                    tone="primary"
                  />
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section
          className={[
            'animate-fade-up [animation-delay:60ms]',
            apreLavori || hasKantiere ? '' : '-mt-10',
          ].join(' ')}
        >
          <ElencoLavoro voci={voci} />
        </section>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────

function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
  tone = 'default',
  tag,
  dataTour,
  highlighted = false,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  tone?: 'default' | 'primary';
  tag?: string;
  dataTour?: string;
  /** Leggermente in risalto rispetto alle altre azioni (es. "Voce"). */
  highlighted?: boolean;
}) {
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className={[
        'group relative flex flex-col gap-2 overflow-hidden rounded-lg border p-3 transition-all active:scale-[0.98]',
        highlighted
          ? 'border-primary/45 bg-primary/[0.1] ring-1 ring-primary/20 hover:bg-primary/[0.14]'
          : tone === 'primary'
            ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
            : 'border-border bg-card hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-md border',
            tone === 'primary'
              ? 'border-primary/30 bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
        </span>
        {tag ? (
          <span
            aria-hidden="true"
            className={[
              'font-mono text-[9px] font-bold uppercase tracking-[0.2em]',
              tone === 'primary' ? 'text-primary' : 'text-muted-foreground/60',
            ].join(' ')}
          >
            {tag}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        <span className="block text-sm font-semibold tracking-tight text-foreground">{label}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {hint}
        </span>
      </div>
    </Link>
  );
}

function CommessaCard({ commessa, index }: { commessa: CommessaRow; index: number }) {
  return (
    <Link
      href={`/mobile/commessa/${commessa.id}`}
      data-tour={index === 1 ? 'commessa-card' : undefined}
      className="group relative flex items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-card via-card to-primary-soft/40 p-3 shadow-soft-md transition-all active:scale-[0.99] active:bg-muted"
    >
      {/* Numerazione laterale */}
      <span
        aria-hidden="true"
        className="flex w-7 shrink-0 flex-col items-center justify-center border-r border-border/60 pr-2 font-mono text-[10px] font-bold tabular-nums text-muted-foreground/60"
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        {/* Riga 1: codice + stato + flag critica (meta) */}
        <div className="flex items-center gap-2">
          <StatoLed stato={commessa.stato} />
          <span className="font-mono text-[10px] font-semibold uppercase tabular-nums tracking-wider text-muted-foreground">
            {commessa.codice_interno}
          </span>
          {commessa.is_critica && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-px font-mono text-[9px] font-bold uppercase leading-none tracking-wider text-destructive">
              <span aria-hidden="true">●</span> Critica
            </span>
          )}
        </div>
        {/* Riga 2: Cliente (semibold dominante) — lavoro/titolo regular muted.
            Coerente con desktop: il cliente è il primo agganciamento mentale,
            il "lavoro" lo distingue tra più commesse dello stesso cliente. */}
        {(() => {
          const cliente = commessa.cliente?.ragione_sociale?.trim() ?? '';
          const lavoro = (commessa.titolo ?? commessa.nome_cartella ?? '').trim();
          const showBoth =
            cliente && lavoro && cliente.toLowerCase() !== lavoro.toLowerCase();
          return (
            <p className="mt-1 line-clamp-2 text-[15px] leading-snug tracking-tight text-foreground">
              <span className="font-semibold">{titoloCase(cliente) || titoloCase(lavoro) || '—'}</span>
              {showBoth ? (
                <>
                  <span className="text-muted-foreground/60"> — </span>
                  <span className="font-normal text-muted-foreground">
                    {titoloCase(lavoro)}
                  </span>
                </>
              ) : null}
            </p>
          );
        })()}
        {/* Riga 3: indirizzo cantiere (il cliente è ora già nella riga 2). */}
        {commessa.cliente_indirizzo_cantiere ? (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{titoloCase(commessa.cliente_indirizzo_cantiere)}</span>
          </p>
        ) : null}
      </div>

      <ChevronRight
        className="self-center h-4 w-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function CampoVuoto({ title, body }: { title: string; body: string }) {
  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col">
      <Hero>
        <HeroMeta>il tuo lavoro di oggi</HeroMeta>
        <h1 className="mt-1 font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
          OGGI
        </h1>
      </Hero>
      <div className="px-4 pt-6">
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
      <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Briefcase className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">Nessuna commessa attiva</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Le commesse compaiono qui appena vengono aperte
      </p>
    </div>
  );
}

function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-6">
      <p className="font-semibold text-destructive">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function formatToday() {
  return new Date()
    .toLocaleDateString('it-IT', {
      timeZone: 'Europe/Rome',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    .toUpperCase();
}

/**
 * Estrae il "titolo" di una commessa per il display nella lista:
 *  1. descrizione_ai_finale (set quando la commessa è creata via voice
 *     intake con AI extraction)
 *  2. descrizione_ai_proposta (proposta AI non rivista)
 *  3. note_iniziali (nota originale del capo)
 *  4. null → il chiamante usa nome_cartella o "—"
 *
 * Tronca la prima riga / prima frase per evitare titoli con 3 paragrafi.
 */
function pickTitolo(r: Record<string, unknown>): string | null {
  const raw =
    (r.descrizione_ai_finale as string | null | undefined) ??
    (r.descrizione_ai_proposta as string | null | undefined) ??
    (r.note_iniziali as string | null | undefined) ??
    null;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Primo a-capo o prima frase
  const firstLine = trimmed.split(/\r?\n/)[0]!;
  // Se primo "punto" è troppo presto (<10 char), prendiamo prima riga intera
  const firstPeriod = firstLine.indexOf('. ');
  if (firstPeriod > 10) return firstLine.slice(0, firstPeriod).trim();
  return firstLine;
}
