import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { statoQr } from '@kommessa/api/kantiere-qr';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { QrClient } from './_components/qr-client';

export const dynamic = 'force-dynamic';

export type QrRiga = {
  id: string;
  titolo: string;
  codice: string | null;
  stato: 'assente' | 'attivo' | 'revocato';
  createdAt: string | null;
};

type CommessaRow = {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  created_at: string;
};

type QrRow = {
  commessa_id: string;
  attivo: boolean;
  revoked_at: string | null;
  created_at: string;
};

export default async function QrPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const { data: commesse } = (await supabase
    .from('commesse' as never)
    .select(
      'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, created_at',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })) as { data: CommessaRow[] | null };

  const { data: qrRows } = (await supabase
    .from('cantiere_qr' as never)
    .select('commessa_id, attivo, revoked_at, created_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)) as { data: QrRow[] | null };

  const qrMap = new Map<string, QrRow>();
  for (const row of qrRows ?? []) {
    qrMap.set(row.commessa_id, row);
  }

  const righe: QrRiga[] = (commesse ?? []).map((c) => {
    const qr = qrMap.get(c.id) ?? null;
    return {
      id: c.id,
      titolo:
        risolviTitoloCommessa({
          descrizione_ai_finale: c.descrizione_ai_finale,
          descrizione_ai_proposta: c.descrizione_ai_proposta,
          note_iniziali: c.note_iniziali,
          nome_cartella: c.nome_cartella,
          codice_interno: c.codice_interno,
        }) || c.codice_interno || c.id,
      codice: c.codice_interno,
      stato: statoQr(qr),
      createdAt: qr?.created_at ?? null,
    };
  });

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">QR cantiere</h1>
        <p className="text-sm text-muted-foreground">
          Genera e gestisci i codici QR di accesso per ogni commessa.
        </p>
      </header>
      <QrClient righe={righe} />
    </div>
  );
}
