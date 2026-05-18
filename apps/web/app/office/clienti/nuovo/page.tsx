import { ClienteForm } from '../_components/form';

export const metadata = { title: 'Nuovo cliente' };

export default function NuovoClientePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nuovo cliente</h1>
      </header>
      <ClienteForm />
    </div>
  );
}
