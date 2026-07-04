'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';

import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import { avviaTurnoMio, elencoCantieriTurno } from '@/app/_actions/kantiere-timbra';
import {
  CantiereSearchSheet,
  type PickerCantiere,
} from './cantiere-picker';

function messaggioErrore(code: string): string {
  switch (code) {
    case 'TURNO_GIA_APERTO':
      return 'Hai già un turno aperto. Chiudilo o cambia cantiere.';
    case 'CANTIERE_NON_VALIDO':
      return 'Cantiere non valido. Riprova.';
    case 'NESSUN_DIPENDENTE':
      return 'Nessun profilo dipendente collegato a questo account.';
    case 'MODULO_OFF':
      return 'Il modulo Kantiere non è abilitato.';
    case 'NON_AUTENTICATO':
      return 'Devi accedere per avviare un turno.';
    default:
      return 'Avvio non riuscito. Riprova.';
  }
}

/**
 * Pulsante "Inizia turno" (senza QR) + foglio di ricerca cantiere con conferma.
 * Riusabile su home tecnico, lista Cantieri e cruscotto office. Se i `cantieri`
 * non sono passati, li carica al primo tap (`elencoCantieriTurno`).
 *
 * Variante `prominente`: card grande (home). Altrimenti bottone compatto.
 */
export function IniziaTurnoButton({
  cantieri: cantieriProp,
  prominente = false,
}: {
  cantieri?: PickerCantiere[];
  prominente?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cantieri, setCantieri] = useState<PickerCantiere[] | null>(cantieriProp ?? null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apri = useCallback(async () => {
    setErrore(null);
    setSelectedId(null);
    setOpen(true);
    if (cantieri == null) {
      setLoading(true);
      const res = await elencoCantieriTurno();
      setLoading(false);
      if (res.ok) setCantieri(res.cantieri);
      else setErrore(messaggioErrore(res.error));
    }
  }, [cantieri]);

  const chiudi = useCallback(() => {
    setOpen(false);
    setSelectedId(null);
    setErrore(null);
  }, []);

  const selezionato = selectedId ? (cantieri ?? []).find((c) => c.id === selectedId) ?? null : null;

  function avvia() {
    if (!selectedId) return;
    setErrore(null);
    startTransition(async () => {
      const res = await avviaTurnoMio({ cantiereId: selectedId });
      if (res.ok) {
        chiudi();
        router.refresh();
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  const nomeSel = selezionato
    ? titoloCase(selezionato.nome ?? '') || codiceCantiereMostrato(selezionato) || 'cantiere'
    : '';

  return (
    <>
      {prominente ? (
        <button
          type="button"
          onClick={apri}
          className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-transparent p-5 text-left shadow-soft transition-transform active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Play className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-emerald-900">Inizia turno</span>
            <span className="block text-xs text-emerald-800/80">
              Scegli un cantiere e timbra l&apos;ingresso
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={apri}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-soft transition-transform active:scale-[0.99] hover:bg-emerald-700"
        >
          <Play className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          Inizia turno
        </button>
      )}

      <CantiereSearchSheet
        open={open}
        title="Inizia turno — scegli cantiere"
        cantieri={cantieri ?? []}
        selectedId={selectedId}
        onPick={(id) => {
          setSelectedId(id);
          setErrore(null);
        }}
        onClose={chiudi}
        footer={
          <div className="space-y-2">
            {errore ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {errore}
              </p>
            ) : null}
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carico i cantieri...
              </p>
            ) : (
              <button
                type="button"
                onClick={avvia}
                disabled={!selectedId || pending}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-soft transition-all active:scale-[0.99] hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <Play className="h-3.5 w-3.5" strokeWidth={2.75} fill="currentColor" />
                  </span>
                )}
                <span className="truncate">
                  {selezionato ? `Avvia turno su ${nomeSel}` : 'Scegli un cantiere'}
                </span>
              </button>
            )}
          </div>
        }
      />
    </>
  );
}
