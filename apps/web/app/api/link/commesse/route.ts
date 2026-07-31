import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { autenticaToken } from '../../../_lib/api-token';
import { etichettaCommessa } from '../../../_lib/link-etichetta';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/link/commesse[?q=testo]
 *
 * Elenco commesse per il comando iOS "Carica su Kommessa". Autenticazione a
 * token Bearer (gli Shortcut non hanno la sessione di Safari).
 *
 * Ritorna `etichette`: **solo stringhe**, ed è su quelle che lo Shortcut fa
 * scegliere. Far scegliere fra dizionari è possibile ma Shortcuts li mostra in
 * modo imprevedibile; con le stringhe la lista è leggibile e la scelta torna
 * indietro come testo, che `/api/link/upload` ri-risolve in commessa.
 *
 * Con `q` filtra a TOKEN cross-campo, la stessa regola del picker cantieri:
 * ogni parola deve comparire da qualche parte nell'etichetta, anche in punti
 * diversi ("rossi bagno" trova "BER-26-004 · Rifacimento bagno · Rossi Mario").
 */

// Si mandano TUTTE le commesse aperte, ordinate dalla più recente.
//
// La schermata "Scegli da elenco" di iOS non ha un campo di ricerca, quindi la
// tentazione è accorciare la lista. Ma questo comando nasce proprio per
// ritrovare materiale di settimane fa: una commessa esclusa dalla lista sarebbe
// **irraggiungibile**, senza alcun ripiego sul telefono. Meglio una lista lunga
// in cui le più probabili stanno in cima. (Bertaiola: ~111 aperte.)
const LIMITE_ELENCO = 300;
const LIMITE_RICERCA = 15;

interface RigaCommessa {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  stato: string | null;
  updated_at: string | null;
  cliente: { ragione_sociale: string | null } | { ragione_sociale: string | null }[] | null;
}

export async function GET(request: NextRequest) {
  const ctx = await autenticaToken(request, 'upload');
  if (!ctx) {
    return Response.json(
      {
        error: 'Token non valido',
        messaggio: 'Token non valido: controlla la prima azione del comando.',
      },
      { status: 401 },
    );
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  const service = createServiceSupabase();

  // Le commesse chiuse non sono destinazioni sensate per una foto nuova.
  const { data, error } = await service
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, stato, updated_at, cliente:clienti(ragione_sociale)',
    )
    .eq('tenant_id', ctx.tenantId)
    .not('stato', 'in', '(archiviata,completata)')
    .order('updated_at', { ascending: false })
    .limit(LIMITE_ELENCO);

  if (error) {
    return Response.json(
      {
        error: 'Lettura commesse fallita',
        messaggio: 'Non riesco a leggere le commesse.',
      },
      { status: 500 },
    );
  }

  const voci = ((data ?? []) as unknown as RigaCommessa[]).map((r) => {
    const cliente = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente;
    const etichetta = etichettaCommessa({
      codice_interno: r.codice_interno,
      nome_cartella: r.nome_cartella,
      descrizione_ai_finale: r.descrizione_ai_finale,
      descrizione_ai_proposta: r.descrizione_ai_proposta,
      note_iniziali: r.note_iniziali,
      clienteNome: cliente?.ragione_sociale ?? null,
    });
    return { id: r.id, etichetta, codice: r.codice_interno };
  });

  const filtrate = q
    ? voci
        .filter((v) => {
          const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
          const cercabile = v.etichetta.toLowerCase();
          return parole.every((p) => cercabile.includes(p));
        })
        .slice(0, LIMITE_RICERCA)
    : voci;

  return Response.json({
    etichette: filtrate.map((v) => v.etichetta),
    commesse: filtrate,
  });
}
