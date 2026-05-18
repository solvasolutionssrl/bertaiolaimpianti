'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
} from '@impiantixplus/ui';
import {
  aggiornaPiano,
  creaPiano,
  eliminaPiano,
} from '../../_actions/plans';

interface Plan {
  id: string;
  code: string;
  nome: string;
  descrizione: string | null;
  prezzo_mensile_eur: number;
  max_utenti: number;
  max_commesse_anno: number;
  max_storage_gb: number;
  max_tickets_mese: number;
  attivo: boolean;
  ordine: number;
}

type EditState = Partial<Plan> & { _new?: boolean };

export function PianiTable({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [edit, setEdit] = React.useState<EditState | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          {plans.length} piani
        </p>
        <Button
          size="sm"
          onClick={() =>
            setEdit({
              _new: true,
              code: '',
              nome: '',
              prezzo_mensile_eur: 0,
              max_utenti: 5,
              max_commesse_anno: 100,
              max_storage_gb: 50,
              max_tickets_mese: 200,
              attivo: true,
              ordine: (plans.at(-1)?.ordine ?? 0) + 10,
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Nuovo piano
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">€/mese</th>
              <th className="px-4 py-2 font-medium">Utenti</th>
              <th className="px-4 py-2 font-medium">Commesse/anno</th>
              <th className="px-4 py-2 font-medium">GB</th>
              <th className="px-4 py-2 font-medium">Tickets/mese</th>
              <th className="px-4 py-2 font-medium">Stato</th>
              <th className="px-4 py-2 text-right font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {plans.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-2 font-medium">{p.nome}</td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums">
                  {p.prezzo_mensile_eur.toFixed(2)}
                </td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums">
                  {p.max_utenti}
                </td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums">
                  {p.max_commesse_anno}
                </td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums">
                  {p.max_storage_gb}
                </td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums">
                  {p.max_tickets_mese}
                </td>
                <td className="px-4 py-2">
                  {p.attivo ? (
                    <Badge variant="outline" className="border-success/30 text-success">
                      Attivo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Archiviato</Badge>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEdit({ ...p })}
                    >
                      Modifica
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Archivia"
                      onClick={() => {
                        if (!confirm(`Archiviare il piano "${p.nome}"?`)) return;
                        start(async () => {
                          const res = await eliminaPiano(p.id);
                          if (!res.ok) alert(res.error);
                          router.refresh();
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {plans.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  Nessun piano configurato.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?._new ? 'Nuovo piano' : 'Modifica piano'}</DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Code</Label>
                <Input
                  value={edit.code ?? ''}
                  onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  className="mt-1 h-10 font-mono"
                  disabled={!edit._new}
                />
              </div>
              <div>
                <Label>Nome</Label>
                <Input
                  value={edit.nome ?? ''}
                  onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                  className="mt-1 h-10"
                />
              </div>
              <div>
                <Label>€ / mese</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={edit.prezzo_mensile_eur ?? 0}
                  onChange={(e) =>
                    setEdit({ ...edit, prezzo_mensile_eur: Number(e.target.value) })
                  }
                  className="mt-1 h-10 font-mono"
                />
              </div>
              <div>
                <Label>Ordine</Label>
                <Input
                  type="number"
                  value={edit.ordine ?? 0}
                  onChange={(e) =>
                    setEdit({ ...edit, ordine: Number(e.target.value) })
                  }
                  className="mt-1 h-10 font-mono"
                />
              </div>
              <div>
                <Label>Max utenti</Label>
                <Input
                  type="number"
                  value={edit.max_utenti ?? 0}
                  onChange={(e) =>
                    setEdit({ ...edit, max_utenti: Number(e.target.value) })
                  }
                  className="mt-1 h-10 font-mono"
                />
              </div>
              <div>
                <Label>Max commesse/anno</Label>
                <Input
                  type="number"
                  value={edit.max_commesse_anno ?? 0}
                  onChange={(e) =>
                    setEdit({ ...edit, max_commesse_anno: Number(e.target.value) })
                  }
                  className="mt-1 h-10 font-mono"
                />
              </div>
              <div>
                <Label>Max storage (GB)</Label>
                <Input
                  type="number"
                  value={edit.max_storage_gb ?? 0}
                  onChange={(e) =>
                    setEdit({ ...edit, max_storage_gb: Number(e.target.value) })
                  }
                  className="mt-1 h-10 font-mono"
                />
              </div>
              <div>
                <Label>Max tickets/mese</Label>
                <Input
                  type="number"
                  value={edit.max_tickets_mese ?? 0}
                  onChange={(e) =>
                    setEdit({ ...edit, max_tickets_mese: Number(e.target.value) })
                  }
                  className="mt-1 h-10 font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Descrizione</Label>
                <Input
                  value={edit.descrizione ?? ''}
                  onChange={(e) => setEdit({ ...edit, descrizione: e.target.value })}
                  className="mt-1 h-10"
                />
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="attivo"
                  type="checkbox"
                  checked={edit.attivo ?? true}
                  onChange={(e) => setEdit({ ...edit, attivo: e.target.checked })}
                />
                <Label htmlFor="attivo">Attivo</Label>
              </div>
            </div>
          ) : null}
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Annulla
            </Button>
            <Button
              disabled={pending || !edit}
              onClick={() => {
                if (!edit) return;
                setErr(null);
                start(async () => {
                  const payload = {
                    code: edit.code ?? '',
                    nome: edit.nome ?? '',
                    descrizione: edit.descrizione ?? null,
                    prezzo_mensile_eur: Number(edit.prezzo_mensile_eur ?? 0),
                    max_utenti: Number(edit.max_utenti ?? 0),
                    max_commesse_anno: Number(edit.max_commesse_anno ?? 0),
                    max_storage_gb: Number(edit.max_storage_gb ?? 0),
                    max_tickets_mese: Number(edit.max_tickets_mese ?? 0),
                    attivo: edit.attivo ?? true,
                    ordine: Number(edit.ordine ?? 0),
                  };
                  const res = edit._new
                    ? await creaPiano(payload)
                    : await aggiornaPiano(edit.id!, payload);
                  if (!res.ok) {
                    setErr(res.error);
                    return;
                  }
                  setEdit(null);
                  router.refresh();
                });
              }}
            >
              <Save className="h-3.5 w-3.5" />
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
