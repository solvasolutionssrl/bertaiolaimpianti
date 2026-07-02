import { redirect } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../_lib/guard';
import { tenantHasModule } from '@/app/_lib/modules';
import { getAppModeCached } from '@/app/_lib/app-mode';
import { NotificheBell } from './_components/notifiche-bell';
import { NuovaSpesa } from './spese/_components/nuova-spesa';
import { titoloCase } from '@/app/mobile/_lib/display-case';

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
  const isManager = ctx.role === 'admin' || ctx.role === 'office';
  let mioDip: string | null = null;
  let cantieriOpts: { id: string; nome: string }[] = [];
  if (isManager) {
    const [dipRes, cantRes] = await Promise.all([
      supa
        .from('dipendenti' as never)
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .maybeSingle(),
      supa
        .from('cantieri' as never)
        .select('id, nome, codice')
        .eq('tenant_id', ctx.tenantId)
        .order('nome', { ascending: true }),
    ]);
    mioDip = (dipRes.data as { id: string } | null)?.id ?? null;
    cantieriOpts = ((cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? []).map(
      (c) => ({ id: c.id, nome: c.nome ? titoloCase(c.nome) : c.codice || 'Cantiere' }),
    );
  }

  return (
    <>
      <NotificheBell unreadCount={unreadCount} />
      {isManager && mioDip ? (
        <NuovaSpesa
          adminMode
          cantieri={cantieriOpts}
          dipendenteId={mioDip}
          triggerVariant="fab-top"
        />
      ) : null}
      {children}
    </>
  );
}
