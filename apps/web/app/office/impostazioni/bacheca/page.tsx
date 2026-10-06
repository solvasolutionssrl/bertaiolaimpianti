import { MonitorPlay } from 'lucide-react';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';

import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { BachecaClient, type BachecaVista } from './_components/bacheca-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bacheca · Impostazioni' };

/**
 * La bacheca da televisione: accenderla, vedere l'indirizzo, cambiare la
 * password.
 *
 * ⚠️ L'indirizzo **si rilegge** (non è il segreto: lo è la password), e questo
 * è l'opposto del collegamento di una commessa, dove il token non è
 * recuperabile da nessuno. La differenza sta nell'uso: un collegamento si manda
 * una volta a un cliente, un indirizzo da televisione lo si ribatte ogni volta
 * che si cambia schermo.
 */
export default async function BachecaSettingsPage() {
  const ctx = await requireTenantContext();
  const canEdit = canManageTenant(ctx);

  let vista: BachecaVista | null = null;
  try {
    const service = createServiceSupabase();
    const { data } = await service
      .from('bacheche_pubbliche' as never)
      .select('token, attiva, aperture, ultima_apertura_at, created_at')
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (data) {
      const r = data as unknown as {
        token: string;
        attiva: boolean;
        aperture: number;
        ultima_apertura_at: string | null;
        created_at: string;
      };
      vista = {
        token: r.token,
        attiva: r.attiva,
        aperture: r.aperture ?? 0,
        ultimaAperturaAt: r.ultima_apertura_at,
        createdAt: r.created_at,
      };
    }
  } catch {
    // Senza service role la pagina si apre comunque e lo dice il client.
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Bacheca"
        description="Una pagina da aprire sul televisore dell’ufficio: per ogni persona, cosa le resta da fare."
        icon={<MonitorPlay />}
      />
      {!canEdit ? <AdminRequiredNotice /> : null}
      <BachecaClient vista={vista} canEdit={canEdit} />
    </div>
  );
}
