import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';

export const metadata = { title: 'SOLVA · Bozze' };
export const dynamic = 'force-dynamic';

const FMT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

interface Payload {
  descrizioneFinale?: string;
  noteIniziali?: string;
  clienteNew?: { ragione_sociale?: string };
  _clienteLabel?: string;
}

function titolo(p: Payload | null): string {
  if (!p) return 'Bozza senza titolo';
  const d = p.descrizioneFinale?.trim();
  if (d) return d;
  const c = p.clienteNew?.ragione_sociale?.trim() || p._clienteLabel?.trim();
  if (c) return c;
  const n = p.noteIniziali?.trim();
  if (n) return n.length > 60 ? `${n.slice(0, 57)}…` : n;
  return 'Bozza senza titolo';
}

/**
 * Vista super admin: bozze ATTIVE di tutti i tenant (sola lettura).
 * Pensata per supporto/debug — l'autore le gestisce dalla propria app.
 * Usa service-role (cross-tenant); la RLS author-scoped non si applica.
 */
export default async function AdminBozzePage() {
  await requirePlatformAdmin();
  const service = createServiceSupabase();

  const { data: raw } = await service
    .from('commessa_bozze' as never)
    .select(
      'id, numero_bozza, payload, stato, created_at, updated_at, tenant:tenant_id(slug), autore:created_by(display_name, email)',
    )
    .eq('stato' as never, 'attiva')
    .order('updated_at', { ascending: false })
    .limit(200);

  const rows =
    (raw as unknown as Array<{
      id: string;
      numero_bozza: number | null;
      payload: Payload | null;
      created_at: string;
      updated_at: string;
      tenant: { slug: string } | { slug: string }[] | null;
      autore:
        | { display_name: string | null; email: string | null }
        | { display_name: string | null; email: string | null }[]
        | null;
    }>) ?? [];

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-orange-400/80">
          Platform
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Bozze attive</h1>
        <p className="mt-1 text-sm text-white/50">
          Bozze di commessa non ancora finalizzate, di tutti i tenant. Sola
          lettura: la gestione è dell&apos;autore. {rows.length} attive.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/50">
          Nessuna bozza attiva.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-3 py-2 font-medium">Tenant</th>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Titolo</th>
                <th className="px-3 py-2 font-medium">Autore</th>
                <th className="px-3 py-2 font-medium">Aggiornata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => {
                const tenant = one(r.tenant);
                const autore = one(r.autore);
                return (
                  <tr key={r.id} className="text-white/80">
                    <td className="px-3 py-2 font-mono text-xs uppercase text-orange-300/90">
                      {tenant?.slug ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-white/50">
                      {r.numero_bozza ?? '—'}
                    </td>
                    <td className="px-3 py-2">{titolo(r.payload)}</td>
                    <td className="px-3 py-2 text-xs text-white/60">
                      {autore?.display_name || autore?.email || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-white/50">
                      {FMT.format(new Date(r.updated_at))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
