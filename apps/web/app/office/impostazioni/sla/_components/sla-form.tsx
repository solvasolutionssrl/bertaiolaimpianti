'use client';

import { useState, useTransition } from 'react';
import { Button, Card, CardContent, Input, Label } from '@impiantixplus/ui';
import { Save } from 'lucide-react';
import { aggiornaSlaPolicy } from '../_actions/sla';

export type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';

export interface SlaPolicyRow {
  priorita: Priorita;
  response_minutes: number;
  close_minutes: number;
}

const PRIORITA_LABELS: Record<Priorita, string> = {
  bassa: 'Bassa',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
};

const PRIORITA_DESCR: Record<Priorita, string> = {
  bassa: 'Richieste informative o non bloccanti.',
  media: 'Default per nuovi ticket.',
  alta: 'Disservizio significativo, intervento entro la giornata.',
  urgente: 'Blocco totale, fuori orario, intervento immediato.',
};

const ORDER: Priorita[] = ['urgente', 'alta', 'media', 'bassa'];

/**
 * Form CRUD per le 4 policy SLA per-priorità del tenant corrente.
 * Mostra anche il valore corrispondente in ore/giorni per leggibilità.
 */
export function SlaForm({
  policies,
  canEdit,
}: {
  policies: SlaPolicyRow[];
  canEdit: boolean;
}) {
  // Indicizziamo per priorità, fallback ai default proposti se mancano righe.
  const byPriorita = new Map(policies.map((p) => [p.priorita, p]));

  return (
    <div className="space-y-4">
      {ORDER.map((p) => (
        <SlaPolicyCard
          key={p}
          priorita={p}
          initial={byPriorita.get(p)}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

function SlaPolicyCard({
  priorita,
  initial,
  canEdit,
}: {
  priorita: Priorita;
  initial: SlaPolicyRow | undefined;
  canEdit: boolean;
}) {
  const [response, setResponse] = useState<string>(
    String(initial?.response_minutes ?? ''),
  );
  const [close, setClose] = useState<string>(
    String(initial?.close_minutes ?? ''),
  );
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(false);
    start(async () => {
      try {
        await aggiornaSlaPolicy({
          priorita,
          response_minutes: Number(response),
          close_minutes: Number(close),
        });
        setOk(true);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : 'Errore salvataggio.');
      }
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="font-semibold">{PRIORITA_LABELS[priorita]}</h3>
              <p className="text-xs text-muted-foreground">
                {PRIORITA_DESCR[priorita]}
              </p>
            </div>
            {!initial ? (
              <span className="text-xs text-muted-foreground">
                Nessuna policy: verrà creata al salvataggio.
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              id={`resp-${priorita}`}
              label="Risposta entro (minuti)"
              value={response}
              onChange={setResponse}
              disabled={!canEdit || pending}
              hint={formatDurata(response)}
            />
            <Field
              id={`close-${priorita}`}
              label="Chiusura entro (minuti)"
              value={close}
              onChange={setClose}
              disabled={!canEdit || pending}
              hint={formatDurata(close)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs">
              {err ? <span className="text-destructive">{err}</span> : null}
              {ok ? (
                <span className="text-muted-foreground">Salvato.</span>
              ) : null}
            </div>
            <Button type="submit" size="sm" disabled={!canEdit || pending}>
              <Save className="h-4 w-4" />
              {pending ? 'Salvataggio…' : 'Salva'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
      />
      {hint ? <p className="text-xs text-muted-foreground">≈ {hint}</p> : null}
    </div>
  );
}

function formatDurata(minutiStr: string): string {
  const n = Number(minutiStr);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 60) return `${n} min`;
  if (n < 60 * 24) {
    const h = n / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
  }
  const g = n / (60 * 24);
  return `${Number.isInteger(g) ? g : g.toFixed(1)} giorni`;
}
