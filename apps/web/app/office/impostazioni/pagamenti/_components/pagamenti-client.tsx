'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@kommessa/ui';
import { CreditCard, Loader2, Pencil, Plus, RotateCcw, Check, X } from 'lucide-react';
import { useConfirm, useAlert } from '@/app/_components/confirm-provider';
import type { MetodoPagamento } from '@/app/_lib/metodi-pagamento';
import {
  aggiungiMetodoPagamento,
  assicuraMetodiPredefiniti,
  cambiaStatoMetodoPagamento,
  rinominaMetodoPagamento,
} from '@/app/office/_actions/metodi-pagamento';

/**
 * Metodi di pagamento: rinomina, aggiunta, ritiro.
 *
 * Due cose che l'utente deve capire senza leggere un manuale:
 *  - rinominare cambia solo quello che si legge, non ricollega niente;
 *  - ritirare non cancella, e le spese vecchie restano leggibili.
 * Per questo la conferma di rinomina dice cosa succede alle spese già salvate.
 */
export function PagamentiClient({
  metodi,
  puoModificare,
}: {
  metodi: MetodoPagamento[];
  puoModificare: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [pending, setPending] = React.useState<string | null>(null);
  const [inModifica, setInModifica] = React.useState<string | null>(null);
  const [bozzaNome, setBozzaNome] = React.useState('');
  const [nuovo, setNuovo] = React.useState('');
  const [apriNuovo, setApriNuovo] = React.useState(false);

  // I clienti creati dopo la migrazione non hanno ancora le righe: la prima
  // volta che si apre la pagina le materializziamo, invece di mostrare tre
  // voci finte che non si possono toccare.
  const daMaterializzare = metodi.length > 0 && metodi.every((m) => m.id === null);
  React.useEffect(() => {
    if (!daMaterializzare || !puoModificare) return;
    void assicuraMetodiPredefiniti().then(() => router.refresh());
  }, [daMaterializzare, puoModificare, router]);

  async function esegui(chiave: string, azione: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(chiave);
    try {
      const res = await azione();
      if (!res.ok) await alert({ title: 'Non ha funzionato', body: res.error });
      else router.refresh();
      return res.ok;
    } finally {
      setPending(null);
    }
  }

  async function salvaRinomina(m: MetodoPagamento) {
    const nome = bozzaNome.trim();
    if (!nome || nome === m.nome) {
      setInModifica(null);
      return;
    }
    const ok = await confirm({
      title: `Rinominare «${m.nome}» in «${nome}»?`,
      description:
        'Cambia solo il nome che si legge a schermo. Le spese già registrate con questo metodo restano collegate e mostreranno il nome nuovo.',
      confirmLabel: 'Rinomina',
    });
    if (!ok) return;
    if (await esegui(m.id!, () => rinominaMetodoPagamento({ id: m.id, nome }))) {
      setInModifica(null);
    }
  }

  async function salvaNuovo() {
    const nome = nuovo.trim();
    if (!nome) return;
    const ok = await confirm({
      title: `Aggiungere «${nome}»?`,
      description:
        'Comparirà tra le scelte nell’app e nel modulo dell’ufficio, e l’assistente potrà proporlo leggendo gli scontrini.',
      confirmLabel: 'Aggiungi',
    });
    if (!ok) return;
    if (await esegui('nuovo', () => aggiungiMetodoPagamento({ nome }))) {
      setNuovo('');
      setApriNuovo(false);
    }
  }

  async function cambiaStato(m: MetodoPagamento) {
    const ok = await confirm({
      title: m.attivo ? `Ritirare «${m.nome}»?` : `Rimettere in uso «${m.nome}»?`,
      description: m.attivo
        ? 'Sparisce dalle scelte per le spese nuove. Quelle già registrate restano com’erano e continuano a mostrarlo.'
        : 'Torna tra le scelte disponibili per le spese nuove.',
      confirmLabel: m.attivo ? 'Ritira' : 'Rimetti in uso',
      destructive: m.attivo,
    });
    if (!ok) return;
    await esegui(m.id!, () => cambiaStatoMetodoPagamento({ id: m.id, attivo: !m.attivo }));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CreditCard className="h-5 w-5 text-primary" />
          Metodi di pagamento
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Come si paga una spesa di cantiere. Sono le voci che il tecnico trova nell’app quando
          registra uno scontrino, e tra cui sceglie l’assistente quando lo legge.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="w-[55%] px-4 py-2.5 font-medium text-muted-foreground">Nome</th>
              <th className="w-[20%] px-4 py-2.5 font-medium text-muted-foreground">Stato</th>
              <th className="w-[25%] px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {metodi.map((m, i) => {
              const occupato = pending === m.id;
              const modificando = inModifica === m.id;
              return (
                <tr
                  key={m.codice}
                  className={
                    'border-b border-border/60 last:border-0 ' +
                    (i % 2 ? 'bg-muted/20 ' : '') +
                    (m.attivo ? '' : 'opacity-60')
                  }
                >
                  <td className="min-w-0 px-4 py-2.5">
                    {modificando ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={bozzaNome}
                          onChange={(e) => setBozzaNome(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void salvaRinomina(m);
                            if (e.key === 'Escape') setInModifica(null);
                          }}
                          maxLength={40}
                          autoFocus
                          className="h-8"
                        />
                        <button
                          type="button"
                          onClick={() => void salvaRinomina(m)}
                          className="shrink-0 rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                          aria-label="Salva il nome"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setInModifica(null)}
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                          aria-label="Lascia stare"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="truncate font-medium">{m.nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (m.attivo
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500')
                      }
                    >
                      {m.attivo ? 'In uso' : 'Ritirato'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {puoModificare && !modificando && (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          disabled={occupato || !m.id}
                          onClick={() => {
                            setBozzaNome(m.nome);
                            setInModifica(m.id);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                          title="Cambia il nome"
                          aria-label={`Cambia il nome di ${m.nome}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={occupato || !m.id}
                          onClick={() => void cambiaStato(m)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                          title={m.attivo ? 'Ritira' : 'Rimetti in uso'}
                          aria-label={m.attivo ? `Ritira ${m.nome}` : `Rimetti in uso ${m.nome}`}
                        >
                          {occupato ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : m.attivo ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puoModificare && (
        <div>
          {apriNuovo ? (
            <div className="flex items-center gap-2">
              <Input
                value={nuovo}
                onChange={(e) => setNuovo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void salvaNuovo();
                  if (e.key === 'Escape') setApriNuovo(false);
                }}
                placeholder="Come si chiama? es. Bonifico"
                maxLength={40}
                autoFocus
                className="h-9 max-w-xs"
              />
              <Button type="button" onClick={() => void salvaNuovo()} disabled={pending === 'nuovo'}>
                {pending === 'nuovo' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aggiungi'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setApriNuovo(false)}>
                Lascia stare
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setApriNuovo(true)}>
              <Plus className="h-4 w-4" /> Aggiungi un metodo
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Ritirare un metodo non cancella niente: sparisce dalle scelte nuove, ma le spese che lo
        usavano restano com’erano.
      </p>
    </div>
  );
}
