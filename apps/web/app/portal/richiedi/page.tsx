import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@impiantixplus/ui';
import { createServerSupabase } from '@impiantixplus/api/server';

import { requirePortalContext } from '../_lib/portal-context';
import { RichiediForm } from './richiedi-form';

export const metadata: Metadata = {
  title: 'Richiedi intervento',
};

export default async function RichiediPage() {
  const ctx = await requirePortalContext();
  const supabase = createServerSupabase();

  // Carico le commesse attive per il select opzionale "Riferimento commessa"
  const { data: commesse } = await supabase
    .from('commesse')
    .select('id, codice_interno, nome_cartella, stato')
    .eq('cliente_id', ctx.clienteId)
    .in('stato', ['aperta', 'in_corso', 'collaudo'])
    .order('data_apertura', { ascending: false })
    .returns<{ id: string; codice_interno: string; nome_cartella: string; stato: string }[]>();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alle commesse
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Richiedi un intervento</CardTitle>
          <CardDescription>
            Spiega cosa ti serve: l&apos;ufficio riceverà subito la
            segnalazione, ti contatterà via email e potrai seguire la
            risposta da qui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RichiediForm commesse={commesse ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
