'use server';

import { suggerisciDescrizione } from '../../_lib/suggerisci-nome';
import { creaCommessa as creaCommessaCanonica } from '../../_actions/crea-commessa';
import type { CreaCommessaServerInput } from '../../_actions/crea-commessa.schemas';

/**
 * Wrapper legacy del flusso sopralluogo. La logica vera vive ora in:
 *  - `apps/web/app/_actions/crea-commessa.ts` (creazione DB inline)
 *  - `apps/web/app/_lib/suggerisci-nome.ts`  (proposta descrizione locale)
 *  - `apps/web/app/api/suggerisci-nome/route.ts` (HTTP per i client)
 *
 * Niente Edge Function: storage cloud TBD, naming AI sostituito da
 * euristica deterministica (vedi suggerisci-nome.ts).
 */

export interface AiNameInput {
  ragioneSociale: string;
  indirizzo?: string;
  voci: number[];
  note?: string;
}

export interface AiNameResult {
  descrizione: string;
  alternativeMatching: string[];
}

export async function chiamaAiName(input: AiNameInput): Promise<AiNameResult> {
  const { proposta, alternatives } = suggerisciDescrizione({
    voci: input.voci,
    cliente: input.ragioneSociale,
    note: input.note,
  });
  return {
    descrizione: proposta,
    alternativeMatching: alternatives,
  };
}

export interface CreaCommessaInput {
  cliente: {
    id?: string;
    ragioneSociale: string;
    tipo?: 'persona_fisica' | 'azienda';
    indirizzo?: string;
    citta?: string;
    cap?: string;
    provincia?: string;
    telefoni?: string[];
    email?: string[];
  };
  indirizzoCantiere?: string;
  voci: number[];
  descrizioneFinale: string;
  note?: string;
  presetId?: string | null;
}

export interface CreaCommessaResult {
  commessaId: string;
  codiceInterno: string;
  nomeCartella: string;
  cloudFolderPath: string;
}

export async function creaCommessa(
  input: CreaCommessaInput,
): Promise<CreaCommessaResult> {
  const payload: CreaCommessaServerInput = {
    clienteId: input.cliente.id,
    clienteNew: input.cliente.id
      ? undefined
      : {
          ragione_sociale: input.cliente.ragioneSociale,
          tipo: input.cliente.tipo ?? 'persona_fisica',
          indirizzo: input.cliente.indirizzo ?? null,
          citta: input.cliente.citta ?? null,
          cap: input.cliente.cap ?? null,
          provincia: input.cliente.provincia ?? null,
          telefoni: input.cliente.telefoni ?? [],
          email: input.cliente.email ?? [],
          note: null,
        },
    indirizzoCantiere: input.indirizzoCantiere ?? null,
    voci: input.voci,
    descrizioneFinale: input.descrizioneFinale,
    note: input.note ?? null,
    presetId: input.presetId ?? null,
  };

  const res = await creaCommessaCanonica(payload);
  if (!res.ok) throw new Error(res.error);
  return {
    commessaId: res.data.commessaId,
    codiceInterno: res.data.codiceInterno,
    nomeCartella: res.data.nomeCartella,
    cloudFolderPath: res.data.cloudFolderPath,
  };
}
