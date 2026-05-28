'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Mail,
  Plus,
  Star,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Label,
  cn,
} from '@kommessa/ui';

import {
  aggiornaContatto,
  creaContatto,
  eliminaContatto,
} from '../../_actions/contatti';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

export interface ContattoRow {
  id: string;
  nome: string;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
  note: string | null;
  is_primary: boolean;
  ordine: number;
}

/**
 * Editor inline dei contatti referente.
 *
 * Scope (Ondata 4.1):
 *  - commessaId === undefined → contatti del CLIENTE (riusabili su tutte
 *    le sue commesse). Mostriamo la stella "Primario" e relativi toggle.
 *  - commessaId valorizzato     → contatti specifici di QUELLA commessa
 *    (es. geometra del cantiere). Niente "primary" — sono semplici elenchi.
 *
 * UX:
 *  - Lista compatta dei contatti esistenti (nome + ruolo + telefono tappabile).
 *  - "+ Aggiungi contatto" apre un mini form inline.
 *  - Click "Modifica" su una riga la espande in edit mode.
 *  - Trash con conferma destructive.
 */
export function ContattiEditor({
  clienteId,
  commessaId,
  initial,
  canEdit,
}: {
  clienteId: string;
  /** Se passato, i nuovi contatti vengono salvati con scope commessa. */
  commessaId?: string;
  initial: ContattoRow[];
  canEdit: boolean;
}) {
  const sorted = React.useMemo(
    () =>
      [...initial].sort(
        (a, b) =>
          (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) ||
          a.ordine - b.ordine ||
          a.nome.localeCompare(b.nome),
      ),
    [initial],
  );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {sorted.length === 0 && !adding ? (
          <li className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
            Nessun contatto. {canEdit ? 'Aggiungine uno qui sotto.' : ''}
          </li>
        ) : null}
        {sorted.map((c) =>
          editingId === c.id ? (
            <ContattoForm
              key={c.id}
              clienteId={clienteId}
              commessaId={commessaId}
              initial={c}
              onClose={() => setEditingId(null)}
            />
          ) : (
            <ContattoRowView
              key={c.id}
              row={c}
              canEdit={canEdit}
              showPrimary={!commessaId}
              onEdit={() => setEditingId(c.id)}
            />
          ),
        )}
        {adding ? (
          <ContattoForm
            clienteId={clienteId}
            commessaId={commessaId}
            initial={null}
            onClose={() => setAdding(false)}
          />
        ) : null}
      </ul>
      {canEdit && !adding && !editingId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Aggiungi contatto
        </Button>
      ) : null}
    </div>
  );
}

function ContattoRowView({
  row,
  canEdit,
  showPrimary,
  onEdit,
}: {
  row: ContattoRow;
  canEdit: boolean;
  /** Se false (scope commessa), nasconde il badge Primario. */
  showPrimary: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  // Quick-add telefono inline: mini form che appare al click di "+ tel"
  // quando il contatto è senza telefono. UX da contatto-mobile-like:
  // veloce, niente dialog, focus immediato, Enter per salvare.
  const [quickTel, setQuickTel] = React.useState<string | null>(null);

  const saveQuickTel = (value: string) => {
    const tel = value.trim();
    if (tel.length === 0) {
      setQuickTel(null);
      return;
    }
    start(async () => {
      const res = await aggiornaContatto({
        id: row.id,
        nome: row.nome,
        ruolo: row.ruolo,
        telefono: tel,
        email: row.email,
        note: row.note,
        isPrimary: row.is_primary,
        ordine: row.ordine,
      });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      setQuickTel(null);
      router.refresh();
    });
  };

  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md border bg-card px-3 py-2',
        row.is_primary && showPrimary
          ? 'border-primary/30 bg-primary/[0.03]'
          : 'border-border',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{row.nome}</span>
          {row.ruolo ? (
            <span className="text-xs text-muted-foreground">· {row.ruolo}</span>
          ) : null}
          {row.is_primary && showPrimary ? (
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary"
            >
              <Star className="mr-0.5 h-2.5 w-2.5" />
              Primario
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {row.telefono ? (
            <a
              href={`tel:${row.telefono}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Phone className="h-3 w-3" aria-hidden="true" />
              {row.telefono}
            </a>
          ) : canEdit && quickTel === null ? (
            <button
              type="button"
              onClick={() => setQuickTel('')}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 active:scale-[0.97]"
              aria-label="Aggiungi telefono"
            >
              <Phone className="h-2.5 w-2.5" aria-hidden="true" />+ tel
            </button>
          ) : null}
          {row.email ? (
            <a
              href={`mailto:${row.email}`}
              className="inline-flex items-center gap-1 break-all text-foreground/80 hover:text-primary"
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              {row.email}
            </a>
          ) : null}
        </div>
        {/* Quick-add tel: appare in linea sotto i dati, niente dialog.
            Enter → salva, Esc → annulla. */}
        {quickTel !== null ? (
          <div className="mt-1 flex items-center gap-1">
            <Phone
              className="h-3 w-3 shrink-0 text-primary"
              aria-hidden="true"
            />
            <input
              type="tel"
              inputMode="tel"
              value={quickTel}
              autoFocus
              placeholder="es. 333 1234567"
              onChange={(e) => setQuickTel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveQuickTel(quickTel);
                } else if (e.key === 'Escape') {
                  setQuickTel(null);
                }
              }}
              maxLength={40}
              className="h-7 flex-1 rounded-md border border-primary/40 bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
            <button
              type="button"
              onClick={() => saveQuickTel(quickTel)}
              disabled={pending || quickTel.trim().length < 3}
              aria-label="Salva telefono"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setQuickTel(null)}
              disabled={pending}
              aria-label="Annulla"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {row.note ? (
          <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-muted-foreground">
            {row.note}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onEdit}
            aria-label={`Modifica ${row.nome}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            aria-label={`Elimina ${row.nome}`}
            onClick={async () => {
              const ok = await askConfirm({
                title: `Eliminare il contatto "${row.nome}"?`,
                description: 'Operazione irreversibile.',
                destructive: true,
                confirmLabel: 'Elimina',
              });
              if (!ok) return;
              start(async () => {
                const res = await eliminaContatto({ id: row.id });
                if (!res.ok) {
                  await showAlert({ title: 'Errore', body: res.error });
                  return;
                }
                router.refresh();
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function ContattoForm({
  clienteId,
  commessaId,
  initial,
  onClose,
}: {
  clienteId: string;
  /** Scope. Se valorizzato, il toggle "Primario" è nascosto. */
  commessaId?: string;
  initial: ContattoRow | null;
  onClose: () => void;
}) {
  const isClienteScope = !commessaId;
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [nome, setNome] = React.useState(initial?.nome ?? '');
  const [ruolo, setRuolo] = React.useState(initial?.ruolo ?? '');
  const [telefono, setTelefono] = React.useState(initial?.telefono ?? '');
  const [email, setEmail] = React.useState(initial?.email ?? '');
  const [note, setNote] = React.useState(initial?.note ?? '');
  const [isPrimary, setIsPrimary] = React.useState(initial?.is_primary ?? false);

  const submit = () => {
    if (nome.trim().length < 1) return;
    start(async () => {
      const payload = {
        nome: nome.trim(),
        ruolo: ruolo.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        note: note.trim() || null,
        isPrimary,
        ordine: initial?.ordine ?? 0,
      };
      const res = initial
        ? await aggiornaContatto({ id: initial.id, ...payload })
        : await creaContatto({
            clienteId,
            commessaId: commessaId ?? null,
            ...payload,
          });
      if (!res.ok) {
        await showAlert({
          title: 'Salvataggio contatto fallito',
          body: res.error,
        });
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <li className="rounded-md border border-primary/40 bg-primary/[0.03] p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="contatto-nome" className="text-xs">
            Nome *
          </Label>
          <Input
            id="contatto-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Es. Mario Rossi"
            maxLength={160}
            autoFocus
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="contatto-ruolo" className="text-xs">
            Ruolo
          </Label>
          <Input
            id="contatto-ruolo"
            value={ruolo}
            onChange={(e) => setRuolo(e.target.value)}
            placeholder="Es. Geometra, Moglie, Tecnico…"
            maxLength={80}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="contatto-tel" className="text-xs">
            Telefono
          </Label>
          <Input
            id="contatto-tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Es. 333 1234567"
            inputMode="tel"
            maxLength={40}
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="contatto-email" className="text-xs">
            Email
          </Label>
          <Input
            id="contatto-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="mario@esempio.it"
            maxLength={200}
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="contatto-note" className="text-xs">
            Note
          </Label>
          <textarea
            id="contatto-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. preferisce essere contattato dopo le 18"
            rows={2}
            maxLength={1000}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        {isClienteScope ? (
          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded accent-primary"
            />
            <span className="text-xs">
              <span className="font-medium">Contatto principale</span> — viene
              mostrato per primo nella commessa e nel mobile (uno solo per cliente)
            </span>
          </label>
        ) : (
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Contatto legato a <strong className="font-medium">questa
            commessa</strong> — verrà mostrato qui ma non nelle altre commesse
            dello stesso cliente.
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onClose}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Annulla
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || nome.trim().length < 1}
          onClick={submit}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          {pending ? 'Salvo…' : initial ? 'Salva modifiche' : 'Aggiungi contatto'}
        </Button>
      </div>
    </li>
  );
}
