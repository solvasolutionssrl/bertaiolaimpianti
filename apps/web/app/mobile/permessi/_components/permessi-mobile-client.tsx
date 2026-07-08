'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  Plus,
  X,
  Check,
  Loader2,
  Clock,
  CalendarDays,
  Inbox,
} from 'lucide-react';
import { PERMESSO_TIPI, LABEL_STATO_PERMESSO, tipoPermesso } from '@kommessa/api/permessi-tipi';
import { Portal } from '@/app/mobile/_components/portal';
import { useAlert } from '@/app/_components/confirm-provider';
import { MobileBackButton } from '@/app/mobile/_components/mobile-back-button';
import { richiediPermesso, decidiPermesso, annullaRichiesta } from '@/app/office/_actions/ferie-permessi';

type Stato = 'in_attesa' | 'approvato' | 'rifiutato' | 'modifica_richiesta';

export interface MiaRichiesta {
  id: string;
  tipoLabel: string;
  dataInizio: string;
  dataFine: string;
  tuttoIlGiorno: boolean;
  oraInizio: string | null;
  oraFine: string | null;
  motivo: string | null;
  stato: Stato;
  decisioneNota: string | null;
}
export interface DaApprovare {
  id: string;
  dipendenteNome: string;
  tipoLabel: string;
  dataInizio: string;
  dataFine: string;
  tuttoIlGiorno: boolean;
  oraInizio: string | null;
  oraFine: string | null;
  motivo: string | null;
}

function fmtData(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  });
}
function fmtQuando(r: {
  dataInizio: string;
  dataFine: string;
  tuttoIlGiorno: boolean;
  oraInizio: string | null;
  oraFine: string | null;
}): string {
  if (!r.tuttoIlGiorno && r.oraInizio && r.oraFine)
    return `${fmtData(r.dataInizio)} · ${r.oraInizio}-${r.oraFine}`;
  return r.dataInizio === r.dataFine
    ? fmtData(r.dataInizio)
    : `${fmtData(r.dataInizio)} → ${fmtData(r.dataFine)}`;
}

const STATO_STYLE: Record<Stato, string> = {
  in_attesa: 'bg-amber-100 text-amber-700',
  approvato: 'bg-emerald-100 text-emerald-700',
  rifiutato: 'bg-rose-100 text-rose-700',
  modifica_richiesta: 'bg-sky-100 text-sky-700',
};

export function PermessiMobileClient({
  mioDip,
  oggiISO,
  tipiAttivi,
  mieRichieste,
  daApprovare,
  puoApprovare,
}: {
  mioDip: string | null;
  oggiISO: string;
  tipiAttivi: string[];
  mieRichieste: MiaRichiesta[];
  daApprovare: DaApprovare[];
  puoApprovare: boolean;
}) {
  const [formOpen, setFormOpen] = React.useState(false);

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="mt-2 flex items-center gap-2">
        <MobileBackButton />
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarCheck className="h-5 w-5 text-primary" />
          Ferie e permessi
        </h1>
      </header>

      {mioDip ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" /> Richiedi permesso
        </button>
      ) : (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Il tuo account non è collegato a una scheda dipendente. Chiedi all&apos;ufficio.
        </p>
      )}

      {/* Da approvare (se approvatore) */}
      {puoApprovare && daApprovare.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Inbox className="h-3.5 w-3.5" /> Da approvare ({daApprovare.length})
          </h2>
          {daApprovare.map((r) => (
            <DaApprovareCard key={r.id} r={r} />
          ))}
        </section>
      ) : null}

      {/* Le mie richieste */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Le mie richieste
        </h2>
        {mieRichieste.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Nessuna richiesta.
          </p>
        ) : (
          mieRichieste.map((r) => <MiaRichiestaCard key={r.id} r={r} />)
        )}
      </section>

      {formOpen && mioDip ? (
        <RichiestaSheet
          dipendenteId={mioDip}
          oggiISO={oggiISO}
          tipiAttivi={tipiAttivi}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MiaRichiestaCard({ r }: { r: MiaRichiesta }) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{r.tipoLabel}</span>
        <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + STATO_STYLE[r.stato]}>
          {LABEL_STATO_PERMESSO[r.stato] ?? r.stato}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        {r.tuttoIlGiorno ? <CalendarDays className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
        {fmtQuando(r)}
      </p>
      {r.motivo ? <p className="mt-1 text-sm text-foreground/80">{r.motivo}</p> : null}
      {r.decisioneNota ? (
        <p className="mt-1 text-xs text-muted-foreground">Nota: {r.decisioneNota}</p>
      ) : null}
      {r.stato === 'in_attesa' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await annullaRichiesta(r.id);
              if (!res.ok) await alert({ title: 'Errore', body: res.error });
              router.refresh();
            })
          }
          className="mt-2 text-xs font-medium text-rose-600"
        >
          Annulla richiesta
        </button>
      ) : null}
    </div>
  );
}

function DaApprovareCard({ r }: { r: DaApprovare }) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();

  const decidi = (esito: 'approvato' | 'rifiutato') =>
    start(async () => {
      const res = await decidiPermesso({ id: r.id, esito });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-semibold">{r.dipendenteNome}</p>
      <p className="text-sm text-muted-foreground">{r.tipoLabel}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        {r.tuttoIlGiorno ? <CalendarDays className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
        {fmtQuando(r)}
      </p>
      {r.motivo ? <p className="mt-1 text-sm text-foreground/80">{r.motivo}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decidi('approvato')}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white active:scale-[0.99]"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Approva
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decidi('rifiutato')}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-300 py-2 text-sm font-semibold text-rose-600 active:scale-[0.99]"
        >
          <X className="h-4 w-4" /> Rifiuta
        </button>
      </div>
    </div>
  );
}

function RichiestaSheet({
  dipendenteId,
  oggiISO,
  tipiAttivi,
  onClose,
}: {
  dipendenteId: string;
  oggiISO: string;
  tipiAttivi: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const tipiDisponibili = React.useMemo(
    () => PERMESSO_TIPI.filter((t) => tipiAttivi.includes(t.codice)),
    [tipiAttivi],
  );
  const [tipo, setTipo] = React.useState(tipiDisponibili[0]?.codice ?? 'ferie');
  const [tuttoIlGiorno, setTuttoIlGiorno] = React.useState(true);
  const [dataInizio, setDataInizio] = React.useState(oggiISO);
  const [dataFine, setDataFine] = React.useState(oggiISO);
  const [oraInizio, setOraInizio] = React.useState('08:00');
  const [oraFine, setOraFine] = React.useState('12:00');
  const [motivo, setMotivo] = React.useState('');

  const onTipo = (codice: string) => {
    setTipo(codice);
    const u = tipoPermesso(codice)?.unita;
    if (u === 'ore') setTuttoIlGiorno(false);
    else if (u === 'giorni') setTuttoIlGiorno(true);
  };

  const invia = () => {
    start(async () => {
      const res = await richiediPermesso({
        dipendenteId,
        tipo,
        dataInizio,
        dataFine: tuttoIlGiorno ? dataFine : dataInizio,
        tuttoIlGiorno,
        oraInizio: tuttoIlGiorno ? null : oraInizio,
        oraFine: tuttoIlGiorno ? null : oraFine,
        motivo: motivo.trim() || null,
      });
      if (!res.ok) {
        await alert({ title: 'Non inviata', body: res.error });
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col bg-white"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Richiedi permesso</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => onTipo(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus:border-primary focus:outline-none"
            >
              {tipiDisponibili.map((t) => (
                <option key={t.codice} value={t.codice}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="text-sm font-medium">Tutto il giorno</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={tuttoIlGiorno}
              onChange={(e) => setTuttoIlGiorno(e.target.checked)}
            />
          </label>

          {tuttoIlGiorno ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Dal</span>
                <input
                  type="date"
                  value={dataInizio}
                  onChange={(e) => {
                    setDataInizio(e.target.value);
                    if (e.target.value > dataFine) setDataFine(e.target.value);
                  }}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Al</span>
                <input
                  type="date"
                  value={dataFine}
                  min={dataInizio}
                  onChange={(e) => setDataFine(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Giorno</span>
                <input
                  type="date"
                  value={dataInizio}
                  onChange={(e) => setDataInizio(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus:border-primary focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Dalle</span>
                  <input
                    type="time"
                    value={oraInizio}
                    onChange={(e) => setOraInizio(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Alle</span>
                  <input
                    type="time"
                    value={oraFine}
                    onChange={(e) => setOraFine(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Motivo (facoltativo)
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none"
            />
          </label>
        </div>

        <footer className="shrink-0 border-t border-border p-4">
          <button
            type="button"
            onClick={invia}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Invia richiesta
          </button>
        </footer>
      </div>
    </Portal>
  );
}
