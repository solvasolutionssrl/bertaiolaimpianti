import { Info } from 'lucide-react';

/**
 * La riga che dice come sta questa commessa: il lavoro e' finito.
 *
 * Non e' un divieto. Su una commessa chiusa si aggiunge ancora — capita di
 * avere una foto o un documento che arrivano dopo la fine dei lavori — e
 * l'app si limita a chiedere conferma prima di scrivere.
 *
 * Le due diciture restano distinte perche' i due stati vogliono dire cose
 * diverse, e la differenza si vede dal telefono: una completata si consulta
 * anche da li', una archiviata no.
 *
 * Su un'archiviata la frase parla degli **elenchi**, non della scheda: questa
 * nota si legge anche da telefono, perche' con un collegamento diretto la
 * scheda si apre lo stesso, e dire «dal telefono non compare» a chi la sta
 * guardando dal telefono e' una bugia che fa dubitare del resto.
 */
export function CommessaChiusaNota({
  stato,
  nota,
}: {
  stato: string | null | undefined;
  /** Riga in piu' per il posto in cui si sta mostrando (es. come riaprirla). */
  nota?: string;
}) {
  const archiviata = stato === 'archiviata';
  const titolo = archiviata ? 'Commessa archiviata.' : 'Commessa completata.';
  const corpo = archiviata
    ? 'Il lavoro è chiuso. Si può ancora aggiungere foto, documenti e attività: prima di scrivere viene chiesta conferma. Negli elenchi del telefono non compare.'
    : 'Il lavoro è chiuso. Si può ancora aggiungere foto, documenti e attività: prima di scrivere viene chiesta conferma.';

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-medium text-foreground">{titolo}</span>{' '}
        {corpo}
        {nota ? <span className="block mt-0.5">{nota}</span> : null}
      </p>
    </div>
  );
}
