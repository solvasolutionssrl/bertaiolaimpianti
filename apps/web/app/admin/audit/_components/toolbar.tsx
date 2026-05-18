'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { Button, Input, Label } from '@impiantixplus/ui';
import { esportaAuditCSV } from '../../_actions/audit';

interface Props {
  tenants: Array<{ id: string; slug: string; nome: string }>;
  initial: {
    tenant?: string;
    entityType?: string;
    action?: string;
    from?: string;
    to?: string;
  };
}

export function AuditToolbar({ tenants, initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = React.useTransition();

  function update(key: string, val: string) {
    const sp = new URLSearchParams(params.toString());
    if (val) sp.set(key, val);
    else sp.delete(key);
    router.replace(`/admin/audit${sp.toString() ? '?' + sp.toString() : ''}`);
  }

  function downloadCSV() {
    start(async () => {
      const res = await esportaAuditCSV({
        tenantId: initial.tenant ?? null,
        entityType: initial.entityType ?? null,
        action: initial.action ?? null,
        from: initial.from ?? null,
        to: initial.to ?? null,
        limit: 5000,
      });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <div>
        <Label>Tenant</Label>
        <select
          defaultValue={initial.tenant ?? ''}
          onChange={(e) => update('tenant', e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="">Tutti</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} ({t.slug})
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Entity type</Label>
        <Input
          defaultValue={initial.entityType ?? ''}
          onBlur={(e) => update('entityType', e.target.value)}
          placeholder="commessa, tenant, …"
          className="mt-1 h-10 font-mono text-xs"
        />
      </div>
      <div>
        <Label>Action</Label>
        <Input
          defaultValue={initial.action ?? ''}
          onBlur={(e) => update('action', e.target.value)}
          placeholder="create, update, …"
          className="mt-1 h-10 font-mono text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Da</Label>
          <Input
            type="date"
            defaultValue={initial.from ?? ''}
            onChange={(e) => update('from', e.target.value)}
            className="mt-1 h-10"
          />
        </div>
        <div>
          <Label>A</Label>
          <Input
            type="date"
            defaultValue={initial.to ?? ''}
            onChange={(e) => update('to', e.target.value)}
            className="mt-1 h-10"
          />
        </div>
      </div>
      <div className="flex items-end">
        <Button variant="outline" disabled={pending} onClick={downloadCSV}>
          <Download className="h-3.5 w-3.5" />
          Esporta CSV
        </Button>
      </div>
    </div>
  );
}
