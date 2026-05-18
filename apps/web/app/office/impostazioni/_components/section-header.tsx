import type { ReactNode } from 'react';
import { SectionHeader as GlobalSectionHeader } from '../../../_components/section-header';

/**
 * Wrapper "settings hub" sopra al SectionHeader globale.
 *
 * Mantiene l'API legacy (`title`, `description`, `actions`) usata in
 * tutte le pagine di /office/impostazioni/* per evitare un rinominamento
 * di massa, e applica il bordo inferiore tipico dell'header settings.
 */
export function SectionHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <GlobalSectionHeader
      title={title}
      description={description}
      actions={actions}
      icon={icon}
      separator
    />
  );
}
