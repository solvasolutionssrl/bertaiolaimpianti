import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, ClipboardCheck, MapPin, Mic } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { StatoBadge } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';

import { guardMobile } from './_lib/guard';

export const metadata: Metadata = {
  title: 'Le mie commesse',
};

interface CommessaRow {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: StatoCommessa;
  cliente_indirizzo_cantiere: string | null;
  data_apertura: string;
  cliente: { id: string; ragione_sociale: string } | null;
  voci_attive: number;
  foto_caricate: number;
  foto_richieste: number;
}

/**
 * /mobile — "Le mie commesse oggi" (Mockup_UI §4-bis).
 *
 * Filtro: commesse dove
 *   - responsabile_id = utente corrente, OR
 *   - utente corrente è assegnato_a su almeno una commessa_voci
 * Per MVP: lato app usiamo la prima clausola; la seconda richiede la
 * colonna `commessa_voci.assegnato_a` (TBD: non ancora in migrazioni —
 * vedi `20260101000700_commessa_voci.sql`). Quando esiste, basta
 * estendere la query qui sotto.
 *
 * Le foto target sono `SUM(min_foto_richieste)` su tutte le voci attive,
 * le foto caricate sono `SUM(foto_caricate_count)`.
 */
export default async function MobileCommessePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        nome_cartella,
        stato,
        cliente_indirizzo_cantiere,
        data_apertura,
        cliente:clienti ( id, ragione_sociale ),
        voci:commessa_voci ( min_foto_richieste, foto_caricate_count, stato )
      `,
    )
    .eq('responsabile_id', ctx.userId)
    .in('stato', ['aperta', 'in_corso', 'collaudo'])
    .order('data_apertura', { ascending: false })
    .limit(30);

  if (error) {
    return (
      <ErrorState
        title="Impossibile caricare le commesse"
        detail={error.message}
      />
    );
  }

  const rows: CommessaRow[] = (data ?? []).map((r) => {
    const voci = Array.isArray(r.voci) ? r.voci : [];
    return {
      id: r.id,
      codice_interno: r.codice_interno,
      nome_cartella: r.nome_cartella,
      stato: r.stato as StatoCommessa,
      cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
      data_apertura: r.data_apertura,
      cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
      voci_attive: voci.filter((v) => v.stato !== 'completata').length,
      foto_caricate: voci.reduce(
        (acc, v) => acc + (v.foto_caricate_count ?? 0),
        0,
      ),
      foto_richieste: voci.reduce(
        (acc, v) => acc + (v.min_foto_richieste ?? 0),
        0,
      ),
    };
  });

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          · {greeting()} · {formatToday()} ·
        </p>
        <h1 className="mt-1 text-[26px] font-semibold leading-none tracking-tight">
          Oggi
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {rows.length === 0
            ? 'Nessuna commessa attiva.'
            : `${rows.length} ${rows.length === 1 ? 'commessa attiva' : 'commesse attive'}`}
        </p>
      </header>

      {/* Azioni rapide — sostituiscono Sopralluogo dalla bottom-nav */}
      <div className="grid grid-cols-2 gap-2">
        <QuickAction
          href="/mobile/sopralluogo"
          icon={ClipboardCheck}
          label="Nuovo sopralluogo"
          hint="7 passi · cliente nuovo"
        />
        <QuickAction
          href="/mobile/voice-intake"
          icon={Mic}
          label="Voce"
          hint="detta nota o ordine"
          tone="primary"
          dataTour="vocale"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <li key={c.id}>
              <CommessaCard commessa={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
  tone = 'default',
  dataTour,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  tone?: 'default' | 'primary';
  dataTour?: string;
}) {
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className={[
        'group relative flex flex-col gap-1 overflow-hidden rounded-xl border p-3 transition-colors active:scale-[0.99]',
        tone === 'primary'
          ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
          : 'border-border bg-card hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-lg border',
            tone === 'primary'
              ? 'border-primary/30 bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span
          aria-hidden="true"
          className={[
            'font-mono text-[9px] uppercase tracking-[0.18em]',
            tone === 'primary' ? 'text-primary' : 'text-muted-foreground/70',
          ].join(' ')}
        >
          {tone === 'primary' ? 'rec' : 'new'}
        </span>
      </div>
      <span className="mt-1 text-sm font-semibold tracking-tight text-foreground">
        {label}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {hint}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------

function CommessaCard({ commessa }: { commessa: CommessaRow }) {
  const fotoUnder =
    commessa.foto_richieste > 0 && commessa.foto_caricate < commessa.foto_richieste;

  return (
    <Link
      href={`/mobile/commessa/${commessa.id}`}
      data-tour="commessa-card"
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {commessa.codice_interno}
            </span>
            <StatoBadge stato={commessa.stato} hideEmoji />
          </div>
          <p className="mt-1 truncate text-base font-medium text-foreground">
            {commessa.cliente?.ragione_sociale ?? '—'}
          </p>
          {commessa.cliente_indirizzo_cantiere ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{commessa.cliente_indirizzo_cantiere}</span>
            </p>
          ) : null}
        </div>
        <ChevronRight
          className="mt-1 h-5 w-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      <dl className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <div>
          <dt className="sr-only">Voci attive</dt>
          <dd>
            <span className="font-semibold text-foreground">
              {commessa.voci_attive}
            </span>{' '}
            {commessa.voci_attive === 1 ? 'fase attiva' : 'fasi attive'}
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <span aria-hidden="true">📸</span>
          <span
            className={
              fotoUnder
                ? 'font-semibold text-stato-collaudo'
                : 'font-semibold text-foreground'
            }
          >
            {commessa.foto_caricate}/{commessa.foto_richieste || '—'}
          </span>
          {fotoUnder ? (
            <span aria-label="Sotto target foto" title="Sotto target foto">
              ⚠
            </span>
          ) : null}
        </div>
      </dl>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
      <p className="text-sm text-muted-foreground">
        Nessuna commessa attiva assegnata a te per oggi.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Le commesse compaiono qui appena un capo ti assegna come responsabile.
      </p>
    </div>
  );
}

function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/10 p-6">
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
  return new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
