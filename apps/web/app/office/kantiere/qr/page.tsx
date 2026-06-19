import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { mascheraToken } from '@kommessa/api/kantiere-qr';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { QrClient } from './_components/qr-client';

export const dynamic = 'force-dynamic';

// ── Tipi shape DB ────────────────────────────────────────────────────────────

type CommessaRow = {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  created_at: string;
};

type CantiereRow = {
  id: string;
  nome: string;
  codice: string | null;
};

type QrDbRow = {
  id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  token: string;
  attivo: boolean;
  created_at: string;
  revoked_at: string | null;
};

type TimbraturaScan = {
  commessa_id: string | null;
  cantiere_id: string | null;
  ts: string;
};

// ── Tipo pubblico esposto al client ─────────────────────────────────────────

export type QrStorico = {
  id: string;
  targetTipo: 'commessa' | 'cantiere';
  targetId: string;
  targetLabel: string;
  tokenMasked: string;
  createdAt: string;
  revokedAt: string | null;
  attivo: boolean;
  scansioni: number;
};

export type CommessaSenzaQr = {
  id: string;
  titolo: string;
  codice: string | null;
};

export type QrPageData = {
  attivi: QrStorico[];
  storico: QrStorico[];
  commesseSenzaQr: CommessaSenzaQr[];
};

// ── Page ────────────────────────────────────────────────────────────────────

export default async function QrPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // 1. Tutti i QR del tenant (attivi + revocati), ordinati per created_at desc
  const { data: qrRows } = (await supabase
    .from('cantiere_qr' as never)
    .select('id, commessa_id, cantiere_id, token, attivo, created_at, revoked_at')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })) as { data: QrDbRow[] | null };

  const allQr = qrRows ?? [];

  // 2. Raccoglie gli id target per batch-load
  const commessaIds = [...new Set(allQr.map((r) => r.commessa_id).filter((x): x is string => x !== null))];
  const cantiereIds = [...new Set(allQr.map((r) => r.cantiere_id).filter((x): x is string => x !== null))];

  const commessePromise =
    commessaIds.length > 0
      ? supabase
          .from('commesse' as never)
          .select(
            'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, created_at',
          )
          .eq('tenant_id', ctx.tenantId)
          .in('id', commessaIds)
      : Promise.resolve({ data: [] });

  const cantieriPromise =
    cantiereIds.length > 0
      ? supabase
          .from('cantieri' as never)
          .select('id, nome, codice')
          .eq('tenant_id', ctx.tenantId)
          .in('id', cantiereIds)
      : Promise.resolve({ data: [] });

  // 3. Tutte le commesse del tenant (per la sezione "genera per commessa")
  const allCommessePromise = supabase
    .from('commesse' as never)
    .select(
      'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, created_at',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });

  // 4. Timbrature (per conteggio scansioni)
  const timbraturePromise = supabase
    .from('timbrature' as never)
    .select('commessa_id, cantiere_id, ts')
    .eq('tenant_id', ctx.tenantId);

  const [{ data: commesseRaw }, { data: cantieriRaw }, { data: allCommesseRaw }, { data: timbratureRaw }] =
    await Promise.all([commessePromise, cantieriPromise, allCommessePromise, timbraturePromise]);

  const commesse = (commesseRaw ?? []) as CommessaRow[];
  const cantieri = (cantieriRaw ?? []) as CantiereRow[];
  const allCommesse = (allCommesseRaw ?? []) as CommessaRow[];
  const timbrature = (timbratureRaw ?? []) as TimbraturaScan[];

  // 5. Lookup maps
  const commesseMap = new Map<string, CommessaRow>(commesse.map((c) => [c.id, c]));
  const cantieriMap = new Map<string, CantiereRow>(cantieri.map((c) => [c.id, c]));

  // 6. Scan count per target
  type ScansEntry = { scansioni: number };
  const scansCommessa: Record<string, ScansEntry> = {};
  const scansCantiere: Record<string, ScansEntry> = {};
  for (const t of timbrature) {
    if (t.commessa_id) {
      const e = scansCommessa[t.commessa_id];
      if (e) e.scansioni += 1;
      else scansCommessa[t.commessa_id] = { scansioni: 1 };
    }
    if (t.cantiere_id) {
      const e = scansCantiere[t.cantiere_id];
      if (e) e.scansioni += 1;
      else scansCantiere[t.cantiere_id] = { scansioni: 1 };
    }
  }

  // 7. Risolvi label e costruisci righe storico
  function risolviLabel(row: QrDbRow): { tipo: 'commessa' | 'cantiere'; id: string; label: string } | null {
    if (row.cantiere_id) {
      const c = cantieriMap.get(row.cantiere_id);
      if (!c) return null;
      return { tipo: 'cantiere', id: row.cantiere_id, label: c.nome };
    }
    if (row.commessa_id) {
      const c = commesseMap.get(row.commessa_id);
      if (!c) return null;
      const label =
        risolviTitoloCommessa({
          descrizione_ai_finale: c.descrizione_ai_finale,
          descrizione_ai_proposta: c.descrizione_ai_proposta,
          note_iniziali: c.note_iniziali,
          nome_cartella: c.nome_cartella,
          codice_interno: c.codice_interno,
        }) || c.codice_interno || c.id;
      return { tipo: 'commessa', id: row.commessa_id, label };
    }
    return null;
  }

  const attivi: QrStorico[] = [];
  const storico: QrStorico[] = [];

  for (const row of allQr) {
    const target = risolviLabel(row);
    if (!target) continue;
    const scansioni =
      target.tipo === 'commessa'
        ? (scansCommessa[target.id]?.scansioni ?? 0)
        : (scansCantiere[target.id]?.scansioni ?? 0);

    const item: QrStorico = {
      id: row.id,
      targetTipo: target.tipo,
      targetId: target.id,
      targetLabel: target.label,
      tokenMasked: mascheraToken(row.token),
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      attivo: row.attivo,
      scansioni,
    };

    if (row.attivo) attivi.push(item);
    else storico.push(item);
  }

  // 8. Commesse senza QR attivo (per sezione "genera")
  const commesseConQrAttivo = new Set(
    attivi.filter((r) => r.targetTipo === 'commessa').map((r) => r.targetId),
  );
  const commesseSenzaQr: CommessaSenzaQr[] = allCommesse
    .filter((c) => !commesseConQrAttivo.has(c.id))
    .map((c) => ({
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
    }));

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">QR code</h1>
        <p className="text-sm text-muted-foreground">
          Genera e stampa i QR di timbratura. Ogni QR è permanente: ristamparlo non lo cambia.
        </p>
      </header>
      <QrClient attivi={attivi} storico={storico} commesseSenzaQr={commesseSenzaQr} />
    </div>
  );
}
