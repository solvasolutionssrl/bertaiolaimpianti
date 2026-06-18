'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Badge,
  cn,
} from '@kommessa/ui';
import { ArrowLeft, ArrowRight, Check, Loader2, Send, Plug, XCircle } from 'lucide-react';
import {
  creaTenant,
  testaConnessioneStorage,
  type CreaTenantInput,
} from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

interface Plan {
  id: string;
  code: string;
  nome: string;
  prezzo_mensile_eur: number;
}

interface Props {
  plans: Plan[];
}

type Step = 1 | 2 | 3 | 'done';

function autoSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6);
}

export function NuovoTenantWizard({ plans }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [step, setStep] = React.useState<Step>(1);
  const [pending, start] = React.useTransition();
  const [errore, setErrore] = React.useState<string | null>(null);
  const [risultato, setRisultato] = React.useState<{
    tenantId: string;
    slug: string;
  } | null>(null);

  // -------- Step 1 (anagrafica) --------
  const [nome, setNome] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [brandColor, setBrandColor] = React.useState('#0c2d57');
  const [logoUrl, setLogoUrl] = React.useState('');
  const [inboundEmail, setInboundEmail] = React.useState('');
  const [planId, setPlanId] = React.useState<string>(plans[1]?.id ?? plans[0]?.id ?? '');

  React.useEffect(() => {
    if (!slugTouched) setSlug(autoSlug(nome));
  }, [nome, slugTouched]);

  // -------- Step 2 (storage) --------
  const [storageProvider, setStorageProvider] = React.useState<'supabase' | 'nextcloud' | 'r2'>(
    'supabase',
  );
  const [storageBaseUrl, setStorageBaseUrl] = React.useState('');
  const [storageUser, setStorageUser] = React.useState('');
  const [storagePass, setStoragePass] = React.useState('');

  // R2 fields
  const [r2AccountId, setR2AccountId] = React.useState('');
  const [r2Bucket, setR2Bucket] = React.useState('');
  const [r2AccessKeyId, setR2AccessKeyId] = React.useState('');
  const [r2SecretAccessKey, setR2SecretAccessKey] = React.useState('');
  const [r2Endpoint, setR2Endpoint] = React.useState('');

  // Crea struttura cartelle commessa (default true; false per R2)
  const [creaCartelle, setCreaCartelle] = React.useState(true);

  // Test connessione storage (Nextcloud / R2)
  const [testing, startTest] = React.useTransition();
  const [testResult, setTestResult] = React.useState<
    | { kind: 'idle' }
    | { kind: 'ok'; latencyMs: number; detail: string }
    | { kind: 'fail'; error: string }
  >({ kind: 'idle' });

  // Reset test result quando cambia la config
  React.useEffect(() => {
    setTestResult({ kind: 'idle' });
  }, [storageProvider, storageBaseUrl, storageUser, storagePass, r2AccountId, r2Bucket, r2AccessKeyId, r2SecretAccessKey, r2Endpoint]);

  function runStorageTest() {
    setTestResult({ kind: 'idle' });
    startTest(async () => {
      let res;
      if (storageProvider === 'r2') {
        res = await testaConnessioneStorage({
          provider: 'r2',
          account_id: r2AccountId,
          bucket: r2Bucket,
          access_key_id: r2AccessKeyId,
          secret_access_key: r2SecretAccessKey,
          endpoint: r2Endpoint,
        });
      } else {
        res = await testaConnessioneStorage({
          provider: storageProvider,
          baseUrl: storageBaseUrl,
          user: storageUser,
          appPassword: storagePass,
        });
      }
      if (res.ok) {
        setTestResult({ kind: 'ok', latencyMs: res.latencyMs, detail: res.detail });
      } else {
        setTestResult({ kind: 'fail', error: res.error });
      }
    });
  }

  // -------- Step 3 (owner) --------
  const [ownerName, setOwnerName] = React.useState('');
  const [ownerEmail, setOwnerEmail] = React.useState('');

  function canAdvance(): boolean {
    if (step === 1)
      return nome.length >= 2 && /^[A-Z0-9]{2,12}$/.test(slug) && planId !== '';
    if (step === 2) {
      if (storageProvider === 'supabase') return true;
      if (storageProvider === 'r2')
        return r2AccountId !== '' && r2Bucket !== '' && r2AccessKeyId !== '' && r2SecretAccessKey !== '';
      return storageBaseUrl !== '' && storageUser !== '' && storagePass !== '';
    }
    if (step === 3)
      return ownerName.length >= 2 && /.+@.+/.test(ownerEmail);
    return false;
  }

  function submit() {
    setErrore(null);
    // Convenzione DB: camelCase (baseUrl, appPassword) — coerente col resto
    // del codebase. NON usare snake_case qui o gli altri consumer non leggono.
    const storage_config: Record<string, unknown> =
      storageProvider === 'nextcloud'
        ? {
            baseUrl: storageBaseUrl,
            user: storageUser,
            appPassword: storagePass,
          }
        : {};
    if (inboundEmail) storage_config.inbound_email = inboundEmail;

    const r2_config: Record<string, unknown> =
      storageProvider === 'r2'
        ? {
            account_id: r2AccountId,
            bucket: r2Bucket,
            access_key_id: r2AccessKeyId,
            secret_access_key: r2SecretAccessKey,
            ...(r2Endpoint ? { endpoint: r2Endpoint } : {}),
          }
        : {};

    const payload: CreaTenantInput = {
      nome,
      slug,
      brand_color: brandColor || null,
      logo_url: logoUrl || null,
      plan_id: planId || null,
      storage_provider: storageProvider,
      storage_config,
      r2_config,
      crea_cartelle: creaCartelle,
      inbound_email: inboundEmail || null,
      owner_email: ownerEmail,
      owner_name: ownerName,
    };
    start(async () => {
      const res = await creaTenant(payload);
      if (!res.ok) {
        setErrore(res.error);
        return;
      }
      setRisultato({ tenantId: res.tenantId, slug: res.slug });
      setStep('done');
    });
  }

  if (step === 'done' && risultato) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">
            Tenant creato!
          </h2>
          <p className="text-sm text-muted-foreground">
            Abbiamo inviato l&apos;invito di onboarding al primo owner.
          </p>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-left font-mono text-xs">
            <div>Nome: {nome}</div>
            <div>Slug: {risultato.slug}</div>
            <div>Owner: {ownerEmail}</div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button asChild>
              <Link href={`/admin/tenants/${risultato.tenantId}`}>
                Apri dettaglio tenant
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const url = `${window.location.origin}/login?tenant=${risultato.slug}`;
                navigator.clipboard?.writeText(url);
                await showAlert({ title: 'Link onboarding copiato', body: url });
              }}
            >
              <Send className="h-3.5 w-3.5" />
              Copia link onboarding
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Stepper step={step} />
      <Card>
        <CardContent className="space-y-5 py-6">
          {step === 1 ? (
            <>
              <div>
                <Label htmlFor="nome">Nome tenant</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1.5 h-10"
                  placeholder="Bertaiola Impianti"
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug (tecnico)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                    setSlugTouched(true);
                  }}
                  className="mt-1.5 h-10 font-mono"
                  maxLength={12}
                  placeholder="BER"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Solo A-Z e 0-9. Usato nel codice commessa: {slug || 'XXX'}-26-001
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="brand_color">Colore brand</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id="brand_color"
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-md border border-border"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-10 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="logo_url">Logo URL (opzionale)</Label>
                  <Input
                    id="logo_url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="mt-1.5 h-10"
                    placeholder="https://…"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="inbound_email">Email inbound (ticket)</Label>
                <Input
                  id="inbound_email"
                  value={inboundEmail}
                  onChange={(e) => setInboundEmail(e.target.value)}
                  className="mt-1.5 h-10"
                  placeholder="assistenza@cliente.it"
                  type="email"
                />
              </div>
              <div>
                <Label>Piano</Label>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {plans.map((p) => {
                    const active = p.id === planId;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setPlanId(p.id)}
                        className={cn(
                          'rounded-md border px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border bg-card text-foreground hover:bg-muted/40',
                        )}
                      >
                        <p className="text-sm font-semibold tracking-tight">
                          {p.nome}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          € {p.prezzo_mensile_eur.toFixed(0)}/mese
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div>
                <Label>Provider storage</Label>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { value: 'supabase', label: 'Supabase', desc: 'Bucket S3 gestito (default)' },
                      { value: 'nextcloud', label: 'Nextcloud', desc: 'WebDAV (Hetzner Storage Share o self-hosted)' },
                      { value: 'r2', label: 'Cloudflare R2', desc: 'Solo R2 (senza cartelle Nextcloud)' },
                    ] as const
                  ).map((p) => (
                    <button
                      type="button"
                      key={p.value}
                      onClick={() => {
                        setStorageProvider(p.value);
                        setCreaCartelle(p.value !== 'r2');
                      }}
                      className={cn(
                        'rounded-md border px-3 py-2.5 text-left transition-colors',
                        storageProvider === p.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:bg-muted/40',
                      )}
                    >
                      <p className="text-sm font-semibold">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              {storageProvider === 'nextcloud' ? (
                <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
                  <div>
                    <Label htmlFor="base_url">Base URL WebDAV</Label>
                    <Input
                      id="base_url"
                      value={storageBaseUrl}
                      onChange={(e) => setStorageBaseUrl(e.target.value)}
                      className="mt-1.5 h-10 font-mono text-xs"
                      placeholder="https://cliente.your-storageshare.de/remote.php/dav/files/admin"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="user">User</Label>
                      <Input
                        id="user"
                        value={storageUser}
                        onChange={(e) => setStorageUser(e.target.value)}
                        className="mt-1.5 h-10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="app_pwd">App password</Label>
                      <Input
                        id="app_pwd"
                        value={storagePass}
                        onChange={(e) => setStoragePass(e.target.value)}
                        className="mt-1.5 h-10 font-mono"
                        type="password"
                      />
                    </div>
                  </div>

                  {/* Test connessione live */}
                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={runStorageTest}
                      disabled={
                        testing || !storageBaseUrl || !storageUser || !storagePass
                      }
                    >
                      {testing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plug className="h-3.5 w-3.5" />
                      )}
                      Testa connessione
                    </Button>
                    {testResult.kind === 'ok' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-success">
                        <Check className="h-3.5 w-3.5" />
                        {testResult.detail} · {testResult.latencyMs} ms
                      </span>
                    ) : null}
                    {testResult.kind === 'fail' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        {testResult.error}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {storageProvider === 'r2' ? (
                <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
                  <div>
                    <Label htmlFor="r2_account_id">Account ID</Label>
                    <Input
                      id="r2_account_id"
                      value={r2AccountId}
                      onChange={(e) => setR2AccountId(e.target.value)}
                      className="mt-1.5 h-10 font-mono text-xs"
                      placeholder="abc123..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="r2_bucket">Bucket</Label>
                    <Input
                      id="r2_bucket"
                      value={r2Bucket}
                      onChange={(e) => setR2Bucket(e.target.value)}
                      className="mt-1.5 h-10 font-mono text-xs"
                      placeholder="nome-bucket"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="r2_access_key_id">Access Key ID</Label>
                      <Input
                        id="r2_access_key_id"
                        value={r2AccessKeyId}
                        onChange={(e) => setR2AccessKeyId(e.target.value)}
                        className="mt-1.5 h-10 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="r2_secret_access_key">Secret Access Key</Label>
                      <Input
                        id="r2_secret_access_key"
                        value={r2SecretAccessKey}
                        onChange={(e) => setR2SecretAccessKey(e.target.value)}
                        className="mt-1.5 h-10 font-mono text-xs"
                        type="password"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="r2_endpoint">Endpoint (opzionale)</Label>
                    <Input
                      id="r2_endpoint"
                      value={r2Endpoint}
                      onChange={(e) => setR2Endpoint(e.target.value)}
                      className="mt-1.5 h-10 font-mono text-xs"
                      placeholder="https://account_id.r2.cloudflarestorage.com"
                    />
                  </div>

                  {/* Test connessione live */}
                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={runStorageTest}
                      disabled={
                        testing || !r2AccountId || !r2Bucket || !r2AccessKeyId || !r2SecretAccessKey
                      }
                    >
                      {testing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plug className="h-3.5 w-3.5" />
                      )}
                      Testa connessione
                    </Button>
                    {testResult.kind === 'ok' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-success">
                        <Check className="h-3.5 w-3.5" />
                        {testResult.detail} · {testResult.latencyMs} ms
                      </span>
                    ) : null}
                    {testResult.kind === 'fail' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        {testResult.error}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {/* Crea struttura cartelle commessa */}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={creaCartelle}
                  onChange={(e) => setCreaCartelle(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">Crea struttura cartelle commessa</span>
              </label>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Inseriamo subito il primo utente owner. Riceverà un&apos;email
                con il link di invito (magic-link Supabase Auth).
              </p>
              <div>
                <Label htmlFor="owner_name">Nome owner</Label>
                <Input
                  id="owner_name"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="mt-1.5 h-10"
                  placeholder="Mario Rossi"
                />
              </div>
              <div>
                <Label htmlFor="owner_email">Email owner</Label>
                <Input
                  id="owner_email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="mt-1.5 h-10"
                  placeholder="mario@cliente.it"
                  type="email"
                />
              </div>
            </>
          ) : null}

          {errore ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errore}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (step === 1) router.push('/admin/tenants');
                else if (step !== 'done') setStep(((step as number) - 1) as Step);
              }}
              disabled={pending}
            >
              <ArrowLeft className="h-4 w-4" />
              {step === 1 ? 'Annulla' : 'Indietro'}
            </Button>
            {step === 3 ? (
              <Button onClick={submit} disabled={!canAdvance() || pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Crea tenant e invita owner
              </Button>
            ) : (
              <Button
                onClick={() => setStep(((step as number) + 1) as Step)}
                disabled={!canAdvance()}
              >
                Avanti
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: Array<{ id: 1 | 2 | 3; label: string }> = [
    { id: 1, label: 'Anagrafica' },
    { id: 2, label: 'Storage' },
    { id: 3, label: 'Owner' },
  ];
  const idx = step === 'done' ? 4 : (step as number);
  return (
    <div className="flex items-center gap-2">
      {items.map((it, i) => {
        const active = it.id === idx;
        const done = it.id < idx;
        return (
          <React.Fragment key={it.id}>
            <Badge
              variant={active ? 'default' : done ? 'outline' : 'secondary'}
              className={cn(
                'gap-1.5',
                done && 'border-success/30 bg-success/10 text-success',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : <span>{it.id}</span>}
              {it.label}
            </Badge>
            {i < items.length - 1 ? (
              <span
                aria-hidden="true"
                className="h-px w-6 bg-border sm:w-12"
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
