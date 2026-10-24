import { ScheletroCard, ScheletroTabella } from '@/app/office/_components/scheletri';

export default function Loading() {
  return (
    <div className="space-y-4">
      <ScheletroCard />
      <ScheletroTabella righe={6} />
    </div>
  );
}
