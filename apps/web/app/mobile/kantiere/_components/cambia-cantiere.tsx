'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Loader2 } from 'lucide-react';

import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import { cambiaCantiereMio, elencoCantieriTurno } from '@/app/_actions/kantiere-timbra';
import {
  CantiereSearchSheet,
  type PickerCantiere,
} from './cantiere-picker';

function messaggioErrore(code: string): string {
  switch (code) {
    case 'IN_PAUSA':
      return 'Sei in pausa: riprendi il turno prima di cambiare cantiere.';
    case 'NESSUN_TURNO_APERTO':
      return 'Il turno è cambiato nel frattempo. Ricarica la pagina.';
    case 'STESSO_CANTIERE':
      return 'È lo stesso cantiere su cui stai già lavorando.';
    case 'CANTIERE_NON_VALIDO':
      return 'Cantiere non valido. Riprova.';
    case 'ORA_NON_VALIDA':
      return 'Non è stato possibile registrare il cambio ora. Riprova.';
    default:
      return 'Cambio cantiere non riuscito. Riprova.';
  }
}

/**
 * "Cambia cantiere" a turno aperto: chiude il segmento corrente e apre quello
 * nuovo (le ore si dividono da sole; i km del tragitto vanno alla destinazione).
 * Mostrato nella card "Turno in corso". Carica i cantieri al primo tap ed
 * esclude quello corrente dalla lista.
 */
export function CambiaCantiereButton({
  cantiereId,
  compatto = false,
}: {
  cantiereId: string;
  /** true = pulsante compatto verticale (per la card turno "compatta"). */
  compatto?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cantieri, setCantieri] = useState<PickerCantiere[] | null>(null);
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
      if (res.ok) setCantieri(res.cantieri.filter((c) => c.id !== cantiereId));
      else setErrore(messaggioErrore(res.error));
    }
  }, [cantieri, cantiereId]);

  const chiudi = useCallback(() => {
    setOpen(false);
    setSelectedId(null);
    setErrore(null);
  }, []);

  const selezionato = selectedId ? (cantieri ?? []).find((c) => c.id === selectedId) ?? null : null;
  const nomeSel = selezionato
    ? titoloCase(selezionato.nome ?? '') || codiceCantiereMostrato(selezionato) || 'cantiere'
    : '';

  function conferma() {
    if (!selectedId) return;
    setErrore(null);
    startTransition(async () => {
      const res = await cambiaCantiereMio({ daCantiereId: cantiereId, aCantiereId: selectedId });
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
      {compatto ? (
        <button
          type="button"
          onClick={apri}
          className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background px-1 py-2.5 text-xs font-semibold text-foreground transition-all active:scale-[0.97] hover:bg-muted"
        >
          <ArrowLeftRight className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          Cambia
        </button>
      ) : (
        <button
          type="button"
          onClick={apri}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-base font-semibold text-foreground transition-all active:scale-[0.99] hover:bg-muted"
        >
          <ArrowLeftRight className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          Cambia cantiere
        </button>
      )}

      <CantiereSearchSheet
        open={open}
        title="Cambia cantiere"
        cantieri={cantieri ?? []}
        selectedId={selectedId}
        onPick={(id) => {
          setSelectedId(id);
          setErrore(null);
        }}
        onClose={chiudi}
        footer={
          <div className="space-y-2">
            <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
              Chiudo il turno sul cantiere attuale e lo riapro su quello scelto. Le ore si dividono da
              sole; i km del tragitto vanno al nuovo cantiere.
            </p>
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
                onClick={conferma}
                disabled={!selectedId || pending}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-foreground px-4 py-3.5 text-base font-semibold text-background shadow-soft transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/20">
                    <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2.75} />
                  </span>
                )}
                <span className="truncate">
                  {selezionato ? `Sposta su ${nomeSel}` : 'Scegli il nuovo cantiere'}
                </span>
              </button>
            )}
          </div>
        }
      />
    </>
  );
}
