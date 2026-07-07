import { SearchEntry, SearchResult, RegulatorInfo, EnrichmentData, PWSDCandidate, ArcGISLayerCandidate, BoundaryFetchResult, EntityCategory, BoundaryLikelihood } from "../types";

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-utility`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${ANON_KEY}`,
  apikey: ANON_KEY,
};

export interface SearchResponse {
  results: SearchResult[];
  regulatory_info: RegulatorInfo;
}

export interface EnrichResponse {
  phase: "enrich";
  enrichment: EnrichmentData;
  pwsid_candidates: PWSDCandidate[];
  needs_selection: boolean;
  auto_selected_pwsid: string | null;
  entity_mismatch: boolean;
  utility_type_mismatch: boolean;
}

export interface ArcGISResponse {
  phase: "arcgis";
  arcgis_candidates: ArcGISLayerCandidate[];
  winner: ArcGISLayerCandidate | null;
  results: SearchResult[];
  regulatory_info: RegulatorInfo;
  boundary_fetch: BoundaryFetchResult | null;
  no_acceptable_candidate: boolean;
}

export async function enrichAgency(entry: SearchEntry): Promise<EnrichResponse> {
  const resp = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phase: "enrich",
      agency: entry.agency,
      state: entry.state,
      county: entry.county || "",
      utility_type: entry.utility_type,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Enrich failed: ${resp.status} – ${text}`);
  }
  return resp.json();
}

export async function searchArcGIS(
  entry: SearchEntry,
  confirmedPwsid: string | null,
  standardizedName: string,
  boundaryLikelihood: BoundaryLikelihood,
  entityCategory: EntityCategory,
): Promise<ArcGISResponse> {
  const resp = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phase: "arcgis",
      agency: entry.agency,
      state: entry.state,
      county: entry.county || "",
      utility_type: entry.utility_type,
      confirmed_pwsid: confirmedPwsid || undefined,
      standardized_name: standardizedName,
      boundary_likelihood: boundaryLikelihood,
      entity_category: entityCategory,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ArcGIS search failed: ${resp.status} – ${text}`);
  }
  return resp.json();
}

export async function searchSingle(entry: SearchEntry): Promise<SearchResponse> {
  const resp = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      state: entry.state,
      county: entry.county,
      agency: entry.agency,
      utility_type: entry.utility_type,
      id: entry.id || undefined,
      source: entry.source || undefined,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Search failed: ${resp.status} – ${text}`);
  }
  const data = await resp.json();
  return {
    results: (data.results ?? []) as SearchResult[],
    regulatory_info: (data.regulatory_info ?? { found: false }) as RegulatorInfo,
  };
}

export async function searchBulk(
  rows: SearchEntry[],
  onRowDone: (index: number, results: SearchResult[], regulatory_info: RegulatorInfo) => void,
  onRowError: (index: number, error: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) break;
    try {
      const { results, regulatory_info } = await searchSingle(rows[i]);
      onRowDone(i, results, regulatory_info);
    } catch (err) {
      onRowError(i, String(err));
    }
  }
}

export function priorityColor(tier: number): string {
  switch (tier) {
    case 7: return "bg-teal-100 text-teal-800 border-teal-200";
    case 6: return "bg-purple-100 text-purple-800 border-purple-200";
    case 5: return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case 4: return "bg-blue-100 text-blue-800 border-blue-200";
    case 3: return "bg-sky-100 text-sky-800 border-sky-200";
    case 2: return "bg-amber-100 text-amber-800 border-amber-200";
    case 1: return "bg-orange-100 text-orange-800 border-orange-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
}
