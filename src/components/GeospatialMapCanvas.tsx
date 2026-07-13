import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Loader2, AlertCircle } from "lucide-react";

interface GeospatialMapCanvasProps {
  geojsonUrl: string;
}

export function GeospatialMapCanvas({ geojsonUrl }: GeospatialMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    if (!containerRef.current) return;
    setStatus("loading");

    const map = L.map(containerRef.current, { attributionControl: false });
    mapRef.current = map;
    map.setView([39.5, -98.35], 4); // continental US fallback view

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 },
    ).addTo(map);

    let cancelled = false;

    fetch(geojsonUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const features = data?.features ?? [];
        if (features.length === 0) throw new Error("No features in response");
        const layer = L.geoJSON(data, {
          style: { color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.15 },
        }).addTo(map);
        map.fitBounds(layer.getBounds(), { padding: [24, 24] });
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [geojsonUrl]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-50">
          <MapPin className="w-4 h-4 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-800">Interactive Geospatial Map Canvas</span>
        </div>
        {status === "loading" && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading
          </span>
        )}
        {status === "loaded" && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            Boundary Loaded
          </span>
        )}
        {status === "error" && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Failed to load
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden border border-slate-200"
        style={{ height: 420 }}
      />
    </div>
  );
}
