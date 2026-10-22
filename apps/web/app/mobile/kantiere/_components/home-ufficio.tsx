import Link from 'next/link';
import { Clock, QrCode } from 'lucide-react';

import { titoloCase } from '@/app/mobile/_lib/display-case';
import type {
  ViaggioRitornoMezzo,
  ViaggioRitornoSede,
} from '@/app/_components/viaggio-ritorno-dialog';
import { IniziaGiornataUfficio } from './inizia-giornata-ufficio';
import { TurnoAzioniUfficio } from './turno-azioni-ufficio';
import type { PickerCantiere } from './cantiere-picker';

/**
 * La giornata di chi lavora in sede.
 *
 * Stessa impalcatura di chi sta in cantiere — stato di oggi, un tasto grande,
 * i collegamenti — ma con le domande girate:
 *
 *  - si comincia scegliendo **su cosa** si lavora, non **da dove** si parte;
 *  - il viaggio non viene chiesto: si dichiara alla chiusura se c'e' stato;
 *  - «Scansiona QR» scende fra i collegamenti. Chi sta alla scrivania non
 *    scansiona un cartello, ma il giorno che va in cantiere lo ritrova.
 *
 * Non e' una pagina a parte: si innesta dove la persona atterra gia', cosi'
 * non ha bisogno di sapere che esiste. Una schermata che si raggiunge solo
 * sapendo l'indirizzo e' una schermata che non esiste.
 */

export interface TurnoApertoUfficio {
  cantiereId: string;
  cantiereNome?: string | null;
  inizioTs: string;
  inPausa: boolean;
  inizioPausaTs: string | null;
}

/**
 * Quello che serve alla card, con i tipi VERI del foglio del viaggio: questi
 * campi gli vengono passati dentro, quindi devono combaciare. Descriverli qui
 * a mano vorrebbe dire scoprire la differenza solo quando qualcuno dichiara un
 * viaggio.
 */
export interface ContestoUfficio {
  pausaOggiFatta?: boolean;
  sedi?: ViaggioRitornoSede[];
  mezzi?: ViaggioRitornoMezzo[];
  sedeDefaultId?: string | null;
  sedeLavoro?: { id: string; nome: string } | null;
  sogliaPausaPranzoOre?: number;
}

export function HomeUfficio({
  nome,
  turno,
  azioni,
  cantieri,
}: {
  nome?: string | null;
  turno: TurnoApertoUfficio | null;
  azioni: ContestoUfficio | null;
  cantieri?: PickerCantiere[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {nome ? (
        <p className="text-sm text-muted-foreground">
          Ciao <span className="font-medium text-foreground">{titoloCase(nome)}</span>
        </p>
      ) : null}

      {turno && azioni ? (
        <TurnoAzioniUfficio
          cantiereId={turno.cantiereId}
          cantiereNome={turno.cantiereNome ?? undefined}
          cantiereHref={`/mobile/kantiere/cantieri/${turno.cantiereId}`}
          inizioTs={turno.inizioTs}
          inPausa={turno.inPausa}
          inizioPausaTs={turno.inizioPausaTs}
          pausaOggiFatta={azioni.pausaOggiFatta}
          sedi={azioni.sedi}
          mezzi={azioni.mezzi}
          sedeDefaultId={azioni.sedeDefaultId}
          sedeLavoro={azioni.sedeLavoro}
          sogliaPausaPranzoOre={azioni.sogliaPausaPranzoOre}
        />
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Stato di oggi
            </p>
            <p className="mt-1 text-lg font-semibold text-muted-foreground">
              Giornata non ancora iniziata
            </p>
          </div>
          <IniziaGiornataUfficio cantieri={cantieri} />
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/mobile/kantiere/ore"
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft transition-transform active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Le mie ore</span>
        </Link>

        {/* Resta raggiungibile: capita di andare in cantiere anche a chi di
            solito non ci va, e quel giorno il cartello va scansionato. */}
        <Link
          href="/mobile/kantiere/scansiona"
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft transition-transform active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <QrCode className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Scansiona QR</span>
        </Link>
      </div>
    </div>
  );
}
