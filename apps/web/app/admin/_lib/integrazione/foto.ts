import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  valutaCollegamento,
  type Diagnosi,
  type FotoCollegamento,
} from '@kommessa/api/integrazione-salute';

import { leggiConfigIntegrazione } from './config';

/**
 * Raccoglie lo stato reale di un collegamento verso un gestionale.
 *
 * Un solo posto, tre consumatori: il tab del cliente, la console di
 * piattaforma e il controllo periodico che manda la mail. Se ognuno si
 * calcolasse i propri numeri, prima o poi la pagina direbbe "tutto a posto"
 * mentre la mail dice "guasto" — ed e' il tipo di incoerenza che fa smettere di
 * fidarsi di entrambi.
 *
 * Il giudizio non sta qui: qui si misura soltanto. La regola vive in
 * `@kommessa/api/integrazione-salute`, che e' pura e testata.
 */

const FINESTRA_ORE = 24;
/** Un giro appena partito non e' "aperto": e' in corso. */
const GIRO_APERTO_DA_ORE = 2;

/**
 * Com'e' andata la promozione all'ultimo giro di lettura chiuso.
 * `ok: null` = il giro c'e' ma non ha lasciato traccia (giro vecchio, o non e'
 * partita): e' un'informazione, non un'assenza di informazione.
 */
export interface PromozioneVista {
  giroChiusoAl: string;
  ok: boolean | null;
  al?: string;
  motivo?: string;
  categorieCollegate?: number;
  categorieDaSmistare?: number;
  cantieriCreati?: number;
  saltati?: number;
}

export interface CollegamentoAdmin {
  foto: FotoCollegamento;
  diagnosi: Diagnosi;
  attivo: boolean;
  /** Anagrafiche depositate dall'ultima lettura, per entita'. */
  staging: { commesse: number; clienti: number; dipendenti: number };
  ultimaLettura: string | null;
  /** Quante nostre anagrafiche esistono in totale, per dare senso a `nonCollegati`. */
  nostreTotali: number;
  collegate: number;
  ultimaPromozione: PromozioneVista | null;
}

interface RigaModulo {
  tenant_id: string;
  attivo: boolean;
  config: Record<string, unknown> | null;
}

/**
 * Foto di tutti i clienti che hanno la riga del modulo — **anche spenti**.
 * Un'integrazione spenta per sbaglio e' un caso da vedere, non da nascondere.
 */
export async function fotoCollegamenti(
  soloTenantId?: string,
): Promise<CollegamentoAdmin[]> {
  const service = createServiceSupabase();

  let q = service
    .from('tenant_modules' as never)
    .select('tenant_id, attivo, config')
    .eq('module_code', 'integrazione');
  if (soloTenantId) q = q.eq('tenant_id', soloTenantId);
  const { data: moduliRaw } = await q;

  const moduli = (moduliRaw ?? []) as unknown as RigaModulo[];
  if (moduli.length === 0) return [];

  const ids = moduli.map((m) => m.tenant_id);
  const { data: tenantsRaw } = await service
    .from('tenants')
    .select('id, nome, app_mode')
    .in('id', ids);
  const tenants = new Map(
    ((tenantsRaw ?? []) as unknown as { id: string; nome: string; app_mode: string | null }[]).map(
      (t) => [t.id, t],
    ),
  );

  const adesso = Date.now();
  const daIso = new Date(adesso - FINESTRA_ORE * 3_600_000).toISOString();

  const out = await Promise.all(
    moduli.map(async (m) => {
      const cfg = leggiConfigIntegrazione(m.config);
      const t = tenants.get(m.tenant_id);
      const inKantiere = (t?.app_mode ?? 'kantiere') !== 'kommessa';

      const [
        scrittureFinestra,
        ultimoOkRow,
        ultimoErroreRow,
        ultimoGiro,
        giriApertiRes,
        tokenRow,
        stagingRows,
        nostreRes,
        mappatureRes,
        ultimaPromozioneRow,
      ] = await Promise.all([
        service
          .from('integrazione_scritture' as never)
          .select('esito, scritto_at, registrato_at')
          .eq('tenant_id', m.tenant_id)
          .gte('registrato_at', daIso),
        service
          .from('integrazione_scritture' as never)
          .select('registrato_at')
          .eq('tenant_id', m.tenant_id)
          .eq('esito', 'ok')
          .order('registrato_at', { ascending: false })
          .limit(1),
        service
          .from('integrazione_scritture' as never)
          .select('registrato_at')
          .eq('tenant_id', m.tenant_id)
          .eq('esito', 'errore')
          .order('registrato_at', { ascending: false })
          .limit(1),
        service
          .from('integrazione_esecuzioni' as never)
          .select('avviata_at')
          .eq('tenant_id', m.tenant_id)
          .order('avviata_at', { ascending: false })
          .limit(1),
        service
          .from('integrazione_esecuzioni' as never)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', m.tenant_id)
          .is('conclusa_at', null)
          .lt('avviata_at', new Date(adesso - GIRO_APERTO_DA_ORE * 3_600_000).toISOString()),
        // `last_used_at` e' il segnale piu' onesto: dice che l'agente ha
        // chiamato, anche quando non aveva niente da scrivere.
        service
          .from('api_tokens' as never)
          .select('last_used_at')
          .eq('tenant_id', m.tenant_id)
          .contains('scopes', ['integrazione'])
          .is('revoked_at', null)
          .order('last_used_at', { ascending: false, nullsFirst: false })
          .limit(1),
        service
          .from('integrazione_staging' as never)
          .select('entita, letto_at')
          .eq('tenant_id', m.tenant_id),
        inKantiere
          ? service
              .from('cantieri' as never)
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', m.tenant_id)
          : service
              .from('commesse')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', m.tenant_id)
              .not('stato', 'in', '(archiviata)'),
        service
          .from('integrazione_mappature' as never)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', m.tenant_id)
          .in('entita', ['cantiere', 'commessa']),
        // L'ultimo giro di lettura chiuso: dentro `dettaglio.promozione` c'e'
        // scritto se la promozione e' partita e cosa ha fatto. Senza questo,
        // «girata a vuoto» e «mai partita» sono indistinguibili.
        service
          .from('integrazione_esecuzioni' as never)
          .select('conclusa_at, dettaglio')
          .eq('tenant_id', m.tenant_id)
          .eq('direzione', 'lettura')
          .not('conclusa_at', 'is', null)
          .order('conclusa_at', { ascending: false })
          .limit(1),
      ]);

      const scritture = (scrittureFinestra.data ?? []) as unknown as {
        esito: string;
        scritto_at: string;
        registrato_at: string;
      }[];
      const ok = scritture.filter((s) => s.esito === 'ok');
      const scarti = ok.map(
        (s) => (new Date(s.registrato_at).getTime() - new Date(s.scritto_at).getTime()) / 60000,
      );

      const primo = <T,>(r: { data: unknown }, k: string): T | null => {
        const rows = (r.data ?? []) as unknown as Record<string, T>[];
        return rows[0]?.[k] ?? null;
      };
      const ultimoOk = primo<string>(ultimoOkRow, 'registrato_at');
      const ultimoErrore = primo<string>(ultimoErroreRow, 'registrato_at');
      const ultimoGiroAt = primo<string>(ultimoGiro, 'avviata_at');
      const ultimoToken = primo<string | null>(tokenRow, 'last_used_at');

      const staging = (stagingRows.data ?? []) as unknown as {
        entita: string;
        letto_at: string;
      }[];
      const conta = (e: string) => staging.filter((s) => s.entita === e).length;
      const ultimaLettura = staging.reduce<string | null>(
        (acc, s) => (!acc || s.letto_at > acc ? s.letto_at : acc),
        null,
      );

      const ultimaAttivita = [ultimoOk, ultimoErrore, ultimoGiroAt, ultimoToken, ultimaLettura]
        .filter((x): x is string => !!x)
        .sort()
        .pop() ?? null;

      const nostreTotali = nostreRes.count ?? 0;
      const collegate = mappatureRes.count ?? 0;

      const giroChiuso = ((ultimaPromozioneRow.data ?? []) as unknown as {
        conclusa_at: string;
        dettaglio: Record<string, unknown> | null;
      }[])[0];
      const promoGrezza = giroChiuso?.dettaglio?.promozione;
      const ultimaPromozione: PromozioneVista | null = giroChiuso
        ? promoGrezza && typeof promoGrezza === 'object'
          ? { giroChiusoAl: giroChiuso.conclusa_at, ...(promoGrezza as Omit<PromozioneVista, 'giroChiusoAl'>) }
          : // Giro chiuso ma nessuna traccia: o e' precedente a questa scrittura,
            // oppure la promozione non e' partita. Va detto, non nascosto.
            { giroChiusoAl: giroChiuso.conclusa_at, ok: null }
        : null;

      const foto: FotoCollegamento = {
        tenantId: m.tenant_id,
        tenant: t?.nome ?? '(cliente rimosso)',
        sistema: cfg.sistema,
        modalita: cfg.modalita,
        ultimaAttivita,
        scrittureOk: ok.length,
        scrittureErrore: scritture.length - ok.length,
        ultimoErrore,
        ultimoOk,
        ritardoAckMin: scarti.length
          ? scarti.reduce((a, b) => a + b, 0) / scarti.length
          : null,
        giriAperti: giriApertiRes.count ?? 0,
        nonCollegati: Math.max(0, nostreTotali - collegate),
        sogliaSilenzioOre: cfg.sogliaSilenzioOre,
      };

      return {
        foto,
        diagnosi: valutaCollegamento(foto, adesso),
        attivo: m.attivo,
        staging: {
          commesse: conta('commessa'),
          clienti: conta('cliente'),
          dipendenti: conta('dipendente'),
        },
        ultimaLettura,
        nostreTotali,
        collegate,
        ultimaPromozione,
      } satisfies CollegamentoAdmin;
    }),
  );

  // Prima quello che chiede attenzione.
  const peso = { guasto: 0, attenzione: 1, mai_visto: 2, ok: 3 } as const;
  return out.sort(
    (a, b) =>
      peso[a.diagnosi.stato] - peso[b.diagnosi.stato] ||
      a.foto.tenant.localeCompare(b.foto.tenant),
  );
}
