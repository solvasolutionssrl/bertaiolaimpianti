import { notFound } from 'next/navigation';

import { AddMediaSection } from '../mobile/commessa/[id]/_components/add-media-section';
import { ProvaSelezione } from './_components/prova-selezione';

/**
 * Banco di prova dell'area upload — **solo in sviluppo**.
 *
 * Due superfici, che si comportano in modo diverso e vanno provate entrambe:
 *  - `AddMediaSection` (tab Media): accoda subito e svuota la lista, quindi il
 *    progresso si vede nel pannello in basso;
 *  - `MediaAttachSection` da sola (creazione commessa): tiene i file in
 *    anteprima finché non si conferma — è lì che vive la X per toglierli.
 *
 * `scripts/banco-upload` guida questa pagina da Chrome senza sfiorare i dati
 * di produzione: le chiamate `/api/upload/*` sono intercettate e i byte vanno
 * a un finto R2 locale. In produzione la rotta non esiste (404).
 */
export const dynamic = 'force-dynamic';

export default function ProvaUploadPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Banco />;
}

function Banco() {
  return (
    <main className="mx-auto max-w-screen-sm space-y-6 p-4">
      <h1 className="text-lg font-semibold">Banco di prova upload</h1>
      <AddMediaSection commessaId="00000000-0000-0000-0000-0000000000aa" />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Selezione in creazione commessa (file in attesa di conferma)
        </h2>
        <ProvaSelezione />
      </section>
    </main>
  );
}
