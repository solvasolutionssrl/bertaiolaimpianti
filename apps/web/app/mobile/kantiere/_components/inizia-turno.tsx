'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2, ArrowRight } from 'lucide-react';

import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import {
  avviaTurnoMio,
  elencoCantieriTurno,
  opzioniViaggioPartenza,
} from '@/app/_actions/kantiere-timbra';
import type {
  ViaggioRitornoSede,
  ViaggioRitornoMezzo,
  ViaggioRitornoPayload,
} from '@/app/_components/viaggio-ritorno-dialog';
import {
  CantiereSearchSheet,
  type PickerCantiere,
} from './cantiere-picker';
import { PartenzaViaggioSheet } from './partenza-viaggio-sheet';

function messaggioErrore(code: string): string {
  switch (code) {
    case 'TURNO_GIA_APERTO':
      return 'Hai già un turno aperto. Chiudilo o cambia cantiere.';
    case 'CANTIERE_NON_VALIDO':
      return 'Cantiere non valido. Riprova.';
    case 'SEDE_NON_VALIDA':
      return 'Sede di partenza non valida. Riprova.';
    case 'GIUSTIFICAZIONE_RICHIESTA':
      return 'Hai modificato la stima: inserisci una giustificazione.';
    case 'MEZZO_NON_VALIDA':
    case 'MEZZO_NON_VALIDO':
      return 'Mezzo non valido. Riprova.';
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

interface OpzioniPartenza {
  sedi: ViaggioRitornoSede[];
  sedeDefaultId: string | null;
  mezzi: ViaggioRitornoMezzo[];
}

/**
 * Pulsante "Inizia turno" (senza QR) → flusso in DUE step:
 *  1. scegli il cantiere (foglio di ricerca);
 *  2. "da dove parti?" (Abitazione privata / sede FPM / sedi del cantiere) →
 *     registra la tratta di andata (km + tempo) come lo scan QR.
 *
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
  const [fase, setFase] = useState<'cantiere' | 'partenza'>('cantiere');
  const [cantieri, setCantieri] = useState<PickerCantiere[] | null>(cantieriProp ?? null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opzioni, setOpzioni] = useState<OpzioniPartenza | null>(null);
  const [opzLoading, setOpzLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apri = useCallback(async () => {
    setErrore(null);
    setSelectedId(null);
    setFase('cantiere');
    setOpzioni(null);
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
    setFase('cantiere');
    setSelectedId(null);
    setOpzioni(null);
    setOpzLoading(false);
    setErrore(null);
  }, []);

  const selezionato = selectedId ? (cantieri ?? []).find((c) => c.id === selectedId) ?? null : null;
  const nomeSel = selezionato
    ? titoloCase(selezionato.nome ?? '') || codiceCantiereMostrato(selezionato) || 'cantiere'
    : '';

  // Step 1 → 2: carica le sedi ammesse per il cantiere e mostra "da dove parti?".
  function continua() {
    if (!selectedId) return;
    setErrore(null);
    setFase('partenza');
    setOpzioni(null);
    setOpzLoading(true);
    void (async () => {
      const res = await opzioniViaggioPartenza({ cantiereId: selectedId });
      setOpzLoading(false);
      if (res.ok) {
        setOpzioni({ sedi: res.sedi, sedeDefaultId: res.sedeDefaultId, mezzi: res.mezzi });
      } else {
        setErrore(messaggioErrore(res.error));
        setFase('cantiere');
      }
    })();
  }

  // Step 2 → avvio effettivo (viaggio null = "Abitazione privata": 0 km/0 tempo).
  function avvia(viaggio: ViaggioRitornoPayload | null) {
    if (!selectedId) return;
    setErrore(null);
    startTransition(async () => {
      const res = await avviaTurnoMio({
        cantiereId: selectedId,
        viaggio: viaggio ?? undefined,
      });
      if (res.ok) {
        chiudi();
        router.refresh();
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

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
        open={open && fase === 'cantiere'}
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
                onClick={continua}
                disabled={!selectedId || pending}
                className="flex w-full items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-soft transition-all active:scale-[0.99] hover:bg-emerald-700 disabled:opacity-50"
              >
                {selezionato ? (
                  <>
                    <span className="shrink-0">Continua</span>
                    <span className="min-w-0 flex-1 truncate text-left text-sm font-normal text-white/85">
                      · {nomeSel}
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                  </>
                ) : (
                  <span className="w-full text-center">Scegli un cantiere</span>
                )}
              </button>
            )}
          </div>
        }
      />

      <PartenzaViaggioSheet
        open={open && fase === 'partenza'}
        cantiereId={selectedId ?? ''}
        cantiereNome={nomeSel}
        loading={opzLoading}
        sedi={opzioni?.sedi ?? []}
        sedeDefaultId={opzioni?.sedeDefaultId ?? null}
        mezzi={opzioni?.mezzi ?? []}
        pending={pending}
        errore={errore}
        onBack={() => {
          setFase('cantiere');
          setErrore(null);
        }}
        onClose={chiudi}
        onConfirm={avvia}
      />
    </>
  );
}
