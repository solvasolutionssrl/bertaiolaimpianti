import { soloMondoCommesse } from '../../_lib/mondo';

/**
 * La scheda di una richiesta arrivata al telefono: mondo commesse. I tenant
 * solo Kantiere tornano alla home dell'app; chi può vederla lo decide la
 * pagina.
 */
export default async function RichiestaMobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await soloMondoCommesse();
  return <>{children}</>;
}
