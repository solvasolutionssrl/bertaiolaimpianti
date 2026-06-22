'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { associaSedeCantiere, dissociaSedeCantiere } from '@/app/office/_actions/kantiere-sedi';

// ── Tipi ──────────────────────────────────────────────────────────────────────

type TipoSede = 'sede_principale' | 'sede_secondaria' | 'hotel' | 'altro';

const TIPO_LABEL: Record<TipoSede, string> = {
  sede_principale: 'Sede principale',
  sede_secondaria: 'Sede secondaria',
  hotel: 'Hotel',
  altro: 'Altro',
};

export interface SedeTenantOption {
  id: string;
  nome: string;
  tipo: TipoSede;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CantiereSedeProps {
  /** UUID del cantiere a cui si associano le sedi. */
  cantiereId: string;
  /** Tutte le sedi del tenant (caricate dalla pagina parent). */
  sediTenant: SedeTenantOption[];
  /** Array di sede_id gia associati a questo cantiere. */
  sediAssociate: string[];
}

// ── Componente ────────────────────────────────────────────────────────────────

/**
 * Panel riusabile per gestire le sedi di partenza/arrivo di un cantiere.
 *
 * Uso:
 * ```tsx
 * <CantiereSediPanel
 *   cantiereId={cantiere.id}
 *   sediTenant={sediTenant}
 *   sediAssociate={sediAssociate}
 * />
 * ```
 *
 * Props:
 * - `cantiereId` — UUID del cantiere
 * - `sediTenant` — lista `{id, nome, tipo}` di tutte le sedi del tenant
 * - `sediAssociate` — array di `sede_id` gia associati a questo cantiere
 *
 * Il componente non richiede alcun wiraggio in questa pagina: lo farai tu
 * nella pagina dettaglio cantiere. Chiama `associaSedeCantiere` /
 * `dissociaSedeCantiere` e poi `router.refresh()`.
 */
export function CantiereSediPanel({ cantiereId, sediTenant, sediAssociate }: CantiereSedeProps) {
  const router = useRouter();
  // Set locale per gestire lo stato ottimistico in attesa del refresh
  const [associateSet, setAssociateSet] = React.useState<Set<string>>(
    () => new Set(sediAssociate),
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [errori, setErrori] = React.useState<Record<string, string>>({});

  // Sincronizza il set locale se le props cambiano (es. dopo router.refresh)
  React.useEffect(() => {
    setAssociateSet(new Set(sediAssociate));
  }, [sediAssociate]);

  async function handleToggle(sedeId: string, attualmenteAssociata: boolean) {
    setBusyId(sedeId);
    setErrori((prev) => {
      const next = { ...prev };
      delete next[sedeId];
      return next;
    });

    // Aggiornamento ottimistico
    setAssociateSet((prev) => {
      const next = new Set(prev);
      if (attualmenteAssociata) next.delete(sedeId);
      else next.add(sedeId);
      return next;
    });

    try {
      const action = attualmenteAssociata ? dissociaSedeCantiere : associaSedeCantiere;
      const res = await action({ cantiereId, sedeId });
      if (!res.ok) {
        // Rollback ottimistico
        setAssociateSet((prev) => {
          const next = new Set(prev);
          if (attualmenteAssociata) next.add(sedeId);
          else next.delete(sedeId);
          return next;
        });
        setErrori((prev) => ({ ...prev, [sedeId]: res.error }));
      } else {
        router.refresh();
      }
    } catch (e) {
      // Rollback ottimistico
      setAssociateSet((prev) => {
        const next = new Set(prev);
        if (attualmenteAssociata) next.add(sedeId);
        else next.delete(sedeId);
        return next;
      });
      setErrori((prev) => ({ ...prev, [sedeId]: (e as Error).message }));
    } finally {
      setBusyId(null);
    }
  }

  if (sediTenant.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <h3 className="text-sm font-semibold">Sedi specifiche di questo cantiere</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Nessuna sede in anagrafica. Aggiungi le sedi di partenza (sede aziendale,
          hotel della zona, depositi) in{' '}
          <a href="/office/kantiere/sedi" className="font-medium text-primary underline-offset-2 hover:underline">
            Kantiere · Sedi
          </a>
          , poi torna qui per collegarle al cantiere.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Sedi specifiche di questo cantiere</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Spunta le sedi (es. hotel della zona, depositi) da cui i tecnici possono
            partire per <strong className="font-medium text-foreground">questo</strong> cantiere.
            Compaiono nella scelta &ldquo;Da dove sei partito?&rdquo; alla timbratura,
            insieme alla sede predefinita.
          </p>
        </div>
        <a
          href="/office/kantiere/sedi"
          className="shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Gestisci sedi
        </a>
      </div>
      <ul className="space-y-2">
        {sediTenant.map((sede) => {
          const associata = associateSet.has(sede.id);
          const isBusy = busyId === sede.id;
          const errore = errori[sede.id];
          return (
            <li key={sede.id} className="flex flex-col gap-0.5">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={associata}
                  disabled={isBusy}
                  onChange={() => handleToggle(sede.id, associata)}
                  className="h-4 w-4 rounded border-input accent-primary disabled:opacity-50"
                />
                <span className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className={isBusy ? 'text-muted-foreground' : ''}>{sede.nome}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {TIPO_LABEL[sede.tipo]}
                  </span>
                </span>
              </label>
              {errore && (
                <p className="ml-6 text-xs text-destructive">{errore}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
