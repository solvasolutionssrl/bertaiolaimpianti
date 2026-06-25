'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { CATEGORIA_META, CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';

export function FiltriSpese({
  tenants,
  tenant,
  categoria,
  da,
  a,
}: {
  tenants: { id: string; nome: string }[];
  tenant: string;
  categoria: string;
  da: string;
  a: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const aggiorna = (patch: Record<string, string>) => {
    const next = { tenant, categoria, da, a, ...patch };
    const params = new URLSearchParams();
    if (next.tenant && next.tenant !== 'all') params.set('tenant', next.tenant);
    if (next.categoria && next.categoria !== 'all') params.set('categoria', next.categoria);
    if (next.da) params.set('da', next.da);
    if (next.a) params.set('a', next.a);
    const qs = params.toString();
    start(() =>
      router.push(qs ? `/admin/kantiere/kontabilita?${qs}` : '/admin/kantiere/kontabilita'),
    );
  };

  const sel =
    'h-9 rounded-md border border-border bg-card px-2.5 text-sm focus:border-primary focus:outline-none';

  return (
    <div className={'flex flex-wrap items-center gap-2 ' + (pending ? 'opacity-60' : '')}>
      <select
        className={sel}
        value={tenant || 'all'}
        onChange={(e) => aggiorna({ tenant: e.target.value })}
        aria-label="Tenant"
      >
        <option value="all">Tutti i tenant</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
      </select>
      <select
        className={sel}
        value={categoria || 'all'}
        onChange={(e) => aggiorna({ categoria: e.target.value })}
        aria-label="Categoria"
      >
        <option value="all">Tutte le categorie</option>
        {CATEGORIE_ORDINATE.map((c) => (
          <option key={c} value={c}>
            {CATEGORIA_META[c].label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Dal
        <input
          type="date"
          className={sel}
          value={da}
          max={a || undefined}
          onChange={(e) => aggiorna({ da: e.target.value })}
          aria-label="Data scontrino da"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Al
        <input
          type="date"
          className={sel}
          value={a}
          min={da || undefined}
          onChange={(e) => aggiorna({ a: e.target.value })}
          aria-label="Data scontrino a"
        />
      </label>
      {tenant !== 'all' || categoria !== 'all' || da || a ? (
        <button
          type="button"
          onClick={() => aggiorna({ tenant: 'all', categoria: 'all', da: '', a: '' })}
          className="h-9 rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted/50"
        >
          Azzera filtri
        </button>
      ) : null}
    </div>
  );
}
