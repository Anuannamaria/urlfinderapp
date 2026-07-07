import { ExternalLink, ChevronDown, ChevronUp, Download, Sparkles, MapPin } from "lucide-react";
import { useState } from "react";
import { SearchResult, SearchEntry } from "../types";
import { priorityColor } from "../utils/searchApi";
import { exportSingleResults } from "../utils/excelUtils";

interface Props {
  results: SearchResult[];
  entry?: SearchEntry;
  compact?: boolean;
}

export default function ResultsTable({ results, entry, compact = false }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <p className="text-sm">No results found. Try refining the search terms.</p>
      </div>
    );
  }

  const hasAiAnalysis = results.some(r => r.ai_score !== undefined);

  return (
    <div className="space-y-2">
      {!compact && entry && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => exportSingleResults(entry, results)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export to Excel
          </button>
        </div>
      )}

      {hasAiAnalysis && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI-ranked by boundary polygon relevance</span>
        </div>
      )}

      {results.map((r, i) => (
        <div
          key={r.url}
          className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow"
        >
          <div className="p-3 flex items-start gap-3">
            {/* Rank badge */}
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </div>

            <div className="flex-1 min-w-0">
              {/* Badges row */}
              <div className="mb-1 flex items-center gap-2 flex-wrap">
                <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityColor(r.priority_tier)}`}>
                  {r.priority_label}
                </span>
                {r.source_type && r.source_type !== "Other" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    <MapPin className="w-2.5 h-2.5" />
                    {r.source_type}
                  </span>
                )}
                {r.ai_score !== undefined && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI: {r.ai_score}
                  </span>
                )}
              </div>

              {/* Title */}
              {r.title && (
                <p className="text-sm font-medium text-slate-800 truncate mb-0.5">{r.title}</p>
              )}

              {/* URL */}
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 min-w-0"
              >
                <span className="truncate">{r.url}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>

              {/* AI Reason */}
              {r.ai_reason && (
                <p className="mt-1 text-[11px] text-slate-500 italic line-clamp-2">
                  {r.ai_reason}
                </p>
              )}

              {/* Snippet toggle */}
              {r.snippet && !compact && (
                <button
                  className="mt-1 text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  {expanded === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expanded === i ? "Hide" : "Show"} description
                </button>
              )}
            </div>

            {/* Score */}
            <div className="flex-shrink-0 text-right">
              <div className="text-[10px] text-slate-400 font-medium">Score</div>
              <div className="text-sm font-bold text-slate-700">{r.score}</div>
            </div>
          </div>

          {expanded === i && r.snippet && (
            <div className="px-4 pb-3 text-xs text-slate-600 border-t border-slate-100 pt-2 bg-slate-50">
              {r.snippet}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
