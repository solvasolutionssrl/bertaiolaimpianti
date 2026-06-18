import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { CantiereDetailClient } from './_components/cantiere-detail-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function CantiereDetailPage({ params }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // 1. Carica cantiere
  const { data: cantiereRaw } = await supabase
    .from('cantieri' as never)
    .select('id, codice, nome, indirizzo, sede_partenza, commessa_id, stato, note')
    .eq('id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!cantiereRaw) notFound();

  const cantiere = cantiereRaw as {
    id: string;
    codice: string;
    nome: string;
    indirizzo: string | null;
    sede_partenza: string | null;
    commessa_id: string | null;
    stato: 'attivo' | 'sospeso' | 'chiuso';
    note: string | null;
  };

  // 2. Carica squadra
  const { data: squadraRaw } = await supabase
    .from('cantiere_squadra' as never)
    .select('dipendente_id, ruolo')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId);

  const squadraRows = (squadraRaw ?? []) as { dipendente_id: string; ruolo: string }[];
  const squadraIds = squadraRows.map((r) => r.dipendente_id);

  // 3. Carica nomi dipendenti della squadra
  const squadraConNomi: { dipendente_id: string; nome: string; ruolo: string }[] = [];
  if (squadraIds.length > 0) {
    const { data: dipRaw } = await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', squadraIds);
    const dipMap = new Map<string, string>();
    for (const d of (dipRaw ?? []) as { id: string; nome: string; cognome: string }[]) {
      dipMap.set(d.id, `${d.cognome} ${d.nome}`);
    }
    for (const r of squadraRows) {
      squadraConNomi.push({
        dipendente_id: r.dipendente_id,
        nome: dipMap.get(r.dipendente_id) ?? r.dipendente_id,
        ruolo: r.ruolo,
      });
    }
  }

  // 4. Carica tutti i dipendenti attivi del tenant (per il picker, esclusi già in squadra)
  const squadraIdSet = new Set(squadraIds);
  const { data: tuttiDipRaw } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato_attivo', true)
    .order('cognome');

  const dipendentiDisponibili = ((tuttiDipRaw ?? []) as { id: string; nome: string; cognome: string }[])
    .filter((d) => !squadraIdSet.has(d.id))
    .map((d) => ({ id: d.id, nome: `${d.cognome} ${d.nome}` }));

  // 5. QR attivo per questo cantiere
  const { data: qrRaw } = await supabase
    .from('cantiere_qr' as never)
    .select('token, created_at')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)
    .maybeSingle();

  const qrRow = qrRaw as { token: string; created_at: string } | null;

  // 6. Conteggio timbrature
  const { count: scansioni } = await supabase
    .from('timbrature' as never)
    .select('*', { count: 'exact', head: true })
    .eq('cantiere_id', params.id);

  // 7. Commesse disponibili per il link
  const { data: commesseRaw } = await supabase
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('codice_interno');

  const commesse = ((commesseRaw ?? []) as {
    id: string;
    codice_interno: string | null;
    nome_cartella: string | null;
    descrizione_ai_finale: string | null;
    descrizione_ai_proposta: string | null;
    note_iniziali: string | null;
  }[]).map((c) => ({
    id: c.id,
    titolo:
      risolviTitoloCommessa({
        descrizione_ai_finale: c.descrizione_ai_finale,
        descrizione_ai_proposta: c.descrizione_ai_proposta,
        note_iniziali: c.note_iniziali,
        nome_cartella: c.nome_cartella,
        codice_interno: c.codice_interno,
      }) || c.codice_interno || c.id,
  }));

  // 8. Titolo commessa collegata (se presente)
  let commessaCollegata: string | null = null;
  if (cantiere.commessa_id) {
    const found = commesse.find((c) => c.id === cantiere.commessa_id);
    commessaCollegata = found?.titolo ?? null;
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/office/kantiere/cantieri"
            className="hover:text-foreground transition-colors"
          >
            Cantieri
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground font-medium">{cantiere.nome}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">{cantiere.nome}</h1>
          <span className="font-mono text-xs text-muted-foreground">{cantiere.codice}</span>
        </div>
      </header>

      <CantiereDetailClient
        cantiere={{
          id: cantiere.id,
          codice: cantiere.codice,
          nome: cantiere.nome,
          indirizzo: cantiere.indirizzo,
          sedePartenza: cantiere.sede_partenza,
          commessaId: cantiere.commessa_id,
          stato: cantiere.stato,
          note: cantiere.note,
        }}
        squadra={squadraConNomi}
        dipendentiDisponibili={dipendentiDisponibili}
        qr={
          qrRow
            ? {
                token: qrRow.token,
                createdAt: qrRow.created_at,
                scansioni: scansioni ?? 0,
              }
            : null
        }
        commesse={commesse}
        commessaCollegata={commessaCollegata}
      />
    </div>
  );
}
