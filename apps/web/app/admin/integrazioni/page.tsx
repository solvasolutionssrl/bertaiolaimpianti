import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { IntegrazioniClient } from './_components/integrazioni-client';
import type { CodaTenant, EsecuzioneRow, ScritturaRow } from './_components/tipi';

export const dynamic = 'force-dynamic';

/**
 * /admin/integrazioni — vista di piattaforma sulle sincronizzazioni.
 *
 * Serve a rispondere in fretta a «il cliente dice che le ore non arrivano»,
 * senza aprire una query a mano sul database.
 *
 * Con l'API a risorse non esiste piu' una coda da guardare: e' l'agente a
 * decidere cosa prendere. Restano le due domande che contano davvero — **cosa
 * e' stato scritto fuori** e **da quanto tempo nessuno si fa vivo** — e la
 * pagina risponde a quelle.
 */

const LIMITE_SCRITTURE = 100;
const LIMITE_ESECUZIONI = 40;

interface ScritturaDb {
  id: string;
  tenant_id: string;
  risorsa: string;
  variante: string;
  esito: string;
  external_ref: Record<string, unknown> | null;
  errore: string | null;
  scritto_at: string;
  registrato_at: string;
}

interface EsecuzioneDb {
  id: string;
  tenant_id: string;
  sistema: string;
  direzione: string;
  avvio: string;
  esito: string | null;
  letti: number;
  scritti: number;
  errori: number;
  messaggio: string | null;
  avviata_at: string;
  conclusa_at: string | null;
}

export default async function IntegrazioniPage() {
  await requirePlatformAdmin();
  const service = createServiceSupabase();

  const [tenantsRes, moduliRes, scrittureRes, esecuzioniRes] = await Promise.all([
    service.from('tenants').select('id, nome, slug'),
    service
      .from('tenant_modules' as never)
      .select('tenant_id, attivo, config')
      .eq('module_code', 'integrazione'),
    service
      .from('integrazione_scritture' as never)
      .select(
        'id, tenant_id, risorsa, variante, esito, external_ref, errore, scritto_at, registrato_at',
      )
      .order('registrato_at', { ascending: false })
      .limit(LIMITE_SCRITTURE),
    service
      .from('integrazione_esecuzioni' as never)
      .select(
        'id, tenant_id, sistema, direzione, avvio, esito, letti, scritti, errori, messaggio, avviata_at, conclusa_at',
      )
      .order('avviata_at', { ascending: false })
      .limit(LIMITE_ESECUZIONI),
  ]);

  const tenants = (tenantsRes.data ?? []) as unknown as {
    id: string;
    nome: string;
    slug: string;
  }[];
  const nomeTenant = new Map(tenants.map((t) => [t.id, t.nome]));

  const moduli = (moduliRes.data ?? []) as unknown as {
    tenant_id: string;
    attivo: boolean;
    config: Record<string, unknown> | null;
  }[];

  const scritture = (scrittureRes.data ?? []) as unknown as ScritturaDb[];
  const esecuzioni = (esecuzioniRes.data ?? []) as unknown as EsecuzioneDb[];

  const code: CodaTenant[] = moduli
    .filter((m) => m.attivo)
    .map((m) => {
      const mie = scritture.filter((s) => s.tenant_id === m.tenant_id);
      const ok = mie.filter((s) => s.esito === 'ok');
      const giri = esecuzioni.filter((e) => e.tenant_id === m.tenant_id);
      const config = m.config ?? {};

      // Lo scarto fra "scritto sul gestionale" e "comunicato a noi": e' il
      // ritardo con cui l'agente ci sta tenendo aggiornati.
      const scarti = ok.map(
        (s) =>
          (new Date(s.registrato_at).getTime() - new Date(s.scritto_at).getTime()) / 60000,
      );
      const ritardoMedioMin = scarti.length
        ? Math.round(scarti.reduce((a, b) => a + b, 0) / scarti.length)
        : null;

      return {
        tenantId: m.tenant_id,
        tenant: nomeTenant.get(m.tenant_id) ?? '—',
        sistema: typeof config.sistema === 'string' ? config.sistema : '—',
        modalita: config.modalita === 'attiva' ? 'attiva' : 'simulazione',
        collaudoEsterni: Array.isArray(config.collaudo_esterni)
          ? config.collaudo_esterni.length
          : 0,
        scrittureOk: ok.length,
        scrittureErrore: mie.filter((s) => s.esito === 'errore').length,
        ultimaScrittura: ok[0]?.scritto_at ?? null,
        ultimoGiroOk:
          giri.find((e) => e.esito === 'ok' || e.esito === 'parziale')?.conclusa_at ?? null,
        ultimoGiro: giri[0]?.avviata_at ?? null,
        ritardoMedioMin,
      };
    })
    .sort((a, b) => b.scrittureErrore - a.scrittureErrore || a.tenant.localeCompare(b.tenant));

  const righeScritture: ScritturaRow[] = scritture.map((s) => ({
    id: s.id,
    tenant: nomeTenant.get(s.tenant_id) ?? '—',
    risorsa: s.risorsa,
    variante: s.variante,
    esito: s.esito,
    riferimento: s.external_ref ? JSON.stringify(s.external_ref) : null,
    errore: s.errore,
    scrittoAl: s.scritto_at,
    registratoAl: s.registrato_at,
  }));

  const giri: EsecuzioneRow[] = esecuzioni.map((e) => ({
    id: e.id,
    tenant: nomeTenant.get(e.tenant_id) ?? '—',
    sistema: e.sistema,
    direzione: e.direzione,
    avvio: e.avvio,
    esito: e.esito,
    letti: e.letti,
    scritti: e.scritti,
    errori: e.errori,
    messaggio: e.messaggio,
    avviataAt: e.avviata_at,
    conclusaAt: e.conclusa_at,
  }));

  return (
    <IntegrazioniClient
      code={code}
      scritture={righeScritture}
      giri={giri}
      nessunModulo={code.length === 0}
    />
  );
}
