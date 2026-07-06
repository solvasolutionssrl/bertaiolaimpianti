import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { leggiRoutingProvider } from '@/app/_lib/kantiere-config';

/**
 * POST /api/geocode/autocomplete
 * Body: { query: string }
 * Returns: { suggestions: { label: string; lat: number; lng: number }[] }
 *
 * Geocoding indirizzi per i form Cantieri e Sedi (modulo Kantiere). Salva
 * lat/lng accanto al testo per il calcolo tragitto (km/tempo).
 *
 * Provider (in ordine di priorità):
 *  0. Google Geocoding — SOLO se il tenant usa il provider 'google' (stesso
 *     toggle del routing, tab "Viaggio" del super admin) e la chiave di
 *     piattaforma `GOOGLE_MAPS_API_KEY` è presente. Così indirizzi, tempo e km
 *     di un tenant restano coerenti. Fail-soft → ripiega sui provider free.
 *  1. Photon (OSM) — `https://photon.komoot.io/api` (GeoJSON, no API key).
 *  2. Nominatim (OSM) — fallback se Photon fallisce o non torna risultati.
 *     Richiede `User-Agent` per policy d'uso OSM.
 *
 * Fail-soft: qualsiasi errore provider → `{ suggestions: [] }` (mai 5xx per
 * problemi esterni). Le chiamate sono server-side → nessun problema CORS lato
 * browser. Auth tramite `requireTenantContext` (endpoint interno office).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  query: z.string().max(200),
});

export interface GeocodeSuggestion {
  label: string;
  lat: number;
  lng: number;
}

/** Soglia minima sotto la quale non interroghiamo i provider. */
const MIN_QUERY_LEN = 3;
const LIMIT = 6;

// Photon UA non obbligatorio; Nominatim sì (policy OSM).
const NOMINATIM_UA = 'Kommessa/1.0 (geocoding; kommessa app)';

/** Compone una label leggibile in italiano da parti d'indirizzo. */
function buildLabel(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const p of parts) {
    const t = (p ?? '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(t);
  }
  return clean.join(', ');
}

// ── Photon (GeoJSON FeatureCollection; geometry.coordinates = [lng, lat]) ──

interface PhotonFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  };
}

async function queryPhoton(q: string): Promise<GeocodeSuggestion[]> {
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&lang=it&limit=${LIMIT}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);

  const json = (await res.json()) as { features?: PhotonFeature[] };
  const features = Array.isArray(json.features) ? json.features : [];

  const out: GeocodeSuggestion[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lng, lat] = coords;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const p = f.properties ?? {};
    // Via + civico
    const via = [p.street ?? p.name, p.housenumber].filter(Boolean).join(' ');
    const label = buildLabel([
      via || p.name,
      p.postcode,
      p.city ?? p.district,
      p.state,
      p.country,
    ]);
    if (!label) continue;
    out.push({ label, lat, lng });
  }
  return out;
}

// ── Nominatim (array; lat/lon stringhe) ──

interface NominatimItem {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

async function queryNominatim(q: string): Promise<GeocodeSuggestion[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1` +
    `&accept-language=it&limit=${LIMIT}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

  const json = (await res.json()) as NominatimItem[];
  const items = Array.isArray(json) ? json : [];

  const out: GeocodeSuggestion[] = [];
  for (const it of items) {
    const lat = it.lat != null ? Number(it.lat) : NaN;
    const lng = it.lon != null ? Number(it.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const a = it.address ?? {};
    const via = [a.road, a.house_number].filter(Boolean).join(' ');
    const citta = a.city ?? a.town ?? a.village;
    const label =
      buildLabel([via, a.postcode, citta, a.state, a.country]) ||
      (it.display_name ?? '');
    if (!label) continue;
    out.push({ label, lat, lng });
  }
  return out;
}

// ── Google Geocoding (chiave di piattaforma GOOGLE_MAPS_API_KEY) ──
// Usato SOLO per i tenant col provider 'google' (stesso toggle del routing:
// tab "Viaggio" del super admin). Restituisce lo stesso shape {label,lat,lng}.

interface GoogleGeocodeResult {
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
}

async function queryGoogle(q: string, key: string): Promise<GeocodeSuggestion[]> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}` +
    `&region=it&language=it&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);

  const json = (await res.json()) as { status?: string; results?: GoogleGeocodeResult[] };
  if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Google status ${json.status}`);
  }
  const results = Array.isArray(json.results) ? json.results : [];

  const out: GeocodeSuggestion[] = [];
  for (const r of results.slice(0, LIMIT)) {
    const loc = r.geometry?.location;
    const label = r.formatted_address;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number' || !label) continue;
    out.push({ label, lat: loc.lat, lng: loc.lng });
  }
  return out;
}

export async function POST(req: Request) {
  // Endpoint interno office: solo utenti autenticati nel tenant.
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  const query = parsed.data.query.trim();
  if (query.length < MIN_QUERY_LEN) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  // 0. Google (se il tenant usa il provider 'google' e la chiave è presente).
  //    Stesso toggle per-tenant del routing (tab "Viaggio"): così indirizzi,
  //    tempo e km di un tenant sono coerenti. Fail-soft → fallback ai free.
  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleKey) {
    let useGoogle = false;
    try {
      useGoogle = (await leggiRoutingProvider(createServerSupabase(), ctx.tenantId)) === 'google';
    } catch {
      useGoogle = false;
    }
    if (useGoogle) {
      try {
        const g = await queryGoogle(query, googleKey);
        if (g.length > 0) {
          return NextResponse.json({ suggestions: g }, { status: 200 });
        }
      } catch (err) {
        console.error('[geocode] Google error, fallback free:', err);
      }
    }
  }

  // 1. Photon primario
  try {
    const photon = await queryPhoton(query);
    if (photon.length > 0) {
      return NextResponse.json({ suggestions: photon }, { status: 200 });
    }
  } catch (err) {
    console.error('[geocode] Photon error, trying Nominatim:', err);
  }

  // 2. Nominatim fallback
  try {
    const nominatim = await queryNominatim(query);
    return NextResponse.json({ suggestions: nominatim }, { status: 200 });
  } catch (err) {
    console.error('[geocode] Nominatim error, returning empty:', err);
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}
