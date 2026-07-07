import { useState, useRef, useCallback } from "react";
import {
  Upload, FileSpreadsheet, Loader2, Download, XCircle,
  CheckCircle2, AlertCircle, PlayCircle, ChevronDown, ChevronUp,
  FileDown,
} from "lucide-react";
import { BulkRow, SearchEntry } from "../types";
import { searchBulk } from "../utils/searchApi";
import { parseFile, exportResults } from "../utils/excelUtils";
import ResultsTable from "./ResultsTable";

export default function BulkUpload() {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = async (file: File) => {
    setParseError(null);
    try {
      const entries = await parseFile(file);
      if (entries.length === 0) {
        setParseError("No valid rows found. Ensure columns: State, County, Agency, Utility Type. ID and Source are optional.");
        return;
      }
      setRows(entries.map((e) => ({ ...e, results: [], status: "pending" })));
      setExpandedRow(null);
    } catch (err) {
      setParseError(String(err));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const startSearch = async () => {
    if (running || rows.length === 0) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);

    // Reset to pending
    setRows((prev) => prev.map((r) => ({ ...r, status: "searching", results: [] })));

    const entries: SearchEntry[] = rows.map((r) => ({
      state: r.state,
      county: r.county,
      agency: r.agency,
      utility_type: r.utility_type,
      id: r.id,
      source: r.source,
    }));

    await searchBulk(
      entries,
      (i, results, regulatory_info) => {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, results, regulatory_info, status: "done" } : r));
      },
      (i, error) => {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, error, status: "error" } : r));
      },
      ctrl.signal,
    );

    setRunning(false);
  };

  const stopSearch = () => {
    abortRef.current?.abort();
    setRunning(false);
    setRows((prev) => prev.map((r) => r.status === "searching" ? { ...r, status: "pending" } : r));
  };

  const clearAll = () => {
    if (running) stopSearch();
    setRows([]);
    setParseError(null);
    setExpandedRow(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  const statusIcon = (r: BulkRow) => {
    if (r.status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    if (r.status === "error") return <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
    if (r.status === "searching") return <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />;
    return <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />;
  };

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      {rows.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${
            dragging ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400 hover:bg-slate-50/50"
          }`}
        >
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Drop your CSV or Excel file here</p>
          <p className="text-xs text-slate-400 mt-1">or click to browse</p>
          <div className="mt-4 flex gap-2">
            {["CSV", "XLSX", "XLS"].map((ext) => (
              <span key={ext} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500">.{ext.toLowerCase()}</span>
            ))}
          </div>
        </div>
      )}

      {parseError && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {parseError}
        </div>
      )}

      {/* File loaded */}
      {rows.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{rows.length} rows loaded</p>
                {running || doneCount > 0 ? (
                  <p className="text-xs text-slate-400">
                    {doneCount} done{errorCount > 0 ? `, ${errorCount} errors` : ""}
                    {running ? `, searching…` : ""}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Progress bar */}
            {(running || doneCount > 0) && (
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${((doneCount + errorCount) / rows.length) * 100}%` }}
                />
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
              {!running && doneCount === 0 && (
                <button
                  onClick={startSearch}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
                >
                  <PlayCircle className="w-4 h-4" />
                  Start Search
                </button>
              )}
              {running && (
                <button
                  onClick={stopSearch}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Stop
                </button>
              )}
              {!running && doneCount > 0 && (
                <button
                  onClick={startSearch}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
                >
                  <PlayCircle className="w-4 h-4" />
                  Re-run
                </button>
              )}
              {/* Export button — visible as soon as ANY row has results */}
              {doneCount > 0 && (
                <button
                  onClick={() => exportResults(rows.filter((r) => r.status === "done"))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Excel
                  <span className="ml-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {doneCount}
                  </span>
                </button>
              )}
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>

          {/* Rows table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-1">#</div>
              <div className="col-span-2">State</div>
              <div className="col-span-2">County</div>
              <div className="col-span-4">Agency</div>
              <div className="col-span-2">Utility</div>
              <div className="col-span-1 text-center">Results</div>
            </div>

            {rows.map((row, i) => (
              <div key={i}>
                <div
                  className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center cursor-pointer hover:bg-slate-50 transition-colors ${expandedRow === i ? "bg-slate-50" : ""}`}
                  onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                >
                  <div className="col-span-1 flex items-center gap-2">
                    {statusIcon(row)}
                    <span className="text-xs text-slate-400">{i + 1}</span>
                  </div>
                  <div className="col-span-2 text-xs text-slate-700 truncate">{row.state || "—"}</div>
                  <div className="col-span-2 text-xs text-slate-500 truncate">{row.county || "—"}</div>
                  <div className="col-span-4 text-xs text-slate-700 font-medium truncate">{row.agency || "—"}</div>
                  <div className="col-span-2 text-xs text-slate-500 truncate">{row.utility_type || "—"}</div>
                  <div className="col-span-1 flex items-center justify-center gap-1">
                    {row.status === "done" && (
                      <span className="text-xs font-semibold text-emerald-600">{row.results.length}</span>
                    )}
                    {row.status === "done" && (
                      expandedRow === i ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    {row.status === "error" && (
                      <span className="text-[10px] text-red-500">err</span>
                    )}
                  </div>
                </div>

                {expandedRow === i && row.status === "done" && (
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                    <ResultsTable results={row.results} entry={row} compact />
                  </div>
                )}
                {expandedRow === i && row.status === "error" && (
                  <div className="px-6 py-3 bg-red-50 border-b border-slate-100 text-xs text-red-600">
                    Error: {row.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Sticky download banner — shown when all done */}
      {rows.length > 0 && !running && doneCount === rows.length && (
        <div className="sticky bottom-4 z-20">
          <div className="bg-slate-900 text-white rounded-2xl shadow-xl px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <FileDown className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">All {doneCount} rows complete</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Your results are ready — download the Excel file with ranked URLs for each entry.
              </p>
            </div>
            <button
              onClick={() => exportResults(rows.filter((r) => r.status === "done"))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              Download Excel
            </button>
          </div>
        </div>
      )}

      {/* Partial results note during search */}
      {rows.length > 0 && running && doneCount > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">{doneCount} of {rows.length}</span> rows ready — you can download partial results now.
          </p>
          <button
            onClick={() => exportResults(rows.filter((r) => r.status === "done"))}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download {doneCount} rows
          </button>
        </div>
      )}

      {/* Column guide */}
      {rows.length === 0 && !parseError && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Expected Columns</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { col: "State", desc: "Full state name", eg: "Oklahoma" },
              { col: "County", desc: "County / city / district", eg: "Canadian County" },
              { col: "Agency", desc: "Agency or ENC name", eg: "Canadian County Rural…" },
              { col: "Utility Type", desc: "Water, Sewer, etc.", eg: "Water" },
              { col: "ID", desc: "PWSID, ENC ID, or other ref (optional)", eg: "FL1234567" },
              { col: "Source", desc: "Data origin hint (optional)", eg: "EPA SDWIS" },
            ].map(({ col, desc, eg }) => (
              <div key={col} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs font-bold text-slate-800 font-mono mb-0.5">{col}</p>
                <p className="text-[11px] text-slate-500">{desc}</p>
                <p className="text-[11px] text-slate-400 italic mt-1">e.g. {eg}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
