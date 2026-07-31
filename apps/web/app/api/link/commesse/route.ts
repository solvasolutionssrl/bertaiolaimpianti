import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { autenticaToken } from '../../../_lib/api-token';
import { risolviTitoloCommessa } from '../../../_lib/commessa-display';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/link/commesse[?q=testo]
 *
 * Elenco commesse per il comando iOS "Carica su Kommessa". Autenticazione a
 * token Bearer (gli Shortcut non hanno la sessione di Safari).
 *
 * Senza `q` ritorna le commesse toccate di recente: nella schermata "Scegli da
 * elenco" degli Shortcut non esiste piu' un campo di ricerca (Apple lo ha tolto
 * in iOS 14), quindi la lista corta di recenti e' cio' che risolve il caso
 * normale, e la ricerca vive qui sul server.
 *
 * Con `q` filtra a TOKEN cross-campo, la stessa regola del picker cantieri:
 * ogni parola deve comparire da qualche parte fra titolo, codice e cliente, in
 * campi anche diversi ("rossi bagno" trova "Rossi Mario — Rifacimento bagno").
 */

const LIMITE_RECENTI = 10;
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
  let query = service
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, stato, updated_at, cliente:clienti(ragione_sociale)',
    )
    .eq('tenant_id', ctx.tenantId)
    .not('stato', 'in', '(archiviata,completata)')
    .order('updated_at', { ascending: false });

  // In ricerca si allarga il bacino prima di filtrare a token in memoria: il
  // match cross-campo non e' esprimibile in una singola query SQL.
  query = query.limit(q ? 300 : LIMITE_RECENTI);

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: 'Lettura commesse fallita' }, { status: 500 });
  }

  const righe = (data ?? []) as unknown as RigaCommessa[];
  const voci = righe.map((r) => {
    const cliente = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente;
    const titolo = risolviTitoloCommessa({
      descrizione_ai_finale: r.descrizione_ai_finale,
      descrizione_ai_proposta: r.descrizione_ai_proposta,
      note_iniziali: r.note_iniziali,
      nome_cartella: r.nome_cartella,
      codice_interno: r.codice_interno,
      cliente_nome: cliente?.ragione_sociale ?? null,
    });
    return {
      id: r.id,
      titolo,
      cliente: cliente?.ragione_sociale ?? null,
      codice: r.codice_interno,
      // `etichetta` e' cio' che l'utente legge nella lista dello Shortcut:
      // una riga sola, quindi ci sta il minimo indispensabile per scegliere.
      etichetta: [titolo, cliente?.ragione_sociale].filter(Boolean).join(' · '),
      cercabile: [titolo, cliente?.ragione_sociale, r.codice_interno]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  });

  const filtrate = q
    ? voci
        .filter((v) => {
          const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
          return parole.every((p) => v.cercabile.includes(p));
        })
        .slice(0, LIMITE_RICERCA)
    : voci;

  // `etichette` = solo stringhe, ed e' quello su cui lo Shortcut fa scegliere.
  // Far scegliere fra DIZIONARI e' possibile ma Shortcuts li mostra in modo
  // imprevedibile; con le stringhe la lista e' leggibile e la scelta torna
  // indietro come testo, che il server ri-risolve in commessa.
  // Le etichette vengono rese univoche (in coda il codice) perche' la scelta
  // viaggia per testo: due commesse omonime sarebbero indistinguibili.
  const conteggio = new Map<string, number>();
  for (const v of filtrate) {
    conteggio.set(v.etichetta, (conteggio.get(v.etichetta) ?? 0) + 1);
  }
  const conEtichetta = filtrate.map((v) => ({
    ...v,
    etichetta:
      (conteggio.get(v.etichetta) ?? 0) > 1 && v.codice
        ? `${v.etichetta} (${v.codice})`
        : v.etichetta,
  }));

  return Response.json({
    etichette: conEtichetta.map((v) => v.etichetta),
    commesse: conEtichetta.map(({ cercabile: _scartato, ...resto }) => resto),
  });
}
