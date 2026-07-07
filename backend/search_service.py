"""
Utility boundary URL search service.

Searches for authoritative utility boundary URLs following source priority:
  1. Official Utility Website
  2. Official GIS Portal
  3. ArcGIS REST Services
  4. County or State Government Websites
  5. Official PDF Maps, Ordinances, Resolutions
"""

from duckduckgo_search import DDGS
from urllib.parse import urlparse
import re

EXCLUDED_DOMAINS = {
    "wikipedia.org", "zillow.com", "realtor.com", "redfin.com",
    "trulia.com", "homes.com", "homefinder.com", "loopnet.com",
    "yellowpages.com", "yelp.com", "facebook.com", "twitter.com",
    "linkedin.com", "reddit.com", "quora.com", "medium.com",
    "blogspot.com", "wordpress.com", "wix.com",
}

PRIORITY_LABELS = {
    5: "Priority 1 – Official Utility Website",
    4: "Priority 2 – Official GIS Portal",
    3: "Priority 3 – ArcGIS REST Services",
    2: "Priority 4 – County/State Government",
    1: "Priority 5 – Official PDF/Ordinance",
}


def _score_url(url: str, agency: str, state: str, county: str, utility_type: str) -> tuple[int, int, str]:
    """
    Returns (score, priority_tier, priority_label).
    Higher score = better match.
    """
    parsed = urlparse(url.lower())
    domain = parsed.netloc.replace("www.", "")
    full_url = url.lower()

    # Exclude junk sources immediately
    for bad in EXCLUDED_DOMAINS:
        if bad in domain:
            return -1, 0, ""

    score = 0
    priority_tier = 0

    agency_lower = agency.lower()
    state_lower = state.lower()
    county_lower = county.lower()
    utility_lower = utility_type.lower()
    utility_keywords = {
        "water": ["water", "h2o", "drinking", "potable"],
        "sewer": ["sewer", "wastewater", "sanitation"],
        "stormwater": ["storm", "stormwater", "drainage"],
        "gas": ["gas", "natural gas"],
        "electric": ["electric", "power", "energy"],
    }

    # ---- Priority 1: Official Utility Website (.org, .com matching agency name) ----
    agency_words = [w for w in re.split(r"[\s\-_]+", agency_lower) if len(w) > 3]
    agency_match_count = sum(1 for w in agency_words if w in full_url)
    is_gov_like = domain.endswith(".gov") or domain.endswith(".us")
    is_org = domain.endswith(".org")
    is_gis_portal = any(k in full_url for k in ["hub.arcgis.com", "experience.arcgis.com", "storymaps", "arcgis.com/apps"])
    is_arcgis_rest = any(k in full_url for k in ["arcgis.com/arcgis/rest", "mapserver", "featureserver", "/rest/services"])
    is_state_gov = f"{state_lower.replace(' ', '')}.gov" in domain or f"{state_lower[:2]}.gov" in domain

    if is_gis_portal:
        score = 850
        priority_tier = 4
    elif is_arcgis_rest:
        score = 750
        priority_tier = 3
    elif is_gov_like:
        score = 700 + (50 if is_state_gov else 0)
        priority_tier = 2
    elif is_org and agency_match_count >= 2:
        score = 950
        priority_tier = 5
    elif is_org or agency_match_count >= 1:
        score = 600
        priority_tier = 1
    else:
        score = 300
        priority_tier = 0

    # Bonus: URL or domain contains state/county keywords
    if state_lower.replace(" ", "") in full_url or state_lower[:2] in domain:
        score += 20
    if county_lower.replace(" ", "") in full_url:
        score += 20

    # Bonus: URL contains utility-type keywords
    for kw in utility_keywords.get(utility_lower, [utility_lower]):
        if kw in full_url:
            score += 15
            break

    # Bonus: map/boundary/service-area language in URL
    boundary_keywords = ["boundary", "service-area", "servicearea", "district", "gis", "map", "layer"]
    for kw in boundary_keywords:
        if kw in full_url:
            score += 10

    # PDF docs
    if full_url.endswith(".pdf") or "/pdf/" in full_url or "ordinance" in full_url or "resolution" in full_url:
        if priority_tier == 0:
            priority_tier = 1
        score = max(score, 400)

    label = PRIORITY_LABELS.get(priority_tier, "Other")
    return score, priority_tier, label


def _build_queries(state: str, county: str, agency: str, utility_type: str) -> list[str]:
    """Generate multiple targeted search queries."""
    ut = utility_type.lower()
    return [
        f'"{agency}" {ut} service area map',
        f'"{agency}" {ut} boundary official',
        f'{agency} {state} {ut} GIS district map',
        f'{agency} {state} official {ut} service area',
        f'{state} {county} {ut} district boundary map site:.gov OR site:.org',
        f'{agency} {ut} boundary GIS ArcGIS',
    ]


def search_utility_urls(
    state: str,
    county: str,
    agency: str,
    utility_type: str,
    max_results: int = 5,
) -> list[dict]:
    """
    Search for authoritative utility boundary URLs.
    Returns up to max_results scored results.
    """
    seen_urls: set[str] = set()
    candidates: list[dict] = []

    queries = _build_queries(state, county, agency, utility_type)

    with DDGS() as ddgs:
        for query in queries:
            try:
                results = list(ddgs.text(query, max_results=8, safesearch="off"))
                for r in results:
                    url = r.get("href", "") or r.get("url", "")
                    title = r.get("title", "")
                    snippet = r.get("body", "")
                    if not url or url in seen_urls:
                        continue
                    seen_urls.add(url)
                    score, priority_tier, priority_label = _score_url(
                        url, agency, state, county, utility_type
                    )
                    if score < 0:
                        continue
                    candidates.append({
                        "url": url,
                        "title": title,
                        "snippet": snippet,
                        "score": score,
                        "priority_tier": priority_tier,
                        "priority_label": priority_label,
                    })
            except Exception:
                continue

    # Sort by score descending, then deduplicate similar domains
    candidates.sort(key=lambda x: x["score"], reverse=True)

    # Keep top results, prefer domain diversity
    final: list[dict] = []
    seen_domains: set[str] = set()
    for c in candidates:
        domain = urlparse(c["url"]).netloc
        if domain not in seen_domains or len(final) < 3:
            final.append(c)
            seen_domains.add(domain)
        if len(final) >= max_results:
            break

    return final
