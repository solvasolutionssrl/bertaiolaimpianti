import { UserRoundX } from 'lucide-react';

/** Quando chi guarda non ha una scheda dipendente: niente da mostrare, e si dice perche'. */
export function SenzaScheda() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <UserRoundX className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Il profilo non è collegato a una scheda dipendente.</p>
      <p className="mt-1 text-sm text-muted-foreground">Ore, cantieri e spese compaiono dopo il collegamento, che fa l’ufficio.</p>
    </div>
  );
}
