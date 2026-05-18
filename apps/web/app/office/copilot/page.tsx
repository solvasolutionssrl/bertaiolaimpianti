import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';

import { Card, CardContent } from '@impiantixplus/ui';

import { requireTenantContextCached as requireTenantContext } from '../../_lib/tenant-cache';
import { SectionHeader } from '../../_components/section-header';

import { CopilotChat } from './_components/chat';

export const metadata: Metadata = { title: 'Co-pilot' };
export const dynamic = 'force-dynamic';

/**
 * /office/copilot — AI Co-pilot operativo (skeleton beta).
 *
 * Layout: 2 colonne. A sinistra la chat streaming → POST /api/copilot/chat.
 * A destra suggerimenti / azioni rapide (chip).
 *
 * Quando ANTHROPIC_API_KEY è assente o uguale a "placeholder" la chat
 * gira in "modalità preview" e ritorna risposte fake (no chiamata API).
 */
export default async function CopilotPage() {
  await requireTenantContext();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const isPreview =
    !apiKey || apiKey === 'placeholder' || apiKey.startsWith('sk-ant-...');

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SectionHeader
        eyebrow="AI · Beta"
        title="Co-pilot operativo"
        description="Suggerisce cosa fare, segnala anomalie, risponde su dati. Modalità preview senza foto cloud."
        icon={<Sparkles />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <CopilotChat previewMode={isPreview} />

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Cosa può fare
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">
                    Analisi commesse:
                  </span>{' '}
                  rileva ritardi, fasi ferme, foto sotto target.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Riepiloghi audit:
                  </span>{' '}
                  digest delle attività del team.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Suggerimenti operativi:
                  </span>{' '}
                  voci mancanti, priorità del giorno.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Q&amp;A sui dati:
                  </span>{' '}
                  rispondi su ore, foto, scadenze in linguaggio naturale.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Limiti attuali (beta)
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                Il co-pilot vede solo i metadati operativi (commesse,
                tickets, audit). Non legge foto, allegati o documenti
                cliente finché lo storage cloud non è attivo. Niente
                azioni distruttive: solo lettura.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
