'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { caricaGiornataDaRiallocare, type GiornataDaRiallocare } from '@/app/_actions/kantiere-timbra';
import { Portal } from '@/app/mobile/_components/portal';
import { RegistraGiornataDialog } from './registra-giornata-dialog';
import { ModificaGiornataDialog } from './modifica-giornata-dialog';

/** Cio' che serve a «Registra giornata» oltre alla giornata: sedi, mezzi, passi. */
export interface BaseRegistraGiornata {
  passoMinuti: number;
  stepViaggio: number;
  sedi: { id: string; nome: string; tipo: string; isDefault: boolean }[];
  sediPerCantiere: Record<string, string[]>;
  mezzi: { id: string; targa: string; modello: string | null }[];
  ultimoMezzoId: string | null;
  inUfficio: boolean;
}

/**
 * Correggere una giornata gia' registrata (28/10/2026).
 *
 * Se la giornata si puo' riallocare — chiusa, senza badge ne' presenza nel
 * registro, non approvata a mano, entro la finestra — si apre la schermata a
 * card colorate di «Registra giornata», con inizio e fine fissi. Altrimenti il
 * dialog «Modifica giornata» di sempre, che dice anche perche' non si puo'.
 */
export function CorreggiGiornata({
  data,
  base,
  onClose,
}: {
  data: string;
  base: BaseRegistraGiornata;
  onClose: () => void;
}) {
  const [stato, setStato] = useState<
    { fase: 'carico' } | { fase: 'rialloca'; giornata: GiornataDaRiallocare } | { fase: 'classica' }
  >({ fase: 'carico' });

  useEffect(() => {
    let vivo = true;
    void caricaGiornataDaRiallocare({ giorno: data }).then((res) => {
      if (!vivo) return;
      setStato(res.ok ? { fase: 'rialloca', giornata: res.giornata } : { fase: 'classica' });
    });
    return () => {
      vivo = false;
    };
  }, [data]);

  if (stato.fase === 'carico') {
    return (
      <Portal>
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-white" aria-label="Carico la giornata" />
        </div>
      </Portal>
    );
  }
  if (stato.fase === 'rialloca') {
    return (
      <RegistraGiornataDialog
        open
        onClose={onClose}
        passoMinuti={base.passoMinuti}
        stepViaggio={base.stepViaggio}
        sedi={base.sedi}
        sediPerCantiere={base.sediPerCantiere}
        mezzi={base.mezzi}
        ultimoMezzoId={base.ultimoMezzoId}
        inUfficio={base.inUfficio}
        riallocazione={stato.giornata}
      />
    );
  }
  return <ModificaGiornataDialog open data={data} passo={base.passoMinuti} onClose={onClose} />;
}
