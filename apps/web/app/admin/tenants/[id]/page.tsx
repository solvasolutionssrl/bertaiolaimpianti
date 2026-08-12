import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@kommessa/ui';
import { createServiceSupabase } from '@kommessa/api/service';
import { requirePlatformAdmin } from '../../_lib/guard';
import { TenantStatusBadge } from '../../_components/tenant-status-badge';
import { UsageBar } from '../../_components/usage-bar';
import { TenantDetailHeaderActions } from './_components/header-actions';
import { TabUtenti } from './_components/tab-utenti';
import { TabQuote } from './_components/tab-quote';
import { TabStorage } from './_components/tab-storage';
import { TabBranding } from './_components/tab-branding';
import { TabNoteInterne } from './_components/tab-note-interne';
import { TabAi } from './_components/tab-ai';
import { TabModuli } from './_components/tab-moduli';
import { TabFunzioni } from './_components/tab-funzioni';
import { TabRouting } from './_components/tab-routing';
import { TabIntegrazione } from './_components/tab-integrazione';
import { fotoCollegamenti } from '../../_lib/integrazione-foto';
import { leggiConfigIntegrazione } from '../../_lib/integrazione-config';
import { googleRoutingDisponibile } from '@/app/_lib/routing';

export const dynamic = 'force-dynamic';

// Etichette leggibili per la config Kantiere (sola lettura, tab Viaggio).
const CONFIG_KANTIERE_LABELS: [string, string][] = [
  ['soglia_ore_ordinarie', 'Soglia ore ordinarie'],
  ['anomalia_turno_ore_max', 'Soglia anomalia turno (h)'],
  ['soglia_pausa_pranzo_ore', 'Promemoria pausa (h)'],
  ['soglia_auto_spegnimento_pausa_ore', 'Auto-spegnimento pausa (h)'],
  ['arrotondamento_viaggio_min', 'Arrotondamento viaggio (min)'],
  ['arrotondamento_ore_min', 'Arrotondamento ore (min)'],
  ['auto_approva_rapportini', 'Auto-approvazione rapportini'],
  ['tolleranza_chiusura_min', 'Tolleranza chiusura (min)'],
  ['split_fine_turno_attivo', 'Split fine turno'],
  ['km_switch_attivo', 'Conteggia trasferimenti tra cantieri'],
  ['passo_minuti_stepper', 'Passo stepper (min)'],
  ['avvio_turno_libero', 'Avvio turno libero'],
  ['registra_giornata_attivo', 'Registra giornata da zero'],
  ['kontabilita_attiva', 'Kontabilità attiva'],
  ['routing_provider', 'Provider viaggio'],
];

/** Formatta un valore di config per la vista sola lettura. */
function fmtConfigKantiere(v: unknown): string {
  if (v === undefined || v === null) return 'predefinito';
  if (typeof v === 'boolean') return v ? 'Sì' : 'No';
  return String(v);
}

/** Schede raggiungibili con `?tab=…`, così i link da altre pagine atterrano giusto. */
const TAB_VALIDI = [
  'overview',
  'utenti',
  'quote',
  'storage',
  'ai',
  'moduli',
  'funzioni',
  'routing',
  'integrazione',
  'branding',
  'note',
  'audit',
];

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  const [tenantRes, usageRes, quotaRes, plansRes, utentiRes, auditRes, moduliRes] =
    await Promise.all([
      supabase
        .from('tenants')
        .select('*')
        .eq('id', params.id)
        .maybeSingle(),
      supabase
        .from('tenant_usage_snapshot')
        .select('*')
        .eq('tenant_id', params.id)
        .maybeSingle(),
      supabase
        .from('tenant_quotas')
        .select('*')
        .eq('tenant_id', params.id)
        .maybeSingle(),
      supabase
        .from('plans')
        .select('id, code, nome, prezzo_mensile_eur, max_utenti, max_commesse_anno, max_storage_gb, max_tickets_mese, attivo, ordine')
        .order('ordine'),
      supabase
        .from('users')
        .select('id, display_name, role, attivo, created_at')
        .eq('tenant_id', params.id)
        .order('display_name'),
      supabase
        .from('audit_events')
        .select('id, created_at, entity_type, entity_id, action, actor_role, metadata')
        .eq('tenant_id', params.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('tenant_modules' as never)
        .select('module_code, attivo, config')
        .eq('tenant_id', params.id),
    ]);

  const tenant: any = tenantRes.data;
  if (!tenant) notFound();

  const usage: any = usageRes.data;
  const quota: any = quotaRes.data;
  const plans = (plansRes.data ?? []) as any[];
  const utenti = (utentiRes.data ?? []) as any[];
  const audit = (auditRes.data ?? []) as any[];
  const moduli = (moduliRes.data ?? []) as any[];
  const kantiereAttivo = moduli.some(
    (m) => m.module_code === 'kantiere' && m.attivo === true,
  );
  const kantiereConfig = (moduli.find((m) => m.module_code === 'kantiere')?.config ?? {}) as Record<
    string,
    unknown
  >;
  const dipendentiAttivo = moduli.some(
    (m) => m.module_code === 'dipendenti' && m.attivo === true,
  );
  const dipendentiConfig = (moduli.find((m) => m.module_code === 'dipendenti')?.config ??
    {}) as Record<string, unknown>;
  const routingProvider: 'free' | 'google' =
    kantiereConfig['routing_provider'] === 'google' ? 'google' : 'free';
  const googleKeyConfigured = googleRoutingDisponibile();

  // ===== Integrazione: config, stato del collegamento, token vivi =====
  const rigaIntegrazione = moduli.find((m) => m.module_code === 'integrazione');
  const integrazionePresente = !!rigaIntegrazione;
  const cfgIntegrazione = leggiConfigIntegrazione(
    (rigaIntegrazione?.config ?? null) as Record<string, unknown> | null,
  );
  const [collegamento] = integrazionePresente
    ? await fotoCollegamenti(params.id)
    : [undefined];
  const { data: tokenRaw } = await supabase
    .from('api_tokens' as never)
    .select('id, label, created_at, last_used_at')
    .eq('tenant_id', params.id)
    .contains('scopes', ['integrazione'])
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  const tokenIntegrazione = (
    (tokenRaw ?? []) as unknown as {
      id: string;
      label: string;
      created_at: string;
      last_used_at: string | null;
    }[]
  ).map((t) => ({
    id: t.id,
    label: t.label,
    creato: t.created_at,
    ultimoUso: t.last_used_at,
  }));

  const appModeTenant: 'kommessa' | 'kantiere' | 'full' =
    tenant.app_mode === 'kantiere' || tenant.app_mode === 'full' ? tenant.app_mode : 'kommessa';
  const kommessaWorld = appModeTenant !== 'kantiere';
  const tenantFeatures = (tenant.features ?? {}) as Record<string, boolean>;

  const plan = plans.find((p) => p.id === tenant.plan_id);

  // Recupera email via auth.admin (per ogni user)
  let emailMap = new Map<string, string>();
  if (utenti.length > 0) {
    // batch via listUsers paginato — semplice fallback: page 1, 100 utenti
    const { data: authUsers } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    emailMap = new Map(
      (authUsers?.users ?? []).map((u) => [u.id, u.email ?? '']),
    );
  }

  const utentiConEmail = utenti.map((u) => ({
    ...u,
    email: emailMap.get(u.id) ?? '',
  }));

  // Computed quotas
  function effective(field: 'max_utenti' | 'max_commesse_anno' | 'max_storage_gb' | 'max_tickets_mese'): number | null {
    return (quota?.[field] ?? plan?.[field]) ?? null;
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div>
        <Link
          href="/admin/tenants"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Tenants
        </Link>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-soft">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
            style={
              tenant.brand_color
                ? { backgroundColor: tenant.brand_color, color: '#fff' }
                : undefined
            }
          >
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {tenant.nome}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {tenant.slug}
              </span>
              {plan ? (
                <Badge variant="outline" className="text-[10px]">
                  {plan.nome} · € {Number(plan.prezzo_mensile_eur).toFixed(0)}/mese
                </Badge>
              ) : null}
              <TenantStatusBadge
                sospeso={tenant.sospeso}
                motivo={tenant.sospeso_motivo}
              />
            </div>
          </div>
        </div>
        <TenantDetailHeaderActions
          tenantId={tenant.id}
          slug={tenant.slug}
          nome={tenant.nome}
          sospeso={tenant.sospeso}
        />
      </header>

      <Tabs
        defaultValue={
          searchParams?.tab && TAB_VALIDI.includes(searchParams.tab)
            ? searchParams.tab
            : 'overview'
        }
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="utenti">Utenti</TabsTrigger>
          <TabsTrigger value="quote">Quote</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="moduli">Moduli</TabsTrigger>
          <TabsTrigger value="funzioni">Funzioni</TabsTrigger>
          {kantiereAttivo ? <TabsTrigger value="routing">Viaggio</TabsTrigger> : null}
          <TabsTrigger value="integrazione">Integrazione</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="note">Note interne</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* ===== Overview ===== */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="space-y-5 py-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Usage corrente
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <UsageBar
                  label="Utenti attivi"
                  used={usage?.utenti_attivi ?? 0}
                  quota={effective('max_utenti')}
                />
                <UsageBar
                  label="Commesse anno corrente"
                  used={usage?.commesse_anno ?? 0}
                  quota={effective('max_commesse_anno')}
                />
                <UsageBar
                  label="Storage (GB)"
                  used={Number(usage?.storage_gb ?? 0)}
                  quota={effective('max_storage_gb')}
                  format={(v) => v.toFixed(2)}
                />
                <UsageBar
                  label="Tickets mese corrente"
                  used={usage?.tickets_mese ?? 0}
                  quota={effective('max_tickets_mese')}
                />
              </div>
              <p className="pt-3 font-mono text-[11px] text-muted-foreground">
                Snapshot: {usage?.snapshot_at
                  ? new Date(usage.snapshot_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
                  : 'mai aggiornato'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Utenti ===== */}
        <TabsContent value="utenti">
          <TabUtenti tenantId={tenant.id} utenti={utentiConEmail} />
        </TabsContent>

        {/* ===== Quote ===== */}
        <TabsContent value="quote">
          <TabQuote
            tenantId={tenant.id}
            quota={quota}
            plan={plan ?? null}
            plans={plans}
          />
        </TabsContent>

        {/* ===== Storage ===== */}
        <TabsContent value="storage">
          <TabStorage
            tenantId={tenant.id}
            tenantNome={tenant.nome}
            storageProvider={tenant.storage_provider}
            storageConfig={tenant.storage_config ?? {}}
            creaCartelle={tenant.crea_cartelle ?? true}
          />
        </TabsContent>

        {/* ===== AI (modello trascrizione audio) ===== */}
        <TabsContent value="ai">
          <TabAi
            tenantId={tenant.id}
            tenantNome={tenant.nome}
            currentModel={tenant.transcribe_model ?? null}
          />
        </TabsContent>

        {/* ===== Moduli ===== */}
        <TabsContent value="moduli">
          <TabModuli
            tenantId={tenant.id}
            kantiereAttivo={kantiereAttivo}
            dipendentiAttivo={dipendentiAttivo}
            pianificazioneAttiva={dipendentiConfig['pianificazione_attiva'] !== false}
            ferieAttiva={dipendentiConfig['ferie_attiva'] !== false}
            appMode={
              tenant.app_mode === 'kantiere' || tenant.app_mode === 'full'
                ? tenant.app_mode
                : 'kommessa'
            }
            codiceAzienda={tenant.codice_azienda ?? ''}
          />
        </TabsContent>

        {/* ===== Funzioni (visibilità funzioni office per-tenant) ===== */}
        <TabsContent value="funzioni">
          <TabFunzioni
            tenantId={tenant.id}
            features={tenantFeatures}
            kommessaWorld={kommessaWorld}
          />
        </TabsContent>

        {/* ===== Viaggio (provider stima km/tempo) ===== */}
        {kantiereAttivo ? (
          <TabsContent value="routing">
            <div className="space-y-5">
              <TabRouting
                tenantId={tenant.id}
                tenantNome={tenant.nome}
                currentProvider={routingProvider}
                googleKeyConfigured={googleKeyConfigured}
              />
              {/* Config Kantiere sola lettura: il super admin vede le soglie
                  payroll/operative del tenant senza dover impersonare. */}
              <Card>
                <CardContent className="py-6">
                  <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Config Kantiere · sola lettura
                  </h2>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Impostazioni operative del tenant (Turni &amp; calcoli, soglie, arrotondamenti).
                    Le gestisce l&apos;ufficio del tenant; qui sono visibili per il supporto.
                  </p>
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
                    {CONFIG_KANTIERE_LABELS.map(([key, label]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-sm"
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono tabular-nums text-foreground">
                          {fmtConfigKantiere(kantiereConfig[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}

        {/* ===== Integrazione (governo di /api/v1 per questo cliente) ===== */}
        <TabsContent value="integrazione">
          <TabIntegrazione
            dati={{
              tenantId: tenant.id,
              tenantNome: tenant.nome,
              slug: tenant.slug,
              attivo: rigaIntegrazione?.attivo === true,
              sistema: cfgIntegrazione.sistema,
              modalita: cfgIntegrazione.modalita,
              collaudoEsterni: cfgIntegrazione.collaudoEsterni,
              maxDescrizione: cfgIntegrazione.maxDescrizione,
              sogliaSilenzioOre: cfgIntegrazione.sogliaSilenzioOre,
              stato: collegamento?.diagnosi.stato ?? 'mai_visto',
              motivi: collegamento?.diagnosi.motivi ?? [
                'Il modulo non è mai stato acceso per questo cliente.',
              ],
              silenzioOre: collegamento?.diagnosi.silenzioOre ?? null,
              scrittureOk: collegamento?.foto.scrittureOk ?? 0,
              scrittureErrore: collegamento?.foto.scrittureErrore ?? 0,
              ritardoAckMin: collegamento?.foto.ritardoAckMin ?? null,
              giriAperti: collegamento?.foto.giriAperti ?? 0,
              nostreTotali: collegamento?.nostreTotali ?? 0,
              collegate: collegamento?.collegate ?? 0,
              staging:
                collegamento?.staging ?? { commesse: 0, clienti: 0, dipendenti: 0 },
              ultimaLettura: collegamento?.ultimaLettura ?? null,
              token: tokenIntegrazione,
            }}
          />
        </TabsContent>

        {/* ===== Branding ===== */}
        <TabsContent value="branding">
          <TabBranding
            tenantId={tenant.id}
            nome={tenant.nome}
            brandColor={tenant.brand_color}
            logoUrl={tenant.logo_url}
            inboundEmail={(tenant.storage_config ?? {})?.inbound_email ?? null}
            landingTagline={tenant.landing_tagline ?? null}
          />
        </TabsContent>

        {/* ===== Note interne ===== */}
        <TabsContent value="note">
          <TabNoteInterne
            tenantId={tenant.id}
            noteInterne={tenant.note_interne ?? ''}
          />
        </TabsContent>

        {/* ===== Audit ===== */}
        <TabsContent value="audit">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {audit.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessun audit event registrato per questo tenant.
                </p>
              ) : (
                audit.map((e: any) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {e.entity_type}
                    </span>
                    <span className="font-medium tracking-tight">{e.action}</span>
                    {e.metadata?.platform ? (
                      <Badge className="border-transparent bg-accent/15 text-accent-foreground text-[10px]">
                        platform
                      </Badge>
                    ) : null}
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString('it-IT', {
                        timeZone: 'Europe/Rome',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
