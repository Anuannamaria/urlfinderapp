"""
Utility Boundary Research API
FastAPI backend for searching authoritative utility boundary URLs.

Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import io
from search_service import search_utility_urls

app = FastAPI(title="Utility Boundary Research API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    state: str
    county: str
    agency: str
    utility_type: str


class BulkSearchRequest(BaseModel):
    rows: list[SearchRequest]


@app.post("/api/search")
async def search_single(req: SearchRequest):
    """Search for authoritative URLs for a single utility entry."""
    if not req.state or not req.agency or not req.utility_type:
        raise HTTPException(status_code=400, detail="state, agency, and utility_type are required")
    results = search_utility_urls(req.state, req.county, req.agency, req.utility_type)
    return {"results": results}


@app.post("/api/search/bulk")
async def search_bulk(req: BulkSearchRequest):
    """Search for authoritative URLs for multiple utility entries."""
    output = []
    for row in req.rows:
        results = search_utility_urls(row.state, row.county, row.agency, row.utility_type)
        output.append({
            "state": row.state,
            "county": row.county,
            "agency": row.agency,
            "utility_type": row.utility_type,
            "results": results,
        })
    return {"rows": output}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Parse uploaded CSV or Excel file and return rows."""
    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    # Normalize column names
    df.columns = [c.strip().lower().replace(" ", "_").replace("/", "_") for c in df.columns]

    col_map = {
        "state": ["state", "state_name"],
        "county": ["county", "county_name", "city", "district", "city_county_district_name"],
        "agency": ["agency", "agency_name", "enc_name", "enc", "utility_name"],
        "utility_type": ["utility_type", "type", "utility"],
    }

    def find_col(df, options):
        for opt in options:
            if opt in df.columns:
                return opt
        return None

    rows = []
    for _, row in df.iterrows():
        entry = {}
        for field, options in col_map.items():
            col = find_col(df, options)
            entry[field] = str(row[col]).strip() if col and pd.notna(row[col]) else ""
        rows.append(entry)

    return {"rows": rows, "columns": list(df.columns)}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
