'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Play } from 'lucide-react';

import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import { avviaTurnoMio, elencoCantieriTurno } from '@/app/_actions/kantiere-timbra';
import { CantiereSearchSheet, type PickerCantiere } from './cantiere-picker';

/**
 * «Inizia giornata» per chi lavora in sede.
 *
 * Un passo solo: si sceglie su cosa si lavora e si parte. Il gemello di chi sta
 * in cantiere ne ha due, perche' dopo il cantiere chiede «da dove parti?» per
 * registrare la tratta di andata. Qui quella domanda non ha risposta utile: la
 * persona e' gia' in sede, e la tratta sarebbe zero chilometri.
 *
 * Sotto c'e' `daSede: true`, cioe' «lavoro dalla sede sul progetto», che
 * esisteva gia': le ore restano del lavoro scelto, il luogo e' la sede
 * predefinita. Se poi un viaggio c'e' stato davvero, si dichiara alla
 * chiusura — vedi `TurnoAzioniUfficio`.
 */

function messaggioErrore(code: string): string {
  switch (code) {
    case 'TURNO_GIA_APERTO':
      return 'Hai già una giornata aperta. Chiudila prima di iniziarne un’altra.';
    case 'CANTIERE_NON_VALIDO':
      return 'Lavoro non valido. Riprova.';
    case 'CANTIERE_CHIUSO':
      return 'Questo lavoro è chiuso: non si timbra più. Se ci hai lavorato, dillo all’ufficio.';
    case 'SEDE_PREDEFINITA_MANCANTE':
      return 'Non c’è una sede predefinita: l’ufficio la imposta in Impostazioni → Sedi.';
    case 'NESSUN_DIPENDENTE':
      return 'Nessun profilo dipendente collegato a questo account.';
    case 'MODULO_OFF':
      return 'Il modulo Kantiere non è abilitato.';
    case 'NON_AUTENTICATO':
      return 'Devi accedere per iniziare la giornata.';
    default:
      return 'Avvio non riuscito. Riprova.';
  }
}

export function IniziaGiornataUfficio({ cantieri: cantieriProp }: { cantieri?: PickerCantiere[] }) {
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

  const selezionato = selectedId ? (cantieri ?? []).find((c) => c.id === selectedId) ?? null : null;
  const nomeSel = selezionato
    ? titoloCase(selezionato.nome ?? '') || codiceCantiereMostrato(selezionato) || 'lavoro'
    : '';

  function avvia() {
    if (!selectedId) return;
    setErrore(null);
    startTransition(async () => {
      const res = await avviaTurnoMio({ cantiereId: selectedId, daSede: true });
      if (res.ok) {
        setOpen(false);
        setSelectedId(null);
        router.refresh();
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={apri}
        className="flex w-full items-center gap-3 rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-50 via-sky-50/60 to-transparent p-5 text-left shadow-soft transition-transform active:scale-[0.99]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
          <Play className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold text-sky-900">Inizia giornata</span>
          <span className="block text-xs text-sky-800/80">Scegli su cosa lavori</span>
        </span>
      </button>

      <CantiereSearchSheet
        open={open}
        title="Su cosa lavori oggi"
        cantieri={cantieri ?? []}
        selectedId={selectedId}
        onPick={(id) => {
          setSelectedId(id);
          setErrore(null);
        }}
        onClose={() => {
          setOpen(false);
          setErrore(null);
        }}
        footer={
          <div className="space-y-2">
            {errore ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {errore}
              </p>
            ) : null}
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carico i lavori...
              </p>
            ) : (
              <button
                type="button"
                onClick={avvia}
                disabled={!selectedId || pending}
                className="flex w-full items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-3.5 text-base font-semibold text-white shadow-soft transition-all active:scale-[0.99] hover:bg-sky-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : null}
                {selezionato ? (
                  <>
                    <span className="shrink-0">Inizia</span>
                    <span className="min-w-0 flex-1 truncate text-left text-sm font-normal text-white/85">
                      · {nomeSel}
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                  </>
                ) : (
                  <span className="w-full text-center">Scegli un lavoro</span>
                )}
              </button>
            )}
          </div>
        }
      />
    </>
  );
}
