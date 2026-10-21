import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import { romeDay } from '@kommessa/api/rome-time';
import { valutaTimbro, type DiagnosiTimbro, type FotoTimbro } from '@kommessa/api/timbro-salute';

import { leggiTutteConfigTimbro, statoDaConfig, type StatoTimbro } from '@/app/_lib/timbro/config';
import { leggiGiornateTimbro } from '@/app/_lib/timbro/giornate';
import { vistaDaGiornata, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';

/**
 * La foto del collegamento con Timbro per uno o tutti i clienti: config
 * raccontabile, contatori dal registro, giudizio puro.
 */
export interface CollegamentoTimbroAdmin {
  tenantId: string;
  tenant: string;
  stato: StatoTimbro;
  diagnosi: DiagnosiTimbro;
  foto: FotoTimbro;
  /** Timbri validi arrivati nelle ultime 24 ore. */
  timbri24h: number;
  /** Giornate degli ultimi 7 giorni per stato. */
  giornate: { daRipartire: number; daVerificare: number; coperte: number; aperte: number };
}

export async function fotoTimbro(soloTenantId?: string): Promise<CollegamentoTimbroAdmin[]> {
  const service = createServiceSupabase();
  const tutte = (await leggiTutteConfigTimbro()).filter((c) => !soloTenantId || c.tenantId === soloTenantId);
  if (tutte.length === 0) return [];
  const { data: tRaw } = await service
    .from('tenants')
    .select('id, nome')
    .in('id', tutte.map((c) => c.tenantId));
  const nome = new Map(((tRaw ?? []) as unknown as { id: string; nome: string }[]).map((t) => [t.id, t.nome]));
  const adesso = Date.now();
  const da24h = new Date(adesso - 86_400_000).toISOString();
  const oggi = romeDay(new Date());
  const settimanaFa = romeDay(new Date(adesso - 7 * 86_400_000));

  const out = await Promise.all(
    tutte.map(async (cfg) => {
      const [orfani, senzaOra, recenti, giornate] = await Promise.all([
        service
          .from('timbri_grezzi' as never)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', cfg.tenantId)
          .eq('sorgente', 'timbro')
          .eq('stato', 'valido')
          .is('dipendente_id', null),
        service
          .from('timbri_grezzi' as never)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', cfg.tenantId)
          .eq('sorgente', 'timbro')
          .eq('stato', 'valido')
          .is('ts', null),
        service
          .from('timbri_grezzi' as never)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', cfg.tenantId)
          .eq('sorgente', 'timbro')
          .eq('stato', 'valido')
          .gte('ts', da24h),
        cfg.stato === 'spento'
          ? Promise.resolve(new Map())
          : leggiGiornateTimbro(service, cfg.tenantId, { dalGiorno: settimanaFa, alGiorno: oggi }),
      ]);
      const foto: FotoTimbro = {
        stato: cfg.stato,
        conToken: !!cfg.token,
        dal: cfg.dal,
        ultimoGiroAt: cfg.ultimoGiroAt,
        ultimoGiroEsito: cfg.ultimoGiroEsito,
        ultimoGiroMessaggio: cfg.ultimoGiroMessaggio,
        ultimoTimbroAt: cfg.ultimoTimbroAt,
        orfani: orfani.count ?? 0,
        senzaOra: senzaOra.count ?? 0,
      };
      const conta = { daRipartire: 0, daVerificare: 0, coperte: 0, aperte: 0 };
      for (const g of giornate.values()) {
        if (g.stato === 'da_ripartire' || g.stato === 'da_chiudere') conta.daRipartire += 1;
        else if (g.stato === 'da_verificare') conta.daVerificare += 1;
        else if (g.stato === 'coperta') conta.coperte += 1;
        else if (g.stato === 'presenza_aperta') conta.aperte += 1;
      }
      return {
        tenantId: cfg.tenantId,
        tenant: nome.get(cfg.tenantId) ?? '(cliente rimosso)',
        stato: statoDaConfig(cfg),
        diagnosi: valutaTimbro(foto, adesso),
        foto,
        timbri24h: recenti.count ?? 0,
        giornate: conta,
      } satisfies CollegamentoTimbroAdmin;
    }),
  );
  const peso = { guasto: 0, attenzione: 1, mai_visto: 2, ok: 3 } as const;
  return out.sort((a, b) => peso[a.diagnosi.stato] - peso[b.diagnosi.stato] || a.tenant.localeCompare(b.tenant));
}

/** Le giornate timbrate degli ultimi giorni di un cliente, per il tab. */
export async function giornateTimbroRecenti(tenantId: string, giorni = 7): Promise<TimbroGiornataVista[]> {
  const service = createServiceSupabase();
  const oggi = romeDay(new Date());
  const dal = romeDay(new Date(Date.now() - giorni * 86_400_000));
  const [m, dipRes, cantRes] = await Promise.all([
    leggiGiornateTimbro(service, tenantId, { dalGiorno: dal, alGiorno: oggi }),
    service.from('dipendenti' as never).select('id, nome, cognome').eq('tenant_id', tenantId),
    service.from('cantieri' as never).select('id, nome, codice').eq('tenant_id', tenantId),
  ]);
  const nomi = new Map(
    ((dipRes.data ?? []) as { id: string; nome: string; cognome: string }[]).map((d) => [d.id, `${d.nome} ${d.cognome}`.trim()]),
  );
  const cant = new Map(
    ((cantRes.data ?? []) as { id: string; nome: string | null; codice: string | null }[]).map((c) => [
      c.id,
      { nome: c.nome ?? 'Cantiere', codice: c.codice },
    ]),
  );
  return [...m.values()]
    .map((g) => vistaDaGiornata(g, nomi.get(g.dipendenteId) ?? g.dipendenteId, (id) => cant.get(id) ?? null))
    .sort((a, b) => b.giorno.localeCompare(a.giorno) || a.dipendenteNome.localeCompare(b.dipendenteNome));
}
