'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

type Opt = { value: string; label: string };

export function FiltriTimbrature({
  tenants,
  tenant,
  origine,
  giorni,
}: {
  tenants: { id: string; nome: string }[];
  tenant: string;
  origine: string;
  giorni: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const aggiorna = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    const next = { tenant, origine, giorni, ...patch };
    if (next.tenant && next.tenant !== 'all') params.set('tenant', next.tenant);
    if (next.origine && next.origine !== 'all') params.set('origine', next.origine);
    if (next.giorni && next.giorni !== '7') params.set('giorni', next.giorni);
    const qs = params.toString();
    start(() => router.push(qs ? `/admin/kantiere/timbrature?${qs}` : '/admin/kantiere/timbrature'));
  };

  const ORIGINI: Opt[] = [
    { value: 'all', label: 'Tutte le origini' },
    { value: 'qr', label: 'QR (self)' },
    { value: 'capo', label: 'Caposquadra' },
    { value: 'manuale', label: 'Manuale (ufficio)' },
    { value: 'cronometro', label: 'Cronometro' },
  ];
  const GIORNI: Opt[] = [
    { value: '1', label: 'Oggi' },
    { value: '7', label: 'Ultimi 7 giorni' },
    { value: '30', label: 'Ultimi 30 giorni' },
  ];

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
        value={origine || 'all'}
        onChange={(e) => aggiorna({ origine: e.target.value })}
        aria-label="Origine"
      >
        {ORIGINI.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className={sel}
        value={giorni || '7'}
        onChange={(e) => aggiorna({ giorni: e.target.value })}
        aria-label="Periodo"
      >
        {GIORNI.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </div>
  );
}
