'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

import { cambiaTodoStato } from '@/app/_actions/commessa-todo';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

/**
 * Il tasto che chiude il giro.
 *
 * ⚠️ Largo quanto la pagina e in fondo, non un cerchietto in cima: qui si
 * arriva **dopo** aver letto cosa c'è da fare, e il gesto che segue è uno solo.
 * Il cerchietto va bene in un elenco, dove si spunta di corsa; in una scheda
 * aperta è un bersaglio piccolo in mezzo ad altri.
 *
 * Chiede conferma come ovunque: il gesto è lo stesso, la domanda anche.
 */
export function ChiudiRichiesta({ id, titolo }: { id: string; titolo: string }) {
  const router = useRouter();
  const chiediConferma = useConfirm();
  const mostraAvviso = useAlert();
  const [inCorso, setInCorso] = React.useState(false);

  const chiudi = async () => {
    const ok = await chiediConferma({
      title: 'Segnare come fatta?',
      description: `"${titolo}"\n\nL'ufficio la vede chiusa. Si può riaprire da lì.`,
      confirmLabel: 'Sì, è fatta',
    });
    if (!ok) return;
    setInCorso(true);
    const res = await cambiaTodoStato({ id, stato: 'completato' });
    setInCorso(false);
    if (!res.ok) {
      await mostraAvviso({ title: 'Non sono riuscito a chiuderla', body: res.error });
      return;
    }
    // Si torna all'elenco: chiusa, qui non c'è più niente da fare.
    router.push('/mobile');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={chiudi}
      disabled={inCorso}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white shadow-soft-md transition-colors active:bg-emerald-700 disabled:opacity-60"
    >
      {inCorso ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <Check className="h-5 w-5" aria-hidden="true" />
      )}
      Segna come fatta
    </button>
  );
}
