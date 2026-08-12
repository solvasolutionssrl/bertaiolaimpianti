import { type NextRequest } from 'next/server';

import { CONTRATTO, LIMITE_DEFAULT, LIMITE_MAX, autenticaApi } from '../_lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/v1/info
 *
 * Il primo colpo di telefono: per chi lavoro, cosa posso chiedere, e sono
 * autorizzato a portare fuori qualcosa?
 *
 * Va interrogata **a ogni avvio**, e le sue risposte non vanno cablate. E'
 * l'unico modo perche' fra un anno si possa cambiare una regola — un
 * vocabolario che si allunga, una modalita' che si apre — senza rimettere le
 * mani su tutti i client gia' installati.
 */
export async function GET(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const ctx = g.ctx;

  return Response.json({
    contratto: CONTRATTO,
    prodotto: 'Kommessa',

    // Il cliente NON e' un parametro delle chiamate: e' dentro il token. Qui
    // si restituisce solo perche' chi installa un agente possa verificare a
    // colpo d'occhio di aver messo il token giusto.
    tenantId: ctx.tenantId,
    sistema: ctx.sistema,

    /**
     * `simulazione`: si legge tutto, ma ogni record arriva con
     * `inviabile: false` e non va portato da nessuna parte. E' la sicura di
     * collaudo, e si toglie una volta sola quando il cliente ha visto.
     */
    modalita: ctx.modalita,
    collaudoEsterni: ctx.collaudoEsterni,

    risorse: {
      lettura: ['ore', 'spese', 'viaggi', 'cantieri', 'dipendenti'],
      scrittura: ['scritture', 'letture', 'esecuzioni'],
    },

    /**
     * La convenzione sui nomi, dichiarata invece che sottintesa: chi scrive un
     * client puo' verificarla a runtime prima di mappare i campi.
     */
    convenzioneNomi: {
      prefissoEsterno: 'external',
      regola:
        'I campi che iniziano con "external" contengono dati DEL GESTIONALE. ' +
        'Senza prefisso sono dati di Kommessa. Il prefisso vale per identificativi, ' +
        'codici e riferimenti, non per gli attributi descrittivi.',
      esempi: {
        'cantieri.codiceCommessa': 'nostro, progressivo (CAN-00190)',
        'cantieri.externalCodiceCommessa': 'del gestionale (26084)',
      },
    },

    paginazione: {
      parametri: ['limite', 'cursore', 'modificatoDopo', 'dal', 'al'],
      limiteDefault: LIMITE_DEFAULT,
      limiteMax: LIMITE_MAX,
    },

    /**
     * Vocabolari **chiusi**: se compare un valore che non e' qui dentro, stai
     * parlando con una versione piu' nuova di Kommessa. Fermati e segnala —
     * non inventare una traduzione, perche' finisce su un sistema dove magari
     * non si cancella.
     */
    vocabolari: {
      statoGiornata: ['bozza', 'inviato', 'verificato', 'approvato', 'respinto', 'esportato'],
      categoriaSpesaCanonica: ['ristorante', 'albergo', 'carburante', 'altro'],
      statoSpesa: ['bozza', 'confermata'],
      ruoloViaggio: ['autista', 'passeggero'],
      direzioneViaggio: ['andata', 'ritorno'],
      entitaLettura: ['commessa', 'cliente', 'dipendente'],
    },
  });
}
