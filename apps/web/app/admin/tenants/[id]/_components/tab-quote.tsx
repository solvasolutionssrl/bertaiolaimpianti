'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
} from '@impiantixplus/ui';
import { aggiornaQuote, cambiaPiano } from '../../../_actions/quote';

interface Plan {
  id: string;
  code: string;
  nome: string;
  max_utenti: number;
  max_commesse_anno: number;
  max_storage_gb: number;
  max_tickets_mese: number;
}

interface Quota {
  max_utenti: number | null;
  max_commesse_anno: number | null;
  max_storage_gb: number | null;
  max_tickets_mese: number | null;
  note: string | null;
}

export function TabQuote({
  tenantId,
  quota,
  plan,
  plans,
}: {
  tenantId: string;
  quota: Quota | null;
  plan: Plan | null;
  plans: Plan[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [planId, setPlanId] = React.useState<string>(plan?.id ?? '');
  const [u, setU] = React.useState(quota?.max_utenti ?? '');
  const [c, setC] = React.useState(quota?.max_commesse_anno ?? '');
  const [s, setS] = React.useState(quota?.max_storage_gb ?? '');
  const [k, setK] = React.useState(quota?.max_tickets_mese ?? '');
  const [note, setNote] = React.useState(quota?.note ?? '');

  function parseN(v: string | number): number | null {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 py-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Piano
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Cambiare il piano modifica i limiti di default. Override più specifici sotto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              <option value="">— nessuno —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={pending || planId === (plan?.id ?? '')}
              onClick={() =>
                start(async () => {
                  if (!planId) return;
                  const res = await cambiaPiano(tenantId, planId);
                  if (!res.ok) alert(res.error);
                  router.refresh();
                })
              }
            >
              <Save className="h-3.5 w-3.5" />
              Cambia piano
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Override quote (per-tenant)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Lascia vuoto per usare il default del piano{plan ? ` (${plan.nome})` : ''}.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <QuotaField
              label="Max utenti"
              value={u}
              defaultHint={plan ? `default: ${plan.max_utenti}` : 'no plan'}
              onChange={setU}
            />
            <QuotaField
              label="Max commesse / anno"
              value={c}
              defaultHint={plan ? `default: ${plan.max_commesse_anno}` : 'no plan'}
              onChange={setC}
            />
            <QuotaField
              label="Max storage (GB)"
              value={s}
              defaultHint={plan ? `default: ${plan.max_storage_gb}` : 'no plan'}
              onChange={setS}
            />
            <QuotaField
              label="Max tickets / mese"
              value={k}
              defaultHint={plan ? `default: ${plan.max_tickets_mese}` : 'no plan'}
              onChange={setK}
            />
          </div>
          <div>
            <Label htmlFor="note">Motivo override</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5 h-10"
              placeholder='Es. "Promo Q4 2026"'
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await aggiornaQuote({
                    tenantId,
                    max_utenti: parseN(u),
                    max_commesse_anno: parseN(c),
                    max_storage_gb: parseN(s),
                    max_tickets_mese: parseN(k),
                    note: note || null,
                  });
                  if (!res.ok) alert(res.error);
                  router.refresh();
                })
              }
            >
              <Save className="h-3.5 w-3.5" />
              Salva override
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuotaField({
  label,
  value,
  onChange,
  defaultHint,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  defaultHint: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        value={value as any}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 font-mono"
        placeholder="vuoto = default"
      />
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {defaultHint}
      </p>
    </div>
  );
}
