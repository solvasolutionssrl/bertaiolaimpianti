import { UserCog } from 'lucide-react';
import { Card, CardContent, Badge } from '@impiantixplus/ui';
import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { CambioPasswordForm } from './_components/cambio-password-form';

export const metadata = { title: 'Platform · Profilo' };
export const dynamic = 'force-dynamic';

export default async function ProfiloPage() {
  const ctx = await requirePlatformAdmin();

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Profilo admin"
        description="Identità SOLVA e impostazioni di sicurezza."
        icon={<UserCog />}
      />
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Email
            </p>
            <p className="font-mono text-sm">{ctx.email}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Ruolo
            </p>
            <Badge className="border-transparent bg-accent text-accent-foreground">
              PLATFORM ADMIN
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              MFA
            </p>
            <Badge variant="outline">In arrivo</Badge>
          </div>
        </CardContent>
      </Card>
      <CambioPasswordForm />
    </div>
  );
}
