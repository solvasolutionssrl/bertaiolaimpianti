'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';

import { Button } from '@kommessa/ui';

import {
  DatiCommessaFields,
  ReferentiFields,
  TipologieSection,
  FrozenFolderNotice,
  type SetValue,
} from '../../../../../_components/commessa-editor/fields';
import type {
  CommessaEditorValue,
  ResponsabileOption,
} from '../../../../../_components/commessa-editor/types';
import type {
  TipologiaVoce,
  TipologiaPreset,
} from '../../../../../_components/aggiungi-tipologie-dialog';
import { aggiornaCommessaCompleta } from '../../../../../_actions/aggiorna-commessa-completa';
import { useOnline } from '../../../../../_lib/use-online';

export function CommessaEditClient({
  commessaId,
  nomeCartella,
  initial,
  responsabili,
  vociPresenti,
  voci,
  presets,
}: {
  commessaId: string;
  nomeCartella: string;
  initial: CommessaEditorValue;
  responsabili: ResponsabileOption[];
  vociPresenti: number[];
  voci: TipologiaVoce[];
  presets: TipologiaPreset[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [value, setValue] = React.useState<CommessaEditorValue>(initial);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const onChange: SetValue = (patch) => setValue((v) => ({ ...v, ...patch }));

  const salva = () => {
    setError(null);
    start(async () => {
      const res = await aggiornaCommessaCompleta({
        commessaId,
        descrizioneFinale: value.descrizioneFinale.trim(),
        indirizzoCantiere: value.indirizzoCantiere.trim() || null,
        noteIniziali: value.noteIniziali,
        isCritica: value.isCritica,
        stato: value.stato,
        responsabileId: value.responsabileId,
        referenti: value.referenti
          .filter((r) => r.nome.trim().length > 0)
          .map((r) => ({
            nome: r.nome.trim(),
            ruolo: r.ruolo.trim() || null,
            telefono: r.telefono.trim() || null,
            email: r.email.trim() || null,
          })),
      });
      if (res.ok) {
        router.push(`/office/commesse/${commessaId}`);
        router.refresh();
        return;
      }
      setError(res.error);
    });
  };

  return (
    <div className="space-y-6">
      <FrozenFolderNotice nomeCartella={nomeCartella} />

      <section className="rounded-lg border border-border bg-card p-4">
        <DatiCommessaFields
          value={value}
          onChange={onChange}
          responsabili={responsabili}
          online={online}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <ReferentiFields value={value} onChange={onChange} />
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <TipologieSection
          commessaId={commessaId}
          vociPresenti={vociPresenti}
          voci={voci}
          presets={presets}
          variant="dialog"
        />
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/office/commesse/${commessaId}`)}
          disabled={pending}
        >
          Annulla
        </Button>
        <Button type="button" onClick={salva} disabled={pending || !online}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Salva modifiche
        </Button>
      </div>
    </div>
  );
}
