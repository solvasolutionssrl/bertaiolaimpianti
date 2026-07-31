'use client';

import * as React from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldOff } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  cn,
} from '@kommessa/ui';

import { creaApiToken, revocaApiToken } from '../../_actions/api-tokens';

export interface TokenRow {
  id: string;
  label: string;
  tenant: string;
  utente: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface UtenteOption {
  id: string;
  tenantId: string;
  nome: string;
  ruolo: string;
}

const fmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : fmt.format(d);
}

export function TokenAppClient({
  tokens,
  tenants,
  utenti,
}: {
  tokens: TokenRow[];
  tenants: Array<{ id: string; nome: string }>;
  utenti: UtenteOption[];
}) {
  const [tenantId, setTenantId] = React.useState(tenants[0]?.id ?? '');
  const [userId, setUserId] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [pending, start] = React.useTransition();
  const [errore, setErrore] = React.useState<string | null>(null);
  const [appenaCreato, setAppenaCreato] = React.useState<string | null>(null);
  const [copiato, setCopiato] = React.useState(false);

  const utentiDelTenant = utenti.filter((u) => u.tenantId === tenantId);

  const crea = () => {
    setErrore(null);
    start(async () => {
      const res = await creaApiToken({ tenantId, userId, label });
      if (!res.ok || !res.token) {
        setErrore(res.error ?? 'Creazione fallita');
        return;
      }
      setAppenaCreato(res.token);
      setLabel('');
      setUserId('');
    });
  };

  const revoca = (id: string) => {
    start(async () => {
      const res = await revocaApiToken(id);
      if (!res.ok) setErrore(res.error ?? 'Revoca fallita');
    });
  };

  return (
    <div className="space-y-5">
      {/* Il token in chiaro esiste solo in questo riquadro, una volta sola:
          non e' recuperabile dal DB (in tabella c'e' solo lo SHA-256). */}
      {appenaCreato ? (
        <Card className="border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20">
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Token creato — copialo adesso
            </p>
            <p className="text-xs text-muted-foreground">
              Non sarà più visibile: in archivio ne resta solo l’impronta. Se lo
              perdi, revoca e creane un altro.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs">
                {appenaCreato}
              </code>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(appenaCreato);
                  setCopiato(true);
                  setTimeout(() => setCopiato(false), 2000);
                }}
              >
                {copiato ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copiato ? 'Copiato' : 'Copia'}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAppenaCreato(null)}
            >
              Ho finito, nascondi
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm font-semibold">Nuovo token</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tk-tenant">Azienda</Label>
              <select
                id="tk-tenant"
                value={tenantId}
                onChange={(e) => {
                  setTenantId(e.target.value);
                  setUserId('');
                }}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-utente">Persona</Label>
              <select
                id="tk-utente"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Scegli…</option>
                {utentiDelTenant.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.ruolo})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-label">Etichetta</Label>
              <Input
                id="tk-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="iPhone di Luca"
              />
            </div>
          </div>
          {errore ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errore}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={crea}
            disabled={pending || !tenantId || !userId || !label.trim()}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            Crea token
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Etichetta</th>
                <th className="w-[18%] px-3 py-2 font-medium">Azienda</th>
                <th className="w-[18%] px-3 py-2 font-medium">Persona</th>
                <th className="w-[14%] px-3 py-2 font-medium">Ultimo uso</th>
                <th className="w-[12%] px-3 py-2 font-medium">Stato</th>
                <th className="w-[10%] px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Nessun token creato.
                  </td>
                </tr>
              ) : (
                tokens.map((t) => (
                  <tr
                    key={t.id}
                    className={cn('align-middle', t.revokedAt && 'opacity-55')}
                  >
                    <td className="truncate px-3 py-2 font-medium" title={t.label}>
                      {t.label}
                    </td>
                    <td className="truncate px-3 py-2 text-muted-foreground">{t.tenant}</td>
                    <td className="truncate px-3 py-2 text-muted-foreground">{t.utente}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {quando(t.lastUsedAt)}
                    </td>
                    <td className="px-3 py-2">
                      {t.revokedAt ? (
                        <Badge variant="outline" className="text-destructive">
                          Revocato
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-emerald-700">
                          Attivo
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!t.revokedAt ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => revoca(t.id)}
                          disabled={pending}
                        >
                          <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                          Revoca
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
