'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type {
  RegolaView,
  DipendenteView,
  CantiereView,
  AggregataCostoRiga,
} from '../page';
import { RegoleTab } from './regole-tab';
import { TariffeTab } from './tariffe-tab';
import { CostiTab } from './costi-tab';

type Tab = 'regole' | 'tariffe' | 'costi';

interface Props {
  regole: RegolaView[];
  dipendenti: DipendenteView[];
  cantieri: CantiereView[];
  aggregati: AggregataCostoRiga[];
  filtri: { from: string; to: string; per: 'dipendente' | 'commessa' };
  tabIniziale: Tab;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'regole', label: 'Regole' },
  { id: 'tariffe', label: 'Tariffe' },
  { id: 'costi', label: 'Costi' },
];

export function OreCostiClient({ regole, dipendenti, cantieri, aggregati, filtri, tabIniziale }: Props) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>(tabIniziale);

  function selezionaTab(t: Tab) {
    setTab(t);
    // tiene l'URL allineato (deep-link + refresh) senza ricaricare i dati pesanti
    const p = new URLSearchParams();
    p.set('tab', t);
    if (t === 'costi') {
      p.set('from', filtri.from);
      p.set('to', filtri.to);
      p.set('per', filtri.per);
    }
    router.replace('/office/kantiere/ore-costi?' + p.toString(), { scroll: false });
  }

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => selezionaTab(t.id)}
            className={
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ' +
              (tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'regole' && <RegoleTab regole={regole} dipendenti={dipendenti} cantieri={cantieri} />}
      {tab === 'tariffe' && <TariffeTab dipendenti={dipendenti} />}
      {tab === 'costi' && <CostiTab aggregati={aggregati} filtri={filtri} />}
    </div>
  );
}
