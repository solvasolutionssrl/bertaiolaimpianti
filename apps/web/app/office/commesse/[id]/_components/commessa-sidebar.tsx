import {
  Calendar,
  Folder,
  MapPin,
  User,
} from 'lucide-react';
import { Card, CardContent } from '@kommessa/ui';
import type { StatoCommessa } from '@kommessa/api/types';

import { StatoPicker } from './stato-picker';
import { TecniciPanel, type TecnicoAssegnato } from './tecnici-panel';
import { fmtData } from '../../../_lib/format';

interface Props {
  commessaId: string;
  stato: StatoCommessa;
  isCritica: boolean;
  nomeCartella: string;
  cloudFolderPath: string | null;
  indirizzoCantiere: string | null;
  responsabileNome: string | null;
  dataApertura: string | null;
  tecniciAssegnati: TecnicoAssegnato[];
  tecniciTenant: Array<{ id: string; display_name: string | null }>;
  canManageTecnici: boolean;
}

/**
 * Sidebar destra desktop per la pagina commessa: gestione stato +
 * tecnici + metadati commessa in un solo posto, sticky.
 *
 * Su mobile (< lg) si trasforma in una colonna che cade sopra il
 * contenuto principale — già responsive senza media query custom
 * grazie al wrapper grid del layout.
 */
export function CommessaSidebar({
  commessaId,
  stato,
  isCritica,
  nomeCartella,
  cloudFolderPath,
  indirizzoCantiere,
  responsabileNome,
  dataApertura,
  tecniciAssegnati,
  tecniciTenant,
  canManageTecnici,
}: Props) {
  const assegnata = tecniciAssegnati.length > 0;

  return (
    <aside className="space-y-3 lg:sticky lg:top-4">
      {/* Card stato */}
      <Card>
        <CardContent className="py-4">
          <StatoPicker
            commessaId={commessaId}
            currentStato={stato}
            isCritica={isCritica}
            assegnata={assegnata}
          />
        </CardContent>
      </Card>

      {/* Card tecnici */}
      <TecniciPanel
        commessaId={commessaId}
        assigned={tecniciAssegnati}
        available={tecniciTenant}
        canManage={canManageTecnici}
      />

      {/* Card meta info — non azionabili, riferimento veloce */}
      <Card>
        <CardContent className="space-y-2.5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Riferimenti
          </p>
          {dataApertura ? (
            <MetaRow icon={<Calendar />} label="Aperta il">
              {fmtData(dataApertura)}
            </MetaRow>
          ) : null}
          {responsabileNome ? (
            <MetaRow icon={<User />} label="Responsabile">
              {responsabileNome}
            </MetaRow>
          ) : null}
          {indirizzoCantiere ? (
            <MetaRow icon={<MapPin />} label="Cantiere">
              <span className="line-clamp-2">{indirizzoCantiere}</span>
            </MetaRow>
          ) : null}
          <MetaRow icon={<Folder />} label="Cartella">
            <code className="block truncate font-mono text-[11px]" title={nomeCartella}>{nomeCartella}</code>
          </MetaRow>
          {cloudFolderPath ? (
            <MetaRow icon={<Folder />} label="Path cloud">
              <code className="block truncate font-mono text-[10px] text-muted-foreground" title={cloudFolderPath}>
                {cloudFolderPath}
              </code>
            </MetaRow>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/80">
        <span className="[&_svg]:h-2.5 [&_svg]:w-2.5">{icon}</span>
        {label}
      </p>
      <div className="text-xs text-foreground">{children}</div>
    </div>
  );
}
