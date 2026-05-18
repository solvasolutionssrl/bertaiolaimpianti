'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@impiantixplus/ui';
import { Search } from 'lucide-react';

export function TenantsSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get('q') ?? '');

  React.useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (q) sp.set('q', q);
      else sp.delete('q');
      router.replace(`/admin/tenants${sp.toString() ? '?' + sp.toString() : ''}`);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="relative w-full max-w-sm">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cerca per nome o slug…"
        className="h-10 pl-9"
        aria-label="Cerca tenant"
      />
    </div>
  );
}
