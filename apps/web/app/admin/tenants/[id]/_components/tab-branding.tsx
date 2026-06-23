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
} from '@kommessa/ui';
import { aggiornaTenant } from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';
import { LANDING_TAGLINE_DEFAULT } from '@/app/_lib/kantiere-landing';

interface Props {
  tenantId: string;
  nome: string;
  brandColor: string | null;
  logoUrl: string | null;
  inboundEmail: string | null;
  landingTagline: string | null;
}

export function TabBranding({
  tenantId,
  nome: nomeInit,
  brandColor,
  logoUrl,
  inboundEmail: inboundInit,
  landingTagline: landingInit,
}: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [nome, setNome] = React.useState(nomeInit);
  const [colore, setColore] = React.useState(brandColor ?? '#0c2d57');
  const [logo, setLogo] = React.useState(logoUrl ?? '');
  const [inbound, setInbound] = React.useState(inboundInit ?? '');
  const [tagline, setTagline] = React.useState(landingInit ?? '');

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Branding tenant
        </h2>
        <div>
          <Label htmlFor="b_nome">Nome</Label>
          <Input
            id="b_nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1.5 h-10"
          />
        </div>
        <div>
          <Label htmlFor="b_colore">Colore brand</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="b_colore"
              type="color"
              value={colore}
              onChange={(e) => setColore(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded-md border border-border"
            />
            <Input
              value={colore}
              onChange={(e) => setColore(e.target.value)}
              className="h-10 font-mono"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="b_logo">Logo URL</Label>
          <Input
            id="b_logo"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            className="mt-1.5 h-10"
            placeholder="https://…/logo.png"
          />
        </div>
        <div>
          <Label htmlFor="b_inbound">Email inbound ticket</Label>
          <Input
            id="b_inbound"
            value={inbound}
            onChange={(e) => setInbound(e.target.value)}
            className="mt-1.5 h-10"
            type="email"
          />
        </div>

        {/* ── Landing pubblica QR ──────────────────────────────────────── */}
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Landing pubblica QR
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pagina mostrata a chi inquadra il QR di un cantiere senza essere un
            tecnico. È identica per ogni cantiere: il nome azienda e il nome
            cantiere si compilano da soli. Qui personalizzi solo il sottotitolo.
          </p>
          <div>
            <Label htmlFor="b_tagline">Sottotitolo</Label>
            <textarea
              id="b_tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder={LANDING_TAGLINE_DEFAULT}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Lascia vuoto per usare il testo predefinito.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                // inbound_email viene salvato dentro storage_config (non
                // c'è una colonna dedicata su tenants)
                const res = await aggiornaTenant({
                  tenantId,
                  nome,
                  brand_color: colore || null,
                  logo_url: logo || null,
                  landing_tagline: tagline.trim() || null,
                });
                if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
                router.refresh();
              })
            }
          >
            <Save className="h-3.5 w-3.5" />
            Salva branding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
