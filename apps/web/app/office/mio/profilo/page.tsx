import Link from 'next/link';
import { KeyRound, Smartphone } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { createServerSupabase } from '@kommessa/api/server';
import { etichettaRuolo } from '@kommessa/api/identita';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { Intestazione } from '../_components/intestazione';
import { mioDipendente } from '../_lib/me';

export const dynamic = 'force-dynamic';

/** Il profilo del tecnico da computer: chi sono, la password, dove arrivano gli avvisi. */
export default async function ProfiloMioPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const [{ data: uRaw }, me] = await Promise.all([
    supabase.from('users').select('display_name, role').eq('id', ctx.userId).maybeSingle(),
    mioDipendente(supabase, ctx.tenantId, ctx.userId),
  ]);
  const u = uRaw as { display_name: string | null; role: string | null } | null;
  return (
    <>
      <Intestazione titolo="Profilo" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{u?.display_name ?? ctx.email}</p>
            <p className="text-muted-foreground">{ctx.email}</p>
            <p className="text-muted-foreground">{etichettaRuolo(u?.role ?? ctx.role)}</p>
            {me ? (
              <p className="text-muted-foreground">
                Scheda dipendente: {me.nome} {me.cognome} · {me.modalita === 'ufficio' ? 'in sede' : 'in cantiere'}
              </p>
            ) : (
              <p className="text-muted-foreground">Nessuna scheda dipendente collegata.</p>
            )}
            <div className="pt-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/cambia-password">
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Cambia password
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Notifiche</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Gli avvisi sul telefono si attivano dall’app installata, in Profilo › Notifiche. Da computer gli avvisi si leggono nella pagina Avvisi.
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/office/notifiche">Apri gli avvisi</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
