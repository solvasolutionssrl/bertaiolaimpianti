import { ToggleRight } from 'lucide-react';

import { getAppModeCached } from '@/app/_lib/app-mode';
import { getTenantFeaturesCached } from '@/app/_lib/tenant-features';
import {
  FEATURE_REGISTRY,
  featureDefault,
} from '@/app/_lib/tenant-features-registry';
import { requireTenantContext } from '@kommessa/api/tenant';

import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { FunzioniClient, type FunzioneVista } from './_components/funzioni-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Funzioni · Impostazioni' };

/**
 * Le funzioni che l'ufficio puo' accendere da se'.
 *
 * Esisteva solo il pannello del super admin, e andava bene finche' le funzioni
 * accendibili erano cose nostre. «Turno in cantiere» no: e' una scelta su come
 * lavora quell'azienda, e chiedere a noi per accenderla significa che non
 * verra' accesa.
 *
 * Il registro (`_lib/tenant-features-registry.ts`) dice quali sono dell'uno e
 * quali dell'altro: qui compaiono solo quelle con `gestibileDaUfficio`. Le
 * altre si vedono comunque, spiegate e non toccabili — sapere che una cosa
 * esiste e che si chiede a noi e' meglio che non vederla affatto.
 */
export default async function FunzioniPage() {
  const ctx = await requireTenantContext();
  const canEdit = canManageTenant(ctx);

  const [overrides, appMode] = await Promise.all([
    getTenantFeaturesCached(),
    getAppModeCached(),
  ]);
  const kommessaWorld = appMode !== 'kantiere';

  const funzioni: FunzioneVista[] = FEATURE_REGISTRY.map((f) => ({
    chiave: f.key,
    etichetta: f.label,
    descrizione: f.descrizione,
    accesa: f.key in overrides ? overrides[f.key]! : featureDefault(f, kommessaWorld),
    scelta: f.key in overrides,
    nostra: f.gestibileDaUfficio !== true,
  }));

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Funzioni"
        description="Cosa è acceso nel vostro spazio di lavoro. Si può cambiare idea in qualsiasi momento: niente viene cancellato."
        icon={<ToggleRight />}
      />

      {!canEdit ? <AdminRequiredNotice /> : null}

      <FunzioniClient funzioni={funzioni} canEdit={canEdit} />
    </div>
  );
}
