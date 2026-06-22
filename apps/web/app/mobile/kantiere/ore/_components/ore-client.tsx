'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Send, Save, CheckCircle2, ChevronDown, PenLine, Clock } from 'lucide-react';
import { Button } from '@kommessa/ui';

import { useConfirm } from '@/app/_components/confirm-provider';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  salvaMioRapportino,
  inviaMioRapportino,
} from '@/app/_actions/kantiere-rapportino';
import { ManualeDialog } from './manuale-dialog';

// ── tipi ────────────────────────────────────────────────────────────────────

type RigaRapportino = {
  id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  target_label: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  note: string | null;
};

type RapportinoProps = {
  id: string;
  data: string;
  stato: string;
  note: string | null;
  righe: RigaRapportino[];
};

interface OreClientProps {
  rapportino: RapportinoProps;
  commesseDisponibili: { id: string; titolo: string }[];
  cantieriDisponibili: { id: string; nome: string }[];
  sediDisponibili: { id: string; nome: string; tipo: string }[];
  mezziDisponibili: { id: string; targa: string; modello: string | null }[];
}

// ── tipi riga editabile ───────────────────────────────────────────────────

type RigaEditable = {
  /** undefined = riga nuova non ancora persistita */
  id: string | undefined;
  commessa_id: string | null;
  cantiere_id: string | null;
  target_label: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  note: string;
};

function rigaFromPayload(r: RigaRapportino): RigaEditable {
  return {
    id: r.id,
    commessa_id: r.commessa_id,
    cantiere_id: r.cantiere_id,
    target_label: r.target_label,
    ore_ordinarie: r.ore_ordinarie,
    ore_straordinarie: r.ore_straordinarie,
    ore_viaggio: r.ore_viaggio,
    note: r.note ?? '',
  };
}

// ── helper: codifica/decodifica valore option del picker ─────────────────────
// formato: "c:<uuid>" = commessa, "k:<uuid>" = cantiere

function encodePickerValue(tipo: 'commessa' | 'cantiere', id: string): string {
  return tipo === 'commessa' ? `c:${id}` : `k:${id}`;
}

function decodePickerValue(val: string): { tipo: 'commessa' | 'cantiere'; id: string } | null {
  if (val.startsWith('c:')) return { tipo: 'commessa', id: val.slice(2) };
  if (val.startsWith('k:')) return { tipo: 'cantiere', id: val.slice(2) };
  return null;
}

// ── helper ore ───────────────────────────────────────────────────────────────

function sumOre(righe: RigaEditable[], field: 'ore_ordinarie' | 'ore_straordinarie' | 'ore_viaggio'): number {
  return righe.reduce((acc, r) => acc + (r[field] || 0), 0);
}

function fmtOre(n: number): string {
  // Formatta con max 2 decimali, senza trailing zeros
  return parseFloat(n.toFixed(2)).toString();
}

// ── input numerico ore ───────────────────────────────────────────────────────

function OreInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        min={0}
        max={24}
        step={0.25}
        value={value}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          onChange(isNaN(val) ? 0 : Math.max(0, Math.min(24, val)));
        }}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-center font-mono text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

// ── stato badge ──────────────────────────────────────────────────────────────

function StatoBadge({ stato }: { stato: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    bozza: { label: 'Bozza', cls: 'bg-muted text-muted-foreground border-border' },
    inviato: { label: 'Inviato', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
    approvato: { label: 'Approvato', cls: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
    respinto: { label: 'Respinto', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  };
  const meta = map[stato] ?? { label: stato, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

// ── componente principale ────────────────────────────────────────────────────

export function OreClient({
  rapportino,
  commesseDisponibili,
  cantieriDisponibili,
  sediDisponibili,
  mezziDisponibili,
}: OreClientProps) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [righe, setRighe] = useState<RigaEditable[]>(() =>
    rapportino.righe.map(rigaFromPayload),
  );
  const [note, setNote] = useState(rapportino.note ?? '');
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  // picker target (valore encodato "c:<uuid>" o "k:<uuid>")
  const [pickerTarget, setPickerTarget] = useState('');

  // dialog inserimento manuale
  const [manualeOpen, setManualeOpen] = useState(false);

  const isBozza = rapportino.stato === 'bozza';
  const isEditabile = ['bozza', 'inviato', 'respinto'].includes(rapportino.stato);

  // ── Bozza locale anti-perdita-dati ──────────────────────────────────────────
  // Le modifiche non salvate vengono memorizzate sul dispositivo: se la rete è
  // lenta o l'utente naviga avanti/indietro, al rientro vengono ripristinate.
  const draftKey = `kantiere-ore-draft-${rapportino.id}`;
  const dirtyRef = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Ripristino bozza locale al montaggio (solo se rapportino in bozza).
  useEffect(() => {
    if (!isBozza || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as { righe?: RigaEditable[]; note?: string };
      if (d && Array.isArray(d.righe)) {
        setRighe(d.righe);
        setNote(typeof d.note === 'string' ? d.note : '');
        dirtyRef.current = true;
        setDraftRestored(true);
      }
    } catch {
      /* bozza locale corrotta: ignora */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistenza bozza locale a ogni modifica (solo dopo una modifica reale).
  useEffect(() => {
    if (!isBozza || typeof window === 'undefined' || !dirtyRef.current) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ righe, note, ts: Date.now() }));
    } catch {
      /* quota piena / storage non disponibile: ignora */
    }
  }, [righe, note, isBozza, draftKey]);

  function clearDraft() {
    dirtyRef.current = false;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        /* ignora */
      }
    }
    setDraftRestored(false);
  }

  function scartaDraft() {
    setRighe(rapportino.righe.map(rigaFromPayload));
    setNote(rapportino.note ?? '');
    clearDraft();
  }

  // Chiavi gia usate nelle righe correnti
  const targetUsati = new Set<string>(
    righe.flatMap((r) => {
      if (r.commessa_id) return [`c:${r.commessa_id}`];
      if (r.cantiere_id) return [`k:${r.cantiere_id}`];
      return [];
    }),
  );

  const commesseLibere = commesseDisponibili.filter((c) => !targetUsati.has(`c:${c.id}`));
  const cantieriLiberi = cantieriDisponibili.filter((c) => !targetUsati.has(`k:${c.id}`));

  const haTargetLiberi = commesseLibere.length > 0 || cantieriLiberi.length > 0;

  function aggiungiRiga() {
    const decoded = decodePickerValue(pickerTarget);
    if (!decoded) return;
    dirtyRef.current = true;

    let label = '';
    if (decoded.tipo === 'commessa') {
      const c = commesseDisponibili.find((x) => x.id === decoded.id);
      if (!c) return;
      label = c.titolo;
    } else {
      const c = cantieriDisponibili.find((x) => x.id === decoded.id);
      if (!c) return;
      label = c.nome;
    }

    setRighe((prev) => [
      ...prev,
      {
        id: undefined,
        commessa_id: decoded.tipo === 'commessa' ? decoded.id : null,
        cantiere_id: decoded.tipo === 'cantiere' ? decoded.id : null,
        target_label: label,
        ore_ordinarie: 0,
        ore_straordinarie: 0,
        ore_viaggio: 0,
        note: '',
      },
    ]);
    setPickerTarget('');
    setErrore(null);
    setSuccesso(null);
  }

  function rimuoviRiga(idx: number) {
    dirtyRef.current = true;
    setRighe((prev) => prev.filter((_, i) => i !== idx));
    setErrore(null);
    setSuccesso(null);
  }

  function aggiornaRiga<K extends keyof RigaEditable>(idx: number, field: K, value: RigaEditable[K]) {
    dirtyRef.current = true;
    setRighe((prev) => {
      const next = [...prev];
      const riga = next[idx];
      if (!riga) return prev;
      next[idx] = { ...riga, [field]: value };
      return next;
    });
    setErrore(null);
    setSuccesso(null);
  }

  function buildRighePayload() {
    return righe.map((r) => ({
      commessa_id: r.commessa_id ?? null,
      cantiere_id: r.cantiere_id ?? null,
      ore_ordinarie: r.ore_ordinarie,
      ore_straordinarie: r.ore_straordinarie,
      ore_viaggio: r.ore_viaggio,
      note: r.note || undefined,
    }));
  }

  function handleSalva() {
    startTransition(async () => {
      setErrore(null);
      setSuccesso(null);
      const res = await salvaMioRapportino({
        rapportinoId: rapportino.id,
        righe: buildRighePayload(),
        note: note || undefined,
      });
      if (res.ok) {
        clearDraft();
        setSuccesso('Bozza salvata.');
        router.refresh();
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  function handleInvia() {
    startTransition(async () => {
      setErrore(null);
      setSuccesso(null);

      const ok = await askConfirm({
        title: 'Inviare il rapportino?',
        description: "Dopo l'invio non sara' piu' modificabile.",
        confirmLabel: "Invia all'ufficio",
        cancelLabel: 'Annulla',
      });
      if (!ok) return;

      // Prima salva le modifiche correnti, poi invia
      const salvato = await salvaMioRapportino({
        rapportinoId: rapportino.id,
        righe: buildRighePayload(),
        note: note || undefined,
      });
      if (!salvato.ok) {
        setErrore(messaggioErrore(salvato.error));
        return;
      }

      const res = await inviaMioRapportino({ rapportinoId: rapportino.id });
      if (res.ok) {
        clearDraft();
        router.refresh();
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  const totOrdinarie = sumOre(righe, 'ore_ordinarie');
  const totStraordinarie = sumOre(righe, 'ore_straordinarie');
  const totViaggio = sumOre(righe, 'ore_viaggio');

  const puoiManuale = isEditabile && cantieriDisponibili.length > 0;
  const mostraPicker = isBozza && haTargetLiberi;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Riepilogo di oggi ── */}
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.06] to-transparent p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Totale di oggi
          </p>
          <StatoBadge stato={rapportino.stato} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              { label: 'Ordinarie', val: totOrdinarie, tone: 'text-foreground' },
              { label: 'Straord.', val: totStraordinarie, tone: 'text-amber-600' },
              { label: 'Viaggio', val: totViaggio, tone: 'text-sky-600' },
            ] as const
          ).map(({ label, val, tone }) => (
            <div
              key={label}
              className="rounded-xl border border-border/60 bg-background/70 px-2.5 py-2 text-center"
            >
              <span className={`block font-mono text-2xl font-bold leading-none tabular-nums ${tone}`}>
                {fmtOre(val)}
              </span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {isBozza
            ? "Le timbrature dal QR compilano gia il viaggio. Controlla le ore di lavoro di ogni cantiere, poi invia all'ufficio."
            : "Rapportino inviato: e in sola lettura. Per correzioni contatta l'ufficio."}
        </p>
      </section>

      {/* Bozza locale ripristinata */}
      {draftRestored && isBozza && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>Ripristinate modifiche non salvate da questo dispositivo.</span>
          <button
            type="button"
            onClick={scartaDraft}
            className="shrink-0 font-medium underline-offset-2 hover:underline"
          >
            Scarta
          </button>
        </div>
      )}

      {/* ── Voci ore ── */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Cantieri e commesse
          </h2>
          {righe.length > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {righe.length} {righe.length === 1 ? 'voce' : 'voci'}
            </span>
          )}
        </div>

        {righe.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-8 text-center shadow-soft">
            <span className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">Nessuna voce per oggi</p>
            <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
              Aggiungi un cantiere o una commessa qui sotto e inserisci le ore.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {righe.map((riga, idx) => (
              <div
                key={`${riga.commessa_id ?? riga.cantiere_id}-${idx}`}
                className="rounded-xl border border-border bg-card p-3 shadow-soft"
              >
                {/* Etichetta target */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    {riga.cantiere_id && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        Cantiere
                      </span>
                    )}
                    <p className="text-sm font-semibold leading-tight text-foreground truncate">
                      {titoloCase(riga.target_label)}
                    </p>
                  </div>
                  {isBozza && (
                    <button
                      type="button"
                      onClick={() => rimuoviRiga(idx)}
                      disabled={isPending}
                      aria-label="Rimuovi riga"
                      className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-destructive disabled:opacity-40"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Inputs ore */}
                <div className="grid grid-cols-3 gap-2">
                  <OreInput
                    label="Ordinarie"
                    value={riga.ore_ordinarie}
                    onChange={(v) => aggiornaRiga(idx, 'ore_ordinarie', v)}
                    disabled={!isBozza || isPending}
                  />
                  <OreInput
                    label="Straord."
                    value={riga.ore_straordinarie}
                    onChange={(v) => aggiornaRiga(idx, 'ore_straordinarie', v)}
                    disabled={!isBozza || isPending}
                  />
                  <OreInput
                    label="Viaggio"
                    value={riga.ore_viaggio}
                    onChange={(v) => aggiornaRiga(idx, 'ore_viaggio', v)}
                    disabled={!isBozza || isPending}
                  />
                </div>

                {/* Nota riga */}
                {isBozza && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Nota riga (opzionale)"
                      value={riga.note}
                      onChange={(e) => aggiornaRiga(idx, 'note', e.target.value)}
                      disabled={isPending}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                )}
                {!isBozza && riga.note && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{riga.note}</p>
                )}
              </div>
            ))}
          </div>
        )}

      </section>

      {/* ── Aggiungi una voce ── */}
      {(mostraPicker || puoiManuale) && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-3.5 shadow-soft">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Aggiungi una voce
          </p>

          {mostraPicker && (
            <div className="space-y-1.5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Scegli un cantiere o una commessa, poi compila le ore nella voce.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={pickerTarget}
                    onChange={(e) => setPickerTarget(e.target.value)}
                    disabled={isPending}
                    className="w-full appearance-none rounded-md border border-border bg-background py-2.5 pl-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">Scegli commessa o cantiere...</option>
                    {commesseLibere.length > 0 && (
                      <optgroup label="Commesse">
                        {commesseLibere.map((c) => (
                          <option key={c.id} value={encodePickerValue('commessa', c.id)}>
                            {titoloCase(c.titolo)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {cantieriLiberi.length > 0 && (
                      <optgroup label="Cantieri">
                        {cantieriLiberi.map((c) => (
                          <option key={c.id} value={encodePickerValue('cantiere', c.id)}>
                            {c.nome}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={aggiungiRiga}
                  disabled={!pickerTarget || isPending}
                  aria-label="Aggiungi voce"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {puoiManuale && (
            <>
              {mostraPicker && (
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
                    oppure
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setManualeOpen(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] px-3 py-3 text-left transition-colors hover:bg-primary/10 active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PenLine className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    Inserimento completo
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    Ore di lavoro e viaggio andata/ritorno, con sede e mezzo.
                  </span>
                </span>
              </button>
            </>
          )}
        </section>
      )}

      {/* ── Note per l'ufficio ── */}
      <section className="space-y-1.5 rounded-2xl border border-border bg-card p-3.5 shadow-soft">
        <label htmlFor="note-testata" className="block text-sm font-semibold text-foreground">
          Note per l&apos;ufficio
        </label>
        <p className="text-xs text-muted-foreground">
          Facoltative. Segnala imprevisti o spiegazioni sulle ore (es. fermo cantiere).
        </p>
        <textarea
          id="note-testata"
          rows={3}
          value={note}
          onChange={(e) => {
            dirtyRef.current = true;
            setNote(e.target.value);
          }}
          disabled={!isBozza || isPending}
          placeholder="Es. fermo per pioggia, materiale mancante..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
      </section>

      {/* Feedback */}
      {errore && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errore}
        </p>
      )}
      {successo && (
        <p className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {successo}
        </p>
      )}

      {/* Bottoni azione */}
      {isBozza && (
        <div className="flex flex-col gap-2 pb-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleSalva}
            disabled={isPending}
            className="w-full gap-2"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isPending ? 'Attendere...' : 'Salva bozza'}
          </Button>
          <Button
            type="button"
            onClick={handleInvia}
            disabled={isPending}
            className="w-full gap-2"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {isPending ? 'Attendere...' : "Invia all'ufficio"}
          </Button>
        </div>
      )}

      {/* Dialog inserimento manuale */}
      <ManualeDialog
        open={manualeOpen}
        onClose={() => setManualeOpen(false)}
        data={rapportino.data}
        cantieri={cantieriDisponibili}
        sedi={sediDisponibili}
        mezzi={mezziDisponibili}
      />
    </div>
  );
}

// ── mappa errori ─────────────────────────────────────────────────────────────

function messaggioErrore(code: string): string {
  switch (code) {
    case 'NON_AUTENTICATO':
      return 'Devi essere autenticato per modificare il rapportino.';
    case 'MODULO_OFF':
      return 'Il modulo Kantiere non e abilitato per questo spazio.';
    case 'NESSUN_DIPENDENTE':
      return 'Nessun profilo dipendente collegato a questo account.';
    case 'NON_TROVATO':
      return 'Rapportino non trovato.';
    case 'NON_MODIFICABILE':
      return 'Il rapportino non e piu modificabile (gia inviato).';
    case 'FORBIDDEN':
      return 'Non sei autorizzato a modificare questo rapportino.';
    case 'Input non valido':
      return 'Dati non validi. Controlla i campi e riprova.';
    default:
      return `Errore: ${code}`;
  }
}
