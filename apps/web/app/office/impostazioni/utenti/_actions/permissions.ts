'use server';

import { revalidatePath } from 'next/cache';

import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { eCapacita, scriviCapacita, type Capacita } from '@kommessa/api/capacita';

import { auditTenant } from '@/app/_actions/_lib/audit';
import { assertCanManageTenant } from '../../_components/role-gate';

/**
 * Dare o togliere un potere a una persona.
 *
 * ## Cosa c'era prima
 *
 * `salvaPermessi`, che scriveva sette aree per quattro livelli in
 * `users.permissions`. Quel pannello **non era letto da nessuna riga di
 * codice**: si poteva togliere a un tecnico il permesso sulle commesse e lui
 * continuava a vederle. Zero utenti lo avevano compilato, quindi togliendolo
 * non si perde nessuna configurazione reale — si perde una promessa che l'app
 * non manteneva.
 *
 * Adesso si scrive una cosa sola, e c'è un posto che la legge.
 */
export async function salvaPotere(input: {
  userId: string;
  capacita: string;
  acceso: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return { ok: false, error: 'Solo un amministratore può cambiare i poteri di una persona.' };
  }

  if (!eCapacita(input?.capacita)) return { ok: false, error: 'Potere non riconosciuto.' };
  const capacita: Capacita = input.capacita;
  const acceso = input?.acceso === true;

  const supabase = createServerSupabase();

  // La persona deve essere di questo spazio di lavoro, e serve lo stato attuale
  // della colonna: si accende una voce senza spegnere le altre.
  const { data: target, error: errLettura } = await supabase
    .from('users')
    .select('id, role, display_name, permissions')
    .eq('id', input.userId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (errLettura || !target) return { ok: false, error: 'Persona non trovata.' };

  const t = target as { role: string; display_name: string | null; permissions: unknown };

  // Su un amministratore o sull'ufficio il potere è già compreso nel ruolo:
  // accenderlo o spegnerlo non cambierebbe niente, e una casella che non
  // cambia niente è una casella che inganna.
  if (t.role === 'admin' || t.role === 'office') {
    return {
      ok: false,
      error: 'Chi è in ufficio o amministra può già farlo: per togliergli qualcosa si cambia il ruolo.',
    };
  }

  const nuovo = scriviCapacita(t.permissions, capacita, acceso);

  // `permissions` non è nei tipi generati: stesso cast che usava la versione
  // precedente di questo file.
  const usersTable = supabase.from('users') as any;
  const { error } = await usersTable
    .update({ permissions: nuovo })
    .eq('id', input.userId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'utente',
    entityId: input.userId,
    action: acceso ? 'potere.concedi' : 'potere.revoca',
    before: { permissions: t.permissions } as never,
    after: { permissions: nuovo } as never,
    metadata: { capacita, persona: t.display_name ?? null },
  });

  revalidatePath('/office/impostazioni/utenti');
  return { ok: true };
}
