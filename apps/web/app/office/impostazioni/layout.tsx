import type { ReactNode } from 'react';
import { SettingsSideNav } from './_components/settings-tabs';

export const metadata = { title: 'Impostazioni · Kommessa' };

export default function ImpostazioniLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="flex gap-8 lg:gap-10">
        {/* Sidebar navigazione impostazioni */}
        <aside className="w-44 shrink-0">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Impostazioni
          </p>
          <SettingsSideNav />
        </aside>

        {/* Contenuto sezione */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
