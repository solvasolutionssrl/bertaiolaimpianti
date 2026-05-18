'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cambiaStatoVoce } from '../../../../_actions/commesse';

const OPZIONI = [
  { value: 'da_iniziare', label: 'Da iniziare' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'completata', label: 'Completata' },
  { value: 'bloccata', label: 'Bloccata' },
] as const;

export function CambiaStatoForm({
  commessaId,
  voceId,
  stato,
}: {
  commessaId: string;
  voceId: number;
  stato: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <select
      defaultValue={stato}
      disabled={pending}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          await cambiaStatoVoce({ commessaId, voceId, stato: next as any });
          router.refresh();
        });
      }}
    >
      {OPZIONI.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
