export type SearchMode = "manual" | "bulk";

export const UTILITY_TYPES = [
  "Water", "Sewer", "Electric", "Gas", "Telecom", "Stormwater",
  "School District", "Fire District", "Other",
] as const;
export type UtilityType = (typeof UTILITY_TYPES)[number];

export type EntityCategory =
  | "Rural-Water-Sewer-District"
  | "Municipal-Government"
  | "Municipal-Public-Works"
  | "Municipal-Utility"
  | "Trust-Public-Authority"
  | "Rural-Electric-Cooperative"
  | "Private-Investor-Utility"
  | "Tribal-Nation"
  | "State-Conservation-Agency"
  | "LLC-Inc-Corp"
  | "Energy-Generation"
  | "Private-Subdivision-Park"
  | "Institutional-Self-Supplier"
  | "Federal-Facility"
  | "Individual-Landowner"
  | "Commercial"
  | "Unclassified";

export type BoundaryLikelihood = "High" | "Medium" | "Low" | "Very Low";

export interface SearchEntry {
  state: string;
  county: string;
  agency: string;
  utility_type: string;
  id?: string;
  source?: string;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  score: number;
  priority_tier: number;
  priority_label: string;
  source_type: string;
  ai_reason?: string;
  ai_score?: number;
}

export interface RegulatorInfo {
  found: boolean;
  // Water / SDWIS fields
  pwsid?: string;
  pws_name?: string;
  pws_activity_code?: string;
  pws_type?: string;
  population_served?: number;
  primary_source?: string;
  city?: string;
  state?: string;
  epa_url?: string;
  echo_url?: string;
  sdwis_url?: string;
  // Generic sector fields (all utility types)
  sector_id?: string;
  sector_id_label?: string;
  boundary_url?: string;
  viewer_url?: string;
  download_url?: string;
  data_confidence?: string;
  // Consumer org context
  is_consumer_org?: boolean;
  searched_as?: string;
}

export interface BulkRow extends SearchEntry {
  results: SearchResult[];
  status: "pending" | "searching" | "done" | "error";
  error?: string;
  regulatory_info?: RegulatorInfo;
}

// ─── Pipeline types ───────────────────────────────────────────────────────────

export interface EnrichmentData {
  standardized_name: string;
  county: string;
  county_inferred: boolean;
  description: string;
  provider_type: string;
  flags: string[];
  core_place_tokens: string[];
  entity_suffix: string[];
  ambiguous_tokens: string[];
  entity_category: EntityCategory;
  boundary_likelihood: BoundaryLikelihood;
  utility_type_mismatch?: boolean;
  is_public_provider?: boolean;
  aliases?: string[];
}

export interface PWSDCandidate {
  pwsid: string;
  name: string;
  status: string;
  pws_type: string;
  county: string;
  score: number;
}

export interface ArcGISLayerCandidate {
  title: string;
  owner: string;
  serviceUrl: string;
  snippet: string;
  layerName: string;
  fieldNames: string[];
  featureCount: number;
  score: number;
  maxScore: number;
  reasons: string[];
  idFieldFound: boolean;
  domainTrust: string;
  orgVerified: boolean;
  isAllowlist?: boolean;
  pwsidExactMatch?: boolean;
}

export interface BoundaryFetchResult {
  outcome: 1 | 2 | 3;
  // Outcome 1 fields
  boundary_url?: string;
  download_url?: string;
  agency_name?: string;
  outcome_county?: string;
  outcome_state?: string;
  source_name?: string;
  source_priority?: number;
  // Outcome 2 fields
  pdf_url?: string;
  requires_georeferencing?: boolean;
  // Outcome 3 fields
  reference_url?: string;
  confidence_level?: "High" | "Medium" | "Low";
  rationale?: string;
  // Shared
  regulatory_links?: {
    echo_url?: string;
    sdwis_url?: string;
    state_dww_url?: string;
  };
}

export type PipelineStage = "idle" | "enriching" | "awaiting_selection" | "searching" | "done" | "error";

export interface PipelineState {
  stage: PipelineStage;
  // Stage 1
  enrichment: EnrichmentData | null;
  pwsidCandidates: PWSDCandidate[];
  needsSelection: boolean;
  selectedPwsid: string | null;
  entityMismatch: boolean;
  utilityTypeMismatch: boolean;
  pwsidNotFound: boolean;
  // Stage 2 + 3
  arcgisCandidates: ArcGISLayerCandidate[];
  winner: ArcGISLayerCandidate | null;
  noAcceptableCandidate: boolean;
  // Stage 4
  boundaryFetch: BoundaryFetchResult | null;
  // Final
  results: SearchResult[];
  regulatoryInfo: RegulatorInfo | null;
  error: string | null;
}
