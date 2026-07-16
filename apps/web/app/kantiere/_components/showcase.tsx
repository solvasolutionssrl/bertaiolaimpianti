import {
  Receipt,
  Sparkles,
  CheckCircle2,
  Users,
  MapPin,
  CreditCard,
  CalendarDays,
  Truck,
  Car,
  Fuel,
  Navigation,
  Building2,
  Wallet,
} from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════════ */
/*  KONTABILITÀ — scontrino → estrazione AI (analogo al dettato in home)      */
/* ════════════════════════════════════════════════════════════════════════ */

export function NotaSpeseAI() {
  const campi = [
    { icon: Building2, label: 'Esercente', value: 'Trattoria da Nino' },
    { icon: CalendarDays, label: 'Data', value: '14/07/2026 · 13:12' },
    { icon: Wallet, label: 'Importo', value: '€ 63,00' },
    { icon: Receipt, label: 'Categoria', value: 'Ristorante' },
    { icon: Users, label: 'Persone', value: '3 tecnici' },
    { icon: MapPin, label: 'Cantiere', value: 'Polo Logistico Est' },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft-lg backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Kantiere · Kontabilità · nuova nota spesa
        </span>
      </div>

      <div className="grid gap-px bg-border/60 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* ── Sinistra: lo scontrino con la scansione ── */}
        <div className="bg-card p-6">
          <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Foto dello scontrino
          </p>
          <div className="relative mx-auto max-w-[15rem] overflow-hidden rounded-md bg-[#fbfaf6] p-4 font-mono text-[10px] leading-relaxed text-neutral-700 shadow-soft-md ring-1 ring-border">
            {/* linea di scansione */}
            <span
              aria-hidden
              className="animate-scan-sweep absolute inset-x-2 z-10 h-6 rounded-sm"
              style={{
                background:
                  'linear-gradient(180deg, hsl(220 80% 45% / 0), hsl(220 80% 45% / 0.18) 45%, hsl(22 92% 54% / 0.22) 60%, transparent)',
                boxShadow: '0 1px 0 hsl(22 92% 54% / 0.6)',
              }}
            />
            <p className="text-center text-[11px] font-bold tracking-tight text-neutral-800">
              TRATTORIA DA NINO
            </p>
            <p className="text-center text-neutral-500">Via Roma 18 · Verona</p>
            <p className="text-center text-neutral-400">P.IVA 0••••••••••</p>
            <div className="my-2 border-t border-dashed border-neutral-300" />
            {[
              ['Coperto x3', '6,00'],
              ['Primi x3', '27,00'],
              ['Secondi x3', '30,00'],
            ].map(([a, b]) => (
              <p key={a} className="flex justify-between">
                <span>{a}</span>
                <span>{b}</span>
              </p>
            ))}
            <div className="my-2 border-t border-dashed border-neutral-300" />
            <p className="flex justify-between text-[11px] font-bold text-neutral-800">
              <span>TOTALE</span>
              <span>€ 63,00</span>
            </p>
            <p className="mt-1 text-neutral-500">Pagamento · Carta</p>
            <p className="mt-2 text-center text-neutral-400">14/07/2026 13:12</p>
          </div>
        </div>

        {/* ── Destra: campi estratti ── */}
        <div className="bg-card p-6">
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Letto e compilato dall’AI
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {campi.map(({ icon: Icon, label, value }, i) => (
              <li
                key={label}
                className="animate-fade-up flex items-center gap-2.5 rounded-lg border border-border/70 bg-background/60 px-3 py-2"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    {label}
                  </span>
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {value}
                  </span>
                </span>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
            <CheckCircle2 className="h-4 w-4" />
            Spesa agganciata al cantiere del turno · pronta da confermare
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  ANALISI COSTI — costo per cantiere con barra a segmenti                   */
/* ════════════════════════════════════════════════════════════════════════ */

export function AnalisiCosti() {
  const voci = [
    { label: 'Manodopera', quota: 58, color: 'hsl(220 80% 40%)', soft: 'bg-primary-soft text-primary' },
    { label: 'Materiali', quota: 27, color: 'hsl(22 92% 54%)', soft: 'bg-accent-soft text-accent-soft-foreground' },
    { label: 'Mezzi e viaggi', quota: 9, color: 'hsl(152 56% 40%)', soft: 'bg-success/10 text-success' },
    { label: 'Note spese', quota: 6, color: 'hsl(38 92% 50%)', soft: 'bg-warning/15 text-warning-foreground' },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Costo cantiere
          </p>
          <p className="text-lg font-semibold tracking-tight">Residenza Aurora</p>
        </div>
        <p className="text-right">
          <span className="block text-2xl font-semibold tracking-tight text-foreground">€ 18.940</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            a oggi
          </span>
        </p>
      </div>

      <div className="mt-4 flex h-3 overflow-hidden rounded-full ring-1 ring-border">
        {voci.map((v) => (
          <span key={v.label} style={{ width: `${v.quota}%`, background: v.color }} />
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {voci.map((v) => (
          <li key={v.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.color }} />
            <span className="text-muted-foreground">{v.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-foreground">{v.quota}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  PIANIFICAZIONE SETTIMANALE — griglia tecnici × giorni                     */
/* ════════════════════════════════════════════════════════════════════════ */

type Chip = { t: string; cls: string } | null;

export function PianificazioneSettimanale() {
  const giorni = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'];
  const BEL = { t: 'Belvedere', cls: 'bg-primary-soft text-primary' };
  const AUR = { t: 'Aurora', cls: 'bg-accent-soft text-accent-soft-foreground' };
  const POL = { t: 'Polo Est', cls: 'bg-success/10 text-success' };
  const MAN = { t: 'Manzoni', cls: 'bg-warning/15 text-warning-foreground' };
  const FER = { t: 'Ferie', cls: 'bg-muted text-muted-foreground' };

  const righe: { nome: string; celle: Chip[] }[] = [
    { nome: 'Marco R.', celle: [BEL, BEL, AUR, AUR, POL] },
    { nome: 'Luca F.', celle: [POL, POL, POL, MAN, MAN] },
    { nome: 'Andrea P.', celle: [AUR, AUR, BEL, BEL, BEL] },
    { nome: 'Giulia B.', celle: [MAN, MAN, FER, FER, POL] },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft-md">
      <div className="mb-4 flex items-center justify-between">
        <p className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
          <CalendarDays className="h-4 w-4 text-primary" />
          Pianificazione · settimana 29
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          4 tecnici · 5 giorni
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[30rem]">
          {/* header */}
          <div className="grid grid-cols-[6.5rem_repeat(5,1fr)] gap-1.5">
            <span />
            {giorni.map((g) => (
              <span
                key={g}
                className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {g}
              </span>
            ))}
          </div>
          {/* righe */}
          <div className="stagger mt-1.5 space-y-1.5">
            {righe.map((r) => (
              <div key={r.nome} className="grid grid-cols-[6.5rem_repeat(5,1fr)] items-center gap-1.5">
                <span className="truncate text-xs font-medium text-foreground">{r.nome}</span>
                {r.celle.map((c, i) => (
                  <span
                    key={i}
                    className={`rounded-md py-1.5 text-center text-[11px] font-medium ${
                      c ? c.cls : 'bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    {c ? c.t : '—'}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  PERCORSI DI OGGI — "disegnino" delle tratte dei tecnici                   */
/* ════════════════════════════════════════════════════════════════════════ */

const BLU = 'hsl(220 80% 40%)';
const ARANCIO = 'hsl(22 92% 54%)';

function Pin({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill="white" stroke={color} strokeWidth={2.5} />
      <circle cx={x} cy={y} r={3.4} fill={color} />
      <text
        x={x}
        y={y - 14}
        textAnchor="middle"
        fontSize="10"
        fontWeight={600}
        fill="hsl(220 30% 25%)"
        style={{ fontFamily: 'var(--font-geist-sans, ui-sans-serif)' }}
      >
        {label}
      </text>
    </g>
  );
}

export function PercorsiGiornata() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-lg">
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5">
        <Navigation className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Percorsi di oggi · 2 tecnici
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          70 km totali
        </span>
      </div>

      <div className="relative bg-grid">
        <svg viewBox="0 0 440 268" className="block w-full" role="img" aria-label="Mappa dei percorsi dei tecnici">
          {/* strada di sfondo (tenue) */}
          <path
            d="M48 232 L150 150 L255 78 L300 244"
            fill="none"
            stroke={BLU}
            strokeOpacity={0.14}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M48 232 L372 150 L300 244"
            fill="none"
            stroke={ARANCIO}
            strokeOpacity={0.14}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* tratte animate */}
          <path
            className="animate-dash"
            d="M48 232 L150 150 L255 78 L300 244"
            fill="none"
            stroke={BLU}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="animate-dash"
            d="M48 232 L372 150 L300 244"
            fill="none"
            stroke={ARANCIO}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* etichette km su alcune tratte */}
          <g style={{ fontFamily: 'var(--font-geist-mono, ui-monospace)' }}>
            <rect x="86" y="184" width="52" height="16" rx="8" fill="white" stroke="hsl(30 12% 89%)" />
            <text x="112" y="195" textAnchor="middle" fontSize="9" fill="hsl(220 30% 30%)">12 km · 18’</text>
            <rect x="250" y="196" width="52" height="16" rx="8" fill="white" stroke="hsl(30 12% 89%)" />
            <text x="276" y="207" textAnchor="middle" fontSize="9" fill="hsl(220 30% 30%)">21 km · 26’</text>
          </g>

          <Pin x={48} y={232} label="Sede" color="hsl(220 30% 30%)" />
          <Pin x={150} y={150} label="Belvedere" color={BLU} />
          <Pin x={255} y={78} label="Aurora" color={BLU} />
          <Pin x={372} y={150} label="Polo Est" color={ARANCIO} />
          <Pin x={300} y={244} label="Abitazione" color="hsl(220 30% 30%)" />
        </svg>
      </div>

      {/* legenda tecnici */}
      <div className="grid gap-px border-t border-border/70 bg-border/60 sm:grid-cols-2">
        {[
          { nome: 'Marco R.', mezzo: 'Furgone · Ducato', km: '42 km · 59’', color: BLU },
          { nome: 'Luca F.', mezzo: 'Van · Trafic', km: '28 km · 41’', color: ARANCIO },
        ].map((t) => (
          <div key={t.nome} className="flex items-center gap-2.5 bg-card px-4 py-3">
            <span className="h-2.5 w-6 rounded-full" style={{ background: t.color }} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{t.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.mezzo}</span>
            </span>
            <span className="ml-auto font-mono text-xs tabular-nums text-foreground">{t.km}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  MEZZI — parco veicoli con km del giorno                                   */
/* ════════════════════════════════════════════════════════════════════════ */

export function MezziStrip() {
  const mezzi = [
    { icon: Truck, tipo: 'Furgone', modello: 'Fiat Ducato', autista: 'Marco R.', km: 42, cantiere: 'Belvedere' },
    { icon: Truck, tipo: 'Van', modello: 'Renault Trafic', autista: 'Luca F.', km: 28, cantiere: 'Polo Est' },
    { icon: Car, tipo: 'Pick-up', modello: 'Toyota Hilux', autista: 'Simone T.', km: 55, cantiere: 'Manzoni' },
    { icon: Fuel, tipo: 'Auto', modello: 'Fiat Panda', autista: 'Ufficio', km: 12, cantiere: 'Sopralluoghi' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {mezzi.map((m) => (
        <div key={m.modello} className="rounded-xl border border-border bg-card p-4 shadow-soft-md">
          <div className="flex items-center justify-between">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary">
              <m.icon className="h-4 w-4" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {m.tipo}
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold tracking-tight">{m.modello}</p>
          <p className="text-xs text-muted-foreground">{m.autista}</p>
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" /> {m.cantiere}
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground">{m.km} km</span>
          </div>
        </div>
      ))}
    </div>
  );
}
