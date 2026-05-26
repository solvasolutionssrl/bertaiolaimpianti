import { FolderLock, Eye, Upload, Info } from 'lucide-react';

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_240px]">
      {/* Matrice principale */}
      <div className="space-y-4">
        <SectionHeader
          title="Permessi cartelle"
          description="Definisci quali ruoli vedono e caricano in ciascuna sottocartella delle commesse."
          icon={<FolderLock />}
        />
        {!canEdit && <AdminRequiredNotice />}
        <PresetsEditor presets={rows} canEdit={canEdit} />
      </div>

      {/* Sidebar: legenda */}
      <div className="pt-[52px]">
        <div className="sticky top-6 space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Info className="h-3.5 w-3.5" />
            Come funziona
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p>
                <strong className="text-foreground">Visibilità</strong> — ruoli che possono vedere e aprire i file nella cartella.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p>
                <strong className="text-foreground">Caricamento</strong> — ruoli che possono caricare nuovi file. Solitamente più restrittivo.
              </p>
            </div>
          </div>
          <div className="border-t border-border pt-3 space-y-1.5">
            <p>Cartelle non classificate visibili solo ad Admin e Office (deny by default).</p>
            <p>Eccezioni per singola commessa: tab Permessi nella pagina commessa.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
