/**
 * /t/[token] — Landing page pubblica per la scansione del QR Kantiere.
 *
 * Risolve il token al cantiere associato e mostra un messaggio minimale
 * mobile-first. Route pubblica by design: rivela solo il titolo commessa
 * per un token valido e attivo; nessun dato sensibile esposto.
 *
 * Placeholder per la timbratura reale (Fase E).
 */

import { createServiceSupabase } from '@kommessa/api/service';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

export const dynamic = 'force-dynamic';

// ─── tipi locali ────────────────────────────────────────────────────────────

type QrRow = {
  commessa_id: string;
  attivo: boolean;
};

type CommessaRow = {
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  nome_cartella: string | null;
  codice_interno: string | null;
};

// ─── componenti di layout ───────────────────────────────────────────────────

function Schermo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-md">
        {children}
      </div>
    </div>
  );
}

function IconaQr() {
  return (
    <div className="mb-5 flex justify-center">
      {/* QR icon — SVG inline, no Lucide import (server component) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h.01M14 18h3M17 14v4M21 14h.01M21 18h.01" />
      </svg>
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

export default async function TokenPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createServiceSupabase();
  const token = params.token;

  // 1. Lookup QR
  const { data: qr } = await supabase
    .from('cantiere_qr' as never)
    .select('commessa_id, attivo')
    .eq('token', token)
    .maybeSingle<QrRow>();

  // 2. Token non trovato o revocato
  if (!qr || qr.attivo === false) {
    return (
      <Schermo>
        <IconaQr />
        <h1 className="text-center text-lg font-semibold tracking-tight text-foreground">
          QR non valido o revocato
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Chiedi all&apos;ufficio un QR aggiornato del cantiere.
        </p>
      </Schermo>
    );
  }

  // 3. Carica la commessa con le colonne necessarie a risolviTitoloCommessa
  const { data: commessa } = await supabase
    .from('commesse' as never)
    .select(
      'descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, nome_cartella, codice_interno',
    )
    .eq('id', qr.commessa_id)
    .maybeSingle<CommessaRow>();

  const titolo = commessa
    ? risolviTitoloCommessa(commessa) || 'Cantiere'
    : 'Cantiere';

  // 4. Render card cantiere
  return (
    <Schermo>
      <IconaQr />
      <p className="mb-1 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Kantiere
      </p>
      <h1 className="text-center text-xl font-bold tracking-tight text-foreground">
        {titolo}
      </h1>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        La timbratura sarà disponibile a breve.
      </p>
    </Schermo>
  );
}
