'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area,
  PieChart,
  Pie,
} from 'recharts';

/**
 * Grafici office Kantiere (client). Ricevono solo dati serializzabili (array di
 * oggetti semplici): nessuna funzione passata da Server Component. Palette
 * allineata al brand (blu primario + ambra + emerald).
 */

const C = {
  blue: '#1340A6',
  blueSoft: '#3B82F6',
  amber: '#D97706',
  emerald: '#059669',
  slate: '#94A3B8',
  ink: '#334155',
  grid: '#E2E8F0',
};

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #E2E8F0',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '6px 10px',
};

function Vuoto({ testo }: { testo: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{testo}</p>;
}

/** Barre orizzontali: presenze per cantiere (o simili "nome → valore"). */
export function BarsOrizzontali({
  data,
  unita = '',
  colore = C.blue,
}: {
  data: { nome: string; valore: number }[];
  unita?: string;
  colore?: string;
}) {
  if (data.length === 0) return <Vuoto testo="Nessun dato nel periodo." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C.slate }} />
        <YAxis
          type="category"
          dataKey="nome"
          width={120}
          tick={{ fontSize: 11, fill: C.ink }}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(19,64,166,0.06)' }}
          contentStyle={tooltipStyle}
          formatter={(v) => [`${v}${unita ? ` ${unita}` : ''}`, '']}
          labelStyle={{ fontWeight: 600, color: C.ink }}
        />
        <Bar dataKey="valore" fill={colore} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Area trend: serie temporale (es. dipendenti con rapportino per giorno). */
export function AreaTrend({
  data,
  unita = '',
}: {
  data: { etichetta: string; valore: number; oggi?: boolean }[];
  unita?: string;
}) {
  if (data.length === 0) return <Vuoto testo="Nessun dato nel periodo." />;
  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.blue} stopOpacity={0.28} />
            <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="etichetta" tick={{ fontSize: 10, fill: C.slate }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.slate }} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          cursor={{ stroke: C.blueSoft, strokeWidth: 1 }}
          contentStyle={tooltipStyle}
          formatter={(v) => [`${v}${unita ? ` ${unita}` : ''}`, '']}
          labelStyle={{ fontWeight: 600, color: C.ink }}
        />
        <Area
          type="monotone"
          dataKey="valore"
          stroke={C.blue}
          strokeWidth={2}
          fill="url(#areaFill)"
          dot={{ r: 3, fill: C.blue }}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Ciambella generica: ripartizione per segmenti arbitrari (nome+valore+colore).
 * Usata per la ripartizione delle spese per categoria. `formatValore` formatta
 * il valore in legenda e tooltip (es. importi in euro).
 */
export function DonutCategorie({
  data,
  formatValore,
  testoVuoto = 'Nessun dato nel periodo.',
}: {
  data: { nome: string; valore: number; colore: string }[];
  formatValore?: (v: number) => string;
  testoVuoto?: string;
}) {
  const segmenti = data.filter((d) => d.valore > 0);
  const totale = segmenti.reduce((a, d) => a + d.valore, 0);
  const fmt = formatValore ?? ((v: number) => String(Math.round(v * 100) / 100));
  if (totale <= 0) return <Vuoto testo={testoVuoto} />;
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={170}>
        <PieChart>
          <Pie
            data={segmenti}
            dataKey="valore"
            nameKey="nome"
            innerRadius={46}
            outerRadius={70}
            paddingAngle={2}
            stroke="none"
          >
            {segmenti.map((d) => (
              <Cell key={d.nome} fill={d.colore} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmt(Number(v)), n]} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5">
        {segmenti.map((d) => (
          <li key={d.nome} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.colore }} aria-hidden />
              <span className="text-muted-foreground">{d.nome}</span>
            </span>
            <span className="font-mono tabular-nums font-medium text-foreground">{fmt(d.valore)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 border-t border-border pt-1.5 text-sm">
          <span className="text-muted-foreground">Totale</span>
          <span className="font-mono tabular-nums font-semibold text-foreground">{fmt(totale)}</span>
        </li>
      </ul>
    </div>
  );
}

/**
 * Barre orizzontali impilate a due serie (es. manodopera vs spese per cantiere).
 * `formatValore` formatta tooltip e asse (es. importi in euro).
 */
export function BarsImpilate({
  data,
  serieA,
  serieB,
  formatValore,
  testoVuoto = 'Nessun dato nel periodo.',
}: {
  data: { nome: string; a: number; b: number }[];
  serieA: { etichetta: string; colore?: string };
  serieB: { etichetta: string; colore?: string };
  formatValore?: (v: number) => string;
  testoVuoto?: string;
}) {
  if (data.length === 0) return <Vuoto testo={testoVuoto} />;
  const fmt = formatValore ?? ((v: number) => String(Math.round(v * 100) / 100));
  const colA = serieA.colore ?? C.blue;
  const colB = serieB.colore ?? C.amber;
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" tick={{ fontSize: 11, fill: C.slate }} tickFormatter={(v: number) => fmt(v)} />
        <YAxis
          type="category"
          dataKey="nome"
          width={120}
          tick={{ fontSize: 11, fill: C.ink }}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(19,64,166,0.06)' }}
          contentStyle={tooltipStyle}
          formatter={(v, n) => [fmt(Number(v)), n]}
          labelStyle={{ fontWeight: 600, color: C.ink }}
        />
        <Bar dataKey="a" name={serieA.etichetta} stackId="t" fill={colA} barSize={18} radius={[0, 0, 0, 0]} />
        <Bar dataKey="b" name={serieB.etichetta} stackId="t" fill={colB} barSize={18} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Trend mensile (area) con etichette stringa libere (es. "2026-06"). Riusa AreaTrend con format. */
export function AreaTrendValore({
  data,
  formatValore,
  testoVuoto = 'Nessun dato nel periodo.',
}: {
  data: { etichetta: string; valore: number }[];
  formatValore?: (v: number) => string;
  testoVuoto?: string;
}) {
  if (data.length === 0) return <Vuoto testo={testoVuoto} />;
  const fmt = formatValore ?? ((v: number) => String(Math.round(v * 100) / 100));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ left: -6, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="areaFillValore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.blue} stopOpacity={0.28} />
            <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="etichetta" tick={{ fontSize: 10, fill: C.slate }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: C.slate }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmt(v)} />
        <Tooltip
          cursor={{ stroke: C.blueSoft, strokeWidth: 1 }}
          contentStyle={tooltipStyle}
          formatter={(v) => [fmt(Number(v)), '']}
          labelStyle={{ fontWeight: 600, color: C.ink }}
        />
        <Area
          type="monotone"
          dataKey="valore"
          stroke={C.blue}
          strokeWidth={2}
          fill="url(#areaFillValore)"
          dot={{ r: 3, fill: C.blue }}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Ciambella: ripartizione ore ordinarie / straordinario / viaggio. */
export function DonutOre({
  ordinarie,
  straordinarie,
  viaggio,
}: {
  ordinarie: number;
  straordinarie: number;
  viaggio: number;
}) {
  const data = [
    { nome: 'Ordinarie', valore: Math.round(ordinarie * 10) / 10, colore: C.blue },
    { nome: 'Straordinario', valore: Math.round(straordinarie * 10) / 10, colore: C.amber },
    { nome: 'Viaggio', valore: Math.round(viaggio * 10) / 10, colore: C.emerald },
  ].filter((d) => d.valore > 0);
  const totale = data.reduce((a, d) => a + d.valore, 0);
  if (totale <= 0) return <Vuoto testo="Nessuna ora nel periodo." />;
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={150}>
        <PieChart>
          <Pie
            data={data}
            dataKey="valore"
            nameKey="nome"
            innerRadius={42}
            outerRadius={64}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.nome} fill={d.colore} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} h`, n]} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.nome} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.colore }} aria-hidden />
              <span className="text-muted-foreground">{d.nome}</span>
            </span>
            <span className="font-mono tabular-nums font-medium text-foreground">
              {d.valore % 1 === 0 ? d.valore : d.valore.toFixed(1)} h
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 border-t border-border pt-1.5 text-sm">
          <span className="text-muted-foreground">Totale</span>
          <span className="font-mono tabular-nums font-semibold text-foreground">
            {totale % 1 === 0 ? totale : totale.toFixed(1)} h
          </span>
        </li>
      </ul>
    </div>
  );
}
