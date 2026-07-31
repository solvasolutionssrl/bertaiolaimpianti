import { notFound } from 'next/navigation';

import { AddMediaSection } from '../mobile/commessa/[id]/_components/add-media-section';

/**
 * Banco di prova dell'area upload — **solo in sviluppo**.
 *
 * Monta la vera tab Media (`AddMediaSection` → `MediaAttachSection` → coda →
 * engine → IndexedDB) fuori dall'autenticazione, così `scripts/banco-upload`
 * può guidarla da Chrome senza sfiorare i dati di produzione: le chiamate
 * `/api/upload/*` sono intercettate e i byte vanno a un finto R2 locale.
 *
 * In produzione la rotta non esiste (404).
 */
export const dynamic = 'force-dynamic';

export default function ProvaUploadPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Banco />;
}

function Banco() {
  return (
    <main className="mx-auto max-w-screen-sm p-4">
      <h1 className="mb-3 text-lg font-semibold">Banco di prova upload</h1>
      <AddMediaSection commessaId="00000000-0000-0000-0000-0000000000aa" />
    </main>
  );
}
