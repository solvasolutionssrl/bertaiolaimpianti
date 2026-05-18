'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  Input,
  Label,
} from '@impiantixplus/ui';
import { Upload } from 'lucide-react';
import {
  aggiornaBranding,
  uploadLogo,
  type BrandingFormState,
} from '../_actions/branding';

const initialState: BrandingFormState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvataggio…' : 'Salva branding'}
    </Button>
  );
}

export function BrandingForm({
  initialNome,
  initialLogoUrl,
  initialBrandColor,
  initialInboundEmail,
  canEdit,
}: {
  initialNome: string;
  initialLogoUrl: string;
  initialBrandColor: string;
  initialInboundEmail: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(aggiornaBranding, initialState);

  const [nome, setNome] = useState(initialNome);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [brandColor, setBrandColor] = useState(initialBrandColor || '#0F4FDB');
  const [inboundEmail, setInboundEmail] = useState(initialInboundEmail);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const onPickFile = () => fileRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const fd = new FormData();
    fd.append('file', file);
    startUpload(async () => {
      const res = await uploadLogo(fd);
      if (res.status === 'error') setUploadError(res.message);
      if (res.publicUrl) setLogoUrl(res.publicUrl);
      if (fileRef.current) fileRef.current.value = '';
    });
  };

  const initials =
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="p-6">
          <form action={formAction} className="space-y-5">
            <fieldset disabled={!canEdit} className="space-y-5">
              <div className="grid gap-1.5">
                <Label htmlFor="nome">Ragione sociale visibile</Label>
                <Input
                  id="nome"
                  name="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={160}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Mostrata nell&apos;header del prodotto e nei documenti
                  esportati.
                </p>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-[120px_1fr] sm:items-end sm:gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="brandColor">Colore brand</Label>
                  <input
                    type="color"
                    id="brandColor-picker"
                    aria-label="Selettore colore"
                    value={brandColor || '#0F4FDB'}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-md border border-input bg-background"
                  />
                </div>
                <Input
                  id="brandColor"
                  name="brandColor"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="codice uppercase"
                  placeholder="#0F4FDB"
                  pattern="^#?[0-9a-fA-F]{6}$"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="logoUrl">Logo</Label>
                <div className="flex gap-2">
                  <Input
                    id="logoUrl"
                    name="logoUrl"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…/logo.png"
                    inputMode="url"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={onFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onPickFile}
                    disabled={uploading}
                  >
                    <Upload className="mr-1.5 h-4 w-4" />
                    {uploading ? 'Carico…' : 'Carica'}
                  </Button>
                </div>
                {uploadError ? (
                  <p
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {uploadError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    PNG/JPG/SVG/WebP, max 2 MB. Salvato nel bucket{' '}
                    <code>branding</code>.
                  </p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="inboundEmail">Email inbound ticket</Label>
                <Input
                  id="inboundEmail"
                  name="inboundEmail"
                  type="email"
                  value={inboundEmail}
                  onChange={(e) => setInboundEmail(e.target.value)}
                  placeholder="supporto@bertaiola.impiantixplus.eu"
                />
                <p className="text-xs text-muted-foreground">
                  Indirizzo da cui verranno generati i ticket via email
                  (sostituirà Freshdesk).
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
                <SubmitButton />
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Anteprima header
        </p>
        <Card className="overflow-hidden">
          <div
            className="flex items-center gap-3 border-b border-border px-4 py-3"
            style={{
              backgroundColor: 'hsl(var(--card))',
            }}
          >
            <Avatar className="h-9 w-9" style={{ backgroundColor: brandColor }}>
              {logoUrl ? <AvatarImage src={logoUrl} alt={nome} /> : null}
              <AvatarFallback
                className="text-xs font-semibold text-white"
                style={{ backgroundColor: brandColor }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{nome || 'Tenant'}</p>
              <p className="codice text-[10px] uppercase tracking-wider text-muted-foreground">
                impiantiXplus
              </p>
            </div>
            <span
              className="ml-auto h-2 w-12 rounded-full"
              style={{ backgroundColor: brandColor }}
              aria-hidden="true"
            />
          </div>
          <div className="space-y-2 p-4 text-xs text-muted-foreground">
            <p>
              Il colore brand viene applicato ai dettagli accent
              (logo placeholder, accenti).
            </p>
            <p className="font-mono uppercase tracking-wider">
              {brandColor || '#0F4FDB'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
