import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { fotoCollegamenti } from '../_lib/integrazione-foto';
import { IntegrazioniClient } from './_components/integrazioni-client';
import type { EsecuzioneRow, RigaCollegamento, ScritturaRow } from './_components/tipi';

export const dynamic = 'force-dynamic';

/**
 * `/admin/integrazioni` — la console di piattaforma sui collegamenti coi
 * gestionali dei clienti.
 *
 * Serve a rispondere in fretta a «il cliente dice che le ore non arrivano»
 * senza aprire una query a mano sul database di produzione. Tre domande, tre
 * schede: **come stanno** (semaforo per cliente, con il perche' scritto),
 * **cosa e' uscito** (registro delle scritture) e **chi e' passato** (i giri).
 *
 * Il giudizio non si calcola qui: arriva da `fotoCollegamenti`, che usa la
 * stessa funzione pura del controllo periodico che manda le mail. Due posti,
 * un solo verdetto.
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

  const [collegamenti, tenantsRes, scrittureRes, esecuzioniRes] = await Promise.all([
    fotoCollegamenti(),
    service.from('tenants').select('id, nome'),
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

  const nomeTenant = new Map(
    ((tenantsRes.data ?? []) as unknown as { id: string; nome: string }[]).map((t) => [
      t.id,
      t.nome,
    ]),
  );

  const righe: RigaCollegamento[] = collegamenti.map((c) => ({
    tenantId: c.foto.tenantId,
    tenant: c.foto.tenant,
    sistema: c.foto.sistema,
    modalita: c.foto.modalita,
    attivo: c.attivo,
    stato: c.diagnosi.stato,
    motivi: c.diagnosi.motivi,
    silenzioOre: c.diagnosi.silenzioOre,
    ultimaAttivita: c.foto.ultimaAttivita,
    scrittureOk: c.foto.scrittureOk,
    scrittureErrore: c.foto.scrittureErrore,
    ritardoMedioMin: c.foto.ritardoAckMin === null ? null : Math.round(c.foto.ritardoAckMin),
    giriAperti: c.foto.giriAperti,
    collegate: c.collegate,
    nostreTotali: c.nostreTotali,
    ultimaLettura: c.ultimaLettura,
  }));

  const scritture: ScritturaRow[] = (
    (scrittureRes.data ?? []) as unknown as ScritturaDb[]
  ).map((s) => ({
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

  const giri: EsecuzioneRow[] = (
    (esecuzioniRes.data ?? []) as unknown as EsecuzioneDb[]
  ).map((e) => ({
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

  return <IntegrazioniClient righe={righe} scritture={scritture} giri={giri} />;
}
