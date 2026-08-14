import { type NextRequest } from 'next/server';

import { meritaAvviso } from '@kommessa/api/integrazione-salute';

import { fotoCollegamenti } from '../../../admin/_lib/integrazione/foto';
import { segnalaCollegamentoInAvaria } from '../../../_lib/integrazione/alert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Controllo periodico dei collegamenti verso i gestionali dei clienti.
 *
 * Serve perche' **un'integrazione non si rompe con un errore in faccia: smette
 * di farsi viva**. L'agente gira su una macchina del cliente, dietro la sua
 * VPN; se quella macchina si spegne, da noi non succede niente di visibile — le
 * ore semplicemente non arrivano piu', e ce ne accorgiamo a fine mese quando il
 * cliente chiama.
 *
 * Il giudizio non e' qui: e' `valutaCollegamento`, la stessa funzione pura che
 * colora i semafori in `/admin/integrazioni`. Cosi' la pagina e la mail non
 * possono dire due cose diverse.
 *
 * Avvisa **solo** i clienti in modalita' `attiva` e solo sui guasti: un agente
 * ancora in scrittura si ferma di continuo, e un avviso che suona sempre e' un
 * avviso che si impara a ignorare.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`. Programmato con pg_cron —
 * vedi `supabase/migrations/20260812090000_cron_integrazioni_salute.sql`.
 */

function autorizzato(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!autorizzato(request)) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  // `prova=1` esegue la valutazione e riporta l'esito senza mandare niente:
  // serve a controllare il controllo, prima di fidarsene.
  const prova = request.nextUrl.searchParams.get('prova') === '1';

  const collegamenti = await fotoCollegamenti();
  const esiti: Array<{
    tenant: string;
    stato: string;
    avvisato: boolean;
    motivi: string[];
  }> = [];

  for (const c of collegamenti) {
    // Modulo spento = scelta nostra, non guasto: non si avvisa di una porta
    // che abbiamo chiuso noi.
    const avvisa = c.attivo && meritaAvviso(c.foto, c.diagnosi);
    if (avvisa && !prova) {
      await segnalaCollegamentoInAvaria({
        tenantId: c.foto.tenantId,
        tenant: c.foto.tenant,
        sistema: c.foto.sistema,
        silenzioOre: c.diagnosi.silenzioOre,
        motivi: c.diagnosi.motivi,
      });
    }
    esiti.push({
      tenant: c.foto.tenant,
      stato: c.diagnosi.stato,
      avvisato: avvisa && !prova,
      motivi: c.diagnosi.motivi,
    });
  }

  return Response.json({
    ok: true,
    prova,
    controllati: collegamenti.length,
    inAvaria: esiti.filter((e) => e.stato === 'guasto').length,
    esiti,
  });
}

export async function POST(request: NextRequest) {
  return run(request);
}

/** Comodo per un controllo manuale dal browser, con `?prova=1`. */
export async function GET(request: NextRequest) {
  return run(request);
}
