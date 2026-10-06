import { Link2 } from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';

import { createServiceSupabase } from '@kommessa/api/service';
import { etichettaStatoLink, giorniRimasti, statoLink } from '@kommessa/api/link-pubblico';

import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';

export const metadata = { title: 'Platform · Link pubblici' };
export const dynamic = 'force-dynamic';

/**
 * Tutti i link pubblici di tutti i clienti, in una pagina sola.
 *
 * È l'unico punto dell'app in cui un dato esce dal perimetro degli account, e
 * per questo va guardato da fuori: quanti ne sono vivi, chi li ha fatti, quante
 * volte sono stati aperti, e soprattutto **quali mostrano anche i dettagli del
 * lavoro** — cioè la dettatura del capo, che può contenere nomi e telefoni.
 *
 * ⚠️ Il token non compare, perché non esiste da nessuna parte: in tabella c'è
 * solo lo SHA-256. Nemmeno un super admin può rileggere un indirizzo già
 * creato, e va bene così — questa pagina serve a sorvegliare, non ad aprire.
 */

interface Riga {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  aperture: number;
  ultima_apertura_at: string | null;
  mostra_dettagli: boolean;
  tenant: { nome: string } | { nome: string }[] | null;
  commessa: { codice_interno: string } | { codice_interno: string }[] | null;
  autore: { display_name: string | null } | { display_name: string | null }[] | null;
}

const uno = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

function quando(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function LinkPubbliciPage() {
  await requirePlatformAdmin();
  const service = createServiceSupabase();

  const { data } = await service
    .from('commessa_link_pubblici' as never)
    .select(
      `id, created_at, expires_at, revoked_at, aperture, ultima_apertura_at, mostra_dettagli,
       tenant:tenants ( nome ),
       commessa:commesse ( codice_interno ),
       autore:users!commessa_link_pubblici_created_by_fkey ( display_name )`,
    )
    .order('created_at', { ascending: false })
    .limit(200);

  const righe = (data ?? []) as unknown as Riga[];
  const adesso = new Date();
  const attivi = righe.filter(
    (r) => statoLink({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, adesso) === 'attivo',
  );
  const conDettagli = attivi.filter((r) => r.mostra_dettagli);
  const aperture = attivi.reduce((n, r) => n + r.aperture, 0);

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={<Link2 className="h-5 w-5" />}
        title="Link pubblici"
        description="Commesse condivise fuori dagli account: foto e video visibili a chi ha l’indirizzo."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Attivi adesso" valore={String(attivi.length)} />
        <Kpi
          label="Mostrano i dettagli"
          valore={String(conDettagli.length)}
          avviso={conDettagli.length > 0}
        />
        <Kpi label="Aperture (attivi)" valore={String(aperture)} />
        <Kpi label="Totale creati" valore={String(righe.length)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Commessa</th>
                  <th className="px-3 py-2">Stato</th>
                  <th className="px-3 py-2">Dettagli</th>
                  <th className="px-3 py-2 text-right">Aperture</th>
                  <th className="px-3 py-2">Ultima apertura</th>
                  <th className="px-3 py-2">Creato</th>
                  <th className="px-3 py-2">Da</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {righe.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Nessun link pubblico è mai stato creato.
                    </td>
                  </tr>
                ) : (
                  righe.map((r) => {
                    const stato = statoLink(
                      { expiresAt: r.expires_at, revokedAt: r.revoked_at },
                      adesso,
                    );
                    const giorni = giorniRimasti({ expiresAt: r.expires_at }, adesso);
                    return (
                      <tr key={r.id} className={stato === 'attivo' ? '' : 'opacity-55'}>
                        <td className="px-3 py-2">{uno(r.tenant)?.nome ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {uno(r.commessa)?.codice_interno ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className={
                              stato === 'attivo'
                                ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                                : ''
                            }
                          >
                            {etichettaStatoLink(stato)}
                            {stato === 'attivo' ? ` · ${giorni}gg` : ''}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {r.mostra_dettagli ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 text-amber-700 dark:text-amber-400"
                            >
                              Visibili
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {r.aperture}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {quando(r.ultima_apertura_at)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {quando(r.created_at)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {uno(r.autore)?.display_name ?? '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        L’indirizzo di un link non è rileggibile da nessuno, nemmeno da qui: in
        archivio c’è solo la sua impronta. Per ricondividere se ne genera uno
        nuovo dalla scheda della commessa, e il precedente si spegne.
      </p>
    </div>
  );
}

function Kpi({
  label,
  valore,
  avviso,
}: {
  label: string;
  valore: string;
  avviso?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={
            avviso
              ? 'mt-0.5 text-2xl font-semibold text-amber-600 dark:text-amber-400'
              : 'mt-0.5 text-2xl font-semibold'
          }
        >
          {valore}
        </p>
      </CardContent>
    </Card>
  );
}
