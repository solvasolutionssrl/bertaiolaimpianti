'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PenLine, Clock, CalendarClock } from 'lucide-react';

import { useConfirm } from '@/app/_components/confirm-provider';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  salvaMioRapportino,
  inviaMioRapportino,
} from '@/app/_actions/kantiere-rapportino';
import { ManualeDialog } from './manuale-dialog';
import { ModificaGiornataDialog } from './modifica-giornata-dialog';
import { RegistraGiornataDialog } from './registra-giornata-dialog';
import type { PickerCantiere } from '../../_components/cantiere-picker';

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
  cantieriDisponibili: PickerCantiere[];
  sediDisponibili: { id: string; nome: string; tipo: string; isDefault: boolean }[];
  /** cantiere_id → sede_id[] associate (oltre alla predefinita). */
  sediPerCantiere: Record<string, string[]>;
  mezziDisponibili: { id: string; targa: string; modello: string | null }[];
  /** true se c'è un turno aperto: il totale di oggi è ancora 0/parziale, quindi
   *  la panoramica compare solo a turno finito. */
  turnoInCorso: boolean;
  /** Registra giornata senza timbrature attiva (impostazione ufficio). */
  registraGiornataAttivo: boolean;
  /** Tolleranza (min) sulla somma. */
  tolleranzaChiusuraMin: number;
  /** Passo (min) degli stepper. */
  passoMinuti: number;
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


// ── helper ore ───────────────────────────────────────────────────────────────

function sumOre(righe: RigaEditable[], field: 'ore_ordinarie' | 'ore_straordinarie' | 'ore_viaggio'): number {
  return righe.reduce((acc, r) => acc + (r[field] || 0), 0);
}

function fmtOre(n: number): string {
  // Ore in formato H:MM (es. 7.5 → "7:30").
  const totMin = Math.max(0, Math.round(n * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
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
    bozza: { label: 'In verifica', cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
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
  cantieriDisponibili,
  sediDisponibili,
  sediPerCantiere,
  mezziDisponibili,
  turnoInCorso,
  registraGiornataAttivo,
  tolleranzaChiusuraMin,
  passoMinuti,
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

  // dialog inserimento manuale + registra giornata (caso 4)
  const [manualeOpen, setManualeOpen] = useState(false);
  const [registraOpen, setRegistraOpen] = useState(false);
  // dialog panoramica/correzione della giornata di oggi (pencil sul totale)
  const [panoramicaOpen, setPanoramicaOpen] = useState(false);

  const isBozza = rapportino.stato === 'bozza';
  const isEditabile = ['bozza', 'inviato', 'respinto'].includes(rapportino.stato);

  // La giornata mostrata è oggi (giorno ancora in corso) o una passata/chiusa?
  const oggiRome = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const isOggi = rapportino.data >= oggiRome;

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
  // Per il tecnico "lavoro" = ordinarie + straordinarie (lo split lo fa
  // l'ufficio); la panoramica di oggi mostra Lavoro + Viaggio.
  const totLavoro = totOrdinarie + totStraordinarie;
  const haOreOggi = totLavoro + totViaggio > 0;

  // Riepilogo compatto "cantieri di oggi": se durante la giornata ha lavorato su
  // più cantieri (cambio cantiere), mostra cosa ha fatto — sola lettura, utile
  // anche a turno aperto (riflette i segmenti già chiusi), non solo "turno aperto".
  const cantieriOggi = righe
    .filter((r) => r.cantiere_id || r.commessa_id)
    .map((r) => ({
      key: r.cantiere_id ?? r.commessa_id ?? r.target_label,
      label: r.target_label,
      lavoro: r.ore_ordinarie + r.ore_straordinarie,
      viaggio: r.ore_viaggio,
    }));

  // Le ore si calcolano e si approvano da sole dalle timbrature: la vista del
  // tecnico è di sola lettura. L'eventuale correzione di un'anomalia la fa
  // l'ufficio. Resta disponibile solo l'inserimento manuale completo per le
  // giornate senza timbratura (es. QR non scansionato).
  const puoiManuale = isEditabile && cantieriDisponibili.length > 0;
  // Giornata passata ancora in bozza = "da verificare": il giorno è rimasto
  // aperto o le ore sono oltre soglia, quindi è in carico all'ufficio. Per il
  // tecnico è solo un'informazione, non un'azione. (Oggi è normale che sia
  // bozza: il giorno è ancora in corso e si chiude da sé.)
  const inVerifica = isBozza && !isOggi;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Cantieri di oggi: mini-tabella (nome in grassetto + Lavoro/Viaggio) ── */}
      {cantieriOggi.length >= 2 ? (
        <section className="rounded-2xl border border-border bg-card p-3.5 shadow-soft">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Cantieri di oggi
          </p>
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border bg-muted/40 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Commessa</span>
              <span className="text-right">Lavoro</span>
              <span className="text-right">Viaggio</span>
            </div>
            {cantieriOggi.map((c) => (
              <div
                key={c.key}
                className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-b border-border/50 px-3 py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                  {titoloCase(c.label)}
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-foreground">
                  {fmtOre(c.lavoro)}
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-sky-600">
                  {fmtOre(c.viaggio)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Panoramica di oggi: compare solo a turno finito (con turno in corso
             il totale è ancora 0/parziale). Pencil → rivedi/correggi. ── */}
      {!turnoInCorso && haOreOggi ? (
        <button
          type="button"
          onClick={() => setPanoramicaOpen(true)}
          className="w-full rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.06] to-transparent p-4 text-left shadow-soft transition-transform active:scale-[0.99]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Riepilogo di oggi
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <PenLine className="h-3 w-3" aria-hidden="true" />
              Controlla
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                { label: 'Lavoro', val: totLavoro, tone: 'text-foreground' },
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
            Giornata chiusa, calcolata dalle tue timbrature. Controlla che sia tutto giusto: tocca per
            rivedere o correggere ore e pausa.
          </p>
        </button>
      ) : null}

      {/* ── Nessuna timbratura: registra la giornata o inserisci a mano ── */}
      {puoiManuale && (
        <section className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-soft">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Non hai timbrato?
          </p>

          {/* Primario: registra l'intera giornata (uno o più cantieri) */}
          {registraGiornataAttivo && !turnoInCorso ? (
            <button
              type="button"
              onClick={() => setRegistraOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-3 text-left transition-colors hover:bg-primary/10 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">Registra giornata</span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  Inizio, fine, pausa e le ore su uno o più cantieri.
                </span>
              </span>
            </button>
          ) : null}

          {/* Secondario: un cantiere alla volta, con il viaggio (o per un giorno passato) */}
          <button
            type="button"
            onClick={() => setManualeOpen(true)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors active:scale-[0.99] ${
              registraGiornataAttivo && !turnoInCorso
                ? 'border-border bg-card hover:bg-muted/40'
                : 'border-primary/25 bg-primary/[0.06] hover:bg-primary/10'
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                registraGiornataAttivo && !turnoInCorso
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/12 text-primary'
              }`}
            >
              <PenLine className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Ore su un cantiere, con viaggio</span>
              <span className="block text-xs leading-snug text-muted-foreground">
                Un cantiere alla volta, con andata e ritorno, sede e mezzo. Va bene anche per un giorno passato.
              </span>
            </span>
          </button>
        </section>
      )}

      {/* ── In verifica dall'ufficio ── */}
      {inVerifica && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Giornata in verifica dall&apos;ufficio. Le ore vengono confermate o sistemate da loro:
            non devi fare nulla.
          </span>
        </div>
      )}

      {/* ── Nota per l'ufficio (sola lettura) ── */}
      {note && (
        <section className="space-y-1 rounded-2xl border border-border bg-card p-3.5 shadow-soft">
          <p className="text-sm font-semibold text-foreground">Nota per l&apos;ufficio</p>
          <p className="text-sm text-muted-foreground">{note}</p>
        </section>
      )}

      {/* Dialog inserimento manuale */}
      <ManualeDialog
        open={manualeOpen}
        onClose={() => setManualeOpen(false)}
        data={rapportino.data}
        cantieri={cantieriDisponibili}
        sedi={sediDisponibili}
        sediPerCantiere={sediPerCantiere}
        mezzi={mezziDisponibili}
      />

      {/* Caso 4: registra una giornata senza timbrature (più cantieri). */}
      <RegistraGiornataDialog
        open={registraOpen}
        onClose={() => setRegistraOpen(false)}
        tolleranzaMin={tolleranzaChiusuraMin}
        passoMinuti={passoMinuti}
      />

      {/* Panoramica/correzione della giornata di oggi (pencil sul riepilogo) */}
      <ModificaGiornataDialog
        open={panoramicaOpen}
        data={rapportino.data}
        passo={passoMinuti}
        onClose={() => setPanoramicaOpen(false)}
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
