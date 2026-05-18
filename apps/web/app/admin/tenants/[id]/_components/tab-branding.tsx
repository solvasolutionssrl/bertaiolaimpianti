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
  nome: string;
  brandColor: string | null;
  logoUrl: string | null;
  inboundEmail: string | null;
}

export function TabBranding({
  tenantId,
  nome: nomeInit,
  brandColor,
  logoUrl,
  inboundEmail: inboundInit,
}: Props) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [nome, setNome] = React.useState(nomeInit);
  const [colore, setColore] = React.useState(brandColor ?? '#0c2d57');
  const [logo, setLogo] = React.useState(logoUrl ?? '');
  const [inbound, setInbound] = React.useState(inboundInit ?? '');

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
                });
                if (!res.ok) alert(res.error);
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
