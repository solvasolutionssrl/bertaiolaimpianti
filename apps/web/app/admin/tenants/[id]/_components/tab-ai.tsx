'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Loader2,
  Mic,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, cn } from '@kommessa/ui';

import { aggiornaModelloTrascrizione } from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

type TranscribeChoice = 'whisper-1' | 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe' | null;

interface ModelOption {
  id: TranscribeChoice;
  label: string;
  byline: string;
  description: string;
  costo: string;
  qualita: 'Base' | 'Buona' | 'Top';
  recommended?: boolean;
  tone: 'muted' | 'primary' | 'success';
}

const OPTIONS: ModelOption[] = [
  {
    id: null,
    label: 'Default piattaforma',
    byline: 'Usa OPENAI_MODEL_TRANSCRIBE (env)',
    description:
      'Eredita il modello impostato come default globale Vercel. Niente override per il tenant. Comodo per nuovi clienti finché non si conosce il caso d\'uso.',
    costo: '—',
    qualita: 'Base',
    tone: 'muted',
  },
  {
    id: 'whisper-1',
    label: 'Whisper-1',
    byline: 'OpenAI · legacy',
    description:
      'Modello speech-to-text storico OpenAI. Buono su audio pulito, soffre su rumore di cantiere e accenti forti. Stabile e prevedibile.',
    costo: '$0,006 / minuto',
    qualita: 'Base',
    tone: 'muted',
  },
  {
    id: 'gpt-4o-mini-transcribe',
    label: 'GPT-4o mini Transcribe',
    byline: 'OpenAI · next-gen',
    description:
      '~22% meno errori di Whisper-1 sui benchmark, particolarmente su audio rumoroso e accenti regionali. E costa la metà. Consigliato per i cantieri.',
    costo: '$0,003 / minuto',
    qualita: 'Buona',
    recommended: true,
    tone: 'primary',
  },
  {
    id: 'gpt-4o-transcribe',
    label: 'GPT-4o Transcribe',
    byline: 'OpenAI · top tier',
    description:
      'Modello speech-to-text più accurato sul mercato. Ideale per audio molto difficile (rumore industriale, dialetti marcati, audio remoto). Costa come whisper-1 ma molto più preciso.',
    costo: '$0,006 / minuto',
    qualita: 'Top',
    tone: 'success',
  },
];

export function TabAi({
  tenantId,
  tenantNome,
  currentModel,
}: {
  tenantId: string;
  tenantNome: string;
  currentModel: TranscribeChoice;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [selected, setSelected] = React.useState<TranscribeChoice>(currentModel);
  const dirty = selected !== currentModel;

  const apply = () => {
    start(async () => {
      const res = await aggiornaModelloTrascrizione({
        tenantId,
        model: selected,
      });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Mic className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Modello di trascrizione audio
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Decide quale modello OpenAI trascrive i dettati vocali per gli
              utenti di <strong className="text-foreground">{tenantNome}</strong>.
              La scelta è per-tenant: ogni cliente può avere un modello diverso
              in base al suo budget e al rumore dei suoi cantieri.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            const isCurrent = currentModel === opt.id;
            const toneRing =
              opt.tone === 'primary'
                ? 'ring-primary/40 bg-primary/[0.04]'
                : opt.tone === 'success'
                  ? 'ring-emerald-500/40 bg-emerald-500/[0.04]'
                  : 'ring-border bg-muted/20';
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setSelected(opt.id)}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-all',
                  isSelected
                    ? 'border-primary ring-2 ' + toneRing
                    : 'border-border hover:border-primary/40 hover:bg-muted/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold">{opt.label}</h3>
                      {opt.recommended ? (
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-primary"
                        >
                          <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                          Consigliato
                        </Badge>
                      ) : null}
                      {isCurrent ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                          Attivo
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {opt.byline}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {opt.qualita}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-foreground/85">
                  {opt.description}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-muted-foreground">
                    {opt.costo}
                  </span>
                  {opt.id === 'gpt-4o-mini-transcribe' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                      -50% vs whisper-1
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[11px] leading-snug text-muted-foreground">
            La modifica è immediata: i dettati successivi useranno il nuovo
            modello. Lo storico audit registra cambio + utente platform admin.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(currentModel)}
                disabled={pending}
              >
                Annulla
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={pending || !dirty}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {pending ? 'Salvo…' : 'Applica modello'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
