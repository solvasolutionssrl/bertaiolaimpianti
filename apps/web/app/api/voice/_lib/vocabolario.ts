import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import { MAX_VOCABOLARIO, preparaVocabolario } from '@kommessa/api/trascrizione';

/**
 * Le parole che con ogni probabilità si sentiranno in una dettatura di questo
 * cliente.
 *
 * ## Il problema che risolve
 *
 * Chi detta dice «Valeggio sul Mincio» e si ritrova scritto «sul Mincio»: il
 * modello non sa che sta ascoltando un idraulico che lavora fra Verona e
 * Mantova, e un nome di paese che non ha mai sentito lo accorcia o lo
 * reinventa. Lo stesso vale per i nomi delle lavorazioni.
 *
 * `gpt-transcribe` accetta un elenco di termini attesi. Glielo diamo.
 *
 * ## Da dove vengono le parole: **dai dati, mai da una lista**
 *
 * Una lista di comuni scritta in un file sarebbe la solita trappola: giusta il
 * giorno in cui la scrivi, vecchia il mese dopo, e diversa per ogni cliente.
 * Qui si legge quello che l'anagrafica già contiene. Entra un cliente di
 * Castelnuovo? «Castelnuovo» entra nel vocabolario da solo, senza che nessuno
 * tocchi niente.
 *
 * Due fonti, in quest'ordine, perché è la coda a venire tagliata:
 *
 *   1. **i comuni dei clienti**, i più ricorrenti per primi — è il problema
 *      segnalato, e un nome di paese o si azzecca o si sbaglia in modo evidente;
 *   2. **le lavorazioni a catalogo**, che sono il lessico del mestiere.
 *
 * ## Perché NON ci sono i nomi dei clienti
 *
 * Sarebbe la fonte più ovvia, ed è quella che ho lasciato fuori di proposito.
 * OpenAI avverte che un elenco di termini può **far comparire parole che
 * nessuno ha detto**. Su un comune è un fastidio; su un cognome è un danno: una
 * commessa aperta sulla persona sbagliata, che sembra giusta e che nessuno va a
 * ricontrollare. Il cliente, oltretutto, viene già riconosciuto dopo, nella
 * revisione, dove c'è un essere umano che conferma.
 *
 * Tollerante per scelta: se una query fallisce si torna un elenco vuoto. Una
 * dettatura senza vocabolario è una dettatura un po' peggiore; una dettatura
 * che non parte è una dettatura persa.
 */

/**
 * Contesto generico sul tipo di registrazione. Volutamente **senza nulla di
 * specifico del cliente**: la zona e i nomi li dicono già le parole del
 * vocabolario, e scrivere qui «provincia di Verona» significherebbe rimettere
 * nel codice un fatto che vale per un cliente solo.
 */
export const CONTESTO_DETTATURA =
  'Nota vocale di un sopralluogo tecnico per un impianto. Possono comparire nomi di comuni, marche e modelli di apparecchi, e termini di cantiere.';

/** Quanti comuni al massimo, per lasciare spazio alle lavorazioni. */
const QUOTA_COMUNI = 70;

export const vocabolarioTenant = cache(
  async (tenantId: string): Promise<string[]> => {
    try {
      const supabase = createServerSupabase();
      const [clientiRes, vociRes] = await Promise.all([
        supabase
          .from('clienti')
          .select('citta')
          .eq('tenant_id', tenantId)
          .not('citta', 'is', null)
          // Tetto di cortesia molto sopra l'anagrafica reale (214 clienti al
          // 06/10/2026): serve solo a non tirare giù un'anagrafica enorme per
          // costruire un suggerimento.
          .limit(1000),
        supabase.from('voci_catalogo').select('nome').limit(200),
      ]);

      // I comuni più ricorrenti per primi: se l'elenco va tagliato, a cadere
      // dev'essere il paese visto una volta sola, non quello di mezza clientela.
      const conteggio = new Map<string, { testo: string; n: number }>();
      for (const r of clientiRes.data ?? []) {
        const citta = (r as { citta?: string | null }).citta?.trim();
        if (!citta) continue;
        const chiave = citta.toLowerCase();
        const gia = conteggio.get(chiave);
        if (gia) gia.n += 1;
        else conteggio.set(chiave, { testo: citta, n: 1 });
      }
      const comuni = [...conteggio.values()]
        .sort((a, b) => b.n - a.n || a.testo.localeCompare(b.testo, 'it'))
        .slice(0, QUOTA_COMUNI)
        .map((c) => c.testo);

      const lavorazioni = (vociRes.data ?? [])
        .map((v) => (v as { nome?: string | null }).nome ?? '')
        .filter(Boolean);

      return preparaVocabolario([...comuni, ...lavorazioni], MAX_VOCABOLARIO);
    } catch {
      return [];
    }
  },
);
