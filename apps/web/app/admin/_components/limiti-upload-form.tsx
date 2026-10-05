'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, cn } from '@kommessa/ui';

import {
  CHIAVI_LIMITI,
  ETICHETTE_LIMITI,
  MINIMI_UPLOAD,
  TETTI_UPLOAD,
  validaLimitiUpload,
  type ChiaveLimite,
  type LimitiUpload,
  type LimitiUploadParziali,
} from '@kommessa/api/limiti-upload';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

/**
 * Come sta un campo adesso: eredita, ha un valore suo, o è sbagliato.
 */
type StatoCampo =
  | { tipo: 'eredita'; valore: number }
  | { tipo: 'impostato'; valore: number }
  | { tipo: 'errore'; messaggio: string };

/**
 * Il form dei limiti di invio media. Uno solo, usato a due livelli:
 *
 * - in `/admin/media` scrive il **default globale** (vale per tutti i tenant);
 * - nel tab Upload di un tenant scrive il suo **override**.
 *
 * Un campo lasciato **vuoto** significa "eredita il livello sopra", e il
 * segnaposto mostra il valore che sta ereditando: così si vede sempre cosa è
 * davvero in vigore senza aprire due pagine.
 */
export function LimitiUploadForm({
  valori,
  ereditati,
  etichettaEreditati,
  avvisoConferma,
  onSalva,
}: {
  /** Quello che è impostato a questo livello. Chiave assente = eredita. */
  valori: LimitiUploadParziali;
  /** Quello che si applica se questo livello tace. */
  ereditati: LimitiUpload;
  /** Come si chiama il livello sopra, per i segnaposto. */
  etichettaEreditati: string;
  /** Testo della conferma prima di salvare. */
  avvisoConferma: string;
  onSalva: (
    campi: Record<string, string>,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const chiediConferma = useConfirm();
  const [pending, start] = React.useTransition();
  const [salvato, setSalvato] = React.useState(false);

  const iniziale = React.useMemo(() => {
    const o: Record<ChiaveLimite, string> = {} as Record<ChiaveLimite, string>;
    for (const k of CHIAVI_LIMITI) o[k] = valori[k] !== undefined ? String(valori[k]) : '';
    return o;
  }, [valori]);

  const [campi, setCampi] = React.useState(iniziale);
  React.useEffect(() => setCampi(iniziale), [iniziale]);

  const dirty = CHIAVI_LIMITI.some((k) => campi[k] !== iniziale[k]);

  // Lo stato di ogni campo lo decide la STESSA funzione che poi salva. Prima
  // l'anteprima usava il resolver della lettura, che taglia in silenzio:
  // digitando 9999 il pannello scriveva "in vigore 500" e poi il salvataggio
  // rifiutava. Due risposte diverse alla stessa domanda.
  const stati = React.useMemo(() => {
    const out = {} as Record<ChiaveLimite, StatoCampo>;
    for (const k of CHIAVI_LIMITI) {
      const esito = validaLimitiUpload({ [k]: campi[k] });
      if (!esito.ok) {
        out[k] = { tipo: 'errore', messaggio: esito.errori[0] ?? 'Valore non valido.' };
        continue;
      }
      const v = esito.valori[k];
      out[k] =
        v === null || v === undefined
          ? { tipo: 'eredita', valore: ereditati[k] }
          : { tipo: 'impostato', valore: v };
    }
    return out;
  }, [campi, ereditati]);

  const haErrori = CHIAVI_LIMITI.some((k) => stati[k].tipo === 'errore');

  const salva = () => {
    start(async () => {
      const righe = CHIAVI_LIMITI.filter((k) => campi[k] !== iniziale[k]).map((k) => {
        const { nome, unita } = ETICHETTE_LIMITI[k];
        const suffisso = unita ? ` ${unita}` : '';
        return campi[k].trim() === ''
          ? `${nome}: torna a ereditare (${ereditati[k]}${suffisso})`
          : `${nome}: ${campi[k]}${suffisso}`;
      });
      const ok = await chiediConferma({
        title: 'Salvare i limiti di invio?',
        description: `${righe.join('\n')}\n\n${avvisoConferma}`,
      });
      if (!ok) return;

      // Solo i campi toccati. Rimandandoli tutti, un valore fuori range
      // scritto a mano nel database bloccava QUALUNQUE modifica agli altri
      // campi, e si allargava inutilmente la finestra di sovrascrittura fra
      // due super admin che salvano insieme.
      const cambiati: Record<string, string> = {};
      for (const k of CHIAVI_LIMITI) if (campi[k] !== iniziale[k]) cambiati[k] = campi[k];
      const res = await onSalva(cambiati);
      if (!res.ok) {
        await showAlert({ title: 'Non salvato', body: res.error });
        return;
      }
      setSalvato(true);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Limiti di invio media</h3>
          <p className="text-xs text-muted-foreground">
            Valgono sulla scelta dei file nel mondo commesse: Nuova commessa, wizard
            sopralluogo, dettatura, tab Scatto e tab Media. Il limite dei video vale anche
            sugli allegati riunione. Un campo vuoto eredita da{' '}
            <span className="font-medium">{etichettaEreditati.toLowerCase()}</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            Non governano gli scontrini di Kontabilità, i documenti del personale, il logo
            e i caricamenti dal Comando iOS: quelli hanno limiti propri, scritti nel
            codice.
          </p>
        </div>

        <div className="space-y-2">
          {CHIAVI_LIMITI.map((k) => {
            const { nome, unita } = ETICHETTE_LIMITI[k];
            const stato = stati[k];
            const suffisso = unita ? ` ${unita}` : '';
            return (
              <div
                key={k}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <label htmlFor={`lim-${k}`} className="block text-xs font-medium">
                    {nome}
                  </label>
                  {stato.tipo === 'errore' ? (
                    <p className="text-[11px] text-destructive">{stato.messaggio}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Da {MINIMI_UPLOAD[k]} a {TETTI_UPLOAD[k]}
                      {suffisso} · in vigore{' '}
                      <span className="font-medium text-foreground">
                        {stato.valore}
                        {suffisso}
                      </span>
                      {stato.tipo === 'eredita'
                        ? ` (${etichettaEreditati.toLowerCase()})`
                        : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    id={`lim-${k}`}
                    type="number"
                    inputMode="numeric"
                    min={MINIMI_UPLOAD[k]}
                    max={TETTI_UPLOAD[k]}
                    step={1}
                    value={campi[k]}
                    placeholder={String(ereditati[k])}
                    onChange={(e) => {
                      setSalvato(false);
                      setCampi((c) => ({ ...c, [k]: e.target.value }));
                    }}
                    aria-invalid={stato.tipo === 'errore'}
                    className={cn(
                      'h-9 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums',
                      stato.tipo === 'errore' ? 'border-destructive' : 'border-input',
                    )}
                  />
                  {unita ? (
                    <span className="w-6 text-xs text-muted-foreground">{unita}</span>
                  ) : (
                    <span className="w-6" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={salva} disabled={!dirty || pending || haErrori}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Salva
          </Button>
          {dirty ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSalvato(false);
                setCampi(iniziale);
              }}
              disabled={pending}
            >
              Annulla
            </Button>
          ) : null}
          {salvato && !dirty ? (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Salvato
            </span>
          ) : null}
        </div>

        <p className="text-[11px] text-muted-foreground">
          I valori fuori dall&apos;intervallo vengono rifiutati: l&apos;intervallo è il
          massimo che la pipeline di caricamento è verificata reggere, non una scelta
          commerciale. Il controllo avviene nell&apos;app quando si scelgono i file:{' '}
          <span className="font-medium">non è un blocco lato server</span>. Le modifiche
          valgono dal caricamento successivo, non sugli invii già in corso.
        </p>
      </CardContent>
    </Card>
  );
}
