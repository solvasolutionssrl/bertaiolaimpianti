'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreVertical, Pencil, Plus, Share2 } from 'lucide-react';

import { Portal } from '../../../_components/portal';
import {
  AggiungiTipologieDialog,
  type TipologiaVoce,
  type TipologiaPreset,
} from '../../../../_components/aggiungi-tipologie-dialog';
import { useConfermaCommessaChiusa } from '../../../../_components/conferma-commessa-chiusa';
import { CondividiCommessa } from '../../../../_components/condividi-commessa';
import type { LinkPubblicoVista } from '../../../../_actions/link-pubblico';

interface Props {
  commessaId: string;
  vociPresenti: number[];
  voci: TipologiaVoce[];
  presets: TipologiaPreset[];
  /** Se la commessa e' chiusa, aggiungere tipologie chiede conferma. */
  statoCommessa?: string | null;
  nomeCommessa?: string | null;
  /** Il link pubblico attivo, se c'e'. Senza token: non si rilegge. */
  linkPubblico: LinkPubblicoVista | null;
  /** Il testo che chi riceve il collegamento leggerebbe, coi dettagli accesi. */
  dettagliTesto: string | null;
  /** L'origine con cui si compone l'indirizzo pubblico, letta dal server. */
  origine: string;
}

/**
 * Menu "⋯" di gestione nell'hero commessa (admin/office): raccoglie le azioni
 * secondarie — Modifica, Aggiungi tipologie, Condividi il lavoro — che prima
 * stavano sparse nel corpo dell'hero. Portalizzato su body perché l'Hero ha
 * `overflow-hidden`.
 *
 * ⚠️ **Nel menu stanno i tasti, non lo stato.** Il menu si smonta al tocco:
 * ogni dialog che si apre da qui va montato fuori e comandato con una coppia
 * `open`/`onOpenChange`, come fanno tipologie e condivisione qui sotto.
 */
export function HeroGestione({
  commessaId,
  vociPresenti,
  voci,
  presets,
  statoCommessa,
  nomeCommessa,
  linkPubblico,
  dettagliTesto,
  origine,
}: Props) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [tipOpen, setTipOpen] = React.useState(false);
  const [condividiOpen, setCondividiOpen] = React.useState(false);
  // Il dialog qui e' controllato da noi: la conferma la chiede chi apre.
  const chiediConferma = useConfermaCommessaChiusa(statoCommessa, nomeCommessa);
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
                onClick={async () => {
                  setMenuOpen(false);
                  if (await chiediConferma()) setTipOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted active:bg-muted"
              >
                <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Aggiungi tipologie
              </button>
              {/* Condividere e' l'unico gesto che fa uscire un dato dal
                  perimetro degli account: sta qui, con le altre azioni
                  secondarie, e non come tasto sempre a vista. */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setCondividiOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted active:bg-muted"
              >
                <Share2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Condividi il lavoro
                {linkPubblico ? (
                  <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                ) : null}
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

      {/* ⚠️ Sempre montato, e FUORI dal Portal del menu. Dentro non funzionava
          per nessuno: la voce chiudeva il menu e apriva il dialog nello stesso
          gesto, React 18 batcha i due aggiornamenti, il Portal si smontava e
          portava con se' il componente — con lo stato «aperto» appena scritto.
          Un componente con stato dentro un contenitore che si smonta al click
          perde lo stato nello stesso istante in cui lo imposta. Il tasto sta
          nel menu, lo stato sta qui. Vale per qualunque cosa si aggiunga a quel
          menu. */}
      <CondividiCommessa
        commessaId={commessaId}
        linkAttivo={linkPubblico}
        dettagliTesto={dettagliTesto}
        origine={origine}
        aperto={condividiOpen}
        onApertoChange={setCondividiOpen}
        renderTrigger={false}
      />
    </>
  );
}
