import { type NextRequest } from 'next/server';

import { MAX_DESCRIZIONE, REQUISITI_MINIMI } from '@kommessa/api/integrazione';

import { autenticaAgente } from '../_lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/integrazione/v1/configurazione
 *
 * Primo colpo di telefono dell'agente. Risponde a: «per chi lavoro, cosa devo
 * mandarmi dietro, e quanto posso scrivere?»
 *
 * Esiste perche' un agente che **cabla** queste risposte va rifatto a ogni
 * cambio di regola; un agente che le **chiede** si adatta da solo. Fra un anno,
 * col terzo gestionale, questo endpoint e' cio' che evita di rimettere le mani
 * su tutti gli agenti gia' in giro.
 */
export async function GET(request: NextRequest) {
  const g = await autenticaAgente(request);
  if (!g.ok) return g.risposta;

  return Response.json({
    contratto: 1,
    sistema: g.ctx.sistema,
    // Cosa deve essere collegato al gestionale perche' un'operazione parta.
    // Il minimo e' di Kommessa (senza CHI e DOVE il dato non e' attribuibile);
    // `requisiti` sono le pretese del singolo gestionale, dalla config.
    riferimentiRichiesti: {
      minimi: REQUISITI_MINIMI,
      aggiuntivi: g.ctx.requisiti,
    },
    // Il tetto lo applichiamo gia' noi comporre la descrizione: qui e' dichiarato
    // perche' l'agente sappia che il testo che riceve e' gia' entro il limite e
    // non debba ritagliarlo (ritagliarlo due volte lo rovinerebbe).
    maxDescrizione: g.ctx.maxDescrizione ?? MAX_DESCRIZIONE,
    // Vocabolari chiusi: se l'agente incontra un valore fuori da questi elenchi
    // sta parlando con una versione piu' nuova di Kommessa e deve fermarsi,
    // non tirare a indovinare una traduzione.
    vocabolari: {
      tipi: ['ore', 'km', 'spesa'],
      causaliOre: [
        'ordinario',
        'straordinario',
        'viaggio',
        'sabato',
        'notturno',
        'trasferta',
        'formazione',
        'permesso',
        'malattia',
      ],
      categorieSpesa: ['ristorante', 'albergo', 'carburante', 'altro'],
      ruoliViaggio: ['autista', 'passeggero'],
      entitaLettura: ['commessa', 'cliente', 'dipendente'],
    },
  });
}
