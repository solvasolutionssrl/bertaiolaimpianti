'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { cn } from '@kommessa/ui';

import type { MiaGiornata } from '@/app/office/_lib/mia-giornata';
import { LeMieOre } from '@/app/office/kantiere/rapportini/_components/le-mie-ore';
import type { TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { useCompilaMio } from './compila-mio';

export interface AvvisoRecente {
  id: string;
  titolo: string;
  quando: string;
  url: string | null;
  letto: boolean;
}

const fmtQuando = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * «Oggi» del tecnico da computer: la stessa card «Le mie ore» che l'ufficio
 * ha in Presenze e ore (stato di oggi con i tasti, giornate da completare) e
 * gli ultimi avvisi. I dialog sono quelli di sempre, nei soli modi «miei».
 */
export function OggiClient({ mia, timbroOggi, timbro, nAnomalie, avvisi }: {
  mia: MiaGiornata;
  timbroOggi: TimbroGiornataVista | null;
  timbro: TimbroGiornataVista[];
  nAnomalie: number;
  avvisi: AvvisoRecente[];
}) {
  const router = useRouter();
  const { apri, dialogo } = useCompilaMio(mia);
  return (
    <div className="space-y-4">
      <LeMieOre
        mia={mia}
        timbroOggi={timbroOggi}
        timbro={timbro}
        giorniAperti={[]}
        nAnomalie={nAnomalie}
        onRipartisci={(g) => apri({ tipo: 'scatola', vista: g })}
        onVediLeMie={(soloAnomalie) => router.push(soloAnomalie ? '/office/mio/ore?stato=bozza' : '/office/mio/ore')}
      />
      <section className="rounded-xl border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Ultimi avvisi
          </h2>
          <button type="button" onClick={() => router.push('/office/notifiche')} className="ml-auto text-xs font-medium text-primary hover:underline">
            Tutti gli avvisi
          </button>
        </div>
        {avvisi.length === 0 ? (
          <p className="px-3.5 py-3 text-xs text-muted-foreground">Nessun avviso recente.</p>
        ) : (
          <ul className="divide-y divide-border">
            {avvisi.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => router.push(a.url ?? '/office/notifiche')}
                  className={cn('flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-muted/40', !a.letto && 'font-medium')}
                >
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', a.letto ? 'bg-transparent' : 'bg-primary')} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{a.titolo}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtQuando.format(new Date(a.quando))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialogo}
    </div>
  );
}
