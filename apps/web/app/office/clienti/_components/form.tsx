'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, Input, Label } from '@impiantixplus/ui';
import { creaCliente, aggiornaCliente, eliminaCliente } from '../../_actions/clienti';

interface Initial {
  id?: string;
  ragione_sociale?: string;
  tipo?: 'persona_fisica' | 'azienda';
  indirizzo?: string | null;
  citta?: string | null;
  cap?: string | null;
  provincia?: string | null;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  telefoni?: string[];
  email?: string[];
  note?: string | null;
}

export function ClienteForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const isEdit = Boolean(initial?.id);

  return (
    <form
      action={(fd) => {
        setErr(null);
        const payload = {
          ragioneSociale: String(fd.get('ragione_sociale') ?? '').trim(),
          tipo: String(fd.get('tipo') ?? 'persona_fisica') as any,
          indirizzo: String(fd.get('indirizzo') ?? '') || null,
          citta: String(fd.get('citta') ?? '') || null,
          cap: String(fd.get('cap') ?? '') || null,
          provincia: String(fd.get('provincia') ?? '') || null,
          partitaIva: String(fd.get('partita_iva') ?? '') || null,
          codiceFiscale: String(fd.get('codice_fiscale') ?? '') || null,
          telefoni: String(fd.get('telefoni') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          email: String(fd.get('email') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          note: String(fd.get('note') ?? '') || null,
        };
        if (!payload.ragioneSociale) {
          setErr('Ragione sociale obbligatoria.');
          return;
        }
        start(async () => {
          try {
            if (isEdit && initial?.id) {
              await aggiornaCliente({ id: initial.id, ...payload });
              router.refresh();
            } else {
              const res = await creaCliente(payload);
              router.push(`/office/clienti/${res.id}`);
            }
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Errore.');
          }
        });
      }}
    >
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="ragione_sociale">Ragione sociale *</Label>
            <Input
              id="ragione_sociale"
              name="ragione_sociale"
              defaultValue={initial?.ragione_sociale}
              required
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tipo">Tipo</Label>
            <select
              id="tipo"
              name="tipo"
              defaultValue={initial?.tipo ?? 'persona_fisica'}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="persona_fisica">Persona fisica</option>
              <option value="azienda">Azienda</option>
            </select>
          </div>
          <div>
            <Label htmlFor="partita_iva">P. IVA / CF</Label>
            <Input
              id="partita_iva"
              name="partita_iva"
              defaultValue={initial?.partita_iva ?? ''}
              className="mt-1.5"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="indirizzo">Indirizzo</Label>
            <Input
              id="indirizzo"
              name="indirizzo"
              defaultValue={initial?.indirizzo ?? ''}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="citta">Città</Label>
            <Input
              id="citta"
              name="citta"
              defaultValue={initial?.citta ?? ''}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="cap">CAP</Label>
              <Input
                id="cap"
                name="cap"
                defaultValue={initial?.cap ?? ''}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="provincia">Prov.</Label>
              <Input
                id="provincia"
                name="provincia"
                maxLength={2}
                defaultValue={initial?.provincia ?? ''}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="telefoni">Telefoni (separati da virgola)</Label>
            <Input
              id="telefoni"
              name="telefoni"
              defaultValue={(initial?.telefoni ?? []).join(', ')}
              className="mt-1.5"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="email">Email (separati da virgola)</Label>
            <Input
              id="email"
              name="email"
              defaultValue={(initial?.email ?? []).join(', ')}
              className="mt-1.5"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="note">Note</Label>
            <textarea
              id="note"
              name="note"
              rows={3}
              defaultValue={initial?.note ?? ''}
              className="mt-1.5 w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

      <div className="mt-4 flex items-center justify-between">
        {isEdit && initial?.id ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm('Eliminare definitivamente questo cliente?')) return;
              start(async () => {
                await eliminaCliente({ id: initial.id! });
                router.push('/office/clienti');
              });
            }}
          >
            Elimina cliente
          </Button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="ghost">
            <a href="/office/clienti">Annulla</a>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Salvataggio…' : isEdit ? 'Salva modifiche' : 'Crea cliente'}
          </Button>
        </div>
      </div>
    </form>
  );
}
