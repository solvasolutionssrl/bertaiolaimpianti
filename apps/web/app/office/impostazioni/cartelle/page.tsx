import { FolderLock } from 'lucide-react';

import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';

import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { PresetsEditor } from './_components/presets-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Permessi cartelle · Impostazioni' };

interface PresetRow {
  id: string;
  path: string;
  label: string;
  ordine: number;
  visible_roles: string[];
  upload_roles: string[];
}

export default async function PermessiCartellePage() {
  const ctx = await requireTenantContext();
  const canEdit = canManageTenant(ctx) && ctx.role === 'admin';

  const supabase = createServerSupabase();
  const { data: presets } = await supabase
    .from('folder_presets')
    .select('id, path, label, ordine, visible_roles, upload_roles')
    .eq('tenant_id', ctx.tenantId)
    .order('ordine', { ascending: true });

  const rows = (presets as PresetRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Permessi cartelle"
        description="Definisci quali ruoli vedono e caricano in ciascuna sottocartella standard delle commesse. Le impostazioni si applicano a tutte le nuove commesse del tenant."
        icon={<FolderLock />}
      />

      {!canEdit && <AdminRequiredNotice />}

      <PresetsEditor presets={rows} canEdit={canEdit} />

      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Come funziona</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Visibilità</strong>: ruoli che possono <em>vedere</em> e aprire i file dentro la cartella.
          </li>
          <li>
            <strong>Caricamento</strong>: ruoli che possono <em>caricare</em> nuovi file. Più restrittivo di solito.
          </li>
          <li>
            Le cartelle non classificate (es. create manualmente da Nextcloud) sono visibili solo a admin e office (deny by default).
          </li>
          <li>
            Eccezioni puntuali per singola commessa si gestiscono dalla pagina commessa → tab Permessi.
          </li>
        </ul>
      </div>
    </div>
  );
}
