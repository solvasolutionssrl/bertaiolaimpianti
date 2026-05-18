import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { SectionHeader } from '../../_components/section-header';
import { SettingsTabs } from './_components/settings-tabs';

export const metadata = { title: 'Impostazioni · impiantiXplus' };

export default function ImpostazioniLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <SectionHeader
        eyebrow="Impostazioni"
        title="Configura il tuo spazio di lavoro"
        description="Profilo, catalogo lavori, preset, accessi, branding e storage. Le modifiche al tenant sono riservate agli amministratori."
        icon={<Settings2 />}
      />

      <div className="mt-8">
        <SettingsTabs />
      </div>

      <div className="pt-8">{children}</div>
    </div>
  );
}
