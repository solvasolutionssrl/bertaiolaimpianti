'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  cn,
} from '@impiantixplus/ui';
import { AlertTriangle, Cloud, Server } from 'lucide-react';
import {
  aggiornaStorage,
  type StorageFormState,
} from '../_actions/storage';

const initialState: StorageFormState = { status: 'idle' };

function SubmitButton({ provider }: { provider: 'supabase' | 'nextcloud' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? 'Salvataggio…'
        : provider === 'supabase'
          ? 'Imposta Supabase Storage'
          : 'Imposta Nextcloud'}
    </Button>
  );
}

export function StorageForm({
  initialProvider,
  initialConfig,
  canEdit,
}: {
  initialProvider: 'supabase' | 'nextcloud';
  initialConfig: Record<string, unknown> | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState(initialProvider);
  const [state, action] = useFormState(aggiornaStorage, initialState);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  // Compatibilità: legge camelCase (canonico) con fallback snake_case (legacy)
  const baseUrl =
    (initialConfig?.baseUrl as string | undefined) ??
    (initialConfig?.base_url as string | undefined) ??
    '';
  const user = (initialConfig?.user as string | undefined) ?? '';
  const hasPassword = Boolean(
    ((initialConfig?.appPassword as string | undefined) ??
      (initialConfig?.app_password as string | undefined))?.trim(),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-muted">
                {initialProvider === 'supabase' ? (
                  <Cloud className="h-5 w-5" />
                ) : (
                  <Server className="h-5 w-5" />
                )}
              </span>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Provider attivo
                </p>
                <p className="text-base font-semibold capitalize">
                  {initialProvider === 'supabase'
                    ? 'Supabase Storage'
                    : 'Nextcloud (WebDAV)'}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="font-mono">
              {initialProvider}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <form action={action} className="space-y-5">
        <fieldset disabled={!canEdit} className="space-y-5">
          <div>
            <Label className="mb-2 block">Cambia provider</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProviderOption
                value="supabase"
                current={provider}
                onChange={setProvider}
                icon={<Cloud className="h-4 w-4" />}
                title="Supabase Storage"
                description="Bucket gestito EU. Default consigliato per il pilot."
              />
              <ProviderOption
                value="nextcloud"
                current={provider}
                onChange={setProvider}
                icon={<Server className="h-4 w-4" />}
                title="Nextcloud (WebDAV)"
                description="Per tenant con infrastruttura on-prem o Hetzner Storage Share."
              />
            </div>
            <input type="hidden" name="provider" value={provider} />
          </div>

          {provider === 'nextcloud' ? (
            <Card>
              <CardContent className="space-y-4 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Credenziali WebDAV
                </p>
                <div className="grid gap-1.5">
                  <Label htmlFor="nextcloudBaseUrl">Base URL</Label>
                  <Input
                    id="nextcloudBaseUrl"
                    name="nextcloudBaseUrl"
                    defaultValue={baseUrl}
                    placeholder="https://cloud.bertaiola.it/remote.php/dav/files/USERNAME"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nextcloudUser">Utente</Label>
                  <Input
                    id="nextcloudUser"
                    name="nextcloudUser"
                    defaultValue={user}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nextcloudAppPassword">
                    App password{hasPassword ? ' (impostata)' : ''}
                  </Label>
                  <Input
                    id="nextcloudAppPassword"
                    name="nextcloudAppPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      hasPassword
                        ? '••••••••  (lascia vuoto per non sovrascrivere)'
                        : 'Genera in Nextcloud → Sicurezza → App password'
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              Lo switch di provider impatta solo le{' '}
              <strong>commesse future</strong>. I file delle commesse esistenti
              restano sul provider attualmente associato a ciascuna commessa.
            </p>
          </div>
        </fieldset>

        {state.status === 'error' ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}
        {state.status === 'success' ? (
          <p
            role="status"
            className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            {state.message}
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex justify-end">
            <SubmitButton provider={provider} />
          </div>
        ) : null}
      </form>
    </div>
  );
}

function ProviderOption({
  value,
  current,
  onChange,
  icon,
  title,
  description,
}: {
  value: 'supabase' | 'nextcloud';
  current: 'supabase' | 'nextcloud';
  onChange: (v: 'supabase' | 'nextcloud') => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={active}
      className={cn(
        'rounded-md border px-4 py-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border hover:bg-muted/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-8 w-8 place-items-center rounded-md',
            active ? 'bg-primary/15 text-primary' : 'bg-muted',
          )}
        >
          {icon}
        </span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
