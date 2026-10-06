'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Card, CardContent, cn } from '@kommessa/ui';

import { useAlert } from '@/app/_components/confirm-provider';
import { cambiaFunzioneTenant } from '../_actions';

export interface FunzioneVista {
  chiave: string;
  etichetta: string;
  descrizione: string;
  accesa: boolean;
  /** Se c'è una scelta esplicita, o se vale il valore di partenza. */
  scelta: boolean;
  /** Se la governa SOLVA e non l'ufficio. */
  nostra: boolean;
}

export function FunzioniClient({
  funzioni,
  canEdit,
}: {
  funzioni: FunzioneVista[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const avvisa = useAlert();
  const [inCorso, avvia] = React.useTransition();

  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {funzioni.map((f) => {
          const modificabile = canEdit && !f.nostra;
          return (
            <div key={f.chiave} className="flex items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {f.etichetta}
                  {f.nostra ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                      title="La accende SOLVA"
                    >
                      <Lock aria-hidden="true" className="h-2.5 w-2.5" />
                      SOLVA
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {f.descrizione}
                </p>
                {!f.scelta ? (
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    Valore di partenza: {f.accesa ? 'accesa' : 'spenta'}.
                  </p>
                ) : null}
              </div>

              <label
                className={cn(
                  'flex shrink-0 items-center gap-2 pt-0.5 text-xs',
                  !modificabile && 'opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={f.accesa}
                  disabled={!modificabile || inCorso}
                  aria-label={`${f.etichetta}: ${f.accesa ? 'accesa' : 'spenta'}`}
                  onChange={(e) => {
                    const accesa = e.target.checked;
                    avvia(async () => {
                      const r = await cambiaFunzioneTenant({ chiave: f.chiave, accesa });
                      if (!r.ok) {
                        await avvisa({ title: 'Non modificata', body: r.error });
                        return;
                      }
                      router.refresh();
                    });
                  }}
                />
                <span className="w-12 tabular-nums">{f.accesa ? 'Accesa' : 'Spenta'}</span>
              </label>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
