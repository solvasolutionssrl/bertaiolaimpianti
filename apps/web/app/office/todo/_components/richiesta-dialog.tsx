'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Phone, Save } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@kommessa/ui';

import { creaTodo, aggiornaTodo } from '../../../_actions/commessa-todo';
import { ClientePicker, type ValoreCliente } from '@/app/_components/cliente-picker';
import { useAlert } from '@/app/_components/confirm-provider';

/**
 * La telefonata, in un modulo.
 *
 * L'ufficio ha la cornetta in mano: i campi stanno nell'ordine in cui le cose
 * vengono dette — cosa serve, chi è, come si richiama, i dettagli — e l'unico
 * obbligatorio è il primo. Se del cliente si sa solo il nome, basta il nome; i
 * dati veri (indirizzo, partita IVA, referenti) li chiede il form della
 * commessa quando il lavoro si concretizza, non adesso.
 *
 * Lo stesso modulo serve a modificare una richiesta già registrata: è lì che si
 * assegna a qualcuno, se al telefono non si sapeva ancora a chi darla.
 */

type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';

const URGENZA: Array<{ value: Priorita; label: string; chip: string }> = [
  { value: 'bassa', label: 'Quando capita', chip: 'bg-muted text-muted-foreground' },
  { value: 'media', label: 'Normale', chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'alta', label: 'Presto', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { value: 'urgente', label: 'Urgente', chip: 'bg-red-500/15 text-red-700 dark:text-red-400' },
];

const ETICHETTA_RUOLO: Record<string, string> = {
  owner: 'Titolari',
  admin: 'Amministratori',
  office: 'Ufficio',
  capo: 'Capi',
  tecnico: 'Tecnici',
};

export interface RichiestaEsistente {
  id: string;
  titolo: string;
  descrizione: string | null;
  contatto: string | null;
  priorita: Priorita;
  assegnatoA: string | null;
  scadenzaAt: string | null;
  clienteId: string | null;
  clienteNome: string | null;
}

export function RichiestaDialog({
  assegnabili,
  esistente,
  onClose,
}: {
  assegnabili: Array<{ id: string; display_name: string | null; role: string }>;
  /** Se presente si modifica, altrimenti si registra una telefonata nuova. */
  esistente?: RichiestaEsistente;
  onClose: () => void;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [salvando, setSalvando] = React.useState(false);

  const [titolo, setTitolo] = React.useState(esistente?.titolo ?? '');
  const [cliente, setCliente] = React.useState<ValoreCliente>({
    id: esistente?.clienteId ?? null,
    nome: esistente?.clienteNome ?? '',
  });
  const [contatto, setContatto] = React.useState(esistente?.contatto ?? '');
  const [dettagli, setDettagli] = React.useState(esistente?.descrizione ?? '');
  const [urgenza, setUrgenza] = React.useState<Priorita>(esistente?.priorita ?? 'media');
  const [assegnatoA, setAssegnatoA] = React.useState(esistente?.assegnatoA ?? '');
  const [scadenza, setScadenza] = React.useState(
    esistente?.scadenzaAt ? esistente.scadenzaAt.slice(0, 10) : '',
  );

  // L'elenco raggruppato per ruolo: con dieci nomi di fila non si capisce
  // chi è l'ufficio e chi va in cantiere.
  const gruppi = React.useMemo(() => {
    const ordine = ['owner', 'admin', 'office', 'capo', 'tecnico'];
    const per = new Map<string, typeof assegnabili>();
    for (const u of assegnabili) {
      const k = u.role;
      if (!per.has(k)) per.set(k, []);
      per.get(k)!.push(u);
    }
    return ordine.filter((r) => per.has(r)).map((r) => ({ ruolo: r, utenti: per.get(r)! }));
  }, [assegnabili]);

  const salva = async () => {
    if (titolo.trim().length === 0) {
      await showAlert({
        title: 'Manca cosa serve',
        body: 'Scrivi in una riga la richiesta: è l’unica cosa indispensabile.',
      });
      return;
    }
    setSalvando(true);
    const comuni = {
      titolo: titolo.trim(),
      descrizione: dettagli.trim() || undefined,
      priorita: urgenza,
      assegnatoA: assegnatoA || null,
      // La data nuda vale «entro quel giorno»: si fissa a fine giornata.
      scadenzaAt: scadenza ? new Date(`${scadenza}T18:00:00`).toISOString() : null,
    };
    const res = esistente
      ? await aggiornaTodo({ id: esistente.id, ...comuni })
      : await creaTodo({
          ...comuni,
          clienteId: cliente.id,
          clienteTesto: cliente.id ? null : cliente.nome.trim() || null,
          contatto: contatto.trim() || null,
          metadata: { fonte: 'telefono' },
        });
    setSalvando(false);
    if (!res.ok) {
      await showAlert({ title: 'Non salvata', body: res.error });
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-x-hidden sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {esistente ? 'Modifica richiesta' : 'Richiesta al telefono'}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-4">
          <div>
            <Label htmlFor="r_titolo">Cosa serve *</Label>
            <Input
              id="r_titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es. Cambio caldaia"
              className="mt-1.5 h-10"
              autoFocus
            />
          </div>

          {esistente ? (
            esistente.clienteNome ? (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Cliente: <span className="font-medium text-foreground">{esistente.clienteNome}</span>
              </div>
            ) : null
          ) : (
            <>
              <ClientePicker
                valore={cliente}
                onChange={(v) => setCliente(v)}
                id="r_cliente"
                label="Chi ha chiamato"
                placeholder="Nome o ragione sociale…"
                notaSenzaMatch="Non è in anagrafica: per ora resta il nome scritto qui. La scheda cliente si crea quando diventa una commessa."
              />

              <div>
                <Label htmlFor="r_contatto">Come richiamare</Label>
                <Input
                  id="r_contatto"
                  value={contatto}
                  onChange={(e) => setContatto(e.target.value)}
                  placeholder="Numero di telefono o email"
                  className="mt-1.5 h-10"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="r_dettagli">Dettagli</Label>
            <textarea
              id="r_dettagli"
              value={dettagli}
              onChange={(e) => setDettagli(e.target.value)}
              rows={3}
              placeholder="Marca e modello, cosa succede, quando sono in casa…"
              className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <Label>Urgenza</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {URGENZA.map((u) => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => setUrgenza(u.value)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-all',
                    urgenza === u.value
                      ? 'border-primary ring-2 ring-primary/30 ' + u.chip
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="r_assegna">Chi se ne occupa</Label>
              <select
                id="r_assegna"
                value={assegnatoA}
                onChange={(e) => setAssegnatoA(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Nessuno, per ora</option>
                {gruppi.map((g) => (
                  <optgroup key={g.ruolo} label={ETICHETTA_RUOLO[g.ruolo] ?? g.ruolo}>
                    {g.utenti.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name ?? u.id.slice(0, 8)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Riceve una notifica sul telefono.
              </p>
            </div>
            <div className="min-w-0">
              <Label htmlFor="r_scadenza">Entro il</Label>
              <input
                id="r_scadenza"
                type="date"
                value={scadenza}
                onChange={(e) => setScadenza(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button size="sm" variant="outline" onClick={onClose} disabled={salvando}>
            Annulla
          </Button>
          <Button size="sm" onClick={salva} disabled={salvando}>
            {salvando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {esistente ? 'Salva' : 'Registra richiesta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
