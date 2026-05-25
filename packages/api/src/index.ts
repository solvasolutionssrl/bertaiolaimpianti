// Client-safe re-exports SOLO. I helper server (server.ts, service.ts) e
// `tenant.ts` (che usa next/headers via createServerSupabase) NON sono qui:
// importali esplicitamente dai subpath:
//   - import { createServerSupabase, updateSession } from '@kommessa/api/server'
//   - import { createServiceSupabase } from '@kommessa/api/service'
//   - import { requireTenantContext, getTenantContext } from '@kommessa/api/tenant'
//
// Questo evita che webpack tiri dentro `next/headers` quando un Client
// Component importa qualcosa da `@kommessa/api` (root).
export * from './types';
export type { AppRole, TenantContext } from './tenant';
export { createBrowserSupabase } from './client';
