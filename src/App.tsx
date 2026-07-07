import { useState } from "react";
import { MapPin, Upload, Search, FileText } from "lucide-react";
import ManualSearch from "./components/ManualSearch";
import BulkUpload from "./components/BulkUpload";
import type { SearchMode } from "./types";

export default function App() {
  const [mode, setMode] = useState<SearchMode>("manual");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none">Utility Boundary Research</h1>
              <p className="text-[11px] text-slate-400 mt-0.5">Locate authoritative service area URLs</p>
            </div>
          </div>

          <a
            href="/user-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <FileText className="w-3.5 h-3.5" />
            User Guide
          </a>

          {/* Source priority legend */}
          <div className="hidden md:flex items-center gap-1.5">
            {[
              { color: "bg-emerald-400", label: "P1" },
              { color: "bg-blue-400", label: "P2" },
              { color: "bg-sky-400", label: "P3" },
              { color: "bg-amber-400", label: "P4" },
              { color: "bg-orange-400", label: "P5" },
            ].map(({ color, label }) => (
              <span key={label} className={`${color} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                {label}
              </span>
            ))}
            <span className="text-[11px] text-slate-400 ml-1">Source Priority</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-7">
          <TabBtn
            active={mode === "manual"}
            onClick={() => setMode("manual")}
            icon={<Search className="w-4 h-4" />}
            label="Manual Search"
          />
          <TabBtn
            active={mode === "bulk"}
            onClick={() => setMode("bulk")}
            icon={<Upload className="w-4 h-4" />}
            label="Bulk Upload"
          />
        </div>

        {/* Description */}
        <div className="mb-6 max-w-2xl">
          {mode === "manual" ? (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Search Utility Boundary URLs</h2>
              <p className="text-sm text-slate-500">
                Enter a state, county, agency name, and utility type to find the top 5 most authoritative URLs
                for utility boundary or service area information, ranked by source priority.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Bulk URL Lookup</h2>
              <p className="text-sm text-slate-500">
                Upload a CSV or Excel file with multiple utility entries. The tool will search each row
                and return the top 5 ranked URLs. Export all results to Excel when done.
              </p>
            </div>
          )}
        </div>

        {/* Content */}
        {mode === "manual" ? <ManualSearch /> : <BulkUpload />}

        {/* Info panel */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: <Search className="w-5 h-5 text-slate-600" />,
              title: "Multi-Query Search",
              body: "Uses multiple keyword combinations (service area map, boundary, GIS district) to maximize coverage.",
            },
            {
              icon: <MapPin className="w-5 h-5 text-slate-600" />,
              title: "Priority Scoring",
              body: "Results are ranked from official utility websites (P1) down to PDF maps and ordinances (P5) per the research guidelines.",
            },
            {
              icon: <FileText className="w-5 h-5 text-slate-600" />,
              title: "Excel Export",
              body: "Download results as a formatted Excel file with up to 5 URLs per row, each labelled with its priority source.",
            },
          ].map(({ icon, title, body }) => (
            <div key={title} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                {icon}
              </div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Python backend note */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">Python Backend Available</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                A full Python FastAPI backend is included in the <code className="font-mono bg-amber-100 px-1 rounded">backend/</code> folder.
                Run it locally with <code className="font-mono bg-amber-100 px-1 rounded">pip install -r requirements.txt</code> then{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">uvicorn main:app --port 8000</code> for enhanced search
                using the <code className="font-mono bg-amber-100 px-1 rounded">duckduckgo-search</code> library.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function TabBtn({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
