import { QrCode } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@kommessa/ui';
import { requirePlatformAdmin } from '../_lib/guard';
import { createServiceSupabase } from '@kommessa/api/service';
import { SectionHeader } from '../../_components/section-header';
import { mascheraToken, statoQr } from '@kommessa/api/kantiere-qr';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

export const metadata = { title: 'Platform · QR cantiere' };
export const dynamic = 'force-dynamic';

const fmtData = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatData(iso: string | null | undefined): string {
  if (!iso) return '';
  return fmtData.format(new Date(iso));
}

type StatoQr = 'attivo' | 'revocato' | 'assente';

function StatoBadge({ stato }: { stato: StatoQr }) {
  if (stato === 'attivo') {
    return (
      <Badge variant="outline" className="border-success/30 text-success">
        attivo
      </Badge>
    );
  }
  if (stato === 'revocato') {
    return (
      <Badge variant="destructive">
        revocato
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      assente
    </Badge>
  );
}

export default async function KantiereQrPage() {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  // Fetch QR codes
  const { data: qrRows, error: qrError } = await supabase
    .from('cantiere_qr' as never)
    .select('id, token, attivo, revoked_at, created_at, tenant_id, commessa_id')
    .order('created_at', { ascending: false })
    .limit(500) as { data: Array<{
      id: string;
      token: string;
      attivo: boolean;
      revoked_at: string | null;
      created_at: string;
      tenant_id: string;
      commessa_id: string | null;
    }> | null; error: unknown };

  const rows = qrRows ?? [];

  // Collect unique IDs for batch lookups
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))];
  const commessaIds = [...new Set(rows.map((r) => r.commessa_id).filter(Boolean))] as string[];

  // Batch fetch tenants
  const tenantMap = new Map<string, string>();
  if (tenantIds.length > 0) {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, nome')
      .in('id', tenantIds);
    for (const t of tenants ?? []) {
      tenantMap.set((t as { id: string; nome: string }).id, (t as { id: string; nome: string }).nome);
    }
  }

  // Batch fetch commesse (only columns needed for risolviTitoloCommessa)
  type CommessaRow = {
    id: string;
    descrizione_ai_finale: string | null;
    descrizione_ai_proposta: string | null;
    note_iniziali: string | null;
    nome_cartella: string | null;
    codice_interno: string | null;
  };
  const commessaMap = new Map<string, CommessaRow>();
  if (commessaIds.length > 0) {
    const { data: commesse } = (await supabase
      .from('commesse' as never)
      .select('id, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, nome_cartella, codice_interno')
      .in('id', commessaIds)) as { data: CommessaRow[] | null };
    for (const c of commesse ?? []) {
      commessaMap.set(c.id, c);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="QR cantiere"
        description="Registro globale di tutti i QR code cantiere generati, su ogni tenant."
        icon={<QrCode />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tutti i QR cantiere
            {rows.length > 0 && (
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                ({rows.length}{rows.length === 500 ? ', cap 500' : ''})
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Solo lettura. Per revocare un QR aprire la scheda commessa dal tenant corrispondente.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-10 text-sm text-muted-foreground">
              Nessun QR cantiere generato.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tenant</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Commessa</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Token</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Stato</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Creato</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Revocato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const tenantNome = tenantMap.get(row.tenant_id) ?? row.tenant_id;
                    const commessa = row.commessa_id ? commessaMap.get(row.commessa_id) : null;
                    const commessaTitolo = commessa
                      ? risolviTitoloCommessa(commessa) || row.commessa_id
                      : (row.commessa_id ?? '');
                    const stato = statoQr({ attivo: row.attivo, revoked_at: row.revoked_at });
                    return (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium tracking-tight">{tenantNome}</td>
                        <td className="px-4 py-3 max-w-[220px] truncate text-muted-foreground">
                          {commessaTitolo}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {mascheraToken(row.token)}
                        </td>
                        <td className="px-4 py-3">
                          <StatoBadge stato={stato} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatData(row.created_at)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {row.revoked_at ? formatData(row.revoked_at) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-right font-mono text-[11px] text-muted-foreground">
        Ultimo aggiornamento:{' '}
        {new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
      </p>
    </div>
  );
}
