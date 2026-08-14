'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Eye,
  ExternalLink,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  RadioTower,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, cn } from '@kommessa/ui';

import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import {
  aggiornaCollaudoEsterni,
  aggiornaImpostazioniIntegrazione,
  attivaIntegrazioneTenant,
  impostaModalitaIntegrazione,
  svuotaStagingIntegrazione,
} from '../../../_actions/integrazioni';
import { revocaApiToken } from '../../../_actions/api-tokens';
import { SemaforoCollegamento } from '../../../_components/semaforo-collegamento';
import type { StatoCollegamento } from '@kommessa/api/integrazione-salute';

/**
 * Tab **Integrazione** del singolo cliente.
 *
 * E' il volante di `/api/v1` per quel cliente: modulo acceso o spento,
 * gestionale, la leva simulazione/attiva, il recinto di collaudo, i token vivi.
 * Prima queste cose si cambiavano solo con una query a mano sul database di
 * produzione — il che significa che nessuno tranne chi l'aveva scritta sapeva
 * dove fossero.
 *
 * La pagina e' costruita in ordine di pericolosita' crescente: prima si guarda,
 * poi si configura, poi si apre il rubinetto. La leva pericolosa sta in fondo e
 * ha una serratura.
 */

export interface TokenIntegrazione {
  id: string;
  label: string;
  creato: string;
  ultimoUso: string | null;
}

export interface DatiTabIntegrazione {
  tenantId: string;
  tenantNome: string;
  slug: string;
  attivo: boolean;
  sistema: string | null;
  modalita: 'simulazione' | 'attiva';
  collaudoEsterni: string[];
  maxDescrizione: number | null;
  sogliaSilenzioOre: number;
  stato: StatoCollegamento;
  motivi: string[];
  silenzioOre: number | null;
  scrittureOk: number;
  scrittureErrore: number;
  ritardoAckMin: number | null;
  giriAperti: number;
  nostreTotali: number;
  collegate: number;
  staging: { commesse: number; clienti: number; dipendenti: number };
  ultimaLettura: string | null;
  token: TokenIntegrazione[];
}

const fmt = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat('it-IT', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Rome',
      }).format(new Date(iso))
    : 'mai';

function Sezione({
  icona,
  titolo,
  sottotitolo,
  children,
  tono = 'neutro',
}: {
  icona: React.ReactNode;
  titolo: string;
  sottotitolo: string;
  children: React.ReactNode;
  tono?: 'neutro' | 'critico';
}) {
  return (
    <section
      className={cn(
        'space-y-4 rounded-xl border p-4',
        tono === 'critico'
          ? 'border-amber-500/40 bg-amber-500/[0.04]'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            tono === 'critico'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
              : 'bg-primary-soft text-primary',
          )}
        >
          {icona}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{titolo}</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {sottotitolo}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function TabIntegrazione({ dati }: { dati: DatiTabIntegrazione }) {
  const router = useRouter();
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();

  const [sistema, setSistema] = React.useState(dati.sistema ?? '');
  const [maxDesc, setMaxDesc] = React.useState(String(dati.maxDescrizione ?? ''));
  const [soglia, setSoglia] = React.useState(String(dati.sogliaSilenzioOre));
  const [esterni, setEsterni] = React.useState<string[]>(dati.collaudoEsterni);
  const [nuovoEsterno, setNuovoEsterno] = React.useState('');
  const [conferma, setConferma] = React.useState('');
  const [svuotaAperto, setSvuotaAperto] = React.useState(false);
  const [confermaSvuota, setConfermaSvuota] = React.useState('');

  const impostazioniDirty =
    sistema.trim() !== (dati.sistema ?? '') ||
    maxDesc.trim() !== String(dati.maxDescrizione ?? '') ||
    soglia.trim() !== String(dati.sogliaSilenzioOre);

  const esterniDirty =
    JSON.stringify([...esterni].sort()) !== JSON.stringify([...dati.collaudoEsterni].sort());

  const esegui = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        await showAlert({ title: 'Non fatto', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  const toggleModulo = async (next: boolean) => {
    if (!next) {
      const ok = await confirm({
        title: 'Spegnere l’integrazione?',
        description:
          'Da subito ogni chiamata di questo cliente all’API riceve un rifiuto, token in circolazione compresi. ' +
          'I token restano validi e gli abbinamenti confermati non si toccano: è un rubinetto, si può riaprire.',
        confirmLabel: 'Spegni',
        destructive: true,
      });
      if (!ok) return;
    }
    esegui(() => attivaIntegrazioneTenant({ tenantId: dati.tenantId, attivo: next }));
  };

  const apriScritture = () => {
    esegui(() =>
      impostaModalitaIntegrazione({
        tenantId: dati.tenantId,
        modalita: 'attiva',
        conferma,
      }).then((r) => {
        if (r.ok) setConferma('');
        return r;
      }),
    );
  };

  const svuota = () => {
    start(async () => {
      const res = await svuotaStagingIntegrazione({
        tenantId: dati.tenantId,
        conferma: confermaSvuota,
      });
      if (!res.ok) {
        await showAlert({ title: 'Non fatto', body: res.error });
        return;
      }
      setConfermaSvuota('');
      setSvuotaAperto(false);
      await showAlert({
        title: 'Deposito svuotato',
        body: `Ho tolto ${res.eliminati} righe. Alla prossima lettura tornano.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------
          1. Come sta — si guarda prima di toccare
      --------------------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <SemaforoCollegamento stato={dati.stato} />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Stato del collegamento</h2>
                <ul className="mt-1 space-y-0.5">
                  {dati.motivi.map((m) => (
                    <li key={m} className="text-xs text-muted-foreground">
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Link
              href="/admin/integrazioni"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Tutti i collegamenti
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                k: 'Scritture 24h',
                v:
                  dati.scrittureErrore > 0
                    ? `${dati.scrittureOk} ok · ${dati.scrittureErrore} err`
                    : String(dati.scrittureOk),
                tono: dati.scrittureErrore > 0 ? 'rosso' : 'neutro',
              },
              {
                k: 'Ritardo medio',
                v: dati.ritardoAckMin === null ? '—' : `${Math.round(dati.ritardoAckMin)} min`,
                tono: 'neutro',
              },
              {
                k: 'Anagrafiche collegate',
                v: `${dati.collegate} / ${dati.nostreTotali}`,
                tono: dati.collegate < dati.nostreTotali ? 'ambra' : 'neutro',
              },
              {
                k: 'Ultima lettura',
                v: fmt(dati.ultimaLettura),
                tono: 'neutro',
              },
            ].map((c) => (
              <div
                key={c.k}
                className={cn(
                  'rounded-lg border px-3 py-2',
                  c.tono === 'rosso'
                    ? 'border-red-500/30 bg-red-500/[0.05]'
                    : c.tono === 'ambra'
                      ? 'border-amber-500/30 bg-amber-500/[0.05]'
                      : 'border-border',
                )}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {c.k}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">{c.v}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------
          2. L'interruttore
      --------------------------------------------------------------- */}
      <Sezione
        icona={<Plug className="h-4 w-4" />}
        titolo="Modulo integrazione"
        sottotitolo="È l’interruttore vero. Da spento, questo cliente non riesce a leggere né a scrivere niente: la richiesta viene respinta prima ancora di guardare i dati."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {dati.attivo ? (
              <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                Acceso
              </Badge>
            ) : (
              <Badge variant="secondary">Spento</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {dati.attivo
                ? 'L’API risponde ai token di questo cliente.'
                : 'L’API non risponde, qualunque token venga usato.'}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant={dati.attivo ? 'outline' : 'default'}
            disabled={pending}
            onClick={() => toggleModulo(!dati.attivo)}
          >
            {dati.attivo ? 'Spegni' : 'Accendi'}
          </Button>
        </div>
      </Sezione>

      {/* ---------------------------------------------------------------
          3. Impostazioni
      --------------------------------------------------------------- */}
      {dati.attivo ? (
        <Sezione
          icona={<RadioTower className="h-4 w-4" />}
          titolo="Impostazioni"
          sottotitolo="Quale programma c’è dall’altra parte, quanto possono essere lunghi i testi che gli mandiamo, e dopo quante ore di silenzio dare l’allarme."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Gestionale
              </span>
              <Input
                value={sistema}
                onChange={(e) => setSistema(e.target.value.toLowerCase())}
                placeholder="ergo, teamsystem…"
                disabled={pending}
              />
              <span className="block text-[10px] text-muted-foreground">
                Etichetta interna. Non arriva mai dal chiamante.
              </span>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Tetto descrizioni
              </span>
              <Input
                value={maxDesc}
                onChange={(e) => setMaxDesc(e.target.value.replace(/\D/g, ''))}
                placeholder="nessuno"
                inputMode="numeric"
                disabled={pending}
              />
              <span className="block text-[10px] text-muted-foreground">
                Caratteri. Vuoto = nessun limite dichiarato.
              </span>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Soglia di silenzio
              </span>
              <Input
                value={soglia}
                onChange={(e) => setSoglia(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                disabled={pending}
              />
              <span className="block text-[10px] text-muted-foreground">
                Ore. Oltre il doppio scatta l’avviso via mail.
              </span>
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={pending || !impostazioniDirty}
              onClick={() =>
                esegui(() =>
                  aggiornaImpostazioniIntegrazione({
                    tenantId: dati.tenantId,
                    sistema: sistema.trim(),
                    maxDescrizione: maxDesc.trim() ? Number(maxDesc) : null,
                    sogliaSilenzioOre: Number(soglia) || 24,
                  }),
                )
              }
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Salva impostazioni
            </Button>
          </div>
        </Sezione>
      ) : null}

      {/* ---------------------------------------------------------------
          4. Token
      --------------------------------------------------------------- */}
      {dati.attivo ? (
        <Sezione
          icona={<KeyRound className="h-4 w-4" />}
          titolo="Token dell’agente"
          sottotitolo="Dall’altra parte c’è un programma, non una persona: queste chiavi non sono intestate a nessuno. Toglierle chiude l’accesso subito."
        >
          {dati.token.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
              Nessun token attivo. Finché non ne emetti uno, l’agente non può
              collegarsi.
            </p>
          ) : (
            <ul className="space-y-2">
              {dati.token.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      creato {fmt(t.creato)} · ultimo uso{' '}
                      {t.ultimoUso ? fmt(t.ultimoUso) : 'mai'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Revocare «${t.label}»?`,
                        description:
                          'L’agente che lo usa smette di funzionare subito. Non è recuperabile: ne servirà uno nuovo.',
                        confirmLabel: 'Revoca',
                        destructive: true,
                      });
                      if (!ok) return;
                      esegui(() => revocaApiToken(t.id));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoca
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/token-app"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Emetti un token
          </Link>
        </Sezione>
      ) : null}

      {/* ---------------------------------------------------------------
          5. La leva pericolosa
      --------------------------------------------------------------- */}
      {dati.attivo ? (
        <Sezione
          icona={
            dati.modalita === 'attiva' ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )
          }
          tono={dati.modalita === 'attiva' ? 'critico' : 'neutro'}
          titolo="Scritture verso il gestionale"
          sottotitolo="In prova ogni riga esce marcata come da non mandare: si collauda tutto il giro senza che niente finisca davvero sul gestionale del cliente."
        >
          <div className="grid gap-2.5 lg:grid-cols-2">
            <div
              className={cn(
                'rounded-lg border p-3.5',
                dati.modalita === 'simulazione'
                  ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/40'
                  : 'border-border',
              )}
            >
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-semibold">Simulazione</h4>
                {dati.modalita === 'simulazione' ? (
                  <Badge className="border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Attiva
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-foreground/85">
                Si legge tutto, non si scrive niente. È lo stato con cui parte
                ogni cliente nuovo.
              </p>
            </div>

            <div
              className={cn(
                'rounded-lg border p-3.5',
                dati.modalita === 'attiva'
                  ? 'border-amber-500 bg-amber-500/[0.06] ring-2 ring-amber-500/40'
                  : 'border-border',
              )}
            >
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-semibold">Attiva</h4>
                {dati.modalita === 'attiva' ? (
                  <Badge className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    In corso
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-foreground/85">
                L’agente è autorizzato a scrivere sul gestionale del cliente. Su
                un ERP che non lascia cancellare, quelle scritture non tornano
                indietro.
              </p>
            </div>
          </div>

          {dati.modalita === 'simulazione' ? (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Per aprire le scritture riscrivi il codice azienda:{' '}
                <strong className="font-mono">{dati.slug}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={conferma}
                  onChange={(e) => setConferma(e.target.value.toUpperCase())}
                  placeholder={dati.slug}
                  className="max-w-[180px] font-mono"
                  disabled={pending}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || conferma.toUpperCase() !== dati.slug.toUpperCase()}
                  onClick={apriScritture}
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Apri le scritture
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                esegui(() =>
                  impostaModalitaIntegrazione({
                    tenantId: dati.tenantId,
                    modalita: 'simulazione',
                  }),
                )
              }
            >
              <CircleSlash className="h-3.5 w-3.5" />
              Torna in simulazione
            </Button>
          )}

          {/* Recinto di collaudo */}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-[11px] font-medium">
              Recinto di collaudo{' '}
              <span className="font-normal text-muted-foreground">
                — identificativi che restano scrivibili anche in simulazione
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {esterni.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  Nessuno. In simulazione non esce niente.
                </span>
              ) : (
                esterni.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                  >
                    {e}
                    <button
                      type="button"
                      aria-label={`Togli ${e}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setEsterni((v) => v.filter((x) => x !== e))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={nuovoEsterno}
                onChange={(e) => setNuovoEsterno(e.target.value)}
                placeholder="es. 26087"
                className="max-w-[180px] font-mono"
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const v = nuovoEsterno.trim();
                  if (v && !esterni.includes(v)) setEsterni((x) => [...x, v]);
                  setNuovoEsterno('');
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || !nuovoEsterno.trim()}
                onClick={() => {
                  const v = nuovoEsterno.trim();
                  if (v && !esterni.includes(v)) setEsterni((x) => [...x, v]);
                  setNuovoEsterno('');
                }}
              >
                Aggiungi
              </Button>
              {esterniDirty ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      esegui(() =>
                        aggiornaCollaudoEsterni({ tenantId: dati.tenantId, esterni }),
                      )
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Salva recinto
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setEsterni(dati.collaudoEsterni)}
                  >
                    Annulla
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </Sezione>
      ) : null}

      {/* ---------------------------------------------------------------
          6. Manutenzione
      --------------------------------------------------------------- */}
      {dati.attivo ? (
        <Sezione
          icona={<Trash2 className="h-4 w-4" />}
          titolo="Deposito delle anagrafiche"
          sottotitolo="Una copia di lavoro di quello che è stato letto dal gestionale. Si può svuotare: alla lettura dopo si rifà da sola. Gli abbinamenti già confermati restano."
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>
                <strong>{dati.staging.commesse}</strong> commesse
              </span>
              <span>
                <strong>{dati.staging.clienti}</strong> clienti
              </span>
              <span>
                <strong>{dati.staging.dipendenti}</strong> dipendenti
              </span>
              <span className="text-muted-foreground">letti il {fmt(dati.ultimaLettura)}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setSvuotaAperto((v) => !v)}
            >
              Svuota deposito
            </Button>
          </div>

          {svuotaAperto ? (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Si cancellano {dati.staging.commesse + dati.staging.clienti + dati.staging.dipendenti}{' '}
                righe lette. Gli {dati.collegate} abbinamenti confermati restano.
                Per confermare riscrivi <strong className="font-mono">{dati.slug}</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={confermaSvuota}
                  onChange={(e) => setConfermaSvuota(e.target.value.toUpperCase())}
                  placeholder={dati.slug}
                  className="max-w-[180px] font-mono"
                  disabled={pending}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    pending || confermaSvuota.toUpperCase() !== dati.slug.toUpperCase()
                  }
                  onClick={svuota}
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Svuota
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setSvuotaAperto(false);
                    setConfermaSvuota('');
                  }}
                >
                  Annulla
                </Button>
              </div>
            </div>
          ) : null}
        </Sezione>
      ) : null}
    </div>
  );
}
