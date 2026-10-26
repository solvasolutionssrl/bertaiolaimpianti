'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  UserCheck,
  Webhook,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, cn } from '@kommessa/ui';

import { useAlert } from '@/app/_components/confirm-provider';
import { SemaforoCollegamento } from '../../../_components/semaforo-collegamento';
import { TimbriTerminale } from '@/app/office/kantiere/_components/timbri-terminale';
import { ETICHETTA_STATO_TIMBRO, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import type { StatoTimbro } from '@/app/_lib/timbro/config';
import type { DiagnosiTimbro, FotoTimbro } from '@kommessa/api/timbro-salute';
import {
  abbinamentoDipendentiTimbro,
  collegaDipendenteTimbro,
  impostaSegretoWebhookTimbro,
  leggiOraTimbro,
  provaWebhookTimbro,
  registraWebhookTimbro,
  salvaCollegamentoTimbro,
  type RigaAbbinamento,
} from '../../../_actions/timbro';

const fmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const quando = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : '—');
const fmtGiorno = (g: string) =>
  new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: '2-digit' }).format(
    new Date(`${g}T12:00:00Z`),
  );
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

export interface DatiTabTimbro {
  tenantId: string;
  tenantNome: string;
  stato: StatoTimbro;
  diagnosi: DiagnosiTimbro;
  foto: FotoTimbro;
  timbri24h: number;
  giornate: { daRipartire: number; daVerificare: number; coperte: number; aperte: number };
  recenti: TimbroGiornataVista[];
  webhookUrl: string;
  kantiereAttivo: boolean;
}

const STATI: { id: StatoTimbro['stato']; label: string; descrizione: string }[] = [
  { id: 'spento', label: 'Spento', descrizione: 'Non si legge niente.' },
  {
    id: 'osservazione',
    label: 'Osservazione',
    descrizione: 'Si leggono i timbri e li vedono ufficio e super admin. Ai tecnici non si chiede niente: serve a confrontare per qualche giorno Timbro con quello che l’app registra già.',
  },
  { id: 'attivo', label: 'Attivo', descrizione: 'Anche i tecnici vedono la giornata timbrata e ripartiscono le ore dal telefono.' },
];

/**
 * Tab **Timbro** del singolo cliente: il collegamento con la timbratrice.
 * In ordine di pericolosita': prima come sta, poi la configurazione, poi gli
 * attrezzi (lettura a comando, webhook, abbinamento delle persone).
 */
export function TabTimbro({ dati }: { dati: DatiTabTimbro }) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, startTransition] = React.useTransition();
  const [stato, setStato] = React.useState(dati.stato.stato);
  const [dal, setDal] = React.useState(dati.stato.dal ?? '');
  const [token, setToken] = React.useState('');
  const [segreto, setSegreto] = React.useState('');
  const [esito, setEsito] = React.useState<string | null>(null);
  const [abbinamento, setAbbinamento] = React.useState<
    { righe: RigaAbbinamento[]; nostriSenzaTimbro: { id: string; nome: string }[] } | null
  >(null);

  const modificato = stato !== dati.stato.stato || dal !== (dati.stato.dal ?? '') || token.trim().length > 0;

  function salva() {
    setEsito(null);
    startTransition(async () => {
      const res = await salvaCollegamentoTimbro({
        tenantId: dati.tenantId,
        stato,
        dal: dal || null,
        ...(token.trim() ? { token: token.trim() } : {}),
      });
      if (!res.ok) return void alert({ title: 'Non salvato', body: res.error });
      setToken('');
      // Salvato, ma mezzo: lo si dice con un dialogo, non con una riga che
      // scorre via insieme a «Salvato.».
      if (res.avviso) await alert({ title: 'Salvato, ma la chiave non scrive', body: res.avviso });
      setEsito(res.avviso ? 'Salvato · la chiave legge ma non scrive.' : 'Salvato.');
      router.refresh();
    });
  }

  function leggiOra() {
    setEsito(null);
    startTransition(async () => {
      const res = await leggiOraTimbro({ tenantId: dati.tenantId });
      setEsito(res.ok ? `Letto: ${res.messaggio}` : `Lettura fallita: ${res.error}`);
      router.refresh();
    });
  }

  function registraWebhook() {
    startTransition(async () => {
      const res = await registraWebhookTimbro({ tenantId: dati.tenantId });
      if (!res.ok)
        return void alert({
          title: 'Webhook non registrato',
          body: `${res.error}\n\nSe il token non ha lo scope webhooks:manage, crea il webhook dal pannello di Timbro verso l’indirizzo qui sotto e incolla il segreto.`,
        });
      setEsito('Webhook registrato su Timbro.');
      router.refresh();
    });
  }

  function salvaSegreto() {
    startTransition(async () => {
      const res = await impostaSegretoWebhookTimbro({ tenantId: dati.tenantId, secret: segreto });
      if (!res.ok) return void alert({ title: 'Segreto non salvato', body: res.error });
      setSegreto('');
      setEsito('Segreto del webhook salvato.');
      router.refresh();
    });
  }

  function provaWebhook() {
    startTransition(async () => {
      const res = await provaWebhookTimbro({ tenantId: dati.tenantId });
      setEsito(res.ok ? 'Evento di prova mandato: controlla i giri fra un minuto.' : `Prova fallita: ${res.error}`);
    });
  }

  function verificaAbbinamento() {
    startTransition(async () => {
      const res = await abbinamentoDipendentiTimbro({ tenantId: dati.tenantId });
      if (!res.ok) return void alert({ title: 'Abbinamento non letto', body: res.error });
      setAbbinamento({ righe: res.righe, nostriSenzaTimbro: res.nostriSenzaTimbro });
    });
  }

  function collega(timbroId: string, dipendenteId: string) {
    startTransition(async () => {
      const res = await collegaDipendenteTimbro({ tenantId: dati.tenantId, timbroId, dipendenteId });
      if (!res.ok) return void alert({ title: 'Non collegato', body: res.error });
      const r = await abbinamentoDipendentiTimbro({ tenantId: dati.tenantId });
      if (r.ok) setAbbinamento({ righe: r.righe, nostriSenzaTimbro: r.nostriSenzaTimbro });
      router.refresh();
    });
  }

  const g = dati.giornate;

  return (
    <div className="space-y-5">
      {!dati.kantiereAttivo ? (
        <Card className="border-amber-500/40">
          <CardContent className="py-4 text-sm text-amber-800">
            Il modulo Kantiere è spento per questo cliente: i timbri si possono leggere, ma non c’è dove ripartirli.
          </CardContent>
        </Card>
      ) : null}

      {/* ── Come sta ── */}
      <Card
        className={cn(
          dati.diagnosi.stato === 'guasto' && 'border-red-500/40',
          dati.diagnosi.stato === 'attenzione' && 'border-amber-500/40',
        )}
      >
        <CardContent className="py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <SemaforoCollegamento stato={dati.diagnosi.stato} />
              <div>
                <p className="font-semibold">Timbratrice Timbro</p>
                <ul className="mt-1 space-y-0.5">
                  {dati.diagnosi.motivi.map((m) => (
                    <li key={m} className="text-xs text-muted-foreground">
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={leggiOra} disabled={pending || !dati.stato.conToken}>
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Leggi ora
            </Button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {(
              [
                ['Ultimo giro', quando(dati.stato.ultimoGiroAt), dati.stato.ultimoGiroEsito === 'errore' ? 'rosso' : ''],
                ['Ultimo timbro', quando(dati.stato.ultimoTimbroAt), ''],
                ['Timbri 24h', String(dati.timbri24h), ''],
                ['Cursore', quando(dati.stato.cursoreUpdatedAt), ''],
                ['Da ripartire 7g', String(g.daRipartire), g.daRipartire > 0 ? 'ambra' : ''],
                ['Da verificare 7g', String(g.daVerificare), g.daVerificare > 0 ? 'ambra' : ''],
                ['Coperte 7g', String(g.coperte), ''],
                ['Senza persona', String(dati.foto.orfani), dati.foto.orfani > 0 ? 'ambra' : ''],
              ] as [string, string, string][]
            ).map(([k, v, tono]) => (
              <div key={k} className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd
                  className={cn(
                    'font-mono text-sm tabular-nums',
                    tono === 'rosso' && 'text-red-700',
                    tono === 'ambra' && 'text-amber-700',
                  )}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {esito ? <p className="mt-3 text-xs text-muted-foreground">{esito}</p> : null}
        </CardContent>
      </Card>

      {/* ── Configurazione ── */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Fingerprint className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Collegamento
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {STATI.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStato(s.id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  stato === s.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                )}
              >
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.descrizione}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-medium">Data di partenza</span>
              <Input type="date" value={dal} onChange={(e) => setDal(e.target.value)} disabled={pending} />
              <span className="block text-muted-foreground">
                Si applica all’ora del passaggio, non a quella di arrivo. I timbri precedenti non entrano mai.
              </span>
            </label>
            <label className="space-y-1 text-xs">
              <span className="flex items-center gap-1 font-medium">
                <KeyRound className="h-3 w-3" aria-hidden="true" />
                Token di Timbro {dati.stato.conToken ? <Badge variant="outline" className="text-[10px]">salvato</Badge> : null}
              </span>
              <Input
                type="password"
                autoComplete="off"
                placeholder={dati.stato.conToken ? 'Lascia vuoto per tenere quello salvato' : 'tmb_live_…'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={pending}
              />
              <span className="block text-muted-foreground">
                Si prova prima di salvarlo. Non si rilegge mai: sta in una tabella che solo il server apre.
              </span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={salva} disabled={pending || !modificato}>
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              Salva
            </Button>
            {modificato ? <span className="text-xs text-amber-700">Modifiche non salvate</span> : null}
          </div>
        </CardContent>
      </Card>

      {/* ── Webhook ── */}
      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Webhook className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Webhook {dati.stato.conWebhook ? <Badge variant="outline" className="text-[10px]">configurato</Badge> : <Badge variant="outline" className="text-[10px]">assente</Badge>}
          </h2>
          <p className="text-xs text-muted-foreground">
            Il giro ogni due minuti basta da solo. Il webhook anticipa: quando Timbro ci avvisa, la stessa lettura parte
            subito. Indirizzo da dare a Timbro:
          </p>
          <code className="block select-all break-all rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
            {dati.webhookUrl}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={registraWebhook} disabled={pending || !dati.stato.conToken}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Registra da qui
            </Button>
            <Button size="sm" variant="outline" onClick={provaWebhook} disabled={pending || !dati.stato.conWebhook}>
              Manda un evento di prova
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[16rem] flex-1 space-y-1 text-xs">
              <span className="font-medium">Oppure incolla il segreto di un webhook creato da Timbro</span>
              <Input
                type="password"
                autoComplete="off"
                value={segreto}
                onChange={(e) => setSegreto(e.target.value)}
                placeholder="whsec_…"
                disabled={pending}
              />
            </label>
            <Button size="sm" variant="outline" onClick={salvaSegreto} disabled={pending || segreto.trim().length < 8}>
              Salva segreto
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Dipendenti ── */}
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Persone: Timbro ↔ Kommessa
            </h2>
            <Button size="sm" variant="outline" onClick={verificaAbbinamento} disabled={pending || !dati.stato.conToken}>
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Verifica abbinamento
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Il legame è il nostro <code>id</code> scritto in <code>external_id</code> su Timbro. Un timbro di una persona
            non collegata resta senza nome finché non la si collega: matricola e nome servono solo a suggerire.
          </p>
          {abbinamento ? (
            <div className="space-y-3">
              <table className="w-full text-xs">
                <thead className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Su Timbro</th>
                    <th className="py-1 pr-3 font-medium">Matricola</th>
                    <th className="py-1 pr-3 font-medium">In Kommessa</th>
                    <th className="py-1 font-medium">Esito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {abbinamento.righe.map((r) => (
                    <tr key={r.timbroId} className={cn(!r.attivo && 'opacity-60')}>
                      <td className="py-1.5 pr-3">
                        {r.nome || '(senza nome)'}
                        {!r.attivo ? <span className="ml-1 text-[10px] text-muted-foreground">non attivo</span> : null}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{r.employeeCode ?? '—'}</td>
                      <td className="py-1.5 pr-3">{r.nostroNome ?? r.suggeritoNome ?? '—'}</td>
                      <td className="py-1.5">
                        {r.esito === 'collegato' ? (
                          <span className="text-emerald-700">collegato</span>
                        ) : r.esito === 'suggerito' && r.suggeritoId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            disabled={pending}
                            onClick={() => collega(r.timbroId, r.suggeritoId!)}
                          >
                            Collega a {r.suggeritoNome}
                          </Button>
                        ) : r.esito === 'esterno_sconosciuto' ? (
                          <span className="text-amber-700" title={r.externalId ?? ''}>
                            external_id non nostro
                          </span>
                        ) : (
                          <span className="text-muted-foreground">nessun suggerimento</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {abbinamento.nostriSenzaTimbro.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  In Kommessa ma non su Timbro: {abbinamento.nostriSenzaTimbro.map((n) => n.nome).join(', ')}.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Giornate recenti ── */}
      <Card>
        <CardContent className="space-y-2 py-5">
          <h2 className="text-sm font-semibold">Giornate timbrate · ultimi 7 giorni</h2>
          {dati.recenti.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nessun timbro nel periodo.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {dati.recenti.map((r) => (
                <li key={r.chiave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{fmtGiorno(r.giorno)}</span>
                  <span className="w-40 shrink-0 truncate font-medium">{r.dipendenteNome}</span>
                  <TimbriTerminale timbri={r.timbri} compatto />
                  <span className="ml-auto flex items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{hm(r.nettoMin)}</span>
                    <Badge
                      variant="outline"
                      title={r.motivo ?? undefined}
                      className={cn(
                        'text-[10px]',
                        (r.stato === 'da_verificare' || r.stato === 'presenza_aperta') && 'border-amber-300 text-amber-800',
                        (r.stato === 'da_ripartire' || r.stato === 'da_chiudere') && 'border-sky-300 text-sky-800',
                        r.stato === 'coperta' && 'border-emerald-300 text-emerald-800',
                      )}
                    >
                      {ETICHETTA_STATO_TIMBRO[r.stato]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
