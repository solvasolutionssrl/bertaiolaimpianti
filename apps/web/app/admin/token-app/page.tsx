import { Smartphone } from 'lucide-react';

import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { TokenAppClient, type TokenRow, type UtenteOption } from './_components/token-app-client';

export const metadata = { title: 'Platform · Token app' };
export const dynamic = 'force-dynamic';

/**
 * /admin/token-app — token personali per il comando iOS "Carica su Kommessa".
 *
 * Sono credenziali che vivono sul telefono di una persona: qui si creano (il
 * valore in chiaro appare una volta sola) e soprattutto si **revocano**, che e'
 * la ragione principale per cui questa pagina esiste — telefono smarrito,
 * persona che lascia l'azienda.
 */
export default async function TokenAppPage() {
  await requirePlatformAdmin();
  const service = createServiceSupabase();

  const [tokensRes, tenantsRes, utentiRes] = await Promise.all([
    service
      .from('api_tokens' as never)
      .select('id, tenant_id, user_id, label, scopes, last_used_at, created_at, revoked_at')
      .order('created_at', { ascending: false })
      .limit(100),
    service.from('tenants').select('id, nome, slug').order('nome'),
    service
      .from('users')
      .select('id, tenant_id, display_name, role, attivo')
      .eq('attivo', true)
      .order('display_name'),
  ]);

  const tenants = ((tenantsRes.data ?? []) as Array<{
    id: string;
    nome: string | null;
    slug: string | null;
  }>).map((t) => ({ id: t.id, nome: t.nome ?? t.slug ?? t.id.slice(0, 8) }));
  const nomiTenant = new Map(tenants.map((t) => [t.id, t.nome]));

  const utenti: UtenteOption[] = (
    (utentiRes.data ?? []) as Array<{
      id: string;
      tenant_id: string;
      display_name: string | null;
      role: string;
    }>
  )
    // I clienti del portale non caricano media: fuori dall'elenco.
    .filter((u) => u.role !== 'cliente')
    .map((u) => ({
      id: u.id,
      tenantId: u.tenant_id,
      nome: u.display_name ?? u.id.slice(0, 8),
      ruolo: u.role,
    }));
  const nomiUtente = new Map(utenti.map((u) => [u.id, u.nome]));

  const tokens: TokenRow[] = (
    (tokensRes.data ?? []) as unknown as Array<{
      id: string;
      tenant_id: string;
      user_id: string;
      label: string;
      scopes: string[] | null;
      last_used_at: string | null;
      created_at: string;
      revoked_at: string | null;
    }>
  ).map((t) => ({
    id: t.id,
    label: t.label,
    tenant: nomiTenant.get(t.tenant_id) ?? t.tenant_id.slice(0, 8),
    utente: nomiUtente.get(t.user_id) ?? t.user_id.slice(0, 8),
    scopes: t.scopes ?? [],
    lastUsedAt: t.last_used_at,
    createdAt: t.created_at,
    revokedAt: t.revoked_at,
  }));

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Piattaforma"
        title="Token app"
        description="Credenziali personali per il comando iOS «Carica su Kommessa». Il valore si vede una volta sola alla creazione; qui si revocano."
        icon={<Smartphone className="h-4 w-4" aria-hidden="true" />}
      />
      <TokenAppClient tokens={tokens} tenants={tenants} utenti={utenti} />
    </div>
  );
}
