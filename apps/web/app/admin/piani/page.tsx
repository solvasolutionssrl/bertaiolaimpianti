import { Layers } from 'lucide-react';
import { Card, CardContent } from '@impiantixplus/ui';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { PianiTable } from './_components/piani-table';

export const metadata = { title: 'Platform · Piani' };
export const dynamic = 'force-dynamic';

export default async function PianiPage() {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from('plans')
    .select('id, code, nome, descrizione, prezzo_mensile_eur, max_utenti, max_commesse_anno, max_storage_gb, max_tickets_mese, attivo, ordine')
    .order('ordine');

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Piani commerciali"
        description="Limiti di default usati da tutti i tenant senza override."
        icon={<Layers />}
      />
      <Card>
        <CardContent className="p-0">
          <PianiTable
            plans={(data ?? []).map((p: any) => ({
              ...p,
              prezzo_mensile_eur: Number(p.prezzo_mensile_eur),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
