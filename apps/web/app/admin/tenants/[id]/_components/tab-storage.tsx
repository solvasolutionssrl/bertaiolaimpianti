'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
} from '@impiantixplus/ui';
import { aggiornaTenant } from '../../../_actions/tenants';

interface Props {
  tenantId: string;
  storageProvider: 'supabase' | 'nextcloud' | null;
  storageConfig: Record<string, unknown>;
}

export function TabStorage({ tenantId, storageProvider, storageConfig }: Props) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [provider, setProvider] = React.useState<'supabase' | 'nextcloud'>(
    storageProvider ?? 'supabase',
  );
  const [baseUrl, setBaseUrl] = React.useState(
    // Compatibilità: legge sia camelCase (canonico) sia snake_case (legacy)
    String(
      (storageConfig?.baseUrl as string) ??
        (storageConfig?.base_url as string) ??
        '',
    ),
  );
  const [user, setUser] = React.useState(
    String((storageConfig?.user as string) ?? ''),
  );
  const [pwd, setPwd] = React.useState(
    String(
      (storageConfig?.appPassword as string) ??
        (storageConfig?.app_password as string) ??
        '',
    ),
  );

  // Maschera password: mostriamo solo "*****" se è già impostata, e
  // permettiamo di re-scriverla solo se l'utente la modifica.
  const [pwdTouched, setPwdTouched] = React.useState(false);
  const pwdDisplay = pwdTouched ? pwd : pwd ? '••••••••' : '';

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Storage provider
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {(['supabase', 'nextcloud'] as const).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setProvider(p)}
              className={
                'rounded-md border px-3 py-2.5 text-left transition-colors ' +
                (provider === p
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-muted/40')
              }
            >
              <p className="text-sm font-semibold capitalize">{p}</p>
              <p className="text-xs text-muted-foreground">
                {p === 'supabase'
                  ? 'Bucket S3 gestito (default)'
                  : 'WebDAV (Hetzner Storage Share)'}
              </p>
            </button>
          ))}
        </div>

        {provider === 'nextcloud' ? (
          <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
            <div>
              <Label htmlFor="s_base_url">Base URL WebDAV</Label>
              <Input
                id="s_base_url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="mt-1.5 h-10 font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="s_user">User</Label>
                <Input
                  id="s_user"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="mt-1.5 h-10"
                />
              </div>
              <div>
                <Label htmlFor="s_pwd">App password</Label>
                <Input
                  id="s_pwd"
                  type="password"
                  value={pwdDisplay}
                  onChange={(e) => {
                    setPwdTouched(true);
                    setPwd(e.target.value);
                  }}
                  className="mt-1.5 h-10 font-mono"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Per modificare la password, click e digita.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                // Convenzione DB: camelCase (baseUrl, appPassword) — coerente
                // con il resto del codice. Manteniamo i campi non-Nextcloud
                // (es. bucket per Supabase) intatti.
                const cfg: Record<string, unknown> = { ...storageConfig };
                if (provider === 'nextcloud') {
                  cfg.baseUrl = baseUrl;
                  cfg.user = user;
                  if (pwdTouched) cfg.appPassword = pwd;
                  // Cleanup legacy snake_case se presenti
                  delete cfg.base_url;
                  delete cfg.app_password;
                } else {
                  delete cfg.baseUrl;
                  delete cfg.user;
                  delete cfg.appPassword;
                  delete cfg.base_url;
                  delete cfg.app_password;
                }
                const res = await aggiornaTenant({
                  tenantId,
                  storage_provider: provider,
                  storage_config: cfg,
                });
                if (!res.ok) alert(res.error);
                router.refresh();
              })
            }
          >
            <Save className="h-3.5 w-3.5" />
            Salva storage
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
