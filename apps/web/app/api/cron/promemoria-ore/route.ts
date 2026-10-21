import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';
import { romeDay } from '@kommessa/api/rome-time';

import { bearerValido } from '@/app/_lib/segreto';
import { promemoriaOreDaConfig } from '@/app/_lib/kantiere-config';
import { leggiTutteConfigTimbro } from '@/app/_lib/timbro/config';
import { leggiGiornateTimbro } from '@/app/_lib/timbro/giornate';
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
  const configs = (await leggiTutteConfigTimbro()).filter((c) => c.stato === 'attivo');

  for (const cfg of configs) {
    const { data: modRaw } = await service
      .from('tenant_modules' as never)
      .select('config, attivo')
      .eq('tenant_id', cfg.tenantId)
      .eq('module_code', 'kantiere')
      .maybeSingle();
    const mod = modRaw as { config: Record<string, unknown> | null; attivo: boolean } | null;
    if (!mod?.attivo) continue;
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
    const gia = new Set(
      ((giaRaw ?? []) as { user_id: string; payload: { giorno?: string; finestra?: string } | null }[]).map(
        (n) => `${n.user_id}|${n.payload?.giorno ?? ''}|${n.payload?.finestra ?? ''}`,
      ),
    );

    const avvisi: Avviso[] = [];
    for (const g of giornate) {
      const userId = utenteDi.get(g.dipendenteId);
      if (!userId) continue;
      if (gia.has(`${userId}|${g.giorno}|${finestra}`)) continue;
      const eOggi = g.giorno === oggi;
      const giornoTesto = eOggi
        ? 'oggi'
        : new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(
            new Date(`${g.giorno}T12:00:00Z`),
          );
      avvisi.push({
        userId,
        codice: 'ore_da_inserire',
        titolo: eOggi ? 'Inserisci le ore di oggi' : 'Ore ancora da inserire',
        corpo: `Hai timbrato ${giornoTesto}: dì su quali commesse hai lavorato.`,
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
