import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface SearchRequest {
  state: string;
  county: string;
  agency: string;
  utility_type: string;
  id?: string;
  source?: string;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  score: number;
  priority_tier: number;
  priority_label: string;
  source_type: string;
  ai_score?: number;
  ai_reason?: string;
}

interface RegulatorInfo {
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

// ─── Constants ───────────────────────────────────────────────────────────────

const STATE_ABBR: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
  "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
  "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
  "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
  // Common misspellings / alternate forms
  "olkahoma": "OK", "oklahama": "OK", "oaklahoma": "OK",
  "illinios": "IL", "illnois": "IL",
  "tenessee": "TN", "tennesse": "TN",
  "missisippi": "MS", "mississipi": "MS",
  "connecticutt": "CT", "conneticut": "CT",
  "massachusets": "MA", "massachsetts": "MA",
  "penssylvania": "PA", "pennsylvannia": "PA",
  "misisouri": "MO", "missour": "MO",
  "kansans": "KS",
  "virgina": "VA", "virgini": "VA",
  // Abbreviations that getStateAbbr already handles via length==2 check,
  // but add lowercase forms here for explicit lookup
  "al":"AL","ak":"AK","az":"AZ","ar":"AR","ca":"CA","co":"CO","ct":"CT",
  "de":"DE","fl":"FL","ga":"GA","hi":"HI","id":"ID","il":"IL","in":"IN",
  "ia":"IA","ks":"KS","ky":"KY","la":"LA","me":"ME","md":"MD","ma":"MA",
  "mi":"MI","mn":"MN","ms":"MS","mo":"MO","mt":"MT","ne":"NE","nv":"NV",
  "nh":"NH","nj":"NJ","nm":"NM","ny":"NY","nc":"NC","nd":"ND","oh":"OH",
  "ok":"OK","or":"OR","pa":"PA","ri":"RI","sc":"SC","sd":"SD","tn":"TN",
  "tx":"TX","ut":"UT","vt":"VT","va":"VA","wa":"WA","wv":"WV","wi":"WI","wy":"WY",
};

const EXCLUDED_DOMAINS = new Set([
  "wikipedia.org", "zillow.com", "realtor.com", "redfin.com",
  "trulia.com", "homes.com", "homefinder.com", "loopnet.com",
  "yellowpages.com", "yelp.com", "facebook.com", "twitter.com",
  "linkedin.com", "reddit.com", "quora.com", "medium.com",
  "blogspot.com", "wordpress.com", "wix.com", "indeed.com",
  "glassdoor.com", "ziprecruiter.com", "monster.com", "angi.com",
  "homeadvisor.com", "thumbtack.com",
  "maps.google.com", "google.com/maps", "mapquest.com",
  "openstreetmap.org", "bing.com/maps", "here.com",
]);

const PRIORITY_LABELS: Record<number, string> = {
  7: "Authoritative Boundary Layer",
  6: "Regulatory / PWSID Record",
  5: "Official Utility Website",
  4: "Official GIS Portal",
  3: "ArcGIS REST Services",
  2: "County/State Government",
  1: "PDF/Ordinance Map",
  0: "Other",
};

const SOURCE_TYPES = {
  BOUNDARY_LAYER: "Authoritative Boundary Layer",
  REGULATORY: "Regulatory / EPA",
  OFFICIAL_UTILITY: "Official Utility Website",
  GIS_PORTAL: "GIS Portal",
  ARCGIS_REST: "ArcGIS REST Service",
  GOV_SITE: "Government Site",
  PDF_MAP: "PDF Map",
  OTHER: "Other",
};

const STATE_GIS_DOMAINS: Record<string, string[]> = {
  "florida": ["fgdl.org", "geodata.florida.gov", "florida.hub.arcgis.com"],
  "texas": ["tnris.org", "data.texas.gov", "texas.hub.arcgis.com"],
  "california": ["gis.data.ca.gov", "california.hub.arcgis.com"],
  "colorado": ["colorado.hub.arcgis.com", "codot.maps.arcgis.com"],
  "arizona": ["azgeo.gov", "arizona.hub.arcgis.com"],
  "georgia": ["georgia.hub.arcgis.com"],
  "north carolina": ["nconemap.gov", "northcarolina.hub.arcgis.com"],
  "virginia": ["virginia.hub.arcgis.com", "gisdata.virginia.gov"],
  "ohio": ["ohio.hub.arcgis.com", "gis.ohio.gov"],
  "pennsylvania": ["pasda.psu.edu", "pennsylvania.hub.arcgis.com"],
  "new york": ["gis.ny.gov", "new-york.hub.arcgis.com"],
  "washington": ["washington.hub.arcgis.com", "geography.wa.gov"],
  "oregon": ["oregon.hub.arcgis.com"],
  "michigan": ["michigan.hub.arcgis.com"],
  "illinois": ["illinois.hub.arcgis.com"],
  "indiana": ["indiana.hub.arcgis.com", "gis.in.gov"],
  "tennessee": ["tennessee.hub.arcgis.com"],
  "alabama": ["alabama.hub.arcgis.com"],
  "louisiana": ["louisiana.hub.arcgis.com"],
  "oklahoma": ["oklahoma.hub.arcgis.com", "okmaps.net"],
  "utah": ["utah.hub.arcgis.com", "gis.utah.gov"],
  "maryland": ["maryland.hub.arcgis.com", "gis.maryland.gov"],
  "minnesota": ["minnesota.hub.arcgis.com"],
  "wisconsin": ["wisconsin.hub.arcgis.com"],
  "south carolina": ["south-carolina.hub.arcgis.com"],
};

// Words that identify an org as a utility consumer rather than a utility provider.
// A "consumer" here means: the agency is a school, hospital, business etc. that
// receives utility service — it does NOT operate the utility itself.
const NON_UTILITY_INSTITUTION_WORDS = [
  "school", "schools", "elementary", "middle", "high school", "k-12",
  "university", "college", "academy", "seminary",
  "hospital", "clinic", "medical center", "health system", "healthcare",
  "church", "chapel", "synagogue", "mosque", "temple", "parish",
  "resort", "hotel", "motel", "lodge", "inn",
  "mall", "plaza", "shopping center",
  "museum", "theater", "theatre", "stadium", "arena", "coliseum",
  "airport", "terminal",
  "prison", "correctional", "detention facility",
];

// Words that identify an org as a utility provider.
const UTILITY_PROVIDER_WORDS = [
  "water", "sewer", "electric", "electricity", "power", "gas",
  "district", "authority", "utility", "utilities", "department", "dept",
  "municipal", "rural", "cooperative", "co-op", "coop",
  "sanitation", "wastewater", "stormwater", "drainage", "treatment",
  "commission", "bureau", "service", "services", "board",
];

// EPA Community Water System Service Areas — public ArcGIS FeatureServer
const EPA_BOUNDARY_SERVER =
  "https://services1.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/EPA_Water_System_Service_Areas_v7/FeatureServer/0";

// ─── Utility helpers ─────────────────────────────────────────────────────────

function getStateAbbr(state: string): string {
  const lower = state.toLowerCase().trim();
  if (lower.length === 2) return lower.toUpperCase();
  return STATE_ABBR[lower] || state.toUpperCase().substring(0, 2);
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// ─── Agency classifier ───────────────────────────────────────────────────────

/**
 * Returns "consumer" when the agency name is clearly a non-utility institution
 * (school, hospital, business, etc.) that *receives* utility service rather than
 * operating it. Returns "provider" for actual utilities and all ambiguous cases.
 */
function classifyAgency(agency: string): "provider" | "consumer" {
  const lower = agency.toLowerCase();
  const hasProvider = UTILITY_PROVIDER_WORDS.some(w => lower.includes(w));
  if (hasProvider) return "provider";
  const hasInstitution = NON_UTILITY_INSTITUTION_WORDS.some(w => lower.includes(w));
  if (hasInstitution) return "consumer";
  return "provider";
}

/**
 * Strips institution-type stop words from an agency name and returns the
 * remaining words as a geographic / place-name context string.
 * e.g. "Tulsa Public Schools" → "Tulsa"
 */
function extractGeographicContext(agency: string): string {
  const stopWords = new Set([
    "public", "private", "school", "schools", "district", "unified",
    "elementary", "high", "middle", "secondary", "primary", "charter",
    "university", "college", "hospital", "medical", "center", "system",
    "church", "resort", "hotel", "corporation", "incorporated",
    "inc", "llc", "ltd", "co",
    "the", "of", "and", "for", "at", "in",
    "community", "regional", "national", "general", "great",
    "academy", "institute", "healthcare", "clinic",
  ]);
  const words = agency
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
  return words.slice(0, 2).join(" ");
}

// ─── EPA Boundary layer query ────────────────────────────────────────────────

/**
 * Queries the EPA Community Water System Service Areas FeatureServer for a
 * specific PWSID. Returns boundary layer URLs if the system exists in the
 * dataset. The EPA dataset covers ~96 % of the US population served by
 * community water systems; ~60 % of boundaries are authoritative state data,
 * ~40 % are modeled estimates.
 */
async function queryEPABoundary(pwsid: string): Promise<{
  boundary_url?: string;
  viewer_url?: string;
  download_url?: string;
  data_confidence?: string;
}> {
  try {
    const where = `PWSID='${pwsid}'`;
    const checkUrl =
      `${EPA_BOUNDARY_SERVER}/query?where=${encodeURIComponent(where)}` +
      `&outFields=PWSID,DATA_CONFIDENCE,Acronym&returnGeometry=false&f=json`;

    const resp = await fetch(checkUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return {};

    const data = await resp.json();

    const geoJsonUrl =
      `${EPA_BOUNDARY_SERVER}/query?where=${encodeURIComponent(where)}` +
      `&outFields=*&f=geojson`;
    const viewerUrl =
      `https://www.arcgis.com/home/webmap/viewer.html?url=${encodeURIComponent(EPA_BOUNDARY_SERVER)}`;

    if (!data.features || data.features.length === 0) {
      // PWSID found in SDWIS but not yet in boundary dataset
      return {
        boundary_url: geoJsonUrl,
        viewer_url: viewerUrl,
        data_confidence: "Not yet in EPA boundary dataset — boundary may be available from state source",
      };
    }

    const attrs = data.features[0].attributes ?? {};
    const raw = String(attrs.DATA_CONFIDENCE ?? attrs.Acronym ?? "");

    const confidenceMap: Record<string, string> = {
      "1": "Authoritative — state-submitted boundary",
      "2": "High confidence — utility-submitted boundary",
      "3": "Modeled estimate — approximate boundary",
      "4": "Low confidence — provisional estimate",
      "S": "Authoritative — state data",
      "U": "Utility-submitted boundary",
      "M": "Modeled / estimated boundary",
    };

    const dataConfidence = confidenceMap[raw] ??
      (raw ? `EPA dataset (confidence code: ${raw})` : "EPA dataset");

    return {
      boundary_url: geoJsonUrl,
      viewer_url: viewerUrl,
      download_url: geoJsonUrl,
      data_confidence: dataConfidence,
    };
  } catch {
    return {};
  }
}

// ─── PWSID / SDWIS lookup ────────────────────────────────────────────────────

async function lookupPWSID(
  agency: string,
  state: string,
  utilityType: string,
  geoContext?: string,
): Promise<RegulatorInfo> {
  const isWaterRelated = [
    "water", "sewer", "wastewater", "stormwater", "drinking",
  ].includes(utilityType.toLowerCase());

  if (!isWaterRelated) return { found: false };

  const stateAbbr = getStateAbbr(state);
  const searchName = geoContext || agency;

  try {
    // Strategy 1 — cleaned name
    const cleanName = searchName
      .replace(/\b(LLC|Inc|Corp|Authority|District|Utility|Department|Dept|Water|Sewer|Wastewater)\b/gi, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 4)
      .join(" ");

    let systems: any[] = [];

    if (cleanName) {
      const url1 =
        `https://data.epa.gov/efservice/WATER_SYSTEM/PRIMACY_AGENCY_CODE/${stateAbbr}` +
        `/PWS_NAME/CONTAINING/${encodeURIComponent(cleanName)}/JSON`;
      const resp1 = await fetch(url1, { signal: AbortSignal.timeout(10000) });
      if (resp1.ok) {
        const d = await resp1.json();
        if (Array.isArray(d)) systems = d;
      }
    }

    // Strategy 2 — first word only
    if (systems.length === 0) {
      const firstWord = searchName.split(/\s+/)[0];
      if (firstWord.length > 3) {
        const url2 =
          `https://data.epa.gov/efservice/WATER_SYSTEM/PRIMACY_AGENCY_CODE/${stateAbbr}` +
          `/PWS_NAME/CONTAINING/${encodeURIComponent(firstWord)}/JSON`;
        const resp2 = await fetch(url2, { signal: AbortSignal.timeout(8000) });
        if (resp2.ok) {
          const d2 = await resp2.json();
          if (Array.isArray(d2)) systems = d2;
        }
      }
    }

    // Strategy 3 — "City of {geoContext}" when we have geographic context
    if (systems.length === 0 && geoContext && !geoContext.toLowerCase().startsWith("city")) {
      const cityQuery = `City of ${geoContext}`;
      const url3 =
        `https://data.epa.gov/efservice/WATER_SYSTEM/PRIMACY_AGENCY_CODE/${stateAbbr}` +
        `/PWS_NAME/CONTAINING/${encodeURIComponent(cityQuery)}/JSON`;
      const resp3 = await fetch(url3, { signal: AbortSignal.timeout(8000) });
      if (resp3.ok) {
        const d3 = await resp3.json();
        if (Array.isArray(d3)) systems = d3;
      }
    }

    if (systems.length === 0) return { found: false };

    // Rank by name overlap against searchName
    const nameLower = searchName.toLowerCase();
    const sorted = systems
      .map(s => {
        const n = (s.PWS_NAME || s.pws_name || "").toLowerCase();
        let score = 0;
        for (const w of nameLower.split(/\s+/).filter(w => w.length > 3)) {
          if (n.includes(w)) score++;
        }
        // Prefer active systems
        if ((s.PWS_ACTIVITY_CODE || s.pws_activity_code || "").toUpperCase() === "A") score += 0.5;
        return { ...s, _matchScore: score };
      })
      .filter(s => s._matchScore > 0)
      .sort((a, b) => b._matchScore - a._matchScore);

    const best = sorted.length > 0
      ? sorted[0]
      : systems.find(s => (s.PWS_ACTIVITY_CODE || s.pws_activity_code || "").toUpperCase() === "A");

    if (!best) return { found: false };

    const info = buildRegulatoryInfo(best);

    // Query EPA boundary layer for the found PWSID
    if (info.pwsid) {
      const boundary = await queryEPABoundary(info.pwsid);
      Object.assign(info, boundary, {
        sector_id: info.pwsid,
        sector_id_label: "PWSID",
      });
    }

    return info;
  } catch {
    return { found: false };
  }
}

function buildRegulatoryInfo(sys: any): RegulatorInfo {
  const pwsid = sys.PWSID || sys.pwsid || "";
  const pwsName = sys.PWS_NAME || sys.pws_name || "";
  const activityCode = sys.PWS_ACTIVITY_CODE || sys.pws_activity_code || "";
  const pwsType = sys.PWS_TYPE_CODE || sys.pws_type_code || "";
  const pop = sys.POPULATION_SERVED_COUNT || sys.population_served_count;
  const source = sys.PRIMARY_SOURCE_CODE || sys.primary_source_code || "";
  const city = sys.CITY_NAME || sys.city_name || "";
  const stateCode = sys.PRIMACY_AGENCY_CODE || sys.primacy_agency_code || "";

  const activityLabel: Record<string, string> = {
    "A": "Active", "I": "Inactive", "M": "Merged", "P": "Pending",
    "N": "Non-Transient Non-Community",
  };
  const typeLabel: Record<string, string> = {
    "CWS": "Community Water System",
    "NTNCWS": "Non-Transient Non-Community",
    "TNCWS": "Transient Non-Community",
  };
  const sourceLabel: Record<string, string> = {
    "GW": "Groundwater", "SW": "Surface Water",
    "GWP": "Purchased Groundwater", "SWP": "Purchased Surface Water",
    "GU": "Groundwater Under Influence",
  };

  return {
    pwsid,
    pws_name: pwsName,
    pws_activity_code: activityLabel[activityCode.toUpperCase()] || activityCode,
    pws_type: typeLabel[pwsType?.toUpperCase()] || pwsType,
    population_served: pop ? parseInt(String(pop), 10) : undefined,
    primary_source: sourceLabel[source?.toUpperCase()] || source,
    city,
    state: stateCode,
    epa_url: pwsid
      ? `https://enviro.epa.gov/enviro/sdw_report_v3.first_table?pws_id=${pwsid}&state_code=${stateCode}&page_no=T&output=html&report_type=b`
      : undefined,
    echo_url: pwsid ? `https://echo.epa.gov/detailed-facility-report?fid=${pwsid}` : undefined,
    sdwis_url: pwsid ? `https://www.epa.gov/enviro/sdw-report?pws_id=${pwsid}` : undefined,
    found: true,
  };
}

// Fetch regulatory info directly by a known/confirmed PWSID — used once a system has
// already been selected (Stage 1), so we don't re-run a fuzzy name search that can land
// on a different, unrelated PWSID than the one the user actually confirmed.
async function lookupPWSIDDirect(pwsid: string): Promise<RegulatorInfo> {
  try {
    const resp = await fetch(`https://data.epa.gov/efservice/WATER_SYSTEM/PWSID/${encodeURIComponent(pwsid)}/JSON`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WaterUtilitySearch/1.0)" },
    });
    if (!resp.ok) return { found: false };
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return { found: false };

    const info = buildRegulatoryInfo(data[0]);
    if (info.pwsid) {
      const boundary = await queryEPABoundary(info.pwsid);
      Object.assign(info, boundary, { sector_id: info.pwsid, sector_id_label: "PWSID" });
    }
    return info;
  } catch {
    return { found: false };
  }
}

// ─── Build authoritative results ─────────────────────────────────────────────

function buildAuthoritativeResults(info: RegulatorInfo): SearchResult[] {
  const results: SearchResult[] = [];
  if (!info.found) return results;

  // Tier 7 — direct boundary polygon from EPA FeatureServer
  if (info.boundary_url) {
    const hasBoundary = !info.data_confidence?.includes("Not yet");
    results.push({
      url: info.boundary_url,
      title: `EPA Boundary Layer — ${info.pws_name || info.pwsid} (${info.pwsid})`,
      snippet: `Direct GeoJSON boundary polygon from EPA Community Water System Service Areas dataset. ${info.data_confidence ?? ""}`,
      score: 1050,
      priority_tier: 7,
      priority_label: PRIORITY_LABELS[7],
      source_type: SOURCE_TYPES.BOUNDARY_LAYER,
      ai_score: 99,
      ai_reason: hasBoundary
        ? `Authoritative EPA boundary polygon for PWSID ${info.pwsid}. ${info.data_confidence ?? ""}`
        : `PWSID ${info.pwsid} found but not yet in EPA spatial dataset`,
    });
  }

  // Tier 7 — ArcGIS Online map viewer
  if (info.viewer_url && info.boundary_url && info.viewer_url !== info.boundary_url) {
    results.push({
      url: info.viewer_url,
      title: `ArcGIS Map Viewer — EPA Water Service Areas (${info.pwsid})`,
      snippet: `Interactive map viewer for the EPA Community Water System Service Areas layer. Filter by PWSID: ${info.pwsid}`,
      score: 1020,
      priority_tier: 7,
      priority_label: PRIORITY_LABELS[7],
      source_type: SOURCE_TYPES.BOUNDARY_LAYER,
      ai_score: 97,
      ai_reason: `ArcGIS Online viewer for EPA water service area boundaries`,
    });
  }

  // Tier 6 — EPA ECHO compliance
  if (info.echo_url) {
    results.push({
      url: info.echo_url,
      title: `EPA ECHO – ${info.pws_name || info.pwsid} (${info.pwsid})`,
      snippet: `EPA Enforcement and Compliance History. Status: ${info.pws_activity_code || "N/A"}. Type: ${info.pws_type || "N/A"}. Population served: ${info.population_served?.toLocaleString() || "N/A"}`,
      score: 980,
      priority_tier: 6,
      priority_label: PRIORITY_LABELS[6],
      source_type: SOURCE_TYPES.REGULATORY,
      ai_score: 95,
      ai_reason: `Official EPA regulatory record for PWSID ${info.pwsid}`,
    });
  }

  // Tier 6 — EPA SDWIS report
  if (info.epa_url) {
    results.push({
      url: info.epa_url,
      title: `EPA SDWIS – ${info.pws_name || info.pwsid} Drinking Water Report`,
      snippet: `Safe Drinking Water Information System report. PWSID: ${info.pwsid}. Source: ${info.primary_source || "N/A"}`,
      score: 960,
      priority_tier: 6,
      priority_label: PRIORITY_LABELS[6],
      source_type: SOURCE_TYPES.REGULATORY,
      ai_score: 90,
      ai_reason: `Official EPA SDWIS drinking water system record`,
    });
  }

  return results;
}

// ─── District / type extraction ───────────────────────────────────────────────

function extractDistrict(agency: string): string {
  const patterns = [
    /district\s*#?\s*(\d+)/i, /d\s*#?\s*(\d+)/i,
    /rwd\s*#?\s*(\d+)/i, /rwsd\s*#?\s*(\d+)/i,
    /uwd\s*#?\s*(\d+)/i, /msd\s*#?\s*(\d+)/i,
    /swd\s*#?\s*(\d+)/i, /wd\s*#?\s*(\d+)/i,
    /utility\s*district\s*#?\s*(\d+)/i, /\bno\.?\s*(\d+)\b/i, /#\s*(\d+)/,
  ];
  for (const p of patterns) {
    const m = agency.match(p);
    if (m) return m[1];
  }
  return "";
}

function extractUtilityTypeFromAgency(agency: string): string[] {
  const types: string[] = [];
  const a = agency.toLowerCase();
  if (a.includes("water") && !a.includes("wastewater")) types.push("water");
  if (a.includes("sewer") || a.includes("wastewater") || a.includes("sanitation")) types.push("sewer");
  if (a.includes("stormwater") || a.includes("storm water") || a.includes("drainage")) types.push("stormwater");
  if (a.includes("gas") && !a.includes("gasoline")) types.push("gas");
  if (a.includes("electric") || a.includes("power")) types.push("electric");
  if (a.includes("solid waste") || a.includes("trash") || a.includes("refuse")) types.push("solid waste");
  return types;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreUrl(
  url: string,
  agency: string,
  state: string,
  county: string,
  utilityType: string,
  district: string,
): [number, number, string, string] {
  const domain = getDomain(url.toLowerCase());
  const fullUrl = url.toLowerCase();

  for (const bad of EXCLUDED_DOMAINS) {
    if (domain.includes(bad)) return [-1, 0, "", ""];
  }

  // Reject k12 / school domains for non-school utility searches
  if (domain.includes(".k12.") || domain.includes("k12.")) {
    return [-1, 0, "", ""];
  }

  let score = 0;
  let priorityTier = 0;
  let sourceType = SOURCE_TYPES.OTHER;

  const agencyWords = agency.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3);
  const agencyMatchCount = agencyWords.filter(w => fullUrl.includes(w)).length;
  const isGovLike = domain.endsWith(".gov") || domain.endsWith(".us") || domain.includes(".state.");
  const isOrg = domain.endsWith(".org");

  const isGisPortal =
    fullUrl.includes("hub.arcgis.com") ||
    fullUrl.includes("experience.arcgis.com") ||
    fullUrl.includes("storymaps.arcgis") ||
    fullUrl.includes("arcgis.com/apps") ||
    fullUrl.includes("opendata") ||
    fullUrl.includes("open-data") ||
    fullUrl.includes("gisdata");

  const isArcgisRest =
    fullUrl.includes("/rest/services") ||
    fullUrl.includes("mapserver") ||
    fullUrl.includes("featureserver") ||
    fullUrl.includes("arcgis/rest");

  const hasBoundaryKeywords =
    fullUrl.includes("boundary") || fullUrl.includes("service-area") ||
    fullUrl.includes("servicearea") || fullUrl.includes("service_area") ||
    fullUrl.includes("district") || fullUrl.includes("polygon") ||
    fullUrl.includes("shapefile") || fullUrl.includes("geodatabase") ||
    fullUrl.includes("coverage") || fullUrl.includes("jurisdiction") ||
    fullUrl.includes("franchise");

  const hasGisKeywords =
    fullUrl.includes("gis") || fullUrl.includes("layer") ||
    fullUrl.includes("kml") || fullUrl.includes("geojson");

  const utilityKeywordsMap: Record<string, string[]> = {
    water: ["water", "h2o", "drinking", "rwd", "rwsd", "uwd", "wd"],
    sewer: ["sewer", "wastewater", "sanitation", "wwtp", "wwd", "msd"],
    stormwater: ["storm", "stormwater", "drainage", "swd"],
    gas: ["gas", "naturalgas"],
    electric: ["electric", "power", "electricity"],
    "solid waste": ["solidwaste", "trash", "refuse", "landfill"],
    telecom: ["telecom", "fiber", "broadband", "cable"],
  };
  const utilityKwList = utilityKeywordsMap[utilityType.toLowerCase()] ?? [utilityType.toLowerCase()];
  const hasUtilityKeyword = utilityKwList.some(kw => fullUrl.includes(kw));

  const hasRelevanceSignal = agencyMatchCount >= 1 || hasUtilityKeyword || hasBoundaryKeywords;

  // PDFs with no utility/boundary/GIS/map content signal are not useful for boundary
  // finding — catches education guides, annual reports, meeting agendas, org charts
  // etc. that happen to share a name or location with the searched utility.
  const isPdf = fullUrl.endsWith(".pdf") || fullUrl.includes("/pdf/");
  if (isPdf && !hasUtilityKeyword && !hasBoundaryKeywords && !hasGisKeywords &&
      !fullUrl.includes("map") && !fullUrl.includes("ordinance")) {
    return [-1, 0, "", ""];
  }

  // For .gov/.us sites the state name is trivially present in the domain
  // (e.g. oklahoma.gov), so a separate "non-trivial" match count excludes
  // geographic words that don't actually signal utility relevance.
  const geoWords = new Set([
    ...state.toLowerCase().split(/\s+/).filter(w => w.length > 2),
    ...county.toLowerCase().split(/\s+/).filter(w => w.length > 2),
    getStateAbbr(state).toLowerCase(),
  ]);
  const nonTrivialAgencyWords = agencyWords.filter(w => !geoWords.has(w));
  const nonTrivialMatchCount = nonTrivialAgencyWords.filter(w => fullUrl.includes(w)).length;

  // BUG FIX: .org with agency name match only scores 900 if the page also has
  // a utility/boundary/GIS signal — prevents school.org, hospital.org, etc.
  // from being ranked as "Official Utility Website"
  if (isOrg && agencyMatchCount >= 2 && (hasUtilityKeyword || hasBoundaryKeywords || hasGisKeywords)) {
    score = 900; priorityTier = 5; sourceType = SOURCE_TYPES.OFFICIAL_UTILITY;
    if (hasBoundaryKeywords) score += 50;
    if (hasGisKeywords) score += 30;
  } else if (isGisPortal) {
    if (!hasRelevanceSignal) return [-1, 0, "", ""];
    score = 850; priorityTier = 4; sourceType = SOURCE_TYPES.GIS_PORTAL;
    if (hasBoundaryKeywords) score += 80;
    if (hasGisKeywords) score += 40;
  } else if (isArcgisRest) {
    if (!hasRelevanceSignal) return [-1, 0, "", ""];
    score = 800; priorityTier = 3; sourceType = SOURCE_TYPES.ARCGIS_REST;
    if (hasBoundaryKeywords) score += 100;
    if (/server\/\d+/.test(fullUrl)) score += 50;
  } else if (isGovLike) {
    // Require a non-trivial signal: utility keyword, boundary keyword, or an agency
    // word that isn't just the state/county name being reflected in the domain.
    const govRelevance = nonTrivialMatchCount >= 1 || hasUtilityKeyword || hasBoundaryKeywords;
    if (!govRelevance) return [-1, 0, "", ""];
    const stateAbbr = getStateAbbr(state).toLowerCase();
    score = 700 + (domain.includes(stateAbbr) ? 50 : 0);
    priorityTier = 2; sourceType = SOURCE_TYPES.GOV_SITE;
    if (hasBoundaryKeywords) score += 60;
    if (hasGisKeywords) score += 40;
    if (fullUrl.includes("gis")) score += 30;
  } else if (isOrg && agencyMatchCount >= 2) {
    // .org with name match but NO utility signal → treat as generic org, lower tier
    if (!hasRelevanceSignal) return [-1, 0, "", ""];
    score = 400; priorityTier = 0; sourceType = SOURCE_TYPES.OTHER;
    if (hasBoundaryKeywords) score += 40;
  } else if (isOrg || agencyMatchCount >= 1) {
    if (!hasRelevanceSignal) return [-1, 0, "", ""];
    score = 550; priorityTier = 1; sourceType = SOURCE_TYPES.OTHER;
    if (hasBoundaryKeywords) score += 40;
    if (hasGisKeywords) score += 30;
  } else {
    return [-1, 0, "", ""];
  }

  const stateClean = state.toLowerCase().replace(/\s+/g, "");
  if (fullUrl.includes(stateClean)) score += 30;
  if (county) {
    const countyClean = county.toLowerCase().replace(/\s+/g, "");
    if (fullUrl.includes(countyClean)) score += 30;
  }
  if (district && fullUrl.includes(district)) score += 40;

  for (const kw of utilityKwList) {
    if (fullUrl.includes(kw)) { score += 25; break; }
  }

  if (fullUrl.endsWith(".pdf") || fullUrl.includes("/pdf/") || fullUrl.includes("ordinance")) {
    if (hasBoundaryKeywords || hasGisKeywords || fullUrl.includes("map")) {
      score = Math.max(score, 650);
      priorityTier = Math.max(priorityTier, 1);
      sourceType = SOURCE_TYPES.PDF_MAP;
    }
  }

  if (fullUrl.endsWith(".shp") || fullUrl.includes("shapefile") ||
      fullUrl.endsWith(".geojson") || fullUrl.endsWith(".kml") ||
      fullUrl.endsWith(".kmz")) {
    score += 80;
    if (priorityTier < 3) priorityTier = 3;
  }

  const label = PRIORITY_LABELS[priorityTier] ?? "Other";
  return [score, priorityTier, label, sourceType];
}

// ─── Query building ───────────────────────────────────────────────────────────

function buildSearchQueries(
  state: string,
  county: string,
  agency: string,
  utilityType: string,
  district: string,
  id?: string,
  source?: string,
  agencyClass?: "provider" | "consumer",
  geoContext?: string,
): string[] {
  const queries: string[] = [];
  const isConsumer = agencyClass === "consumer" && geoContext;
  const geo = isConsumer ? geoContext! : agency;

  // ID-specific queries — always highest signal
  if (id) {
    queries.push(`"${id}" ${utilityType} service area boundary map`);
    queries.push(`"${id}" ${agency} boundary GIS`);
  }

  if (source) {
    queries.push(`${geo} ${utilityType} boundary site:${source}`);
  }

  if (isConsumer) {
    // Consumer path: search for the utility serving the geographic area, NOT
    // the institution's own pages. The full agency name is intentionally dropped.
    queries.push(`${geo} ${state} ${utilityType} service area boundary map`);
    queries.push(`City of ${geo} ${utilityType} service area boundary GIS`);
    queries.push(`${geo} ${state} ${utilityType} district boundary official`);
    queries.push(`${geo} ${state} ${utilityType} service area polygon GIS`);
    queries.push(`"${geo}" ${utilityType} site:hub.arcgis.com OR site:arcgis.com`);
    queries.push(`${geo} ${state} ${utilityType} MapServer OR FeatureServer boundary`);
    queries.push(`${geo} ${state} ${utilityType} district boundary site:.gov`);
    if (county) {
      queries.push(`${geo} ${county} ${utilityType} GIS boundary`);
    }
    const stateGisDomains = STATE_GIS_DOMAINS[state.toLowerCase()] || [];
    if (stateGisDomains.length > 0) {
      const domainQ = stateGisDomains.map(d => `site:${d}`).join(" OR ");
      queries.push(`${geo} ${utilityType} boundary ${domainQ}`);
    }
    if (utilityType.toLowerCase() === "water") {
      queries.push(`${geo} ${state} water utility franchise area map`);
      queries.push(`${geo} ${state} water system service area PWS boundary`);
      queries.push(`${geo} ${state} PWSID water service area`);
    }
  } else {
    // Provider path (original logic)
    const agencyTypes = extractUtilityTypeFromAgency(agency);

    queries.push(`"${agency}" ${utilityType} service area map boundary`);
    queries.push(`"${agency}" ${utilityType} district boundary official`);
    queries.push(`${agency} ${utilityType} service area polygon GIS`);

    if (county) {
      queries.push(`"${agency}" ${county} ${utilityType} GIS data boundary`);
      queries.push(`${state} ${county} ${utilityType} GIS data boundary`);
    }
    queries.push(`"${agency}" ${utilityType} site:hub.arcgis.com OR site:arcgis.com`);
    queries.push(`"${agency}" ${utilityType} MapServer OR FeatureServer boundary`);
    if (county) {
      queries.push(`${state} ${county} ${utilityType} "rest/services" boundary`);
    }
    queries.push(`"${agency}" ${utilityType} GIS layer mapserver`);

    if (district) {
      queries.push(`"${agency}" District ${district} MapServer OR FeatureServer`);
      queries.push(`"${agency}" District ${district} boundary map`);
      queries.push(`${state} ${utilityType} District ${district} boundary service area`);
      if (county) queries.push(`${county} County ${utilityType} District ${district} GIS boundary`);
    }

    queries.push(`"${agency}" ${utilityType} site:.gov OR site:.us boundary map`);
    if (county) queries.push(`${state} ${county} ${utilityType} district boundary site:.gov`);

    const stateGisDomains = STATE_GIS_DOMAINS[state.toLowerCase()] || [];
    if (stateGisDomains.length > 0) {
      const domainQ = stateGisDomains.map(d => `site:${d}`).join(" OR ");
      queries.push(`"${agency}" ${utilityType} boundary ${domainQ}`);
    }

    queries.push(`"${agency}" ${utilityType} service area map filetype:pdf`);
    if (county) queries.push(`${county} ${utilityType} district boundary map pdf`);

    for (const t of agencyTypes) {
      if (t !== utilityType.toLowerCase()) {
        queries.push(`${agency} ${t} boundary map GIS`);
      }
    }

    queries.push(`"${agency}" ${utilityType} site:.org boundary`);
    queries.push(`${agency} ${utilityType} open data boundary`);

    if (utilityType.toLowerCase() === "water") {
      queries.push(`${agency} water district franchise area map`);
      queries.push(`${agency} water service area boundary PWS`);
    }
    if (utilityType.toLowerCase() === "sewer" || utilityType.toLowerCase() === "wastewater") {
      queries.push(`${agency} wastewater sewer service area boundary`);
    }
  }

  return queries.filter(q => q.trim().length > 15);
}

// ─── DuckDuckGo search ────────────────────────────────────────────────────────

async function searchDuckDuckGo(query: string): Promise<Array<{ url: string; title: string; snippet: string }>> {
  const results: Array<{ url: string; title: string; snippet: string }> = [];
  try {
    const params = new URLSearchParams({ q: query, kl: "us-en", kp: "-1" });
    const resp = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://duckduckgo.com/",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return results;
    const html = await resp.text();

    const linkRegex = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/gi;
    const titleRegex = /<a[^>]+class="result__a"[^>]*>(.*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gi;

    const urls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      try { urls.push(decodeURIComponent(match[1])); } catch { /* skip */ }
    }
    const titles: string[] = [];
    while ((match = titleRegex.exec(html)) !== null) {
      titles.push(match[1].replace(/<[^>]+>/g, "").trim());
    }
    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
    }

    for (let i = 0; i < Math.min(urls.length, 10); i++) {
      if (urls[i]) results.push({ url: urls[i], title: titles[i] ?? "", snippet: snippets[i] ?? "" });
    }
  } catch { /* ignore */ }
  return results;
}

// ─── AI ranking ──────────────────────────────────────────────────────────────

async function rankUrlsWithAI(
  candidates: SearchResult[],
  agency: string,
  state: string,
  county: string,
  utilityType: string,
  district: string,
  regInfo: RegulatorInfo,
): Promise<SearchResult[]> {
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey || candidates.length === 0) {
    return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  const urlList = candidates.map((c, i) =>
    `${i + 1}. URL: ${c.url}\n   Title: ${c.title}\n   Source: ${c.source_type}\n   Snippet: ${c.snippet}\n   Score: ${c.score}`
  ).join("\n\n");

  const districtInfo = district ? `, District #${district}` : "";
  const pwsidContext = regInfo.found && regInfo.pwsid
    ? `\nKnown PWSID: ${regInfo.pwsid} | Status: ${regInfo.pws_activity_code} | Type: ${regInfo.pws_type}`
    : "";
  const consumerNote = regInfo.is_consumer_org
    ? `\nNote: "${agency}" is a utility consumer. These results target the ${utilityType} utility serving ${regInfo.searched_as ?? agency}.`
    : "";

  const prompt = `You are a GIS and regulatory expert specializing in US utility district boundaries. Rank these URLs by likelihood of containing the ACTUAL BOUNDARY POLYGON or regulatory service area for:

Agency: ${agency}
Location: ${county ? county + " County, " : ""}${state}${districtInfo}
Utility Type: ${utilityType}${pwsidContext}${consumerNote}

HIGHEST VALUE (rank first):
1. ArcGIS MapServer/FeatureServer with layer IDs (/MapServer/0, /FeatureServer/1) - direct GIS data
2. GIS data downloads (shapefiles, GeoJSON, KML, ZIP with spatial data)
3. Interactive boundary/service area maps
4. PDF maps specifically showing district boundaries or service area
5. State/County GIS portals with utility district layers

LOW VALUE (rank last or exclude):
- Job listings, news, press releases, meeting agendas
- Contact pages, staff directories, HR pages
- General homepage or "about us" pages
- Billing/payment portals
- Social media

Return ONLY a JSON array of top 5 URLs ranked best first:
[{"rank": 1, "url": "...", "score": 95, "reason": "brief reason why this URL likely has the boundary polygon"}]

URLs to analyze:
${urlList}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) return candidates.sort((a, b) => b.score - a.score).slice(0, 5);

    const data = await resp.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return candidates.sort((a, b) => b.score - a.score).slice(0, 5);

    const rankings = JSON.parse(jsonMatch[0]) as Array<{
      rank: number; url: string; score: number; reason: string;
    }>;

    const ranked: SearchResult[] = [];
    const seen = new Set<string>();

    for (const r of rankings) {
      const candidate = candidates.find(c => c.url === r.url);
      if (candidate && !seen.has(r.url)) {
        ranked.push({ ...candidate, score: candidate.score + r.score, ai_score: r.score, ai_reason: r.reason });
        seen.add(r.url);
      }
    }
    for (const c of candidates) {
      if (!seen.has(c.url) && ranked.length < 8) { ranked.push(c); seen.add(c.url); }
    }

    return ranked.slice(0, 5);
  } catch {
    return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
  }
}

// ─── Main orchestrator ───────────────────────────────────────────────────────

async function findUtilityUrls(
  req: SearchRequest,
): Promise<{ results: SearchResult[]; regulatory_info: RegulatorInfo }> {
  const district = extractDistrict(req.agency);
  const agencyClass = classifyAgency(req.agency);
  const geoContext = agencyClass === "consumer"
    ? extractGeographicContext(req.agency)
    : undefined;

  // For consumer orgs, use the geographic context for the PWSID lookup so we
  // find the water utility serving that area rather than the institution itself.
  const pwsidLookupName = geoContext ?? req.agency;

  const [regInfo] = await Promise.all([
    lookupPWSID(pwsidLookupName, req.state, req.utility_type, geoContext),
  ]);

  // Annotate with consumer context
  if (agencyClass === "consumer") {
    regInfo.is_consumer_org = true;
    regInfo.searched_as = geoContext || req.agency;
  }

  const queries = buildSearchQueries(
    req.state, req.county, req.agency, req.utility_type, district,
    req.id, req.source, agencyClass, geoContext,
  );

  const seenUrls = new Set<string>();
  const candidates: SearchResult[] = [];

  // Authoritative boundary + regulatory results always come first
  const authResults = buildAuthoritativeResults(regInfo);
  for (const r of authResults) {
    seenUrls.add(r.url);
    candidates.push(r);
  }

  // Web search in batches
  const batchSize = 4;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(q => searchDuckDuckGo(q)));

    for (const rawResults of batchResults) {
      for (const r of rawResults) {
        if (!r.url || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);

        const [score, priorityTier, priorityLabel, sourceType] = scoreUrl(
          r.url, req.agency, req.state, req.county, req.utility_type, district,
        );
        if (score < 0) continue;
        candidates.push({
          url: r.url, title: r.title, snippet: r.snippet,
          score, priority_tier: priorityTier, priority_label: priorityLabel, source_type: sourceType,
        });
      }
    }

    if (i + batchSize < queries.length) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  // Separate authoritative/regulatory from web results for AI ranking
  const authCandidates = candidates.filter(
    c => c.source_type === SOURCE_TYPES.BOUNDARY_LAYER || c.source_type === SOURCE_TYPES.REGULATORY,
  );
  const webCandidates = candidates
    .filter(c => c.source_type !== SOURCE_TYPES.BOUNDARY_LAYER && c.source_type !== SOURCE_TYPES.REGULATORY)
    .slice(0, 15);

  const aiRanked = await rankUrlsWithAI(
    webCandidates, req.agency, req.state, req.county, req.utility_type, district, regInfo,
  );

  // Authoritative first, then AI-ranked web results
  const allRanked = [...authCandidates, ...aiRanked];

  // Domain diversity cap
  const final: SearchResult[] = [];
  const seenDomains = new Set<string>();
  for (const c of allRanked) {
    const domain = getDomain(c.url);
    const count = [...seenDomains].filter(d => d === domain).length;
    if (count < 2) {
      final.push(c);
      seenDomains.add(domain);
    }
    if (final.length >= 8) break;
  }

  return { results: final, regulatory_info: regInfo };
}

// ─── Phase: Enrich ────────────────────────────────────────────────────────────

// Entity taxonomy driven by observed agency name patterns
type EntityCategory =
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
  | "Fire-Protection-District"
  | "Irrigation-District"
  | "Port-District"
  | "Unclassified";

type BoundaryLikelihood = "High" | "Medium" | "Low" | "Very Low";

interface EnrichmentResult {
  standardized_name: string;
  county: string;
  county_inferred: boolean;
  description: string;
  provider_type: string;
  flags: string[];
  is_public_provider: boolean;
  regulatory_status_context: string;
  // Entity analysis (deterministic, not from LLM)
  core_place_tokens: string[];
  entity_suffix: string[];
  entity_category: EntityCategory;
  boundary_likelihood: BoundaryLikelihood;
  // Legacy PWSID fields — kept empty; real lookup is Phase B
  pwsid: string;
  pws_name: string;
  pwsid_found: boolean;
}

interface PWSDCandidate {
  pwsid: string;
  name: string;
  status: string;
  pws_type: string;
  county: string;
  score: number;
}

// Generic/legal/type tokens that do not help disambiguate place names
// Includes US state names so they are stripped in Step 1 of tokenization
const GENERIC_SUFFIX_WORDS = new Set([
  "water","sewer","gas","electric","electricity","power","utility","utilities",
  "district","authority","trust","service","services","department","dept",
  "commission","board","system","systems","works","infrastructure","network",
  "inc","llc","corp","corporation","company","co","ltd","limited",
  "association","assn","cooperative","coop",
  "the","of","and","a","an","for","by","at","in","no","number",
  "nation","tribal","tribe","native","american","indian",
  "rural","municipal","public","private","community","regional",
  "management","operations","sanitation","wastewater","stormwater",
  "drinking","treatment","drainage",
  // US state names (step 1 of spec: zero discriminating signal per state query)
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada","hampshire",
  "jersey","mexico","york","carolina","dakota","ohio","oklahoma","oregon",
  "pennsylvania","rhode","island","tennessee","texas","utah","vermont",
  "virginia","washington","wisconsin","wyoming",
]);

// County names per state — used in tokenizeAgency Step 5 to flag ambiguous_tokens
// (county names that overlap with place names should not count toward SDWIS name scoring)
const STATE_COUNTY_NAMES: Record<string, Set<string>> = {
  "OK": new Set([
    "adair","alfalfa","atoka","beaver","beckham","blaine","bryan","caddo","canadian",
    "carter","cherokee","choctaw","cimarron","cleveland","coal","comanche","cotton",
    "craig","creek","custer","delaware","dewey","ellis","garfield","garvin","grady",
    "grant","greer","harmon","harper","haskell","hughes","jackson","jefferson",
    "johnston","kay","kingfisher","kiowa","latimer","leflore","lincoln","logan",
    "love","major","marshall","mayes","mcclain","mccurtain","mcintosh","murray",
    "muskogee","noble","nowata","okfuskee","oklahoma","okmulgee","osage","ottawa",
    "pawnee","payne","pittsburg","pontotoc","pottawatomie","pushmataha","rogers",
    "seminole","sequoyah","stephens","texas","tillman","tulsa","wagoner",
    "washington","washita","woods","woodward",
  ]),
  "TX": new Set([
    "anderson","andrews","angelina","aransas","archer","armstrong","atascosa",
    "austin","bailey","bandera","bastrop","baylor","bee","bell","bexar","blanco",
    "borden","bosque","bowie","brazoria","brazos","brewster","briscoe","brooks",
    "brown","burleson","burnet","caldwell","calhoun","callahan","cameron","camp",
    "carson","cass","castro","chambers","cherokee","childress","clay","cochran",
    "coke","coleman","collin","collingsworth","colorado","comal","comanche",
    "concho","cooke","corpus","dallas","dawson","delta","denton","dewitt",
    "donley","duval","eastland","ector","edwards","ellis","erath","falls","fannin",
    "fayette","fisher","floyd","foard","franklin","freestone","frio","gaines",
    "galveston","gillespie","gray","grayson","gregg","grimes","guadalupe","hale",
    "hall","hamilton","hansford","hardeman","hardin","harris","hartley","haskell",
    "hays","henderson","hidalgo","hill","hockley","hood","houston","howard",
    "hunt","hutchinson","irion","jack","jasper","jeff","johnson","jones",
    "karnes","kaufman","kendall","kenedy","kent","kerr","kimble","kinney","kleberg",
    "knox","lamar","lampasas","lavaca","lee","leon","liberty","limestone","lipscomb",
    "live oak","llano","loving","lubbock","lynn","madison","marion","martin",
    "mason","matagorda","maverick","mcculloch","mclennan","medina","menard",
    "midland","milam","mills","mitchell","montague","montgomery","moore","morris",
    "motley","nacogdoches","navarro","newton","nolan","nueces","ochiltree","oldham",
    "orange","palo pinto","panola","parker","parmer","pecos","polk","potter",
    "presidio","rains","randall","reagan","red river","reeves","refugio","roberts",
    "robertson","rockwall","runnels","rusk","sabine","san augustine","san jacinto",
    "san patricio","san saba","schleicher","scurry","shackelford","shelby","sherman",
    "smith","somervell","starr","stephens","sterling","stonewall","sutton","swisher",
    "tarrant","taylor","terry","throckmorton","titus","tom green","travis","trinity",
    "tyler","upshur","upton","uvalde","val verde","van zandt","victoria","walker",
    "waller","ward","washington","webb","wharton","wheeler","wichita","wilbarger",
    "willacy","williamson","wilson","winkler","wise","wood","yoakum","young","zapata","zavala",
  ]),
  "KS": new Set([
    "allen","anderson","atchison","barber","barton","bourbon","brown","butler","chase",
    "chautauqua","cherokee","cheyenne","clark","clay","cloud","coffey","comanche",
    "cowley","crawford","decatur","dickinson","doniphan","douglas","edwards","elk",
    "ellis","ellsworth","finney","ford","franklin","geary","gove","graham","grant",
    "gray","greeley","greenwood","hamilton","harper","harvey","haskell","hodgeman",
    "jackson","jefferson","jewell","johnson","kearny","kingman","kiowa","labette",
    "lane","leavenworth","lincoln","linn","logan","lyon","marion","marshall",
    "mcpherson","meade","miami","mitchell","montgomery","morris","morton","nemaha",
    "neosho","ness","norton","osage","osborne","ottawa","pawnee","phillips","pottawatomie",
    "pratt","rawlins","reno","republic","rice","riley","rooks","rush","russell",
    "saline","scott","sedgwick","seward","shawnee","sheridan","sherman","smith",
    "stafford","stanton","stevens","sumner","thomas","trego","wabaunsee","wallace",
    "washington","wichita","wilson","woodson","wyandotte",
  ]),
};

function tokenizeAgency(
  agency: string, stateAbbr?: string,
): { core_place_tokens: string[]; entity_suffix: string[]; ambiguous_tokens: string[] } {
  const tokens = agency.split(/[\s\-,&.\/]+/).filter(t => t.length > 1);
  const corePlaceTokens: string[] = [];
  const entitySuffix: string[] = [];
  const ambiguousTokens: string[] = [];
  const countySet = stateAbbr ? (STATE_COUNTY_NAMES[stateAbbr] ?? new Set()) : new Set<string>();

  for (const token of tokens) {
    const lower = token.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (GENERIC_SUFFIX_WORDS.has(lower) || /^\d+$/.test(lower)) {
      entitySuffix.push(token);
    } else if (token.length > 2) {
      // Step 5: flag county-name tokens as ambiguous (not core place identifiers)
      if (countySet.has(lower)) {
        ambiguousTokens.push(token);
      } else {
        corePlaceTokens.push(token);
      }
    }
  }
  return { core_place_tokens: corePlaceTokens, entity_suffix: entitySuffix, ambiguous_tokens: ambiguousTokens };
}

function classifyEntityType(agency: string): { entity_category: EntityCategory; boundary_likelihood: BoundaryLikelihood } {
  // wb() creates a word-boundary regex — prevents "National" matching "Nation", etc.
  const wb = (kw: string) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const any = (kws: string[]) => kws.some(kw => wb(kw).test(agency));

  // ── Excluded: Energy-generation assets have no service-area boundary ──
  if (any(["Wind","Energy Center","Clean Energy","Solar Farm","Solar","Power Plant","Generating Station"]) ||
      (any(["Power","Energy","Solar"]) && /\b(Electric|Generation|Generating|Station|Farm|Center)\b/i.test(agency))) {
    return { entity_category: "Energy-Generation", boundary_likelihood: "Very Low" };
  }

  // ── Very Low ─────────────────────────────────────────────────────────────
  if (any(["Air Force","Army","Navy","Marines","Reserve Center","National Guard","Correctional","Military","Prison","Fort"])) {
    return { entity_category: "Federal-Facility", boundary_likelihood: "Very Low" };
  }
  if (any(["School","Schools","Elementary","Middle School","High School","K-12","University","College","Academy","Institute","Public Schools"])) {
    return { entity_category: "Institutional-Self-Supplier", boundary_likelihood: "Very Low" };
  }
  if (any(["Mobile Home Park","Trailer Park","RV Park","Manufactured Home","Estates","Subdivision","Townhouses","Resort","Campground","RV Resort"])) {
    return { entity_category: "Private-Subdivision-Park", boundary_likelihood: "Very Low" };
  }
  if (any(["Bank","Golf","Country Club","Camp","Hotel","Motel","Restaurant","Casino","Church","Temple"])) {
    return { entity_category: "Commercial", boundary_likelihood: "Very Low" };
  }

  // ── High likelihood ───────────────────────────────────────────────────────
  if (any(["Public Works"]) || (any(["City of","Town of","Village of"]) && any(["Public Works","Water Dept","Water Department","Utilities"]))) {
    return { entity_category: "Municipal-Public-Works", boundary_likelihood: "High" };
  }
  if (any(["Municipal Utility Board","Municipal Water","Municipal Light","Municipal Power"])) {
    return { entity_category: "Municipal-Utility", boundary_likelihood: "High" };
  }
  if (any(["City of","Town of","Village of","Municipality of"])) {
    return { entity_category: "Municipal-Government", boundary_likelihood: "High" };
  }

  // ── Rural Water/Sewer District ────────────────────────────────────────────
  if (any(["Rural Water District","Rural Water and Sewer","Rural Water & Sewer","Water District","Solid Waste Management District"]) ||
      /\bRWD\b/.test(agency) || /Water District #\s*\d/i.test(agency)) {
    return { entity_category: "Rural-Water-Sewer-District", boundary_likelihood: "High" };
  }

  // ── Fire Protection District — frequently mislabeled with a "water" utility
  // type in source data, but is not itself a drinking-water utility. A minority
  // do also operate a small water system, so this does NOT skip the PWSID
  // search — it only fixes classification so boundary source selection
  // (county fire-district GIS layers) is correctly prioritized.
  if (any(["Fire Protection District","Fire District","Fire Rescue","Fire & Rescue","Fire and Rescue","Regional Fire Authority","Fire Authority"])) {
    return { entity_category: "Fire-Protection-District", boundary_likelihood: "Medium" };
  }

  // ── Irrigation District — delivers agricultural/irrigation water, distinct
  // from a public drinking-water utility; rarely has an EPA PWSID.
  if (any(["Irrigation District","Reclamation District","Water Users Association","Ditch Association"])) {
    return { entity_category: "Irrigation-District", boundary_likelihood: "Medium" };
  }

  // ── Port District — marine/economic-development special district, not a
  // utility, but usually has a real GIS-mapped boundary.
  if (any(["Port of","Port District"])) {
    return { entity_category: "Port-District", boundary_likelihood: "Medium" };
  }

  // ── Medium-High ───────────────────────────────────────────────────────────
  // "Conservation Authority" is NOT a utility — exclude it here
  if (any(["Authority","Public Authority","Municipal Authority","Trust"]) && !any(["LLC","Inc","Corp","Conservation Authority"])) {
    return { entity_category: "Trust-Public-Authority", boundary_likelihood: "Medium" };
  }

  // ── Cooperative ───────────────────────────────────────────────────────────
  if (any(["Electric Cooperative","Rural Electric","Electricity Cooperative","Electric Co-Op","Electric Coop"])) {
    return { entity_category: "Rural-Electric-Cooperative", boundary_likelihood: "Medium" };
  }

  // ── Tribal — WORD BOUNDARY: "National" must NOT match ────────────────────
  if (any(["Tribal","Tribe","Nation"]) && !/\bNational\b/i.test(agency)) {
    return { entity_category: "Tribal-Nation", boundary_likelihood: "Medium" };
  }

  // ── State/conservation ───────────────────────────────────────────────────
  if (any(["Conservation Commission","Conservation District","Water Resources Board","Water Management District"])) {
    return { entity_category: "State-Conservation-Agency", boundary_likelihood: "Medium" };
  }

  // ── Private investor utility ─────────────────────────────────────────────
  if (/\bUtilities\b/i.test(agency) && !/\bPublic\b/i.test(agency)) {
    return { entity_category: "Private-Investor-Utility", boundary_likelihood: "Medium" };
  }

  // ── LLC / Inc / Corp — Low-Medium ────────────────────────────────────────
  if (any(["LLC","Inc","Corp","Corporation","Company","Association","Assoc"])) {
    return { entity_category: "LLC-Inc-Corp", boundary_likelihood: "Low" };
  }

  // ── Individual-Landowner heuristic: ≤3 words, no utility keyword ─────────
  const words = agency.trim().split(/\s+/);
  const hasUtilityWord = /\b(water|sewer|electric|gas|utility|district|authority|rural)\b/i.test(agency);
  if (words.length <= 3 && !hasUtilityWord) {
    return { entity_category: "Individual-Landowner", boundary_likelihood: "Very Low" };
  }

  return { entity_category: "Unclassified", boundary_likelihood: "Low" };
}


async function enrichWithAI(
  agency: string, state: string, county: string, utilityType: string,
  entityCategory: EntityCategory,
): Promise<EnrichmentResult> {
  const { core_place_tokens, entity_suffix } = tokenizeAgency(agency, getStateAbbr(state));
  const { boundary_likelihood } = classifyEntityType(agency);

  const fallback: EnrichmentResult = {
    standardized_name: core_place_tokens.slice(0, 3).join(" ").toUpperCase() || agency.toUpperCase().slice(0, 20),
    county: county || "",
    county_inferred: false,
    description: `${agency} provides ${utilityType.toLowerCase()} utility services in ${state}.`,
    provider_type: entityCategory === "Tribal-Nation" ? "Tribal Utility"
      : entityCategory === "Municipal-Government" ? "Municipal"
      : entityCategory === "Rural-Water-Sewer-District" ? "Rural Water District"
      : entityCategory === "LLC-Inc-Corp" ? "Private Provider"
      : "Public Provider",
    flags: [],
    is_public_provider: !["LLC-Inc-Corp", "Private-Subdivision-Park", "Individual-Landowner", "Commercial"].includes(entityCategory),
    regulatory_status_context: "",
    core_place_tokens,
    entity_suffix,
    entity_category: entityCategory,
    boundary_likelihood,
    pwsid: "",
    pws_name: "",
    pwsid_found: false,
  };

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fallback;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        system: "You are a US utility regulatory expert. Return only valid JSON. No explanation.",
        messages: [{
          role: "user",
          content: `Analyze this agency. Do NOT guess or generate a PWSID — that is handled separately via official government databases.

Agency: ${agency}
State: ${state}
Utility Type: ${utilityType}
${county ? `County hint: ${county}` : ""}
Pre-classified entity type: ${entityCategory}
Core place tokens: ${core_place_tokens.join(", ")}

Return ONLY this JSON:
{
  "standardized_name": "SHORT ALL-CAPS name as registered in EPA SDWIS (e.g. SASAKWA RWD, CITY OF MIAMI WATER, JENKS WATER DEPT). Use the GEOGRAPHIC PLACE NAME + utility abbreviation. If the agency name contains both a place name (e.g. Sasakwa) and a tribal/nation name (e.g. Seminole Nation), use the PLACE NAME — not the tribal name. Omit 'District of', 'Nation of', etc.",
  "county": "county name — infer from geography if obvious, else blank string",
  "county_inferred": true or false,
  "description": "1-2 sentences: what this utility does and who it serves",
  "provider_type": "Public Provider" | "Private Provider" | "Tribal Utility" | "Municipal" | "Rural Water District" | "Cooperative",
  "is_public_provider": true or false (true for regulated public utilities; false for private, HOA, self-supplied),
  "regulatory_status_context": "1 sentence describing regulatory context, e.g. 'Community water system regulated by Oklahoma DEQ under Safe Drinking Water Act.'",
  "flags": ["Tribal Ambiguity" if tribal wording present but may be non-tribal CWS, "May be Private", "Name Ambiguity"]
}`,
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return fallback;
    const data = await resp.json();
    if (!data.content?.[0]?.text) return fallback;
    const match = (data.content[0].text as string).match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    let parsed: any;
    try { parsed = JSON.parse(match[0]); } catch { return fallback; }
    return {
      ...fallback,
      standardized_name: typeof parsed.standardized_name === "string" ? parsed.standardized_name : fallback.standardized_name,
      county: typeof parsed.county === "string" ? parsed.county : fallback.county,
      county_inferred: typeof parsed.county_inferred === "boolean" ? parsed.county_inferred : fallback.county_inferred,
      description: typeof parsed.description === "string" ? parsed.description : fallback.description,
      provider_type: typeof parsed.provider_type === "string" ? parsed.provider_type : fallback.provider_type,
      is_public_provider: typeof parsed.is_public_provider === "boolean" ? parsed.is_public_provider : fallback.is_public_provider,
      regulatory_status_context: typeof parsed.regulatory_status_context === "string" ? parsed.regulatory_status_context : fallback.regulatory_status_context,
      flags: Array.isArray(parsed.flags) ? parsed.flags : fallback.flags,
      core_place_tokens,
      entity_suffix,
      entity_category: entityCategory,
      boundary_likelihood,
    };
  } catch {
    return fallback;
  }
}

// ─── Phase B: Government PWSID Lookup — 4-gate waterfall ─────────────────────
// PWSIDs come exclusively from official EPA databases.
// LLM is used only for name normalization (Phase A), never for PWSID generation.

// Gate helpers

async function epaEfserviceFetch(stateAbbr: string, name: string, operator: "exact" | "contains"): Promise<any[]> {
  try {
    const path = operator === "exact"
      ? `/PRIMACY_AGENCY_CODE/${stateAbbr}/PWS_NAME/${encodeURIComponent(name)}/JSON`
      : `/PRIMACY_AGENCY_CODE/${stateAbbr}/PWS_NAME/CONTAINING/${encodeURIComponent(name)}/JSON`;
    const resp = await fetch(`https://data.epa.gov/efservice/WATER_SYSTEM${path}`, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WaterUtilitySearch/1.0)" },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function epaEchoFetch(keyword: string, stateAbbr: string): Promise<any[]> {
  // Try both known ECHO base hostnames for resilience
  const urls = [
    `https://echodata.epa.gov/echo/sdw_rest_services.get_systems?p_fn=${encodeURIComponent(keyword)}&p_st=${stateAbbr}&output=JSON`,
    `https://echo.epa.gov/echo/sdw_rest_services.get_systems?p_fn=${encodeURIComponent(keyword)}&p_st=${stateAbbr}&output=JSON`,
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; WaterUtilitySearch/1.0)" },
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const systems: any[] = data?.Results?.WaterSystems ?? [];
      if (systems.length === 0) continue;
      // Actual ECHO JSON field names per EPA metadata (echoSDWGetMeta):
      // PWSId, PWSName, PWSTypeCode, PWSActivityCode, CountiesServed, CitiesServed, StateCode, PopulationServedCount
      return systems.map((s: any) => ({
        PWSID: s.PWSId ?? s.pwsid,
        PWS_NAME: s.PWSName ?? s.pws_name,
        PWS_ACTIVITY_CODE: s.PWSActivityCode ?? s.activity,
        PWS_TYPE_CODE: s.PWSTypeCode ?? s.pws_type,
        COUNTY_SERVED: s.CountiesServed ?? s.county,
        CITY_NAME: s.CitiesServed ?? s.city,
        PRIMACY_AGENCY_CODE: s.StateCode ?? stateAbbr,
        POPULATION_SERVED_COUNT: s.PopulationServedCount,
      }));
    } catch { continue; }
  }
  return [];
}

// Tribal/nation proper names — these identify WHO governs a system, not WHICH place it's in.
// A record matching only on the tribal name (e.g. "SEMINOLE") is not evidence it's the right
// system when the agency name also has a distinct place name (e.g. "SASAKWA"): many unrelated
// systems within a tribal jurisdiction can legitimately contain the tribe's name.
const TRIBAL_NAMES = new Set([
  "seminole","cherokee","choctaw","creek","osage","comanche","navajo","apache","sioux",
  "ojibwe","potawatomi","pueblo","mohawk","wyandotte","shawnee","miami","kickapoo","ponca",
  "tonkawa","pawnee","wichita","caddo","delaware","lenape","absentee","citizen",
]);

// Extract primary keyword, top-3 keywords, and optional tribal keyword from agency name
function extractSearchKeywords(standardizedName: string, originalAgency: string): {
  primary: string;
  top3: string[];
  tribal?: string;
} {
  const stop = new Set([
    "water","district","authority","utility","department","system","service","services",
    "inc","llc","corp","co","the","of","and","or","for","with","from",
    "public","municipal","rural","county","city","town","village","state",
    "management","board","commission","cooperative","nation","tribe","indian",
  ]);
  const words = [...new Set([
    ...standardizedName.toUpperCase().split(/\s+/),
    ...originalAgency.toUpperCase().split(/\s+/),
  ])].filter(w => w.length > 3 && !stop.has(w.toLowerCase()));

  const primary = words[0] || standardizedName.split(/\s+/)[0];
  const top3 = words.slice(0, 3);

  const tribalMatch = originalAgency.match(
    new RegExp(`\\b(${[...TRIBAL_NAMES].join("|")})\\b`, "i"),
  );
  const tribal = tribalMatch ? tribalMatch[1].toUpperCase() : undefined;

  return { primary, top3, tribal };
}

const SCORE_STOP = new Set([
  "water","district","authority","utility","department","system","service","services",
  "inc","llc","corp","co","the","of","and","or","for","with","from","public","municipal",
  "rural","county","city","town","village","state","management","board","commission",
  "cooperative","nation","tribe","tribal","indian","authority",
]);

// Scoring formula per spec
function scoreSDWISRecord(record: any, standardizedName: string, originalAgency: string): number {
  const pwsName = String(record.PWS_NAME || record.pws_name || "").toUpperCase().trim();
  const stdUpper = standardizedName.toUpperCase().trim();
  const origUpper = originalAgency.toUpperCase().trim();
  let score = 0;

  // Exact name match +100
  if (pwsName === stdUpper || pwsName === origUpper) score += 100;

  // Use the more informative name for coverage/Jaccard (whichever has more tokens)
  const stdTokens = stdUpper.split(/\s+/).filter(w => w.length > 2);
  const origTokens = origUpper.split(/\s+/).filter(w => w.length > 2);
  const refUpper = origTokens.length > stdTokens.length ? origUpper : stdUpper;
  // Exclude generic corporate-suffix words (WATER, DISTRICT, SYSTEM, ASSOCIATION, ...) from
  // the overlap calculation — otherwise a candidate that merely shares a suffix word with the
  // agency's legal name (e.g. both end in "DISTRICT") gets rewarded as if that were meaningful
  // similarity, even when the actual identifying place word differs entirely. Verified case:
  // "Valley Water District" (Puyallup) vs EPA's "VALLEY WATER SYSTEM" (correct match, but only
  // shares "VALLEY") was outscored by the unrelated "HOME VALLEY WATER DISTRICT" (Stevenson,
  // WA) purely because both agency name and candidate contain "DISTRICT".
  const filterMeaningful = (s: string) => s.split(/\s+/).filter(w => w.length > 2 && !SCORE_STOP.has(w.toLowerCase()));
  const refWordsList = filterMeaningful(refUpper);
  const pwsWordsList = filterMeaningful(pwsName);
  const refWords = new Set(refWordsList.length > 0 ? refWordsList : refUpper.split(/\s+/).filter(w => w.length > 2));
  const pwsWords = new Set(pwsWordsList.length > 0 ? pwsWordsList : pwsName.split(/\s+/).filter(w => w.length > 2));

  // Word coverage fraction +50
  if (refWords.size > 0) {
    let covered = 0;
    for (const w of refWords) if (pwsWords.has(w)) covered++;
    score += Math.round((covered / refWords.size) * 50);
  }

  // Jaccard similarity +40
  const union = new Set([...refWords, ...pwsWords]);
  const intersection = new Set([...refWords].filter(w => pwsWords.has(w)));
  if (union.size > 0) score += Math.round((intersection.size / union.size) * 40);

  // Name token bonus: a match on the tribal/nation name (+35) outranks a match on a
  // generic place token (+30) — confirmed policy: when an agency name identifies a
  // tribal/nation affiliation (e.g. "...of The Seminole Nation of Oklahoma"), the EPA
  // system registered under that nation's name is preferred over a same-state system
  // that merely shares a place-name token (e.g. "Sasakwa").
  //
  // The tribal bonus requires the SDWIS name to be a CLEAN match on the tribal name alone
  // (e.g. "SEMINOLE"), not merely contain it as a substring — otherwise unrelated
  // county-suffix systems like "SEMINOLE CO. RWD #7" (a Seminole COUNTY rural water
  // district, not the tribal nation's own system) would earn the same bonus as noise.
  const allTokens = origUpper.split(/\s+/).filter(w => w.length > 3 && !SCORE_STOP.has(w.toLowerCase()));
  const placeTokens = allTokens.filter(w => !TRIBAL_NAMES.has(w.toLowerCase()));
  const tribalTokens = allTokens.filter(w => TRIBAL_NAMES.has(w.toLowerCase()));

  const pwsNameCore = pwsName.replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !SCORE_STOP.has(w.toLowerCase()));
  const matchedTribal = tribalTokens.some(tok => pwsNameCore.length === 1 && pwsNameCore[0] === tok);
  const matchedPlace = placeTokens.slice(0, 2).some(tok => pwsName.includes(tok));
  if (matchedTribal) {
    score += 35;
  } else if (matchedPlace) {
    score += 30;
  }

  // Active system +20
  if (String(record.PWS_ACTIVITY_CODE || record.pws_activity_code || "").toUpperCase() === "A") score += 20;

  // Community water system +10
  if (String(record.PWS_TYPE_CODE || record.pws_type_code || "").toUpperCase() === "CWS") score += 10;

  return score;
}

// Oklahoma structural validation: PWSID[2:5] = 3-digit DEQ county code
const OK_COUNTY_CODES: Record<string, string> = {
  "001":"Adair","003":"Alfalfa","005":"Atoka","007":"Beaver","009":"Beckham",
  "011":"Blaine","013":"Bryan","015":"Caddo","017":"Canadian","019":"Carter",
  "021":"Cherokee","023":"Choctaw","025":"Cimarron","027":"Cleveland","029":"Coal",
  "031":"Comanche","033":"Cotton","035":"Craig","037":"Creek","039":"Custer",
  "041":"Delaware","043":"Dewey","045":"Ellis","047":"Garfield","049":"Garvin",
  "051":"Grady","053":"Grant","055":"Greer","057":"Harmon","059":"Harper",
  "061":"Haskell","063":"Hughes","065":"Jackson","067":"Jefferson","069":"Johnston",
  "071":"Kay","073":"Kingfisher","075":"Kiowa","077":"Latimer","079":"LeFlore",
  "081":"Lincoln","083":"Logan","085":"Love","087":"Major","089":"Marshall",
  "091":"Mayes","093":"McClain","095":"McCurtain","097":"McIntosh","099":"Murray",
  "101":"Muskogee","103":"Noble","105":"Nowata","107":"Okfuskee","109":"Oklahoma",
  "111":"Okmulgee","113":"Osage","115":"Ottawa","117":"Pawnee","119":"Payne",
  "121":"Pittsburg","123":"Pontotoc","125":"Pottawatomie","127":"Pushmataha",
  "129":"Roger Mills","131":"Rogers","133":"Seminole","135":"Sequoyah",
  "137":"Stephens","139":"Texas","141":"Tillman","143":"Tulsa","145":"Wagoner",
  "147":"Washington","149":"Washita","151":"Woods","153":"Woodward",
};

function okCountyMatches(pwsid: string, resolvedCounty: string): boolean {
  if (!pwsid.startsWith("OK") || pwsid.length !== 9) return true;
  const code = pwsid.substring(2, 5);
  const mapped = OK_COUNTY_CODES[code];
  if (!mapped) return true; // unknown code — don't invalidate
  const cLower = resolvedCounty.toLowerCase().replace(/\s*county\s*$/i, "").trim();
  const mLower = mapped.toLowerCase();
  return cLower.includes(mLower) || mLower.includes(cLower) || cLower === "" ;
}

const MIN_PWSID_SCORE = 10;

async function lookupPWSIDFromEPA(
  standardizedName: string,
  originalAgency: string,
  stateAbbr: string,
  resolvedCounty: string,
): Promise<{ candidates: PWSDCandidate[]; confidence: "verified" | "ambiguous" | "not_found"; searchTerms: string[]; _debug: object }> {
  const { primary, top3, tribal } = extractSearchKeywords(standardizedName, originalAgency);
  const searchTerms = [standardizedName, ...top3.filter(t => t !== standardizedName)];
  if (tribal) searchTerms.push(tribal);

  const debug: Record<string, any> = { primary, top3, tribal, stateAbbr, standardizedName };

  let allRecords: any[] = [];

  // Gate 1 — Exact match on standardized name (efservice only, fast path)
  const gate1 = await epaEfserviceFetch(stateAbbr, standardizedName, "exact");
  debug.gate1_count = gate1.length;
  allRecords = gate1;

  if (allRecords.length === 0) {
    // Gates 2–4 run efservice and ECHO in PARALLEL for resilience.
    // If efservice is slow/unavailable, ECHO fills the gap; results are merged.
    const [efRecords, echoRecords] = await Promise.all([
      // efservice: try primary keyword (Gate 2), fall through to remaining keywords (Gate 3)
      (async () => {
        // Search the tribal keyword whenever one is detected in the agency name — independent
        // of entity_category, since e.g. "Sasakwa Water District of The Seminole Nation" gets
        // classified as Rural-Water-Sewer-District (not Tribal-Nation) by classifyEntityType,
        // but "Seminole" is still a valid, intentionally-prioritized search term (see
        // scoreSDWISRecord's tribal-name bonus).
        const g2keywords = tribal
          ? [primary, tribal]
          : [primary];
        const g2results = await Promise.all(g2keywords.map(k => epaEfserviceFetch(stateAbbr, k, "contains")));
        const g2flat = g2results.flat();
        debug.gate2_count = g2flat.length;
        if (g2flat.length > 0) return g2flat;
        // Gate 3 — remaining top-3 tokens
        const rest = top3.filter(k => !g2keywords.includes(k));
        const g3 = await Promise.allSettled(rest.map(k => epaEfserviceFetch(stateAbbr, k, "contains")));
        const g3flat = g3.flatMap(r => r.status === "fulfilled" ? r.value : []);
        debug.gate3_count = g3flat.length;
        return g3flat;
      })(),
      // ECHO: parallel fallback, always runs alongside efservice
      epaEchoFetch(primary, stateAbbr),
    ]);
    debug.echo_count = echoRecords.length;
    debug.ef_count = efRecords.length;
    allRecords = [...efRecords, ...echoRecords];
  }

  debug.total_raw = allRecords.length;

  if (allRecords.length === 0) {
    return { candidates: [], confidence: "not_found", searchTerms, _debug: debug };
  }

  // Deduplicate by PWSID and score
  const seen = new Map<string, { record: any; score: number }>();
  for (const r of allRecords) {
    const pwsid = String(r.PWSID || r.pwsid || "").trim();
    if (!pwsid) continue;
    const score = scoreSDWISRecord(r, standardizedName, originalAgency);
    const existing = seen.get(pwsid);
    if (!existing || existing.score < score) seen.set(pwsid, { record: r, score });
  }

  debug.deduped_count = seen.size;

  const rankedCandidates: PWSDCandidate[] = Array.from(seen.entries())
    .filter(([pwsid, { score }]) => score >= MIN_PWSID_SCORE && okCountyMatches(pwsid, resolvedCounty))
    .map(([pwsid, { record, score }]) => ({
      pwsid,
      name: String(record.PWS_NAME || record.pws_name || "").trim(),
      status: String(record.PWS_ACTIVITY_CODE || record.pws_activity_code || "").toUpperCase() === "A" ? "Active" : "Inactive",
      pws_type: String(record.PWS_TYPE_CODE || record.pws_type_code || "CWS").toUpperCase(),
      county: String(record.COUNTY_SERVED || record.county_served || "").split(",")[0].trim() || resolvedCounty,
      score,
    }))
    .sort((a, b) => b.score - a.score);

  // Drop clear stragglers: a wide search net (e.g. the broad tribal-name keyword search)
  // can pull in tangentially-related records — e.g. "SEMINOLE CO. RWD #7" for an agency
  // whose real candidates are "SEMINOLE", "SASAKWA RWD", "SASAKWA PWA". Only keep records
  // within a reasonable gap of the top score, rather than always padding to 5.
  const CANDIDATE_GAP = 25;
  const topScore = rankedCandidates[0]?.score ?? 0;
  const candidates = rankedCandidates
    .filter(c => c.score >= topScore - CANDIDATE_GAP)
    .slice(0, 5);

  debug.candidates_after_filter = candidates.length;
  debug.sample_scores = Array.from(seen.values()).slice(0, 3).map(v => ({ score: v.score, name: v.record.PWS_NAME || v.record.pws_name }));

  if (candidates.length === 0) return { candidates: [], confidence: "not_found", searchTerms, _debug: debug };

  const best = candidates[0].score;
  const second = candidates[1]?.score ?? -Infinity;
  const confidence: "verified" | "ambiguous" | "not_found" =
    candidates.length === 1 || best - second >= 15 ? "verified" : "ambiguous";

  return { candidates, confidence, searchTerms, _debug: debug };
}



async function handleEnrichPhase(body: any): Promise<object> {
  const originalAgency = String(body.agency || "").trim();
  const { state, county = "", utility_type } = body;
  const stateAbbr = getStateAbbr(state);
  const { entity_category, boundary_likelihood } = classifyEntityType(originalAgency);
  const { ambiguous_tokens } = tokenizeAgency(originalAgency, stateAbbr);

  const utilityTypeMismatch = entity_category === "Energy-Generation";
  const isWaterType = ["water","sewer","wastewater","stormwater","drinking"].includes(utility_type.toLowerCase());

  // Phase A — Normalize via AI (no PWSID values produced here)
  const enrichment = await enrichWithAI(originalAgency, state, county, utility_type, entity_category);
  const enrichedCounty = enrichment.county || county || ambiguous_tokens[0] || "";

  // Phase B — 4-gate EPA waterfall (all water-type utilities regardless of ownership)
  const isTribal = entity_category === "Tribal-Nation";
  const { candidates, confidence, searchTerms, _debug: lookupDebug } = isWaterType
    ? await lookupPWSIDFromEPA(enrichment.standardized_name, originalAgency, stateAbbr, enrichedCounty)
    : { candidates: [] as PWSDCandidate[], confidence: "not_found" as const, searchTerms: [originalAgency], _debug: {} };

  const finalCandidates = candidates
    .map(c => ({ ...c, county: c.county || enrichedCounty }))
    .sort((a, b) => b.score - a.score);

  const needsSelection = confidence === "ambiguous" ||
    (isTribal && finalCandidates.length > 0 &&
      ["CWS","NTNCWS","TNCWS"].includes((finalCandidates[0]?.pws_type ?? "").toUpperCase()));
  const noMatch = isWaterType && finalCandidates.length === 0;

  return {
    phase: "enrich",
    enrichment: {
      ...enrichment,
      county: enrichedCounty,
      utility_type_mismatch: utilityTypeMismatch,
      ambiguous_tokens,
      aliases: searchTerms,
    },
    pwsid_candidates: finalCandidates,
    pwsid_confidence: confidence,
    needs_selection: needsSelection,
    pwsid_not_found: noMatch,
    entity_mismatch: confidence === "ambiguous" && isTribal,
    utility_type_mismatch: utilityTypeMismatch,
    auto_selected_pwsid: !needsSelection && finalCandidates.length > 0 ? finalCandidates[0].pwsid : null,
    entity_category,
    boundary_likelihood,
    _pwsid_debug: lookupDebug,
  };
}

// ─── Phase: ArcGIS ────────────────────────────────────────────────────────────

const EPA_WATER_BOUNDARIES =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0";
const EPA_WATER_BOUNDARIES_ALT =
  "https://services1.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/EPA_Water_System_Service_Areas_v7/FeatureServer/0";

// State bounding boxes [minX,minY,maxX,maxY] — mandatory for Tier 4 geo-constrained ArcGIS search
const STATE_BBOXES: Record<string, string> = {
  "AL":"-88.47,30.22,-84.89,35.01","AK":"-179.15,51.22,-129.99,71.37",
  "AZ":"-114.82,31.33,-109.05,37.00","AR":"-94.62,33.00,-89.65,36.50",
  "CA":"-124.41,32.53,-114.13,42.01","CO":"-109.06,36.99,-102.04,41.00",
  "CT":"-73.73,40.99,-71.79,42.05","DE":"-75.79,38.45,-74.98,39.84",
  "FL":"-87.63,24.52,-80.03,31.00","GA":"-85.61,30.36,-80.84,35.00",
  "HI":"-160.25,18.92,-154.80,22.24","ID":"-117.24,41.99,-111.04,48.99",
  "IL":"-91.51,36.97,-87.49,42.51","IN":"-88.10,37.77,-84.78,41.76",
  "IA":"-96.64,40.37,-90.14,43.50","KS":"-102.05,36.99,-94.59,40.00",
  "KY":"-89.57,36.50,-81.96,39.15","LA":"-94.04,28.93,-88.82,33.02",
  "ME":"-71.09,42.98,-66.95,47.46","MD":"-79.49,37.91,-74.98,39.72",
  "MA":"-73.51,41.24,-69.93,42.89","MI":"-90.42,41.70,-82.42,48.19",
  "MN":"-97.24,43.50,-89.49,49.38","MS":"-91.65,30.17,-88.10,35.01",
  "MO":"-95.77,35.99,-89.10,40.61","MT":"-116.05,44.36,-104.04,49.00",
  "NE":"-104.05,40.00,-95.31,43.00","NV":"-120.00,35.00,-114.04,42.00",
  "NH":"-72.56,42.70,-70.70,45.31","NJ":"-75.56,38.93,-73.89,41.36",
  "NM":"-109.05,31.33,-103.00,37.00","NY":"-79.76,40.50,-71.88,45.01",
  "NC":"-84.32,33.84,-75.46,36.59","ND":"-104.05,45.94,-96.55,49.00",
  "OH":"-84.82,38.40,-80.52,41.98","OK":"-103.00,33.60,-94.43,37.00",
  "OR":"-124.57,41.99,-116.46,46.26","PA":"-80.52,39.72,-74.69,42.27",
  "RI":"-71.86,41.15,-71.12,42.02","SC":"-83.35,32.05,-78.54,35.22",
  "SD":"-104.06,42.48,-96.44,45.95","TN":"-90.31,34.98,-81.65,36.68",
  "TX":"-106.65,25.84,-93.51,36.50","UT":"-114.05,36.99,-109.04,42.00",
  "VT":"-73.44,42.73,-71.50,45.02","VA":"-83.68,36.54,-75.24,39.46",
  "WA":"-124.73,45.54,-116.92,49.00","WV":"-82.64,37.20,-77.72,40.64",
  "WI":"-92.89,42.49,-86.25,47.30","WY":"-111.05,40.99,-104.05,45.01",
};

// State ArcGIS Hub / Open Data portal URLs for Tier 3 deterministic search
const STATE_GIS_HUBS: Record<string, string> = {
  "AL":"https://ago-gov.maps.arcgis.com","AK":"https://alaska-dcced.opendata.arcgis.com",
  "AZ":"https://azgeo-open-data-agic.hub.arcgis.com","AR":"https://gis.arkansas.gov",
  "CA":"https://gis.data.ca.gov","CO":"https://data.colorado.gov",
  "CT":"https://geodata.ct.gov","DE":"https://firstmap.delaware.gov",
  "FL":"https://geodata.dep.state.fl.us","GA":"https://opendata.gis.ga.gov",
  "HI":"https://geoportal.hawaii.gov","ID":"https://opendata.gis.idaho.gov",
  "IL":"https://data.illinois.gov","IN":"https://hub.arcgis.com",
  "IA":"https://geodata.iowa.gov","KS":"https://hub.arcgis.com",
  "KY":"https://opengisdata.ky.gov","LA":"https://atlas.la.gov",
  "ME":"https://opendata.maine.gov","MD":"https://data.imap.maryland.gov",
  "MA":"https://docs.digital.mass.gov","MI":"https://gis-michigan.opendata.arcgis.com",
  "MN":"https://gisdata.mn.gov","MS":"https://hub.arcgis.com",
  "MO":"https://msdis.missouri.edu","MT":"https://hub.arcgis.com",
  "NE":"https://nebraskamap.gov","NV":"https://hub.arcgis.com",
  "NH":"https://nhgeodata.unh.edu","NJ":"https://njogis-newjersey.opendata.arcgis.com",
  "NM":"https://rgis.unm.edu","NY":"https://gis.ny.gov",
  "NC":"https://data.nconemap.gov","ND":"https://gishubdata.nd.gov",
  "OH":"https://hub.arcgis.com","OK":"https://hub.arcgis.com",
  "OR":"https://spatialdata.oregonexplorer.info","PA":"https://www.pasda.psu.edu",
  "RI":"https://ridatahub.org","SC":"https://opendata.sc.gov",
  "SD":"https://hub.arcgis.com","TN":"https://tn.gov/finance/sts-gis",
  "TX":"https://tnris.org","UT":"https://gis.utah.gov",
  "VT":"https://geodata.vermont.gov","VA":"https://vgin.vdem.virginia.gov",
  "WA":"https://geo.wa.gov","WV":"https://wvgis.wvu.edu",
  "WI":"https://data-wi-dnr.opendata.arcgis.com","WY":"https://wyoming-geospatial-hub-wyo-gib.hub.arcgis.com",
};

// Gate 2 deny-list — blocks all non-service-area datasets regardless of score
const DATASET_DENY_WORDS = [
  // Water-related but wrong type
  "waterbody","water body","waterbodies","stream","streamflow","stream network","stream centerline",
  "river","creek","lake","riverine","nhd","national hydrography","3dhp","3d hp","3d hydrographic",
  "floodplain","flood plain","flood zone","floodzone","fema","nfhl",
  "watershed","huc","drainage basin","catchment",
  "wetland","wetlands","nwi","bathymetry","aquifer","groundwater",
  // Land / environment
  "protected areas","protected_areas","pad-us","padus","conservation easement","conservation value",
  "park","recreation","trail","forest","forestry","land class","land use","land cover",
  "soil","contamination","geology","habitat","wildlife",
  // Administrative / demographic
  "census","meshblock","census tract","block group","zip code","voting","precinct","zoning","parcel",
  // Infrastructure / other (not service territory)
  "critical infrastructure","critical_infrastructure",
  "transmission line","substation",
  "covid","vulnerability","health","medical",
  "road","transportation","traffic",
];

// Foreign/unrelated publisher reject patterns (applied in Tier 4)
const PUBLISHER_REJECT_RX = [
  /\.nz\b/i, /\.ca\b/i, /\.au\b/i, /\.uk\b/i, /\.in\b/i, /\.de\b/i,
  /govt\.nz/i, /esri_in/i, /esri_au/i, /pncc\.govt/i,
  /nelson.*city/i,
];

interface ArcGISLayerCandidate {
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
  isAllowlist: boolean;
  pwsidExactMatch: boolean;
}

// 3-outcome boundary result contract
interface BoundaryFetchResult {
  outcome: 1 | 2 | 3;
  // Outcome 1: GIS layer with boundary polygon
  boundary_url?: string;
  download_url?: string;
  agency_name?: string;
  outcome_county?: string;
  outcome_state?: string;
  source_name?: string;
  source_priority?: number;
  // Outcome 2: PDF/image map
  pdf_url?: string;
  requires_georeferencing?: boolean;
  // Outcome 3: Agency confirmed but no boundary polygon
  reference_url?: string;
  confidence_level?: "High" | "Medium" | "Low";
  rationale?: string;
  // Always present
  regulatory_links?: { echo_url?: string; sdwis_url?: string; state_dww_url?: string };
}

function buildRegLinks(
  pwsid: string | null, stateAbbr: string, utilityType: string, regInfo: RegulatorInfo,
): { echo_url?: string; sdwis_url?: string; state_dww_url?: string } {
  const ut = utilityType.toLowerCase();
  let state_dww_url: string | undefined;
  if (stateAbbr === "OK") {
    if (/water|drinking/.test(ut) && pwsid) {
      state_dww_url = `http://sdwis.deq.state.ok.us/DWW/JSP/WaterSystemDetail.jsp?tinwsys_st_code=OK&wsnumber=${pwsid}`;
    } else if (/electric/.test(ut)) {
      state_dww_url = "https://www.occeweb.com/Applications/ONERules/";
    } else if (/gas/.test(ut)) {
      state_dww_url = "https://www.occeweb.com";
    } else if (/sewer|wastewater/.test(ut)) {
      state_dww_url = "https://www.deq.state.ok.us/WQDnew/pef/pef_search.asp";
    }
  } else {
    state_dww_url = regInfo.epa_url;
  }
  return {
    echo_url: regInfo.echo_url,
    sdwis_url: regInfo.sdwis_url,
    state_dww_url,
  };
}

// ─── Tier 1: EPA direct PWSID query ──────────────────────────────────────────
// Queries both EPA national boundary layers directly.
// Primary path: exact PWSID match.
// Fallback path: PWS_NAME name search when no PWSID is available.
async function tier1_EPADirectQuery(
  pwsid: string, utilityType: string, nameFallback?: string,
): Promise<ArcGISLayerCandidate | null> {
  const isWater = /water|sewer|wastewater|drinking/i.test(utilityType);
  if (!isWater) return null;

  const sources = [
    { name: "EPA Water System Boundaries", baseUrl: EPA_WATER_BOUNDARIES, priority: 1 },
    { name: "EPA Water System Service Areas", baseUrl: EPA_BOUNDARY_SERVER, priority: 2 },
  ];

  // Build the WHERE clause: PWSID exact match preferred; name LIKE fallback.
  const nameTerm = nameFallback
    ? nameFallback.replace(/"/g, "").split(/\s+/).filter(w => w.length > 3)[0] || nameFallback
    : null;
  const whereByPwsid = pwsid ? `PWSID='${pwsid}'` : null;
  const whereByName = nameTerm
    ? `UPPER(PWS_NAME) LIKE UPPER('%25${encodeURIComponent(nameTerm).replace(/%20/g, "+")}%25')`
    : null;

  for (const { name, baseUrl, priority } of sources) {
    for (const [whereRaw, isPwsidSearch] of [
      [whereByPwsid, true] as const,
      [whereByName, false] as const,
    ]) {
      if (!whereRaw) continue;
      try {
        // Use raw where string for the count query (name LIKE is pre-encoded above)
        const whereEncoded = isPwsidSearch
          ? encodeURIComponent(whereRaw)
          : whereRaw; // already encoded for name search
        const countResp = await fetch(
          `${baseUrl}/query?where=${whereEncoded}&outFields=PWSID&returnCountOnly=true&f=json`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!countResp.ok) continue;
        const countData = await countResp.json();
        const matchCount = countData.count ?? 0;
        if (matchCount === 0) continue;

        const [metaResp, totalResp] = await Promise.allSettled([
          fetch(`${baseUrl}?f=json`, { signal: AbortSignal.timeout(7000) }),
          fetch(`${baseUrl}/query?where=1%3D1&returnCountOnly=true&f=json`, { signal: AbortSignal.timeout(7000) }),
        ]);
        const meta = metaResp.status === "fulfilled" && metaResp.value.ok
          ? await metaResp.value.json().catch(() => ({})) : {};
        const totalData = totalResp.status === "fulfilled" && totalResp.value.ok
          ? await totalResp.value.json().catch(() => ({})) : {};

        const fieldNames: string[] = (meta.fields ?? []).map((f: any) => (f.name ?? "").toLowerCase());
        const layerName = meta.name ?? name;
        const featureCount = totalData.count ?? 0;
        const score = isPwsidSearch ? 245 : (matchCount === 1 ? 220 : 180);
        const geoJsonUrl = `${baseUrl}/query?where=${whereEncoded}&outFields=*&f=geojson`;
        const matchDesc = isPwsidSearch
          ? `PWSID ${pwsid}`
          : `name "${nameTerm}" (${matchCount} match${matchCount > 1 ? "es" : ""})`;

        return {
          title: name,
          owner: "EPA_gov",
          serviceUrl: geoJsonUrl,
          snippet: `EPA boundary polygon matched by ${matchDesc}. Source: ${name}.`,
          layerName,
          fieldNames,
          featureCount,
          score,
          maxScore: 245,
          reasons: [`Tier 1 — EPA boundary match by ${isPwsidSearch ? "PWSID" : "name"} (${priority === 1 ? "primary" : "secondary"} source, ${score}/245)`],
          idFieldFound: fieldNames.includes("pwsid"),
          domainTrust: "trusted EPA authoritative source",
          orgVerified: true,
          isAllowlist: true,
          pwsidExactMatch: isPwsidSearch,
        };
      } catch { continue; }
    }
  }
  return null;
}

// ─── Tier 2: Official website check ──────────────────────────────────────────
// Searches DuckDuckGo for the agency's official website and looks for a GIS/boundary link.
// Returns a layer candidate if a matching GeoJSON/FeatureServer endpoint is found.
async function tier2_OfficialWebsite(
  standardizedName: string, state: string, stateAbbr: string, utilityType: string,
): Promise<ArcGISLayerCandidate | null> {
  try {
    const query = `${standardizedName} ${stateAbbr} ${utilityType} official site`;
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(ddgUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Extract hrefs from DuckDuckGo result links
    const hrefRx = /href="(https?:\/\/[^"]+)"/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    const candidates: string[] = [];
    while ((m = hrefRx.exec(html)) !== null) {
      const url = decodeURIComponent(m[1]);
      if (seen.has(url)) continue;
      seen.add(url);
      // Only consider .gov, .org, or agency-sounding domains
      if (/\.(gov|org|us)\b/i.test(url) && candidates.length < 5) {
        candidates.push(url);
      }
    }

    // Look for a GIS portal or FeatureServer link on official pages
    for (const siteUrl of candidates.slice(0, 3)) {
      try {
        const siteResp = await fetch(siteUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(6000),
        });
        if (!siteResp.ok) continue;
        const siteHtml = await siteResp.text();
        const fsRx = /(https?:\/\/[^\s"']+\/FeatureServer\/\d+)/gi;
        let fsm: RegExpExecArray | null;
        while ((fsm = fsRx.exec(siteHtml)) !== null) {
          const fsUrl = fsm[1];
          if (PUBLISHER_REJECT_RX.some(rx => rx.test(fsUrl))) continue;
          return {
            title: `${standardizedName} Official Site GIS`,
            owner: new URL(siteUrl).hostname,
            serviceUrl: fsUrl,
            snippet: `GIS boundary link found on official agency website for ${standardizedName}, ${stateAbbr}.`,
            layerName: "",
            fieldNames: [],
            featureCount: 0,
            score: 160,
            maxScore: 245,
            reasons: ["Tier 2 — official agency website GIS link (+160)"],
            idFieldFound: false,
            domainTrust: "official agency domain",
            orgVerified: true,
            isAllowlist: false,
            pwsidExactMatch: false,
          };
        }
      } catch { continue; }
    }
  } catch { /* no result */ }
  return null;
}

// ─── Tier 3: State portals (deterministic URL construction) ──────────────────
// Branches by utility type and constructs direct state portal URLs.
// Does NOT use organic ArcGIS sharing/rest/search.
async function tier3_StatePortals(
  corePlaceTokens: string[], standardizedName: string,
  stateAbbr: string, utilityType: string, pwsid?: string,
): Promise<ArcGISLayerCandidate | null> {
  const ut = utilityType.toLowerCase();
  const coreQuery = corePlaceTokens.filter(t => t.length > 2).join(" ");

  // Build a list of candidate FeatureServer URLs to probe, deterministically by state + type
  const candidates: Array<{ url: string; label: string; priority: number }> = [];

  // ── Water: state open data hubs + EPA SDWIS ──────────────────────────────
  if (ut === "water" || ut === "sewer" || ut === "wastewater") {
    // Washington-specific: WA DOH's own "Drinking Water Service Areas" layer (geo.wa.gov,
    // item b09475f47a5a46ca90fe6a168fb22e6d) uses a different ID format than EPA's federal
    // PWSID — e.g. EPA "WA5301250" is WA DOH WS_ID "01250" (state/primacy prefix "WA53"
    // stripped). Without this transform, this genuine WA-specific source silently never
    // gets reached because everything else in this file queries by the full EPA PWSID.
    // Probed with priority 1 (tried before the generic EPA duplicate below) so it's actually
    // used when it has real data, surfacing it as a distinct candidate from Tier 1's EPA layer.
    if (stateAbbr === "WA" && pwsid) {
      const waWsId = pwsid.replace(/^WA53/i, "");
      candidates.push({
        url: `https://services8.arcgis.com/rGGrs6HCnw87OFOT/arcgis/rest/services/Drinking_Water_Service_Areas/FeatureServer/0/query?where=WS_ID%3D'${encodeURIComponent(waWsId)}'&outFields=*&f=geojson`,
        label: "WA DOH Drinking Water Service Areas", priority: 1,
      });
    }
    // Oklahoma-specific
    if (stateAbbr === "OK") {
      candidates.push({
        url: `https://geo.okgov.us/datasets?q=${encodeURIComponent(coreQuery)}+water+district&type=Feature+Service`,
        label: "Oklahoma GIS Open Data Hub", priority: 1,
      });
    }
    // State-level EPA SDWIS boundary layer via ArcGIS REST (deterministic by state)
    if (pwsid) {
      candidates.push({
        url: `https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0/query?where=PWSID%3D'${encodeURIComponent(pwsid)}'&outFields=*&f=geojson`,
        label: "EPA Water System Boundaries (Tier 3 direct)", priority: 1,
      });
    }
    // State GIS Hub via ArcGIS Portal search scoped to state org
    const stateHub = STATE_GIS_HUBS[stateAbbr];
    if (stateHub) {
      candidates.push({
        url: `${stateHub}/sharing/rest/search?q=${encodeURIComponent(`"${coreQuery}" water service area boundary`)}&num=5&f=json&filter=type%3A%22Feature+Service%22`,
        label: `${stateAbbr} State GIS Portal`, priority: 2,
      });
    }
  }

  // ── Electric: state utility commission + coop sites ──────────────────────
  if (ut === "electric") {
    const stateHub = STATE_GIS_HUBS[stateAbbr];
    if (stateHub) {
      candidates.push({
        url: `${stateHub}/sharing/rest/search?q=${encodeURIComponent(`"${coreQuery}" electric cooperative service territory`)}&num=5&f=json&filter=type%3A%22Feature+Service%22`,
        label: `${stateAbbr} State GIS Portal (Electric)`, priority: 2,
      });
    }
  }

  // ── Gas: state utility commission GIS ─────────────────────────────────────
  if (ut === "gas") {
    const stateHub = STATE_GIS_HUBS[stateAbbr];
    if (stateHub) {
      candidates.push({
        url: `${stateHub}/sharing/rest/search?q=${encodeURIComponent(`"${coreQuery}" gas utility service area`)}&num=5&f=json&filter=type%3A%22Feature+Service%22`,
        label: `${stateAbbr} State GIS Portal (Gas)`, priority: 2,
      });
    }
  }

  // Probe each candidate URL
  for (const { url, label, priority } of candidates.sort((a, b) => a.priority - b.priority)) {
    try {
      // Direct FeatureServer/GeoJSON probe (Tier 1 EPA duplicate path or PWSID direct)
      if (url.includes("/FeatureServer/") && url.includes("query?")) {
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;
        const data = await resp.json();
        const featureCount = (data.features ?? []).length;
        if (featureCount > 0) {
          return {
            title: label,
            owner: "state-portal",
            serviceUrl: url,
            snippet: `${label} — direct layer query found ${featureCount} feature(s) for ${standardizedName}.`,
            layerName: label,
            fieldNames: [],
            featureCount,
            score: 180,
            maxScore: 245,
            reasons: [`Tier 3 — ${label} direct query, ${featureCount} features (+180)`],
            idFieldFound: pwsid ? true : false,
            domainTrust: "state/EPA portal",
            orgVerified: true,
            isAllowlist: false,
            pwsidExactMatch: !!pwsid,
          };
        }
        continue;
      }

      // ArcGIS Hub search endpoint
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const item of (data.results ?? [])) {
        const svcUrl = item.url ? `${item.url}/0` : null;
        if (!svcUrl) continue;
        if (PUBLISHER_REJECT_RX.some(rx => rx.test(`${item.owner ?? ""} ${svcUrl}`))) continue;
        const titleLower = (item.title ?? "").toLowerCase();
        const matchCount = corePlaceTokens.filter(t => t.length > 2 && titleLower.includes(t.toLowerCase())).length;
        if (matchCount < 1) continue;
        return {
          title: item.title ?? "",
          owner: item.owner ?? label,
          serviceUrl: svcUrl,
          snippet: item.snippet ?? `${label} GIS layer for ${standardizedName}, ${stateAbbr}.`,
          layerName: "",
          fieldNames: [],
          featureCount: 0,
          score: 150,
          maxScore: 245,
          reasons: [`Tier 3 — ${label} portal match (+150)`],
          idFieldFound: false,
          domainTrust: "state GIS portal",
          orgVerified: true,
          isAllowlist: false,
          pwsidExactMatch: false,
        };
      }
    } catch { continue; }
  }
  return null;
}

// ─── Publisher rejection helper ───────────────────────────────────────────────
function isPublisherRejected(candidate: { owner: string; serviceUrl: string }): boolean {
  const combined = `${candidate.owner} ${candidate.serviceUrl}`;
  return PUBLISHER_REJECT_RX.some(rx => rx.test(combined));
}

// ─── Tier 4: ArcGIS with mandatory bbox ──────────────────────────────────────
// Last-resort ArcGIS search — geographic bbox is MANDATORY to prevent global false positives.
// Replaces the old free-text organic search which returned NZ/Canada/India results.
async function tier4_ArcGISWithBbox(
  corePlaceTokens: string[], standardizedName: string,
  stateAbbr: string, state: string, utilityType: string, pwsid?: string,
  entityCategory?: string,
): Promise<Array<{ title: string; owner: string; serviceUrl: string; snippet: string }>> {
  const bbox = STATE_BBOXES[stateAbbr];
  if (!bbox) return [];

  // Entity category takes priority over the (often mislabeled) utility_type field —
  // e.g. a Fire Protection District is frequently tagged utility_type="water" in source
  // data even though its real boundary source is a county fire-district GIS layer, not
  // a water-service-area one.
  const ut = utilityType.toLowerCase();
  const typeTerms =
    entityCategory === "Fire-Protection-District" ? `"fire district" OR "fire protection" OR "response area" OR "boundary"`
    : entityCategory === "Irrigation-District" ? `"irrigation district" OR "reclamation district" OR "boundary"`
    : entityCategory === "Port-District" ? `"port district" OR "port commissioner" OR "boundary"`
    : ut === "water" ? `"service area" OR "water district" OR "boundary"`
    : ut === "sewer" || ut === "wastewater" ? `"sewer district" OR "wastewater" OR "service area"`
    : ut === "electric" ? `"service territory" OR "electric cooperative" OR "boundary"`
    : ut === "gas" ? `"gas service area" OR "gas district" OR "boundary"`
    : `"service area" OR "boundary"`;

  const coreStr = corePlaceTokens.filter(t => t.length > 2).slice(0, 3).map(t => `"${t}"`).join(" ");
  const queries: string[] = [];

  // PWSID literal (most specific — EPA layers are indexed by PWSID)
  if (pwsid) queries.push(pwsid);

  // Core-token AND state AND type terms (proper boolean query)
  if (coreStr) {
    queries.push(`${coreStr} AND "${state}" AND (${typeTerms})`);
    queries.push(`${coreStr} AND "${stateAbbr}" AND (${typeTerms})`);
  } else {
    queries.push(`"${standardizedName}" AND "${stateAbbr}" AND (${typeTerms})`);
  }

  // Broader fallback: state + type only, no place-name requirement. A small/obscure place
  // name (e.g. "Sasakwa") rarely appears in a statewide dataset's title/description, so the
  // place-name-gated queries above can return zero results even when a genuinely relevant
  // statewide layer exists (e.g. "Oklahoma Rural Water System Service Areas"). Tried last —
  // scoring downstream (scoreArcGISCandidate) still ranks candidates by actual PWSID/place
  // relevance, this just widens the net that reaches scoring.
  queries.push(`(${typeTerms}) AND "${state}"`);

  const seen = new Set<string>();
  const results: Array<{ title: string; owner: string; serviceUrl: string; snippet: string }> = [];

  for (const q of queries) {
    try {
      const url = `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&bbox=${encodeURIComponent(bbox)}&num=10&f=json&sortField=relevance&filter=type%3A%22Feature+Service%22`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const item of (data.results ?? [])) {
        const svcUrl = item.url ? `${item.url}/0` : null;
        if (!svcUrl || seen.has(svcUrl)) continue;
        if (PUBLISHER_REJECT_RX.some(rx => rx.test(`${item.owner ?? ""} ${svcUrl}`))) continue;
        seen.add(svcUrl);
        results.push({ title: item.title ?? "", owner: item.owner ?? "", serviceUrl: svcUrl, snippet: item.snippet ?? "" });
        if (results.length >= 12) break;
      }
    } catch { /* continue */ }
    if (results.length >= 10) break;
  }
  return results.slice(0, 10);
}

// ─── Gate 1: Jurisdiction reject ─────────────────────────────────────────────
// Rejects candidates whose title/URL clearly belongs to a different US state.
function gate1_JurisdictionReject(
  candidate: { title: string; owner: string; serviceUrl: string; snippet: string },
  layerName: string,
  inputStateAbbr: string,
): string | null {
  const titleLayer = `${candidate.title} ${layerName}`.toLowerCase();
  const combined = `${titleLayer} ${candidate.snippet} ${candidate.owner} ${candidate.serviceUrl}`.toLowerCase();

  for (const [sName, abbr] of Object.entries(STATE_ABBR)) {
    if (abbr === inputStateAbbr) continue;
    const a = abbr.toLowerCase();
    const n = sName.replace(/\s+/g, "_").toLowerCase();
    if (
      new RegExp(`^${a}[_\\-\\s]`).test(titleLayer) ||
      new RegExp(`^${a}[_\\-\\s]`).test(layerName.toLowerCase()) ||
      combined.includes(`/${a}_`) ||
      titleLayer.includes(`_${n}_`) ||
      (titleLayer.includes(` ${sName.toLowerCase()} `) && !titleLayer.includes(` ${inputStateAbbr.toLowerCase()} `))
    ) {
      return `Jurisdiction mismatch: layer appears to be from ${abbr} (${sName}), not ${inputStateAbbr}`;
    }
  }
  return null;
}

// ─── Gate 2: Dataset deny-list ────────────────────────────────────────────────
// Rejects datasets whose title/snippet matches the DATASET_DENY_WORDS list.
function gate2_DatasetReject(
  candidate: { title: string; owner: string; serviceUrl: string; snippet: string },
  layerName: string,
): string | null {
  const combined = `${candidate.title} ${layerName} ${candidate.snippet}`.toLowerCase();
  const hit = DATASET_DENY_WORDS.find(kw => combined.includes(kw));
  if (hit) return `Dataset deny-list: "${hit}" matched — not a utility service-area layer`;
  return null;
}

// ─── Gate 3: Live HTTP resolution ─────────────────────────────────────────────
// Fetches layer metadata and verifies it resolves successfully. Rejects 404/error responses.
async function gate3_LiveHTTP(serviceUrl: string): Promise<{
  ok: boolean; fieldNames: string[]; layerName: string; featureCount: number;
}> {
  try {
    const [metaR, countR] = await Promise.allSettled([
      fetch(`${serviceUrl}?f=json`, { signal: AbortSignal.timeout(7000) }),
      fetch(`${serviceUrl}/query?where=1%3D1&returnCountOnly=true&f=json`, { signal: AbortSignal.timeout(7000) }),
    ]);
    if (metaR.status !== "fulfilled" || !metaR.value.ok) return { ok: false, fieldNames: [], layerName: "", featureCount: 0 };
    const m = await metaR.value.json().catch(() => null);
    if (!m || m.error) return { ok: false, fieldNames: [], layerName: "", featureCount: 0 };
    // Check for "Layer not found" or similar ArcGIS error responses
    if (typeof m.error === "object" || m.code === 400 || m.code === 404) {
      return { ok: false, fieldNames: [], layerName: "", featureCount: 0 };
    }
    const fieldNames: string[] = (m.fields ?? []).map((f: any) => (f.name ?? "").toLowerCase());
    const layerName: string = m.name ?? "";
    let featureCount = 0;
    if (countR.status === "fulfilled" && countR.value.ok) {
      const c = await countR.value.json().catch(() => ({}));
      featureCount = c.count ?? 0;
    }
    return { ok: true, fieldNames, layerName, featureCount };
  } catch {
    return { ok: false, fieldNames: [], layerName: "", featureCount: 0 };
  }
}

// ─── Scoring rubric (Tier 4 candidates only) ──────────────────────────────────
function scoreArcGISCandidate(
  candidate: {
    title: string; owner: string; serviceUrl: string;
    isAllowlist?: boolean; pwsidExactMatch?: boolean;
  },
  meta: { fieldNames: string[]; layerName: string; featureCount: number },
  pwsid: string, corePlaceTokens: string[], _state: string, stateAbbr: string,
): { score: number; maxScore: number; reasons: string[]; idFieldFound: boolean; domainTrust: string; orgVerified: boolean } {
  if (candidate.isAllowlist && candidate.pwsidExactMatch) {
    return {
      score: 245, maxScore: 245,
      reasons: ["Tier 1 — EPA allowlist source with exact PWSID match (override — max score)"],
      idFieldFound: true, domainTrust: "trusted EPA authoritative source", orgVerified: true,
    };
  }
  if (candidate.isAllowlist && !candidate.pwsidExactMatch) {
    return {
      score: 0, maxScore: 245,
      reasons: ["EPA allowlist source — PWSID not found (coverage gap)"],
      idFieldFound: false, domainTrust: "trusted EPA authoritative source", orgVerified: true,
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const titleLower = (candidate.title + " " + meta.layerName).toLowerCase();
  const ownerLower = candidate.owner.toLowerCase();

  // AUTO-WIN: EPA Water_System_Boundaries layer with confirmed PWSID field match (+200)
  const isEPABoundaryLayer = /Water_System_Boundaries|Water_System_Service_Areas/i.test(candidate.serviceUrl);
  const idFieldFound = meta.fieldNames.some(f => f.includes("pwsid") || f.includes("pws_id") || f.includes("water_id"));
  if (isEPABoundaryLayer && idFieldFound && pwsid) {
    return {
      score: 200, maxScore: 200,
      reasons: ["EPA Water System Boundaries layer with PWSID field — auto-win (+200)"],
      idFieldFound: true, domainTrust: "trusted EPA authoritative source", orgVerified: true,
    };
  }

  // PWSID field found in layer schema (+100)
  if (idFieldFound) { score += 100; reasons.push("PWSID field in schema (+100)"); }

  // Publisher: confirmed US federal or state government org (+60)
  const isFederalGov = /\.gov\/|epa\.gov|usgs\.gov|census\.gov|services\.arcgis\.com/i.test(candidate.serviceUrl + " " + ownerLower);
  if (isFederalGov) { score += 60; reasons.push("confirmed US federal/state government org (+60)"); }

  // Layer title contains core_place_token: exact word match (+50), partial match (+20)
  const exactTokenMatch = corePlaceTokens.some(t =>
    t.length > 2 && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(titleLower)
  );
  const partialTokenMatch = !exactTokenMatch && corePlaceTokens.some(t => t.length > 2 && titleLower.includes(t.toLowerCase()));
  if (exactTokenMatch) { score += 50; reasons.push("title contains core place token (exact word, +50)"); }
  else if (partialTokenMatch) { score += 20; reasons.push("title contains core place token (partial, +20)"); }

  // Publisher: confirmed state/county government (+40)
  const isStateGov = /\.gov|_gis|_dep|_owrb|_dnr|_epa|\.state\./i.test(ownerLower);
  if (!isFederalGov && isStateGov) { score += 40; reasons.push("confirmed state/county government (+40)"); }

  // Layer TOTAL RECORD COUNT between 1 and 500,000 (+15), else any non-zero (+5)
  if (meta.featureCount > 0 && meta.featureCount < 500_000) {
    score += 15; reasons.push(`layer has ${meta.featureCount.toLocaleString()} total features (+15)`);
  } else if (meta.featureCount >= 500_000) {
    score += 5; reasons.push(`layer has ${meta.featureCount.toLocaleString()} features (very large dataset, +5)`);
  }

  // Utility-type keyword in title (+10)
  if (/water|utility|district|service|sewer|electric|cooperative|gas\b/i.test(titleLower)) {
    score += 10; reasons.push("utility keyword in title (+10)");
  }

  // Trusted .gov domain (+10)
  const domainTrust = /\.gov|services\.arcgis\.com/i.test(candidate.serviceUrl)
    ? "trusted .gov or ArcGIS domain" : "external domain";
  if (/\.gov|services\.arcgis\.com/i.test(candidate.serviceUrl)) {
    score += 10; reasons.push("trusted .gov or services.arcgis.com domain (+10)");
  }

  // At least 1 queryable feature (+5)
  if (meta.featureCount > 0 && score < 100) {
    score += 5; reasons.push("layer has queryable features (+5)");
  }

  const orgVerified = isFederalGov || isStateGov;
  return { score, maxScore: 245, reasons, idFieldFound, domainTrust, orgVerified };
}

// ─── URL resolution check (Stage 4 / fixes P32) ──────────────────────────────
// Returns the URL if it resolves (HTTP 200 + no "not found" body), else null.
async function validateUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    // For JSON endpoints, check for ArcGIS "not found" error bodies
    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const body = await resp.text();
      if (/was not found|invalid layer|layerid.*not found/i.test(body)) return null;
    }
    return url;
  } catch {
    return null;
  }
}

// ─── 3-Outcome boundary fetch ─────────────────────────────────────────────────
async function fetchBoundary3Outcome(
  pwsid: string, agency: string, county: string, state: string,
  utilityType: string, regInfo: RegulatorInfo,
): Promise<BoundaryFetchResult> {
  const stateAbbr = getStateAbbr(state);
  const regulatoryLinks = buildRegLinks(pwsid, stateAbbr, utilityType, regInfo);

  // county/state must NEVER be blank — use SDWIS value or flag NOT_FOUND
  const resolvedCounty = county || regInfo.city || "NOT_FOUND";
  const resolvedState = stateAbbr || "NOT_FOUND";

  const isWater = /water|sewer|wastewater|drinking/i.test(utilityType);
  if (!isWater) {
    return {
      outcome: 3,
      outcome_county: resolvedCounty,
      outcome_state: resolvedState,
      reference_url: regInfo.epa_url ?? regInfo.echo_url,
      confidence_level: "Low",
      rationale: `No EPA national boundary layer exists for ${utilityType} utilities. Check state utility commission or county GIS for service territory.`,
      regulatory_links: regulatoryLinks,
    };
  }

  for (const { name, baseUrl, priority } of [
    { name: "EPA Water System Boundaries", baseUrl: EPA_WATER_BOUNDARIES, priority: 1 },
    { name: "EPA Water System Service Areas v7", baseUrl: EPA_BOUNDARY_SERVER, priority: 2 },
  ]) {
    try {
      const where = `PWSID='${pwsid}'`;
      const geoJsonUrl = `${baseUrl}/query?where=${encodeURIComponent(where)}&outFields=*&f=geojson`;
      const resp = await fetch(geoJsonUrl, { signal: AbortSignal.timeout(12000) });
      if (!resp.ok) continue;
      const geojson = await resp.json();
      if ((geojson.features ?? []).length > 0) {
        const props = geojson.features[0].properties ?? {};
        const featureCounty = props.COUNTY_SERVED || props.PRINCIPAL_COUNTY_SERVED || resolvedCounty;
        const featureState = props.STATE || resolvedState;
        const validatedUrl = await validateUrl(geoJsonUrl);
        if (!validatedUrl) continue;
        return {
          outcome: 1,
          boundary_url: validatedUrl,
          download_url: validatedUrl,
          agency_name: props.PWS_NAME || props.PWSNAME || regInfo.pws_name || agency,
          outcome_county: featureCounty || "NOT_FOUND",
          outcome_state: featureState || "NOT_FOUND",
          source_name: name,
          source_priority: priority,
          regulatory_links: regulatoryLinks,
        };
      }
    } catch { continue; }
  }

  const stateDeqUrl = stateAbbr === "OK"
    ? `https://sdwis.deq.state.ok.us/DWW/JSP/WaterSystemDetail.jsp?tinwsys_st_code=OK&wsnumber=${pwsid}`
    : undefined;

  // Validate reference URL before returning
  const candidateRef = stateDeqUrl ?? regInfo.epa_url ?? regInfo.echo_url ??
    `https://data.epa.gov/efservice/WATER_SYSTEM/PWSID/${pwsid}/JSON`;
  const validatedRef = await validateUrl(candidateRef) ?? candidateRef;

  return {
    outcome: 3,
    outcome_county: resolvedCounty,
    outcome_state: resolvedState,
    reference_url: validatedRef,
    confidence_level: regInfo.found ? "Medium" : "Low",
    rationale: regInfo.found
      ? `State/EPA regulatory record confirms PWSID ${pwsid}, county ${resolvedCounty}, status ${regInfo.pws_activity_code ?? "unknown"} — no spatial boundary polygon published for this system in the EPA national dataset.`
      : `PWSID ${pwsid} could not be confirmed in EPA SDWIS. No spatial boundary available.`,
    regulatory_links: regulatoryLinks,
  };
}

// ─── Stage 2+3+4 orchestrator ──────────────────────────────────────────────────
async function handleArcGISPhase(body: any): Promise<object> {
  const {
    agency, state, county = "", utility_type,
    confirmed_pwsid, standardized_name,
    boundary_likelihood, entity_category,
  } = body;
  const stateAbbr = getStateAbbr(state);
  const searchName = standardized_name || agency;

  // Compute core place tokens from agency name for better ArcGIS queries
  const { core_place_tokens: corePlaceTokens } = tokenizeAgency(agency, stateAbbr);

  // Very Low boundary likelihood → skip all tiers, return Outcome 3 immediately
  if (boundary_likelihood === "Very Low") {
    const regInfo = confirmed_pwsid
      ? await lookupPWSIDDirect(confirmed_pwsid)
      : { found: false } as RegulatorInfo;
    return {
      phase: "arcgis",
      arcgis_candidates: [],
      winner: null,
      no_acceptable_candidate: true,
      boundary_fetch: {
        outcome: 3,
        outcome_county: county || "NOT_FOUND",
        outcome_state: stateAbbr || "NOT_FOUND",
        reference_url: regInfo.found ? regInfo.epa_url : undefined,
        confidence_level: "Low",
        rationale: `Entity category "${entity_category}" has Very Low boundary-availability likelihood (e.g. mobile home park, individual well, or energy generation asset). No public GIS service-area boundary is expected.`,
        regulatory_links: { echo_url: regInfo.echo_url, sdwis_url: regInfo.sdwis_url },
      } as BoundaryFetchResult,
      results: buildAuthoritativeResults(regInfo),
      regulatory_info: regInfo,
    };
  }

  // Entity categories that structurally never have an EPA PWSID (not drinking-water
  // utilities). For these, a missing confirmed_pwsid doesn't mean "try a fuzzy name
  // fallback against the EPA water registry" (Tier 1's nameFallback path, or regInfo's
  // legacy lookupPWSID call) — that produces false positives, e.g. "Fire Protection
  // District 11" fuzzy-matching an unrelated "Irrigation District" purely because both
  // contain the county/place name. It means "skip the EPA water search and rely on
  // Tier 4's entity-specific ArcGIS search instead."
  const NON_PWSID_ENTITY_CATEGORIES = new Set(["Fire-Protection-District", "Irrigation-District", "Port-District"]);
  const skipEPAWaterSearch = !confirmed_pwsid && NON_PWSID_ENTITY_CATEGORIES.has(entity_category);

  // EPA regulatory lookup runs in parallel with tier probes. When a PWSID has already
  // been confirmed (Stage 1 selection), look it up directly instead of re-running a fuzzy
  // name search that can land on a different, unrelated system than the one confirmed.
  const regInfoPromise = confirmed_pwsid
    ? lookupPWSIDDirect(confirmed_pwsid)
    : skipEPAWaterSearch
    ? Promise.resolve({ found: false } as RegulatorInfo)
    : lookupPWSID(agency, state, utility_type).then(async (info) => {
        if (info.found && info.pwsid) {
          const b = await queryEPABoundary(info.pwsid);
          return { ...info, ...b };
        }
        return info;
      });

  // ── Tier 1: EPA direct PWSID query (falls back to name search if no PWSID) ──
  // Note: does NOT short-circuit — even when Tier 1 finds a genuine authoritative match,
  // Tiers 2-4 still run so users see the full candidate set (Tier 1's allowlist-override
  // score naturally still wins the ranking, but lower-confidence alternatives remain visible
  // instead of being hidden).
  const tier1Result = skipEPAWaterSearch
    ? null
    : await tier1_EPADirectQuery(confirmed_pwsid ?? "", utility_type, searchName);

  // ── Tier 2: Official website check ────────────────────────────────────────
  const tier2Result = await tier2_OfficialWebsite(searchName, state, stateAbbr, utility_type);

  // ── Tier 3: State portals ─────────────────────────────────────────────────
  const tier3Result = await tier3_StatePortals(corePlaceTokens, searchName, stateAbbr, utility_type, confirmed_pwsid);

  // ── Tier 4: ArcGIS with mandatory bbox ──────────────────────────────────────
  // Normally requires a confirmed PWSID — without one, an organic water-service search
  // returns globally random results. Exception: Fire/Irrigation/Port districts structurally
  // never have a PWSID (they're not EPA-regulated drinking water systems), so a missing
  // PWSID there doesn't mean "unresolved" — it means "search anyway" via their
  // entity-specific type terms (see tier4_ArcGISWithBbox), which are targeted enough
  // (place tokens + bbox + district-type terms) to avoid the random-result problem.
  const tier4Raw = (confirmed_pwsid || NON_PWSID_ENTITY_CATEGORIES.has(entity_category))
    ? await tier4_ArcGISWithBbox(corePlaceTokens, searchName, stateAbbr, state, utility_type, confirmed_pwsid, entity_category)
    : [];

  // Gate filtering + scoring of Tier 4 candidates
  const scoredTier4: ArcGISLayerCandidate[] = (await Promise.all(
    tier4Raw.map(async (c) => {
      // Gate 1: jurisdiction (fast, title-only first)
      if (gate1_JurisdictionReject(c, "", stateAbbr)) return null;
      // Gate 2: dataset deny-list
      if (gate2_DatasetReject(c, "")) return null;
      // Gate 3: live HTTP resolution
      const meta = await gate3_LiveHTTP(c.serviceUrl);
      if (!meta.ok) return null;
      // Gates 1+2 again with full metadata
      if (gate1_JurisdictionReject(c, meta.layerName, stateAbbr)) return null;
      if (gate2_DatasetReject(c, meta.layerName)) return null;
      const s = scoreArcGISCandidate(c, meta, confirmed_pwsid ?? "", corePlaceTokens, state, stateAbbr);
      return { ...c, ...meta, ...s, isAllowlist: false, pwsidExactMatch: false };
    }),
  )).filter((c): c is ArcGISLayerCandidate => c !== null);

  // Merge tier 1, tier 2, tier 3, and scored tier 4 candidates — dedupe by serviceUrl, since
  // tiers can independently discover the identical underlying resource (e.g. Tier 3 has a
  // built-in safety-net probe of the same EPA Water_System_Boundaries layer Tier 1 already
  // checks, originally only relevant when Tier 1 was skipped). Keep the highest-scoring copy.
  const mergedCandidates: ArcGISLayerCandidate[] = [
    ...(tier1Result ? [tier1Result] : []),
    ...(tier2Result ? [tier2Result] : []),
    ...(tier3Result ? [tier3Result] : []),
    ...scoredTier4,
  ].sort((a, b) => b.score - a.score);

  const seenServiceUrls = new Set<string>();
  const allScored: ArcGISLayerCandidate[] = [];
  for (const c of mergedCandidates) {
    if (seenServiceUrls.has(c.serviceUrl)) continue;
    seenServiceUrls.add(c.serviceUrl);
    allScored.push(c);
  }

  const winner = allScored[0] ?? null;
  const topScore = winner?.score ?? 0;

  // No-acceptable-candidate exit: score < 80 pts and boundary likelihood is Low/Very Low
  const isLowLikelihood = boundary_likelihood === "Low" || boundary_likelihood === "Very Low";
  const noAcceptableCandidate = topScore < 80 && isLowLikelihood;

  const regInfo = await regInfoPromise;

  // Stage 4: 3-outcome boundary fetch
  let boundaryFetch: BoundaryFetchResult | null = null;
  if (confirmed_pwsid && !noAcceptableCandidate) {
    boundaryFetch = await fetchBoundary3Outcome(
      confirmed_pwsid, agency, county, state, utility_type, regInfo,
    );
  } else if (noAcceptableCandidate) {
    const resolvedCounty = county || regInfo.city || "NOT_FOUND";
    boundaryFetch = {
      outcome: 3,
      outcome_county: resolvedCounty,
      outcome_state: stateAbbr || "NOT_FOUND",
      reference_url: regInfo.found ? regInfo.epa_url : undefined,
      confidence_level: "Low",
      rationale: `Top candidate scored ${topScore}/245 — below 80-pt threshold for a "${boundary_likelihood}" boundary-likelihood entity. No boundary polygon returned; regulatory reference provided.`,
      regulatory_links: { echo_url: regInfo.echo_url, sdwis_url: regInfo.sdwis_url },
    };
  }

  const authResults = buildAuthoritativeResults(regInfo);
  const arcgisResults: SearchResult[] = allScored
    .filter(c => c.score > 0)
    .slice(0, 5)
    .map((c) => ({
      url: c.serviceUrl,
      title: c.title || c.layerName,
      snippet: c.snippet || `ArcGIS Feature Service. ${c.reasons.slice(0, 2).join("; ")}`,
      score: 800 + c.score,
      priority_tier: c.isAllowlist ? 7 : c.idFieldFound ? 3 : 2,
      priority_label: c.isAllowlist
        ? "Authoritative Boundary Layer"
        : c.idFieldFound ? "ArcGIS REST Services" : "County/State Government",
      source_type: c.isAllowlist ? "Authoritative Boundary Layer" : "ArcGIS REST Service",
      ai_score: Math.round((c.score / c.maxScore) * 100),
      ai_reason: `Score: ${c.score}/${c.maxScore}. ${c.reasons.join("; ")}.`,
    }));

  return {
    phase: "arcgis",
    arcgis_candidates: allScored,
    winner,
    no_acceptable_candidate: noAcceptableCandidate,
    boundary_fetch: boundaryFetch,
    results: [...authResults, ...arcgisResults],
    regulatory_info: regInfo,
  };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as any;

    if ("rows" in body) {
      const output = [];
      for (const row of body.rows) {
        const { results, regulatory_info } = await findUtilityUrls(row);
        output.push({
          state: row.state, county: row.county, agency: row.agency,
          utility_type: row.utility_type, results, regulatory_info,
        });
      }
      return new Response(JSON.stringify({ rows: output }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (body.phase === "enrich") {
      const result = await handleEnrichPhase(body);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (body.phase === "arcgis") {
      const result = await handleArcGISPhase(body);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const { results, regulatory_info } = await findUtilityUrls(body as SearchRequest);
    return new Response(JSON.stringify({ results, regulatory_info }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
