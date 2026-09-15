import { soloMondoCommesse } from '../../_lib/mondo';

/**
 * Scheda commessa e sotto-pagine (cartella, report, scatto, modifica): mondo
 * commesse. I tenant solo Kantiere tornano alla home dell'app; accesso e
 * assegnazione restano controllati da ogni pagina.
 */
export default async function CommessaMobileLayout({ children }: { children: React.ReactNode }) {
  await soloMondoCommesse();
  return <>{children}</>;
}
