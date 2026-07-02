'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreVertical, Pencil, Plus } from 'lucide-react';

import { Portal } from '../../../_components/portal';
import {
  AggiungiTipologieDialog,
  type TipologiaVoce,
  type TipologiaPreset,
} from '../../../../_components/aggiungi-tipologie-dialog';

interface Props {
  commessaId: string;
  vociPresenti: number[];
  voci: TipologiaVoce[];
  presets: TipologiaPreset[];
}

/**
 * Menu "⋯" di gestione nell'hero commessa (admin/office): raccoglie le azioni
 * secondarie — Modifica e Aggiungi tipologie — che prima stavano sparse nel
 * corpo dell'hero. Portalizzato su body perché l'Hero ha `overflow-hidden`.
 */
export function HeroGestione({ commessaId, vociPresenti, voci, presets }: Props) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [tipOpen, setTipOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);

  const apri = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setMenuOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={apri}
        aria-label="Altre azioni"
        aria-expanded={menuOpen}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground transition-transform hover:bg-primary-foreground/20 active:scale-95"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {menuOpen ? (
        <Portal>
          <div
            className="fixed inset-0 z-[70]"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          >
            <div
              role="menu"
              className="absolute w-56 overflow-hidden rounded-xl border border-border bg-card p-1 text-foreground shadow-xl"
              style={{ top: pos?.top, right: pos?.right }}
              onClick={(e) => e.stopPropagation()}
            >
              <Link
                href={`/mobile/commessa/${commessaId}/modifica`}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted active:bg-muted"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Modifica commessa
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setTipOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted active:bg-muted"
              >
                <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Aggiungi tipologie
              </button>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* Dialog tipologie controllato dal menu: sempre montato, così non si
          smonta chiudendo il menu (apre il proprio sheet su body). */}
      <AggiungiTipologieDialog
        commessaId={commessaId}
        vociPresenti={vociPresenti}
        voci={voci}
        presets={presets}
        variant="sheet"
        open={tipOpen}
        onOpenChange={setTipOpen}
        renderTrigger={false}
      />
    </>
  );
}
