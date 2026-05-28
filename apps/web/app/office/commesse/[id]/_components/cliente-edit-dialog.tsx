'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';

import { ClienteForm } from '../../../clienti/_components/form';

/**
 * Apre un dialog con la scheda cliente completa, riusando il form
 * standard di /office/clienti. Restano fuori dal dialog tutti gli
 * accidenti di navigazione del form (Annulla → callback, save →
 * router.refresh() già fatto dal form, poi chiude il dialog).
 */
interface Props {
  cliente: {
    id: string;
    ragione_sociale?: string | null;
    tipo?: 'persona_fisica' | 'azienda' | null;
    indirizzo?: string | null;
    citta?: string | null;
    cap?: string | null;
    provincia?: string | null;
    partita_iva?: string | null;
    codice_fiscale?: string | null;
    telefoni?: string[] | null;
    email?: string[] | null;
    note?: string | null;
  };
}

export function ClienteEditDialog({ cliente }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Modifica
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifica cliente</DialogTitle>
            <DialogDescription>
              Le modifiche si applicano al cliente e a tutte le commesse
              collegate.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            <ClienteForm
              initial={{
                id: cliente.id,
                ragione_sociale: cliente.ragione_sociale ?? '',
                tipo: cliente.tipo ?? 'persona_fisica',
                indirizzo: cliente.indirizzo ?? '',
                citta: cliente.citta ?? '',
                cap: cliente.cap ?? '',
                provincia: cliente.provincia ?? '',
                partita_iva: cliente.partita_iva ?? '',
                codice_fiscale: cliente.codice_fiscale ?? '',
                telefoni: cliente.telefoni ?? [],
                email: cliente.email ?? [],
                note: cliente.note ?? '',
              }}
              onCancel={() => setOpen(false)}
              onSuccess={(action) => {
                if (action !== 'deleted') setOpen(false);
                // Su 'deleted' il form fa router.refresh; il dialog rimane aperto
                // per mostrare eventuale messaggio di errore (es. commesse collegate
                // bloccano la cancellazione). In caso di successo router.refresh()
                // smonterà comunque la pagina.
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
