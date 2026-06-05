'use server';

import { revalidatePath } from 'next/cache';

import { requireTenantContext } from '@kommessa/api/tenant';

import { softDeleteMediaFile, type CestinoResult } from '@/app/_lib/media-cestino';

/**
 * Server action: l'ufficio sposta un media nel cestino (retention 30gg).
 *
 * Permessi: solo ruoli 'admin' e 'office' del tenant. Tecnico e cliente NON
 * possono eliminare. Il guardrail `expectTenantId` impedisce di toccare file
 * di altri tenant anche se l'id venisse manipolato.
 *
 * Effetto: il file sparisce da Nextcloud e da tutte le gallerie; resta
 * recuperabile 30 giorni dal pannello SOLVA (/admin/media).
 */
export async function eliminaMediaOffice(
  fileRefId: string,
  commessaId: string,
): Promise<CestinoResult> {
  const ctx = await requireTenantContext();
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return { ok: false, message: 'Non hai i permessi per eliminare i media.' };
  }

  const res = await softDeleteMediaFile({
    fileRefId,
    expectTenantId: ctx.tenantId,
    actor: { userId: ctx.userId, role: ctx.role },
  });

  if (res.ok && commessaId) {
    revalidatePath(`/office/commesse/${commessaId}/foto`);
    revalidatePath(`/office/commesse/${commessaId}/lavori`);
  }
  return res;
}
