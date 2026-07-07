import * as XLSX from "xlsx";
import { SearchEntry, BulkRow, SearchResult } from "../types";

export function parseFile(file: File): Promise<SearchEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

        const normalize = (s: string) => s.toLowerCase().replace(/[\s/_-]+/g, "_");

        const COL_ALIASES: Record<string, string[]> = {
          state:        ["state", "state_name"],
          county:       ["county", "county_name", "city", "district", "city_county_district_name"],
          agency:       ["agency", "agency_name", "enc_name", "enc", "utility_name", "name"],
          utility_type: ["utility_type", "utility", "type"],
        };

        function findValue(row: Record<string, string>, field: string): string {
          const aliases = COL_ALIASES[field];
          for (const key of Object.keys(row)) {
            const norm = normalize(key);
            if (aliases.includes(norm)) return String(row[key] ?? "").trim();
          }
          return "";
        }

        const entries: SearchEntry[] = rows
          .map((row) => ({
            state: findValue(row, "state"),
            county: findValue(row, "county"),
            agency: findValue(row, "agency"),
            utility_type: findValue(row, "utility_type"),
          }))
          .filter((e) => e.state || e.agency);

        resolve(entries);
      } catch (err) {
        reject(new Error(`Could not parse file: ${err}`));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

const EMPTY_RESULT: SearchResult = {
  url: "", title: "", snippet: "", score: 0,
  priority_tier: 0, priority_label: "", source_type: "",
};

export function exportResults(rows: BulkRow[]): void {
  const flat: Record<string, string>[] = [];

  for (const row of rows) {
    const top5 = row.results.slice(0, 5);
    while (top5.length < 5) top5.push({ ...EMPTY_RESULT });

    const reg = row.regulatory_info;

    const record: Record<string, string> = {
      State: row.state,
      County: row.county,
      Agency: row.agency,
      "Utility Type": row.utility_type,
      // Regulatory columns
      PWSID: reg?.pwsid || "",
      "Regulatory Name": reg?.pws_name || "",
      "Regulatory Status": reg?.pws_activity_code || "",
      "System Type": reg?.pws_type || "",
      "Source Water": reg?.primary_source || "",
      "Population Served": reg?.population_served ? String(reg.population_served) : "",
      "EPA ECHO URL": reg?.echo_url || "",
      "EPA SDWIS URL": reg?.epa_url || "",
    };

    top5.forEach((r, i) => {
      const n = i + 1;
      record[`URL ${n}`] = r.url;
      record[`Source ${n}`] = r.source_type || "";
      record[`Priority ${n}`] = r.priority_label;
      record[`Title ${n}`] = r.title;
      if (r.ai_reason) record[`AI Reason ${n}`] = r.ai_reason;
    });

    flat.push(record);
  }

  const ws = XLSX.utils.json_to_sheet(flat);

  ws["!cols"] = [
    { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 14 },
    { wch: 16 }, { wch: 35 }, { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 18 },
    { wch: 55 }, { wch: 55 },
    { wch: 55 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
    { wch: 55 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
    { wch: 55 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
    { wch: 55 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
    { wch: 55 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  XLSX.writeFile(wb, "utility_boundary_results.xlsx");
}

export function exportSingleResults(entry: SearchEntry, results: SearchResult[]): void {
  exportResults([{ ...entry, results, status: "done" }]);
}
