'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@impiantixplus/ui';

interface Props {
  tenants: Array<{ id: string; slug: string; nome: string }>;
}

export function UtentiToolbar({ tenants }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get('q') ?? '');
  const tenantFilter = params.get('tenant') ?? '';
  const roleFilter = params.get('role') ?? '';

  React.useEffect(() => {
    const t = setTimeout(() => updateParam('q', q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function updateParam(key: string, val: string) {
    const sp = new URLSearchParams(params.toString());
    if (val) sp.set(key, val);
    else sp.delete(key);
    router.replace(`/admin/utenti${sp.toString() ? '?' + sp.toString() : ''}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per nome o email…"
          className="h-10 pl-9"
        />
      </div>
      <select
        value={tenantFilter}
        onChange={(e) => updateParam('tenant', e.target.value)}
        className="h-10 rounded-md border border-border bg-card px-3 text-sm"
      >
        <option value="">Tutti i tenant</option>
        <option value="__platform__">SOLVA Platform</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.slug}>
            {t.nome}
          </option>
        ))}
      </select>
      <select
        value={roleFilter}
        onChange={(e) => updateParam('role', e.target.value)}
        className="h-10 rounded-md border border-border bg-card px-3 text-sm"
      >
        <option value="">Tutti i ruoli</option>
        {['owner', 'admin', 'office', 'capo', 'tecnico', 'cliente'].map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}
