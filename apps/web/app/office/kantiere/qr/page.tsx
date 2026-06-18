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
  scansioni: number;
  ultimaScansione: string | null;
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

type TimbraturaScan = {
  commessa_id: string;
  ts: string;
};

type ScansMap = Record<string, { scansioni: number; ultima: string | null }>;

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

  const { data: timbrature } = (await supabase
    .from('timbrature' as never)
    .select('commessa_id, ts')
    .eq('tenant_id', ctx.tenantId)) as { data: TimbraturaScan[] | null };

  const qrMap = new Map<string, QrRow>();
  for (const row of qrRows ?? []) {
    qrMap.set(row.commessa_id, row);
  }

  // Build scans map: { commessa_id -> { scansioni, ultima } }
  const scansMap: ScansMap = {};
  for (const t of timbrature ?? []) {
    const cid = t.commessa_id;
    if (!cid) continue;
    const existing = scansMap[cid];
    if (!existing) {
      scansMap[cid] = { scansioni: 1, ultima: t.ts };
    } else {
      existing.scansioni += 1;
      if (t.ts > (existing.ultima ?? '')) {
        existing.ultima = t.ts;
      }
    }
  }

  const righe: QrRiga[] = (commesse ?? []).map((c) => {
    const qr = qrMap.get(c.id) ?? null;
    const scans = scansMap[c.id];
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
      scansioni: scans?.scansioni ?? 0,
      ultimaScansione: scans?.ultima ?? null,
    };
  });

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">QR code</h1>
        <p className="text-sm text-muted-foreground">
          Genera e stampa i QR di timbratura. Ogni QR è permanente: ristamparlo non lo cambia.
        </p>
      </header>
      <QrClient righe={righe} />
    </div>
  );
}
