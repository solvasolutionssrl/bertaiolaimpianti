import { redirect } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../_lib/guard';
import { tenantHasModule } from '@/app/_lib/modules';
import { getAppModeCached } from '@/app/_lib/app-mode';
import { kontabilitaAttiva } from '@/app/_lib/kontabilita-config';
import { NotificheBell } from './_components/notifiche-bell';
import { NuovaSpesa } from './spese/_components/nuova-spesa';
import { elencoCantieriPicker } from './_lib/cantieri-picker-data';
import { mioTurnoAttivo } from './_lib/turno-attivo';
import type { PickerCantiere } from './_components/cantiere-picker';

/**
 * Layout della shell Kantiere mobile.
 *
 * Gating: utente autenticato (guardMobile) + modulo `kantiere` attivo +
 * `app_mode` in ('kantiere','full'). Altrimenti redirect a /mobile.
 * Per i tenant 'kommessa' (incluso Bertaiola) queste route non sono
 * raggiungibili: zero diff sul percorso esistente.
 */
export default async function KantiereMobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await guardMobile();

  const [haModulo, appMode] = await Promise.all([
    tenantHasModule('kantiere'),
    getAppModeCached(),
  ]);

  if (!haModulo || (appMode !== 'kantiere' && appMode !== 'full')) {
    redirect('/mobile');
  }

  const supa = createServerSupabase();

  // Conteggio notifiche non lette per la campanella fissa (best-effort: se la
  // query fallisce mostriamo comunque la campanella senza badge).
  const { count } = await supa
    .from('notifiche' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .is('read_at', null);
  const unreadCount = count ?? 0;

  // Admin/office con profilo dipendente: pill "＋ Spesa" fissa accanto alla
  // campanella → aggiunta spesa (con scelta cantiere) da QUALUNQUE pagina.
  // Mostrata solo se il modulo Kontabilità è attivo.
  const isManager = ctx.role === 'admin' || ctx.role === 'office';
  let mioDip: string | null = null;
  let cantieriPicker: PickerCantiere[] = [];
  let turnoCantiereId: string | null = null;
  let turnoCantiereNome: string | null = null;
  const kontab = isManager ? await kontabilitaAttiva(supa, ctx.tenantId) : false;
  if (isManager && kontab) {
    const [dipRes, cantieri, turno] = await Promise.all([
      supa
        .from('dipendenti' as never)
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .maybeSingle(),
      elencoCantieriPicker(ctx.tenantId),
      mioTurnoAttivo(),
    ]);
    mioDip = (dipRes.data as { id: string } | null)?.id ?? null;
    cantieriPicker = cantieri;
    turnoCantiereId = turno?.cantiereId ?? null;
    turnoCantiereNome = turno?.cantiereNome ?? null;
  }

  return (
    <>
      <NotificheBell unreadCount={unreadCount} />
      {isManager && kontab && mioDip ? (
        <NuovaSpesa
          cantieri={cantieriPicker}
          turnoCantiereId={turnoCantiereId}
          turnoCantiereNome={turnoCantiereNome}
          triggerVariant="fab-top"
        />
      ) : null}
      {children}
    </>
  );
}
