import { NextResponse } from 'next/server';

import { createServiceSupabase } from '@impiantixplus/api/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Health check endpoint per monitoring esterno (UptimeRobot, BetterStack,
 * Vercel monitor, ecc.). Verifica:
 *  - L'app risponde (200 base)
 *  - La connessione a Postgres funziona (semplice SELECT)
 *
 * Niente auth: questo endpoint è pubblico per ragioni operative.
 * Non espone dati sensibili — solo timestamps e status.
 *
 * Risposta:
 *  - 200 { status: "ok", db: "up", region, version, ts }
 *  - 503 { status: "degraded", db: "down", reason }
 */
export async function GET() {
  const startedAt = Date.now();
  const ts = new Date().toISOString();
  const region = process.env.VERCEL_REGION ?? 'local';
  // Vercel automatically sets the build commit; useful for traceability
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';

  // Probe DB con timeout di 3s — evita di rimanere appesi se Postgres è giù
  let dbStatus: 'up' | 'down' = 'down';
  let dbLatencyMs: number | null = null;
  let dbReason: string | null = null;

  try {
    const service = createServiceSupabase();
    const probeStart = Date.now();
    const probe = await Promise.race([
      service.from('tenants').select('id', { count: 'exact', head: true }).limit(1),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout_3s')), 3000),
      ),
    ]) as { error: { message: string } | null };

    if (probe.error) {
      dbReason = probe.error.message;
    } else {
      dbStatus = 'up';
      dbLatencyMs = Date.now() - probeStart;
    }
  } catch (e) {
    dbReason = e instanceof Error ? e.message : 'unknown_error';
  }

  const ok = dbStatus === 'up';

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      db: dbStatus,
      dbLatencyMs,
      dbReason,
      region,
      version,
      ts,
      uptimeMs: Date.now() - startedAt,
    },
    {
      status: ok ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
}
