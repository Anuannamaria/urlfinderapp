import { useState } from "react";
import {
  Search, Loader2, Sparkles, Globe, Star, Map, MapPin,
  CheckCircle2, Circle, AlertCircle, ChevronDown, ChevronUp,
  Copy, ExternalLink, Check, X, Download, FileText,
} from "lucide-react";
import { SearchEntry, UTILITY_TYPES, PipelineState, ArcGISLayerCandidate, BoundaryFetchResult, EntityCategory, BoundaryLikelihood } from "../types";
import { enrichAgency, searchArcGIS } from "../utils/searchApi";
import { GeospatialMapCanvas } from "./GeospatialMapCanvas";

const STATE_NAMES: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
  KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
  MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
  NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
  NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

function normalizeState(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const upper = trimmed.toUpperCase();
  if (STATE_NAMES[upper]) return STATE_NAMES[upper];
  const lower = trimmed.toLowerCase();
  const full = Object.values(STATE_NAMES).find(n => n.toLowerCase() === lower);
  if (full) return full;
  return trimmed.replace(/\b\w/g, c => c.toUpperCase());
}

const PWS_TYPE_LABELS: Record<string, string> = {
  CWS: "Community Water System",
  NTNCWS: "Non-Transient Non-Community",
  TNCWS: "Transient Non-Community",
  NTNC: "Non-Transient Non-Community",
  TNC: "Transient Non-Community",
};

const PIPELINE_STEPS = [
  { id: "enrich", label: "AI Enrichment", Icon: Sparkles },
  { id: "arcgis", label: "ArcGIS Search", Icon: Globe },
  { id: "score", label: "Scoring & Selection", Icon: Star },
  { id: "boundary", label: "Boundary Fetch", Icon: Map },
] as const;

const EMPTY_PIPELINE: PipelineState = {
  stage: "idle",
  enrichment: null,
  pwsidCandidates: [],
  needsSelection: false,
  selectedPwsid: null,
  entityMismatch: false,
  utilityTypeMismatch: false,
  pwsidNotFound: false,
  arcgisCandidates: [],
  winner: null,
  noAcceptableCandidate: false,
  boundaryFetch: null,
  results: [],
  regulatoryInfo: null,
  error: null,
};

export default function ManualSearch() {
  const [form, setForm] = useState<SearchEntry>({
    state: "",
    county: "",
    agency: "",
    utility_type: "Water",
  });
  const [pipeline, setPipeline] = useState<PipelineState>(EMPTY_PIPELINE);
  const [localPickedPwsid, setLocalPickedPwsid] = useState<string | null>(null);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [showAllArcGIS, setShowAllArcGIS] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const isRunning = pipeline.stage === "enriching" || pipeline.stage === "searching";

  const handleChange = (field: keyof SearchEntry, value: string) => {
    const normalized = value;
    setForm((p) => ({ ...p, [field]: normalized }));
  };

  const handleStateBlur = () => {
    setForm((p) => ({ ...p, state: normalizeState(p.state) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedState = normalizeState(form.state);
    if (!normalizedState.trim() || !form.agency.trim()) return;
    const submittedForm = { ...form, state: normalizedState };
    setForm(submittedForm);

    setPipeline({ ...EMPTY_PIPELINE, stage: "enriching" });
    setLocalPickedPwsid(null);
    setShowAllCandidates(false);
    setShowAllArcGIS(false);

    try {
      const enrichRes = await enrichAgency(submittedForm);
      const needsSel = enrichRes.needs_selection || enrichRes.entity_mismatch;
      const autoPwsid = enrichRes.auto_selected_pwsid;
      const pwsidNotFound = enrichRes.pwsid_not_found ?? false;

      setPipeline((p) => ({
        ...p,
        stage: needsSel ? "awaiting_selection" : "searching",
        enrichment: enrichRes.enrichment,
        pwsidCandidates: enrichRes.pwsid_candidates,
        needsSelection: needsSel,
        entityMismatch: enrichRes.entity_mismatch ?? false,
        utilityTypeMismatch: enrichRes.utility_type_mismatch ?? false,
        pwsidNotFound,
        selectedPwsid: autoPwsid,
      }));

      if (!needsSel) {
        await runArcGISPhase(
          form, autoPwsid,
          enrichRes.enrichment.standardized_name,
          enrichRes.enrichment.boundary_likelihood,
          enrichRes.enrichment.entity_category,
        );
      }
    } catch (err) {
      setPipeline((p) => ({ ...p, stage: "error", error: String(err) }));
    }
  };

  const handleSelectPwsid = async (pwsid: string) => {
    const enrichment = pipeline.enrichment!;
    const candidate = pipeline.pwsidCandidates.find(c => c.pwsid === pwsid);
    const nameForSearch = candidate?.name ?? (enrichment.core_place_tokens.join(" ").toUpperCase() || enrichment.standardized_name);
    setLocalPickedPwsid(null);
    setPipeline((p) => ({ ...p, selectedPwsid: pwsid, stage: "searching" }));
    await runArcGISPhase(
      form, pwsid,
      nameForSearch,
      enrichment.boundary_likelihood,
      enrichment.entity_category,
    );
  };

  const runArcGISPhase = async (
    entry: SearchEntry,
    pwsid: string | null,
    standardizedName: string,
    boundaryLikelihood: BoundaryLikelihood,
    entityCategory: EntityCategory,
  ) => {
    try {
      const arcRes = await searchArcGIS(entry, pwsid, standardizedName, boundaryLikelihood, entityCategory);
      setPipeline((p) => ({
        ...p,
        stage: "done",
        arcgisCandidates: arcRes.arcgis_candidates ?? [],
        winner: arcRes.winner ?? null,
        noAcceptableCandidate: arcRes.no_acceptable_candidate ?? false,
        boundaryFetch: arcRes.boundary_fetch ?? null,
        results: arcRes.results ?? [],
        regulatoryInfo: arcRes.regulatory_info ?? null,
      }));
    } catch (err) {
      setPipeline((p) => ({ ...p, stage: "error", error: String(err) }));
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    });
  };

  const activeStep =
    pipeline.stage === "idle" ? -1
    : pipeline.stage === "enriching" ? 0
    : pipeline.stage === "awaiting_selection" ? 0
    : pipeline.stage === "searching" ? 1
    : pipeline.stage === "done" ? 3
    : -1;

  const stepDone = (i: number) =>
    pipeline.stage === "done" ||
    (pipeline.stage === "searching" && i < 1) ||
    (pipeline.stage === "awaiting_selection" && i < 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* ── Left: Form ─────────────────────────────────────────────────────── */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-1">Search Parameters</h2>
          <p className="text-xs text-slate-400 mb-5">
            Enter utility details to run the four-stage discovery pipeline.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Agency / ENC Name" required>
              <input
                type="text"
                placeholder="e.g. Sasakwa Water District of The Semino"
                value={form.agency}
                onChange={(e) => handleChange("agency", e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            <Field label="Utility Type" required>
              <select
                value={form.utility_type}
                onChange={(e) => handleChange("utility_type", e.target.value)}
                className={inputCls}
              >
                {UTILITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <Field label="County / City / District">
              <input
                type="text"
                placeholder="e.g. Murray"
                value={form.county}
                onChange={(e) => handleChange("county", e.target.value)}
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="State" required>
                <input
                  type="text"
                  placeholder="e.g. Oklahoma"
                  value={form.state}
                  onChange={(e) => handleChange("state", e.target.value)}
                  onBlur={handleStateBlur}
                  className={inputCls}
                  required
                />
              </Field>
              <Field label="Country">
                <input type="text" defaultValue="USA" className={inputCls} readOnly />
              </Field>
            </div>

            {pipeline.error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {pipeline.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isRunning}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {isRunning ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
              ) : (
                <><Search className="w-4 h-4" /> Find URL</>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ── Right: Pipeline ─────────────────────────────────────────────────── */}
      <div className="lg:col-span-3 space-y-4">
        {/* Pipeline header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex items-center gap-1">
            {PIPELINE_STEPS.map(({ id, label, Icon }, i) => (
              <div key={id} className="flex items-center gap-1 flex-1 min-w-0">
                <div className={`flex items-center gap-1.5 flex-shrink-0 ${
                  stepDone(i)
                    ? "text-emerald-600"
                    : activeStep === i
                    ? "text-slate-800"
                    : "text-slate-300"
                }`}>
                  {stepDone(i) ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : activeStep === i && isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium whitespace-nowrap hidden sm:block">{label}</span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="h-px flex-1 bg-slate-200 mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* No PWSID found — neutral info, not an error; pipeline continues by name */}
        {pipeline.pwsidNotFound && (
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-slate-500">
              No PWSID found in EPA registry — proceeding with name-based boundary search.
            </span>
          </div>
        )}

        {/* Energy-generation mismatch warning */}
        {pipeline.utilityTypeMismatch && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-semibold text-red-800">Energy Generation Asset</span>
              <span className="text-sm text-red-700"> — This entity is a power generation asset, not a distribution utility. No service-area boundary exists.</span>
            </div>
          </div>
        )}

        {/* Entity mismatch warning */}
        {pipeline.entityMismatch && (
          <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-semibold text-orange-800">Entity Type Mismatch</span>
              <span className="text-sm text-orange-700"> — Tribal name detected but SDWIS registry shows a non-tribal CWS registrant. Select the correct PWSID to confirm the right system.</span>
            </div>
          </div>
        )}

        {/* ID selection alert */}
        {pipeline.needsSelection && !pipeline.selectedPwsid && !pipeline.entityMismatch && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-semibold text-amber-800">ID Selection Required</span>
              <span className="text-sm text-amber-700"> — Multiple registry matches found. Pick the correct PWSID below to continue.</span>
            </div>
          </div>
        )}

        {/* Idle state */}
        {pipeline.stage === "idle" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-20 text-slate-300">
            <Search className="w-12 h-12 mb-3" />
            <p className="text-sm text-slate-400">Enter parameters and click Find URL</p>
          </div>
        )}

        {/* ── Stage 1: AI Enrichment ─────────────────────────────────────── */}
        {(pipeline.stage !== "idle" && (pipeline.enrichment || pipeline.stage === "enriching")) && (
          <StageCard
            number="1"
            label="AI Enrichment"
            Icon={Sparkles}
            loading={pipeline.stage === "enriching"}
            tags={pipeline.enrichment ? [
              pipeline.enrichment.provider_type,
              ...(pipeline.enrichment.flags ?? []),
              ...(pipeline.pwsidCandidates.length > 1 ? [`Review Required (${pipeline.pwsidCandidates.length} matches)`] : []),
            ] : []}
          >
            {pipeline.enrichment && (
              <div className="space-y-4">
                {/* Entity + Likelihood tags */}
                <div className="flex items-center gap-2 flex-wrap">
                  <EntityTag category={pipeline.enrichment.entity_category} />
                  <LikelihoodTag likelihood={pipeline.enrichment.boundary_likelihood} />
                  {pipeline.enrichment.core_place_tokens.length > 0 && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      tokens: [{pipeline.enrichment.core_place_tokens.join(", ")}]
                    </span>
                  )}
                  {(pipeline.enrichment.ambiguous_tokens ?? []).length > 0 && (
                    <span className="text-[11px] text-amber-500 font-mono">
                      ambiguous: [{(pipeline.enrichment.ambiguous_tokens ?? []).join(", ")}]
                    </span>
                  )}
                </div>

                {/* Search aliases used for EPA lookup */}
                {(pipeline.enrichment.aliases ?? []).length > 1 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      EPA Search Aliases
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(pipeline.enrichment.aliases ?? []).slice(1).map((alias) => (
                        <span key={alias} className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-[11px] text-blue-700 font-mono">
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* PWSID highlight */}
                {(pipeline.selectedPwsid ?? pipeline.pwsidCandidates[0]?.pwsid) && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Regulatory ID (PWSID)
                    </p>
                    <p className="text-2xl font-black text-blue-600 font-mono tracking-wide">
                      {pipeline.selectedPwsid ?? pipeline.pwsidCandidates[0].pwsid}
                    </p>
                  </div>
                )}

                {/* Enrichment grid — computed display values */}
                {(() => {
                  const enr = pipeline.enrichment!;
                  const candidates = pipeline.pwsidCandidates;
                  const selectedCand = candidates.find(c => c.pwsid === pipeline.selectedPwsid);
                  const topCand = candidates[0];

                  // Rule 2: standardized name
                  const displayName = selectedCand
                    ? selectedCand.name
                    : enr.core_place_tokens.length > 0
                    ? enr.core_place_tokens.join(" ").toUpperCase()
                    : enr.standardized_name;

                  // Rule 3: county from SDWIS candidates, AI enrichment, or ambiguous place tokens
                  let displayCounty: string;
                  let countyBadge: string | undefined;
                  let countySubtext: string | undefined;

                  // Ambiguous tokens (e.g. "Seminole") are county names detected by tokenizer —
                  // use as last-resort county when no SDWIS or AI county is available
                  const ambiguousCounty = (enr.ambiguous_tokens ?? [])[0] ?? "";

                  if (candidates.length === 0) {
                    const fallback = enr.county || ambiguousCounty;
                    displayCounty = fallback || "NOT_FOUND";
                    countyBadge = fallback ? (enr.county ? (enr.county_inferred ? "AI inferred" : undefined) : "AI inferred") : undefined;
                    if (!fallback) countySubtext = "No SDWIS match found. Enter county manually.";
                  } else {
                    const counties = candidates
                      .map(c => c.county.replace(/\s*county\s*$/i, "").trim())
                      .filter(Boolean);
                    const unique = [...new Set(counties.map(x => x.toLowerCase()))];
                    if (unique.length === 1 && unique[0]) {
                      displayCounty = counties[0];
                      countyBadge = "SDWIS";
                    } else if (unique.length > 1) {
                      displayCounty = "Multiple — pick PWSID to confirm";
                    } else {
                      // All candidate counties are empty — use AI enrichment or ambiguous token
                      const fallback = enr.county || ambiguousCounty;
                      displayCounty = fallback || "NOT_FOUND";
                      countyBadge = fallback ? "AI inferred" : undefined;
                      if (!fallback) countySubtext = "County not returned by SDWIS. Enter manually if needed.";
                    }
                    if (selectedCand?.county) {
                      displayCounty = selectedCand.county.replace(/\s*county\s*$/i, "").trim();
                      countyBadge = "SDWIS";
                    }
                  }

                  return (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <InfoRow label="Standardized Name" value={displayName} />
                      <div>
                        <InfoRow
                          label="County / Jurisdiction"
                          value={displayCounty}
                          badge={countyBadge}
                          icon={<MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                        />
                        {countySubtext && (
                          <p className="text-[10px] text-amber-600 mt-0.5">{countySubtext}</p>
                        )}
                      </div>
                      <InfoRow label="State" value={form.state} />
                      <InfoRow label="Utility Type" value={form.utility_type} />
                    </div>
                  );
                })()}

                {pipeline.enrichment.description && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      Regulatory Context / Description
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">{pipeline.enrichment.description}</p>
                  </div>
                )}

                {/* PWSID candidate selector */}
                {pipeline.needsSelection && !pipeline.selectedPwsid && pipeline.pwsidCandidates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-800">
                          {pipeline.entityMismatch
                            ? "Entity mismatch — confirm the correct water system"
                            : "Multiple registry matches — select the correct system"}
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          The SDWIS registry returned {pipeline.pwsidCandidates.length} candidate{pipeline.pwsidCandidates.length !== 1 ? "s" : ""} that {pipeline.pwsidCandidates.length !== 1 ? "are" : "is"} too close to automatically pick. Select the correct Public Water System below to continue.
                        </p>
                      </div>
                    </div>

                    {(showAllCandidates
                      ? pipeline.pwsidCandidates
                      : pipeline.pwsidCandidates.slice(0, 5)
                    ).map((c) => {
                      const isPicked = localPickedPwsid === c.pwsid;
                      return (
                        <button
                          key={c.pwsid}
                          onClick={() => setLocalPickedPwsid(c.pwsid)}
                          className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                            isPicked
                              ? "border-blue-400 bg-blue-50 shadow-sm"
                              : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-mono text-sm font-bold ${isPicked ? "text-blue-600" : "text-slate-800"}`}>
                                {c.pwsid}
                              </span>
                              <Badge color="green">{c.status}</Badge>
                              {c.pws_type && (
                                <Badge color="gray">{c.pws_type.toUpperCase()}</Badge>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-slate-700 truncate">{c.name}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Score</p>
                            <p className={`text-xl font-black ${isPicked ? "text-blue-600" : "text-slate-600"}`}>{c.score}</p>
                          </div>
                        </button>
                      );
                    })}

                    {pipeline.pwsidCandidates.length > 5 && (
                      <button
                        onClick={() => setShowAllCandidates(!showAllCandidates)}
                        className="w-full text-xs text-slate-500 hover:text-slate-700 py-1 flex items-center justify-center gap-1"
                      >
                        {showAllCandidates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showAllCandidates ? "Show less" : `Show ${pipeline.pwsidCandidates.length - 5} more`}
                      </button>
                    )}

                    {localPickedPwsid ? (
                      <button
                        onClick={() => handleSelectPwsid(localPickedPwsid)}
                        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors shadow-sm"
                      >
                        Continue with {localPickedPwsid}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full py-3 rounded-xl bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed"
                      >
                        Select a system above to continue
                      </button>
                    )}
                  </div>
                )}

                {/* Auto-selected confirmation */}
                {pipeline.selectedPwsid && !pipeline.needsSelection && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    Auto-selected PWSID {pipeline.selectedPwsid} — proceeding to ArcGIS search
                  </div>
                )}
              </div>
            )}
          </StageCard>
        )}

        {/* ── Stage 2: ArcGIS Search ─────────────────────────────────────── */}
        {(pipeline.stage === "searching" || pipeline.stage === "done") && (
          <StageCard
            number="2"
            label="ArcGIS Search"
            Icon={Globe}
            loading={pipeline.stage === "searching"}
            badge={pipeline.arcgisCandidates.length > 0 ? `${pipeline.arcgisCandidates.length} candidates found` : undefined}
            badgeColor="green"
          >
            {pipeline.arcgisCandidates.length > 0 && (
              <div className="space-y-0.5">
                {(showAllArcGIS ? pipeline.arcgisCandidates : pipeline.arcgisCandidates.slice(0, 8)).map((c, i) => (
                  <ArcGISRow key={c.serviceUrl} index={i + 1} candidate={c} copiedUrl={copiedUrl} onCopy={copyUrl} />
                ))}
                {pipeline.arcgisCandidates.length > 8 && (
                  <button
                    onClick={() => setShowAllArcGIS(!showAllArcGIS)}
                    className="w-full text-xs text-slate-500 hover:text-slate-700 pt-2 flex items-center justify-center gap-1"
                  >
                    {showAllArcGIS ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showAllArcGIS ? "Show fewer" : `Show all ${pipeline.arcgisCandidates.length}`}
                  </button>
                )}
              </div>
            )}
            {pipeline.stage === "done" && pipeline.arcgisCandidates.length === 0 && (
              <p className="text-xs text-slate-400 py-1">No ArcGIS candidates found.</p>
            )}
          </StageCard>
        )}

        {/* ── Stage 3: Score & Selection ────────────────────────────────── */}
        {pipeline.stage === "done" && pipeline.winner && (
          <StageCard
            number="3"
            label="Score & Selection"
            Icon={Star}
            badge={
              pipeline.winner.isAllowlist
                ? `EPA Allowlist — ${pipeline.winner.score} pts`
                : `Winner: ${pipeline.winner.score}/${pipeline.winner.maxScore} pts`
            }
            badgeColor="green"
          >
            <WinnerCard
              winner={pipeline.winner}
              allCandidates={pipeline.arcgisCandidates}
              copiedUrl={copiedUrl}
              onCopy={copyUrl}
            />
          </StageCard>
        )}

        {pipeline.stage === "done" && !pipeline.winner && pipeline.noAcceptableCandidate && (
          <StageCard number="3" label="Score & Selection" Icon={Star}>
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              No ArcGIS layer met the minimum score threshold — routing to reference link only.
            </div>
          </StageCard>
        )}

        {/* ── Stage 4: Boundary Fetch ───────────────────────────────────── */}
        {pipeline.stage === "done" && pipeline.boundaryFetch && (
          <StageCard
            number="4"
            label="Boundary Fetch"
            Icon={Map}
            badge={
              pipeline.boundaryFetch.outcome === 1 ? "Outcome 1 — GIS Polygon Found"
              : pipeline.boundaryFetch.outcome === 2 ? "Outcome 2 — PDF / Requires Georef"
              : "Outcome 3 — No Boundary"
            }
            badgeColor={pipeline.boundaryFetch.outcome === 1 ? "green" : "gray"}
          >
            <BoundaryOutcomeCard fetch={pipeline.boundaryFetch} copiedUrl={copiedUrl} onCopy={copyUrl} />
          </StageCard>
        )}

        {pipeline.stage === "done" && pipeline.boundaryFetch?.outcome === 1 &&
          (pipeline.boundaryFetch.download_url || pipeline.boundaryFetch.boundary_url) && (
            <GeospatialMapCanvas
              geojsonUrl={pipeline.boundaryFetch.download_url ?? pipeline.boundaryFetch.boundary_url!}
            />
        )}

        {/* Fallback: old regulatory_info path when no boundaryFetch */}
        {pipeline.stage === "done" && !pipeline.boundaryFetch && pipeline.regulatoryInfo?.found && (
          <StageCard number="4" label="Boundary Fetch" Icon={Map}>
            <BoundaryFetchCard info={pipeline.regulatoryInfo} copiedUrl={copiedUrl} onCopy={copyUrl} />
          </StageCard>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StageCard({
  number, label, Icon, loading = false, tags, badge, badgeColor = "gray", children,
}: {
  number: string;
  label: string;
  Icon: React.ElementType;
  loading?: boolean;
  tags?: string[];
  badge?: string;
  badgeColor?: "green" | "gray";
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          loading ? "bg-blue-50" : "bg-slate-50"
        }`}>
          {loading
            ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            : <Icon className="w-4 h-4 text-slate-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm font-semibold text-slate-800">Stage {number} — {label}</span>
            {badge && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                badgeColor === "green"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }`}>
                {badge}
              </span>
            )}
          </div>
        </div>
        {tags && tags.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5">
            {tags.map((tag) => <Tag key={tag} label={tag} />)}
          </div>
        )}
      </div>
      {loading && !children && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Running…
        </div>
      )}
      {children}
    </div>
  );
}

function EntityTag({ category }: { category: EntityCategory }) {
  const styles: Record<EntityCategory, string> = {
    "Rural-Water-Sewer-District": "bg-sky-100 text-sky-700 border-sky-200",
    "Municipal-Government": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Municipal-Public-Works": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Municipal-Utility": "bg-teal-100 text-teal-700 border-teal-200",
    "Trust-Public-Authority": "bg-violet-100 text-violet-700 border-violet-200",
    "Rural-Electric-Cooperative": "bg-yellow-100 text-yellow-700 border-yellow-200",
    "Private-Investor-Utility": "bg-blue-100 text-blue-700 border-blue-200",
    "Tribal-Nation": "bg-purple-100 text-purple-700 border-purple-200",
    "State-Conservation-Agency": "bg-green-100 text-green-700 border-green-200",
    "LLC-Inc-Corp": "bg-slate-100 text-slate-600 border-slate-200",
    "Energy-Generation": "bg-red-100 text-red-700 border-red-200",
    "Private-Subdivision-Park": "bg-orange-100 text-orange-700 border-orange-200",
    "Institutional-Self-Supplier": "bg-orange-100 text-orange-700 border-orange-200",
    "Federal-Facility": "bg-gray-100 text-gray-600 border-gray-200",
    "Individual-Landowner": "bg-red-100 text-red-600 border-red-200",
    "Commercial": "bg-pink-100 text-pink-700 border-pink-200",
    "Fire-Protection-District": "bg-amber-100 text-amber-700 border-amber-200",
    "Irrigation-District": "bg-lime-100 text-lime-700 border-lime-200",
    "Port-District": "bg-cyan-100 text-cyan-700 border-cyan-200",
    "Unclassified": "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${styles[category] ?? styles["Unclassified"]}`}>
      {category}
    </span>
  );
}

function LikelihoodTag({ likelihood }: { likelihood: BoundaryLikelihood }) {
  const styles: Record<BoundaryLikelihood, string> = {
    "High": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Medium": "bg-blue-100 text-blue-700 border-blue-200",
    "Low": "bg-amber-100 text-amber-700 border-amber-200",
    "Very Low": "bg-red-100 text-red-600 border-red-200",
  };
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${styles[likelihood]}`}>
      Boundary: {likelihood}
    </span>
  );
}

function Tag({ label }: { label: string }) {
  const color =
    label === "Public Provider" || label === "Municipal" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : label === "Private Provider" ? "bg-slate-100 text-slate-600 border-slate-200"
    : label === "Tribal Utility" || label.includes("Tribal") ? "bg-purple-100 text-purple-700 border-purple-200"
    : label.includes("Review") ? "bg-amber-100 text-amber-700 border-amber-200"
    : label.includes("Ambiguity") || label.includes("Private") ? "bg-orange-100 text-orange-700 border-orange-200"
    : label === "Rural Water District" || label === "Cooperative" ? "bg-sky-100 text-sky-700 border-sky-200"
    : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
  );
}

function Badge({ color, children }: { color: "green" | "gray"; children: React.ReactNode }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
      color === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
    }`}>
      {children}
    </span>
  );
}

function InfoRow({ label, value, badge, icon }: { label: string; value: string; badge?: string; icon?: React.ReactNode }) {
  const badgeCls = badge === "AI inferred"
    ? "bg-violet-100 text-violet-700 border-violet-200"
    : badge === "SDWIS"
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-sky-100 text-sky-700 border-sky-200";

  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {icon}
        <p className="text-sm font-semibold text-slate-800">{value}</p>
        {badge && (
          <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badgeCls}`}>
            {badge === "AI inferred" && <Sparkles className="w-2.5 h-2.5" />}
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function UrlRow({
  url, copiedUrl, onCopy,
}: { url: string; copiedUrl: string | null; onCopy: (u: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:underline truncate flex-1"
      >
        {url}
      </a>
      <button
        onClick={() => onCopy(url)}
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0 transition-colors"
        title="Copy URL"
      >
        {copiedUrl === url ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0 transition-colors"
        title="Open in new tab"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

function ArcGISRow({
  index, candidate, copiedUrl, onCopy,
}: { index: number; candidate: ArcGISLayerCandidate; copiedUrl: string | null; onCopy: (u: string) => void }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-bold text-slate-400 w-5 flex-shrink-0 pt-0.5">{index}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold text-slate-800 truncate">{candidate.title || candidate.layerName}</p>
          {candidate.isAllowlist && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-200 flex-shrink-0">EPA</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 mb-1">
          <span className="text-[10px] text-slate-400">⊞</span>
          <span className="text-[11px] text-slate-500">{candidate.owner}</span>
        </div>
        <UrlRow url={candidate.serviceUrl} copiedUrl={copiedUrl} onCopy={onCopy} />
      </div>
    </div>
  );
}

function WinnerCard({
  winner, allCandidates, copiedUrl, onCopy,
}: {
  winner: ArcGISLayerCandidate;
  allCandidates: ArcGISLayerCandidate[];
  copiedUrl: string | null;
  onCopy: (u: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Selected</span>
              {winner.isAllowlist && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-200">EPA Allowlist</span>
              )}
            </div>
            <p className="text-base font-bold text-slate-800">{winner.title || winner.layerName}</p>
            {winner.snippet && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{winner.snippet}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-3xl font-black text-slate-800 leading-none">{winner.score}</p>
            <p className="text-xs text-slate-400">/{winner.maxScore}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <MetricBox label="ID Field Found" value={winner.idFieldFound ? "FOUND" : "NOT FOUND"} ok={winner.idFieldFound} />
          <MetricBox label="Feature Count" value={winner.featureCount > 0 ? winner.featureCount.toLocaleString() : "—"} ok={winner.featureCount > 0} />
          <MetricBox label="Domain Trust" value={winner.domainTrust} ok={winner.domainTrust.includes("trusted")} />
          <MetricBox label="Org Verified" value={winner.orgVerified ? "yes" : "no"} ok={winner.orgVerified} />
        </div>

        <UrlRow url={winner.serviceUrl} copiedUrl={copiedUrl} onCopy={onCopy} />
      </div>

      {winner.reasons.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Selection Reason</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Score: {winner.score}/{winner.maxScore}. {winner.reasons.join("; ")}.
          </p>
        </div>
      )}

      {allCandidates.length > 1 && (
        <div>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? "Hide" : `Show all ${allCandidates.length} ranked candidates`}
          </button>
          {showAll && (
            <div className="mt-3 space-y-2">
              {allCandidates.slice(1).map((c, i) => (
                <div key={c.serviceUrl} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                  <span className="text-xs font-bold text-slate-400 w-5 flex-shrink-0 pt-0.5">{i + 2}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700 truncate">{c.title || c.layerName}</p>
                      <span className="text-xs font-bold text-slate-500 flex-shrink-0">{c.score} pts</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{c.owner}</p>
                    <UrlRow url={c.serviceUrl} copiedUrl={copiedUrl} onCopy={onCopy} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-2.5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        {ok
          ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          : <X className="w-3 h-3 text-red-400" />}
        {label}
      </p>
      <p className={`text-xs font-bold ${ok ? "text-emerald-700" : "text-red-600"}`}>{value}</p>
    </div>
  );
}

function BoundaryOutcomeCard({
  fetch: f, copiedUrl, onCopy,
}: { fetch: BoundaryFetchResult; copiedUrl: string | null; onCopy: (u: string) => void }) {
  if (f.outcome === 1) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 font-medium">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          GIS boundary polygon found in EPA Water System Boundaries
        </div>
        {f.agency_name && (
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="System Name" value={f.agency_name} />
            {f.outcome_county && <InfoRow label="County" value={f.outcome_county} />}
            {f.outcome_state && <InfoRow label="State" value={f.outcome_state} />}
            {f.source_name && <InfoRow label="Source" value={f.source_name} />}
          </div>
        )}
        {f.boundary_url && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Boundary Query URL</p>
            <UrlRow url={f.boundary_url} copiedUrl={copiedUrl} onCopy={onCopy} />
          </div>
        )}
        {f.download_url && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Download (GeoJSON)</p>
            <div className="flex items-center gap-2">
              <UrlRow url={f.download_url} copiedUrl={copiedUrl} onCopy={onCopy} />
              <a
                href={f.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors flex-shrink-0"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          </div>
        )}
        <RegulatoryLinks links={f.regulatory_links} />
      </div>
    );
  }

  if (f.outcome === 2) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5 font-medium">
          <FileText className="w-4 h-4 flex-shrink-0" />
          Boundary available as PDF — requires georeferencing
        </div>
        {f.pdf_url && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">PDF Document</p>
            <UrlRow url={f.pdf_url} copiedUrl={copiedUrl} onCopy={onCopy} />
          </div>
        )}
        <RegulatoryLinks links={f.regulatory_links} />
      </div>
    );
  }

  // Outcome 3
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-0.5">No digital boundary found</p>
          {f.rationale && <p className="text-orange-600 leading-relaxed">{f.rationale}</p>}
        </div>
      </div>
      {f.confidence_level && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Confidence:</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
            f.confidence_level === "High" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : f.confidence_level === "Medium" ? "bg-blue-100 text-blue-700 border-blue-200"
            : "bg-amber-100 text-amber-700 border-amber-200"
          }`}>
            {f.confidence_level}
          </span>
        </div>
      )}
      {f.reference_url && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Reference / State Registry</p>
          <UrlRow url={f.reference_url} copiedUrl={copiedUrl} onCopy={onCopy} />
        </div>
      )}
      <RegulatoryLinks links={f.regulatory_links} />
    </div>
  );
}

function RegulatoryLinks({ links }: { links?: BoundaryFetchResult["regulatory_links"] }) {
  if (!links) return null;
  const entries = [
    links.echo_url && { label: "EPA ECHO – Compliance History", url: links.echo_url },
    links.sdwis_url && { label: "EPA SDWIS – Drinking Water Report", url: links.sdwis_url },
    links.state_dww_url && { label: "State Drinking Water Registry", url: links.state_dww_url },
  ].filter(Boolean) as { label: string; url: string }[];
  if (entries.length === 0) return null;
  return (
    <div className="pt-2 border-t border-slate-100 space-y-1.5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Regulatory Links</p>
      {entries.map(({ label, url }) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
          <ExternalLink className="w-3 h-3" /> {label}
        </a>
      ))}
    </div>
  );
}

function BoundaryFetchCard({
  info, copiedUrl, onCopy,
}: { info: NonNullable<PipelineState["regulatoryInfo"]>; copiedUrl: string | null; onCopy: (u: string) => void }) {
  return (
    <div className="space-y-3">
      {info.data_confidence && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border font-medium ${
          info.data_confidence.toLowerCase().includes("authoritative") || info.data_confidence.toLowerCase().includes("state")
            ? "bg-teal-50 border-teal-200 text-teal-800"
            : info.data_confidence.toLowerCase().includes("modeled") || info.data_confidence.toLowerCase().includes("estimate")
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-slate-50 border-slate-200 text-slate-600"
        }`}>
          <Map className="w-3.5 h-3.5 flex-shrink-0" />
          {info.data_confidence}
        </div>
      )}
      {info.boundary_url && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">EPA Boundary (GeoJSON)</p>
          <UrlRow url={info.boundary_url} copiedUrl={copiedUrl} onCopy={onCopy} />
        </div>
      )}
      {info.viewer_url && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">ArcGIS Map Viewer</p>
          <UrlRow url={info.viewer_url} copiedUrl={copiedUrl} onCopy={onCopy} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
        {info.pwsid && <InfoRow label="PWSID" value={info.pwsid} />}
        {info.pws_name && <InfoRow label="System Name" value={info.pws_name} />}
        {info.pws_activity_code && <InfoRow label="Status" value={info.pws_activity_code} />}
        {info.pws_type && <InfoRow label="Type" value={info.pws_type} />}
        {info.population_served && <InfoRow label="Population Served" value={info.population_served.toLocaleString()} />}
        {info.primary_source && <InfoRow label="Source Water" value={info.primary_source} />}
      </div>
      {(info.echo_url || info.epa_url) && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Regulatory Links</p>
          {info.echo_url && (
            <a href={info.echo_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
              <ExternalLink className="w-3 h-3" /> EPA ECHO – Compliance History
            </a>
          )}
          {info.epa_url && (
            <a href={info.epa_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
              <ExternalLink className="w-3 h-3" /> EPA SDWIS – Drinking Water Report
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition";

function Field({
  label, children, required,
}: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
