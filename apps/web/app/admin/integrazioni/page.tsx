import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { IntegrazioniClient } from './_components/integrazioni-client';
import type { CodaTenant, EsecuzioneRow, OperazioneRow } from './_components/tipi';

export const dynamic = 'force-dynamic';

/**
 * /admin/integrazioni — vista di piattaforma sulle sincronizzazioni.
 *
 * Serve a rispondere in fretta a: «il cliente dice che le ore non arrivano».
 * Senza questa pagina la risposta richiede una query a mano sul database,
 * e nel frattempo il cliente aspetta.
 *
 * L'ordine delle informazioni segue quello delle domande vere:
 *  1. le code sono ferme? (quante in attesa, quante in errore, da quanto)
 *  2. l'agente è vivo? (ultimo giro riuscito)
 *  3. cosa è fallito, e con che messaggio?
 */

const LIMITE_OPERAZIONI = 100;
const LIMITE_ESECUZIONI = 40;

interface RigaOutboxDb {
  id: string;
  tenant_id: string;
  sistema: string;
  tipo: string;
  stato: string;
  tentativi: number;
  ultimo_errore: string | null;
  payload: Record<string, unknown> | null;
  esito_esterno: Record<string, unknown> | null;
  created_at: string;
  inviato_at: string | null;
}

interface RigaEsecuzioneDb {
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

  const [tenantsRes, moduliRes, outboxRes, esecuzioniRes] = await Promise.all([
    service.from('tenants').select('id, nome, slug'),
    service
      .from('tenant_modules' as never)
      .select('tenant_id, attivo, config')
      .eq('module_code', 'integrazione'),
    service
      .from('integrazione_outbox' as never)
      .select(
        'id, tenant_id, sistema, tipo, stato, tentativi, ultimo_errore, payload, esito_esterno, created_at, inviato_at',
      )
      .order('created_at', { ascending: false })
      .limit(LIMITE_OPERAZIONI),
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

  const outbox = (outboxRes.data ?? []) as unknown as RigaOutboxDb[];
  const esecuzioni = (esecuzioniRes.data ?? []) as unknown as RigaEsecuzioneDb[];

  // Una scheda per cliente che ha l'integrazione accesa. Anche a zero
  // operazioni: «nessuna coda» e «cliente non configurato» sono due risposte
  // diverse, e vanno distinte a colpo d'occhio.
  const code: CodaTenant[] = moduli
    .filter((m) => m.attivo)
    .map((m) => {
      const mie = outbox.filter((o) => o.tenant_id === m.tenant_id);
      const giri = esecuzioni.filter((e) => e.tenant_id === m.tenant_id);
      const ultimoOk = giri.find((e) => e.esito === 'ok' || e.esito === 'parziale');
      const config = m.config ?? {};
      return {
        tenantId: m.tenant_id,
        tenant: nomeTenant.get(m.tenant_id) ?? '—',
        sistema: typeof config.sistema === 'string' ? config.sistema : '—',
        sincManuale: config.sinc_manuale !== false,
        autoPush: config.auto_push === true,
        inAttesa: mie.filter((o) => o.stato === 'in_attesa').length,
        inCorso: mie.filter((o) => o.stato === 'in_corso').length,
        inErrore: mie.filter((o) => o.stato === 'errore').length,
        inviate: mie.filter((o) => o.stato === 'inviato').length,
        ultimoGiroOk: ultimoOk?.conclusa_at ?? null,
        ultimoGiro: giri[0]?.avviata_at ?? null,
      };
    })
    .sort((a, b) => b.inErrore - a.inErrore || a.tenant.localeCompare(b.tenant));

  const operazioni: OperazioneRow[] = outbox.map((o) => ({
    id: o.id,
    tenant: nomeTenant.get(o.tenant_id) ?? '—',
    sistema: o.sistema,
    tipo: o.tipo,
    stato: o.stato,
    tentativi: o.tentativi,
    errore: o.ultimo_errore,
    descrizione:
      typeof o.payload?.descrizione === 'string' ? o.payload.descrizione : null,
    esitoEsterno: o.esito_esterno ? JSON.stringify(o.esito_esterno) : null,
    creataAt: o.created_at,
    inviataAt: o.inviato_at,
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
      operazioni={operazioni}
      giri={giri}
      nessunModulo={code.length === 0}
    />
  );
}
