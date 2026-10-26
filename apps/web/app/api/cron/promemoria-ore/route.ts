import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';
import { romeDay } from '@kommessa/api/rome-time';

import { bearerValido } from '@/app/_lib/segreto';
import { promemoriaOreDaConfig } from '@/app/_lib/kantiere-config';
import { leggiGiornateTimbro } from '@/app/_lib/timbro/giornate';
import { FINESTRA_FINE_TURNO } from '@/app/_lib/timbro/avvisa-fine';
import { avvisa, type Avviso } from '@/app/_actions/_lib/avvisa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Il promemoria «inserisci le ore»: ogni quarto d'ora (pg_cron) si guarda
 * quali clienti sono nella loro finestra — la sera per oggi, la mattina per
 * le giornate precedenti — e si avvisa chi ha timbrato al terminale senza
 * aver ancora ripartito.
 *
 * Il mittente e' `avvisa()`, come per tutto il resto: la riga in app si
 * scrive sempre, la push rispetta le preferenze della persona. Un avviso per
 * giornata per finestra: se oggi ha gia' ricevuto quello di stasera per il
 * 22/10, non ne riceve un secondo alle 18:22.
 */

const FINESTRA_MIN = 15;

function minutiDelGiorno(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

function nellaFinestra(adessoMin: number, oraHHMM: string): boolean {
  const t = minutiDelGiorno(oraHHMM);
  return adessoMin >= t && adessoMin < t + FINESTRA_MIN;
}

async function run(request: NextRequest) {
  if (!bearerValido(request, process.env.CRON_SECRET)) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  const prova = request.nextUrl.searchParams.get('prova') === '1';
  const forzaFinestra = request.nextUrl.searchParams.get('finestra'); // 'sera' | 'mattina' per provare
  const service = createServiceSupabase();

  const adesso = new Date();
  const oggi = romeDay(adesso);
  const oraRome = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false }).format(adesso);
  const adessoMin = minutiDelGiorno(oraRome);

  const esiti: Array<{ tenantId: string; finestra: string; destinatari: number; avvisati: number }> = [];
  // Tutti i clienti con il modulo presenze: il registro contiene i badge del
  // terminale (dove c'e') e la presenza segnata dall'app senza cantiere.
  const { data: moduliRaw } = await service
    .from('tenant_modules' as never)
    .select('tenant_id, config, attivo')
    .eq('module_code', 'kantiere')
    .eq('attivo', true);
  const moduli = (moduliRaw ?? []) as { tenant_id: string; config: Record<string, unknown> | null; attivo: boolean }[];

  for (const mod of moduli) {
    const cfg = { tenantId: mod.tenant_id };
    const pr = promemoriaOreDaConfig(mod.config?.['promemoria_ore']);
    if (!pr.attivo) continue;

    const finestra =
      forzaFinestra === 'sera' || forzaFinestra === 'mattina'
        ? forzaFinestra
        : nellaFinestra(adessoMin, pr.sera)
          ? 'sera'
          : nellaFinestra(adessoMin, pr.mattina)
            ? 'mattina'
            : null;
    if (!finestra) continue;

    // La sera: la giornata di oggi. La mattina: ieri e i giorni prima, fino a una settimana.
    const dal = finestra === 'sera' ? oggi : romeDay(new Date(adesso.getTime() - 7 * 86_400_000));
    const al = finestra === 'sera' ? oggi : romeDay(new Date(adesso.getTime() - 86_400_000));
    const giornate = [...(await leggiGiornateTimbro(service, cfg.tenantId, { dalGiorno: dal, alGiorno: al })).values()].filter(
      (g) => g.stato === 'da_ripartire' || g.stato === 'da_chiudere',
    );
    if (giornate.length === 0) {
      esiti.push({ tenantId: cfg.tenantId, finestra, destinatari: 0, avvisati: 0 });
      continue;
    }

    const dipendenti = [...new Set(giornate.map((g) => g.dipendenteId))];
    const { data: dipRaw } = await service
      .from('dipendenti' as never)
      .select('id, user_id')
      .in('id', dipendenti);
    const utenteDi = new Map(
      ((dipRaw ?? []) as { id: string; user_id: string | null }[]).filter((d) => d.user_id).map((d) => [d.id, d.user_id!]),
    );

    // Gia' avvisati in questa finestra: stesso utente, stessa giornata, nelle ultime 20 ore.
    const da20h = new Date(adesso.getTime() - 20 * 3_600_000).toISOString();
    const { data: giaRaw } = await service
      .from('notifiche')
      .select('user_id, payload')
      .eq('tenant_id', cfg.tenantId)
      .eq('type', 'ore_da_inserire')
      .gte('created_at', da20h);
    const righeGia = (giaRaw ?? []) as {
      user_id: string;
      payload: { giorno?: string; finestra?: string } | null;
    }[];
    const gia = new Set(
      righeGia.map((n) => `${n.user_id}|${n.payload?.giorno ?? ''}|${n.payload?.finestra ?? ''}`),
    );
    // Il promemoria partito al gesto di fine giornata vale per la sera.
    const giaAlTerminale =
      finestra === 'sera'
        ? new Set(
            righeGia
              .filter((n) => n.payload?.finestra === FINESTRA_FINE_TURNO)
              .map((n) => `${n.user_id}|${n.payload?.giorno ?? ''}`),
          )
        : new Set<string>();

    const avvisi: Avviso[] = [];
    for (const g of giornate) {
      const userId = utenteDi.get(g.dipendenteId);
      if (!userId) continue;
      if (gia.has(`${userId}|${g.giorno}|${finestra}`)) continue;
      if (giaAlTerminale.has(`${userId}|${g.giorno}`)) continue;
      const eOggi = g.giorno === oggi;
      const giornoTesto = eOggi
        ? 'oggi'
        : new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(
            new Date(`${g.giorno}T12:00:00Z`),
          );
      avvisi.push({
        userId,
        codice: 'ore_da_inserire',
        // Registro formale e oggettivo: un fatto e l'azione richiesta.
        titolo: eOggi ? 'Registrazione ore' : `Registrazione ore · ${giornoTesto}`,
        // Testo scelto da Luca il 23/10/2026.
        corpo: `Presenza registrata. Ricordati di caricare le ore sulle commesse di ${giornoTesto}.`,
        url: '/mobile/kantiere/ore',
        extra: { giorno: g.giorno, finestra },
      });
    }
    const esito = prova ? { registrati: 0, saltati: 0 } : await avvisa(avvisi);
    esiti.push({ tenantId: cfg.tenantId, finestra, destinatari: avvisi.length, avvisati: esito.registrati });
  }

  return Response.json({ ok: true, prova, ora: oraRome, esiti });
}

export async function POST(request: NextRequest) {
  return run(request);
}
export async function GET(request: NextRequest) {
  return run(request);
}
