import 'server-only';

import type { createServiceSupabase } from '@kommessa/api/service';

import { etichettaCommessa } from '../../../_lib/link-etichetta';

/**
 * Ritrova la commessa a cui destinare un file, dato l'id oppure l'ETICHETTA
 * scelta nella lista del comando iOS.
 *
 * Sta qui perché la usano due endpoint (`upload` e `prepara`): duplicarla
 * significherebbe poterla far divergere, e una divergenza qui si manifesta
 * come "commessa non trovata" senza altra spiegazione.
 */

export interface RigaCommessa {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  cloud_folder_path: string | null;
}

interface RigaEstesa extends RigaCommessa {
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  cliente: { ragione_sociale: string | null } | { ragione_sociale: string | null }[] | null;
}

const CAMPI =
  'id, codice_interno, nome_cartella, cloud_folder_path, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, cliente:clienti(ragione_sociale)';

export async function risolviCommessa(
  service: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
  come: { commessaId?: string; etichetta?: string },
): Promise<RigaCommessa | null> {
  // Lo scoping esplicito sul tenant È la difesa: qui si gira con service role,
  // che bypassa la RLS. Un token non deve poter scrivere su altre aziende.
  if (come.commessaId) {
    const { data } = await service
      .from('commesse')
      .select(CAMPI)
      .eq('id', come.commessaId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as unknown as RigaCommessa | null) ?? null;
  }

  const etichetta = (come.etichetta ?? '').trim();
  if (!etichetta) return null;

  /** Scorre le commesse e restituisce quella la cui etichetta combacia. */
  async function cerca(soloAperte: boolean): Promise<RigaCommessa | null> {
    let q = service
      .from('commesse')
      .select(CAMPI)
      .eq('tenant_id', tenantId)
      .order('codice_interno', { ascending: false, nullsFirst: false })
      // Il primo giro guarda solo le vive e 300 bastano. Il secondo pesca fra
      // TUTTE, chiuse comprese, e li' 300 sarebbero pochi: su un archivio di
      // anni una commessa chiusa vecchia resterebbe fuori e il comando iOS
      // direbbe «non trovata», cioe' il difetto che questo giro deve chiudere.
      // 999 e' il tetto di una pagina PostgREST (chiederne di piu' non serve).
      .limit(soloAperte ? 300 : 999);
    if (soloAperte) q = q.not('stato', 'in', '(archiviata,completata)');

    const { data } = await q;
    for (const r of (data ?? []) as unknown as RigaEstesa[]) {
      const cliente = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente;
      const etichettaRiga = etichettaCommessa({
        codice_interno: r.codice_interno,
        nome_cartella: r.nome_cartella,
        descrizione_ai_finale: r.descrizione_ai_finale,
        descrizione_ai_proposta: r.descrizione_ai_proposta,
        note_iniziali: r.note_iniziali,
        clienteNome: cliente?.ragione_sociale ?? null,
      });
      if (etichettaRiga === etichetta) {
        return {
          id: r.id,
          codice_interno: r.codice_interno,
          nome_cartella: r.nome_cartella,
          cloud_folder_path: r.cloud_folder_path,
        };
      }
    }
    return null;
  }

  // Prima fra le commesse vive, poi fra tutte. Su una commessa chiusa si carica
  // eccome (una foto o un documento che arrivano dopo la fine dei lavori sono
  // la normalita'), ma a parita' di etichetta deve vincere quella aperta: e' la
  // ragione di questi due giri invece di una query sola senza filtro.
  return (await cerca(true)) ?? (await cerca(false));
}
