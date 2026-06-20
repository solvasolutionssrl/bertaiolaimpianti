'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck, Car, Package2, CheckCircle2, CircleOff, Search, X } from 'lucide-react';
import type { MezzoView, MezzoStats, TipoMezzo } from '../page';
import { creaMezzo, aggiornaMezzo, eliminaMezzo } from '@/app/office/_actions/kantiere-mezzi';

type ViaggioAggRow = {
  mezzo_id: string;
  km_totali: number;
  n_viaggi: number;
};

interface Props {
  mezzi: MezzoView[];
  viaggioAgg: ViaggioAggRow[];
}

function fmtKm(km: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(km);
}

// ── Costanti tipo ─────────────────────────────────────────────────────────

const TIPI: { value: TipoMezzo | ''; label: string }[] = [
  { value: '', label: 'Tutti i tipi' },
  { value: 'autocarro', label: 'Autocarro' },
  { value: 'autovettura', label: 'Autovettura' },
  { value: 'altro', label: 'Altro' },
];

function labelTipo(t: TipoMezzo): string {
  if (t === 'autocarro') return 'Autocarro';
  if (t === 'autovettura') return 'Autovettura';
  return 'Altro';
}

function TipoBadge({ tipo }: { tipo: TipoMezzo }) {
  if (tipo === 'autocarro') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <Truck className="h-3 w-3" aria-hidden="true" />
        Autocarro
      </span>
    );
  }
  if (tipo === 'autovettura') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Car className="h-3 w-3" aria-hidden="true" />
        Autovettura
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      <Package2 className="h-3 w-3" aria-hidden="true" />
      Altro
    </span>
  );
}

// ── Form aggiungi mezzo ────────────────────────────────────────────────────

function AggiiungiMezzoForm() {
  const router = useRouter();
  const [tipo, setTipo] = React.useState<TipoMezzo>('autocarro');
  const [targa, setTarga] = React.useState('');
  const [modello, setModello] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targa.trim()) { setErr("La targa e' obbligatoria"); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await creaMezzo({
        tipo,
        targa: targa.trim().toUpperCase(),
        modello: modello.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (!res.ok) { setErr(res.error); return; }
      setTarga('');
      setModello('');
      setNote('');
      setTipo('autocarro');
      router.refresh();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold">Aggiungi mezzo</h2>
      <div className="flex flex-wrap gap-3">
        {/* Tipo */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tipo *</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMezzo)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="autocarro">Autocarro</option>
            <option value="autovettura">Autovettura</option>
            <option value="altro">Altro</option>
          </select>
        </div>
        {/* Targa */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Targa *</label>
          <input
            type="text"
            value={targa}
            onChange={(e) => setTarga(e.target.value.toUpperCase())}
            placeholder="AB123CD"
            maxLength={20}
            className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans"
          />
        </div>
        {/* Modello */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Modello</label>
          <input
            type="text"
            value={modello}
            onChange={(e) => setModello(e.target.value)}
            placeholder="es. Fiat Ducato"
            maxLength={120}
            className="w-48 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        {/* Note */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Note</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Facoltativo"
            maxLength={500}
            className="w-56 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? 'Salvataggio...' : 'Aggiungi'}
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </form>
  );
}

// ── Riga mezzo ────────────────────────────────────────────────────────────

function MezzoRow({ mezzo, stats }: { mezzo: MezzoView; stats: MezzoStats | undefined }) {
  const router = useRouter();
  const [tipo, setTipo] = React.useState<TipoMezzo>(mezzo.tipo);
  const [targa, setTarga] = React.useState(mezzo.targa);
  const [modello, setModello] = React.useState(mezzo.modello ?? '');
  const [attivo, setAttivo] = React.useState(mezzo.attivo);
  const [note, setNote] = React.useState(mezzo.note ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const dirty =
    tipo !== mezzo.tipo ||
    targa.trim().toUpperCase() !== mezzo.targa ||
    (modello.trim() || null) !== mezzo.modello ||
    attivo !== mezzo.attivo ||
    (note.trim() || null) !== mezzo.note;

  async function salva() {
    if (!targa.trim()) { setErr("La targa e' obbligatoria"); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await aggiornaMezzo({
        id: mezzo.id,
        tipo,
        targa: targa.trim(),
        modello: modello.trim() || undefined,
        attivo,
        note: note.trim() || undefined,
      });
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function elimina() {
    setBusy(true);
    setErr(null);
    try {
      const res = await eliminaMezzo({ id: mezzo.id });
      if (!res.ok) { setErr(res.error); setConfirmDelete(false); return; }
      router.refresh();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <tr className="hover:bg-muted/30">
      {/* Tipo */}
      <td className="px-4 py-2.5">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoMezzo)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          aria-label="Tipo mezzo"
        >
          <option value="autocarro">Autocarro</option>
          <option value="autovettura">Autovettura</option>
          <option value="altro">Altro</option>
        </select>
      </td>
      {/* Targa */}
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={targa}
          onChange={(e) => setTarga(e.target.value.toUpperCase())}
          maxLength={20}
          className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm uppercase font-mono"
        />
      </td>
      {/* Modello */}
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={modello}
          onChange={(e) => setModello(e.target.value)}
          placeholder="n.d."
          maxLength={120}
          className="w-44 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
      </td>
      {/* Stato (toggle) */}
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => setAttivo((v) => !v)}
          className={[
            'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
            attivo
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground',
          ].join(' ')}
        >
          {attivo ? 'Attivo' : 'Disattivo'}
        </button>
      </td>
      {/* Note */}
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="n.d."
          maxLength={500}
          className="w-56 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
        {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
      </td>
      {/* Km totali */}
      <td className="px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground whitespace-nowrap">
        {stats ? (
          <span title={`${stats.nViaggi} viaggio/i`}>
            {fmtKm(stats.kmTotali)} km
            <span className="ml-1.5 text-xs text-muted-foreground/70">({stats.nViaggi})</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">n.d.</span>
        )}
      </td>
      {/* Azioni */}
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/office/kantiere/mezzi/${mezzo.id}`}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            Storico
          </Link>
          {dirty && (
            <button
              disabled={busy}
              onClick={salva}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Salva
            </button>
          )}
          {confirmDelete ? (
            <>
              <button
                disabled={busy}
                onClick={elimina}
                className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                Conferma
              </button>
              <button
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Annulla
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-destructive hover:bg-muted disabled:opacity-50"
            >
              Elimina
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── MezziClient (root) ────────────────────────────────────────────────────

export function MezziClient({ mezzi, viaggioAgg }: Props) {
  const [cerca, setCerca] = React.useState('');
  const [filtroTipo, setFiltroTipo] = React.useState<TipoMezzo | ''>('');
  const [filtroStato, setFiltroStato] = React.useState<'tutti' | 'attivi'>('tutti');

  // Mappa mezzo_id -> stats
  const statsMap = React.useMemo(() => {
    const m = new Map<string, MezzoStats>();
    for (const v of viaggioAgg) {
      m.set(v.mezzo_id, { kmTotali: v.km_totali, nViaggi: v.n_viaggi });
    }
    return m;
  }, [viaggioAgg]);

  // Statistiche
  const totale = mezzi.length;
  const autocarri = mezzi.filter((m) => m.tipo === 'autocarro').length;
  const autovetture = mezzi.filter((m) => m.tipo === 'autovettura').length;
  const attivi = mezzi.filter((m) => m.attivo).length;
  const disattivi = totale - attivi;

  // Filtro
  const q = cerca.trim().toUpperCase();
  const visibili = mezzi.filter((m) => {
    if (filtroTipo && m.tipo !== filtroTipo) return false;
    if (filtroStato === 'attivi' && !m.attivo) return false;
    if (q && !m.targa.includes(q) && !(m.modello ?? '').toUpperCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Barra statistiche */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Totale mezzi</p>
          <p className="mt-1 text-2xl font-semibold">{totale}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Autocarri</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-2xl font-semibold">{autocarri}</p>
            <Truck className="mb-0.5 h-4 w-4 text-slate-500" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Autovetture</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-2xl font-semibold">{autovetture}</p>
            <Car className="mb-0.5 h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Attivi / disattivi</p>
          <div className="mt-1 flex items-end gap-2">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
              <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">{attivi}</p>
            </div>
            <span className="mb-0.5 text-muted-foreground">/</span>
            <div className="flex items-center gap-1">
              <CircleOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <p className="text-xl font-semibold text-muted-foreground">{disattivi}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form aggiungi */}
      <AggiiungiMezzoForm />

      {/* Barra ricerca + filtri */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca targa o modello..."
            className="w-full rounded-md border border-input bg-background pl-8 pr-8 py-1.5 text-sm"
          />
          {cerca && (
            <button
              type="button"
              onClick={() => setCerca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Cancella ricerca"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as TipoMezzo | '')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Filtra per tipo"
        >
          {TIPI.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value as 'tutti' | 'attivi')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Filtra per stato"
        >
          <option value="tutti">Tutti gli stati</option>
          <option value="attivi">Solo attivi</option>
        </select>
        {(cerca || filtroTipo || filtroStato !== 'tutti') && (
          <span className="text-xs text-muted-foreground">
            {visibili.length} di {totale}
          </span>
        )}
      </div>

      {/* Tabella */}
      {mezzi.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 py-12 text-center">
          <Truck className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">Nessun mezzo registrato</p>
          <p className="mt-1 text-xs text-muted-foreground">Aggiungi il primo mezzo con il modulo sopra.</p>
        </div>
      ) : visibili.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 py-10 text-center">
          <p className="text-sm text-muted-foreground">Nessun mezzo corrisponde ai filtri applicati.</p>
          <button
            type="button"
            onClick={() => { setCerca(''); setFiltroTipo(''); setFiltroStato('tutti'); }}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Rimuovi filtri
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Targa</th>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Modello</th>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Stato</th>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Note</th>
                <th className="px-4 py-2.5 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Km tot. (viaggi)</th>
                <th className="px-4 py-2.5 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibili.map((m) => (
                <MezzoRow key={m.id} mezzo={m} stats={statsMap.get(m.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legenda tipo (solo se ci sono mezzi) */}
      {mezzi.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="font-medium">Legenda:</span>
          {(['autocarro', 'autovettura', 'altro'] as TipoMezzo[]).map((t) => (
            <span key={t} className="flex items-center gap-1">
              <TipoBadge tipo={t} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
