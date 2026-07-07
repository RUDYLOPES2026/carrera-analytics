import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, BarChart, Bar, ComposedChart, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, TrendingUp, Clock, MousePointerClick,
  Globe, ArrowUpRight, ArrowDownRight, ArrowLeft,
  Minus, Calendar, Info, ChevronDown, ChevronRight, ChevronUp,
  ExternalLink, BarChart2, Filter,
} from "lucide-react";

// ---- TYPES ----
type Period = "today" | "yesterday" | "7days" | "15days" | "30days" | "90days" | "custom";

const PERIOD_LABELS: Record<Exclude<Period, "custom">, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7days": "7 dias",
  "15days": "15 dias",
  "30days": "30 dias",
  "90days": "90 dias",
};

const BRAND_COLORS: Record<string, string> = {
  Chevrolet: "#f59e0b",
  Volkswagen: "#3b82f6",
  Nissan: "#ef4444",
  GWM: "#8b5cf6",
  GAC: "#06b6d4",
  Zeekr: "#10b981",
  Omoda: "#f97316",
  Bajaj: "#ec4899",
  Seminovos: "#6b7280",
  Outros: "#94a3b8",
};

const tooltipStyle = {
  backgroundColor: "oklch(0.14 0.012 240)",
  border: "1px solid oklch(0.22 0.015 240)",
  borderRadius: "8px",
  color: "oklch(0.95 0.005 240)",
  fontSize: "12px",
  padding: "8px 12px",
};

// ---- HELPERS ----
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ---- SHARED COMPONENTS ----
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

function MetricBadge({ label, value, sub, color = "text-foreground" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
      {sub && <span className="text-[10px] text-muted-foreground/60">{sub}</span>}
    </div>
  );
}

// ---- CUSTOM DATE PICKER ----
function CustomDatePicker({ onApply, onCancel }: { onApply: (start: string, end: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <div className="absolute top-full right-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-xl p-4 w-72">
      <p className="text-xs font-semibold text-foreground mb-3">Periodo personalizado</p>
      <div className="space-y-2 mb-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Data inicial</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Data final</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 text-xs py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors">Cancelar</button>
        <button onClick={() => start && end && onApply(start, end)} disabled={!start || !end} className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">Aplicar</button>
      </div>
    </div>
  );
}

// ---- LP DETAIL PANEL ----
const UTM_COLORS = ["#6366f1", "#22d3ee", "#4ade80", "#f472b6", "#fb923c", "#a78bfa", "#34d399", "#f87171", "#60a5fa", "#fbbf24"];

function LPDetailPanel({
  page, label, brand, period, customStart, customEnd, onClose,
}: {
  page: string; label: string; brand: string;
  period: Period; customStart?: string; customEnd?: string;
  onClose: () => void;
}) {
  const [utmView, setUtmView] = useState<"overview" | "campaigns" | "sources" | "mediums">("overview");
  const input = useMemo(() => ({ period, customStart, customEnd, page }), [period, customStart, customEnd, page]);
  const { data: utms, isLoading: loadingUTMs } = trpc.analytics.lpsPageUTMs.useQuery(input);
  const { data: byDay, isLoading: loadingDays } = trpc.analytics.lpsPageSessionsByDay.useQuery(input);
  const brandColor = BRAND_COLORS[brand] || "#6366f1";

  const totalSessions = useMemo(() => (utms as any[] || []).reduce((s: number, r: any) => s + r.sessions, 0), [utms]);

  const bySource = useMemo(() => {
    if (!utms) return [];
    const map = new Map<string, { source: string; sessions: number; users: number }>();
    for (const r of utms as any[]) {
      const key = r.source === "(direct)" ? "Direto" : r.source === "(not set)" ? "Nao definido" : r.source;
      const ex = map.get(key) || { source: key, sessions: 0, users: 0 };
      ex.sessions += r.sessions; ex.users += r.users;
      map.set(key, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
  }, [utms]);

  const byMedium = useMemo(() => {
    if (!utms) return [];
    const map = new Map<string, { medium: string; sessions: number; users: number }>();
    for (const r of utms as any[]) {
      const key = r.medium === "(none)" ? "Nenhum" : r.medium === "(not set)" ? "Nao definido" : r.medium;
      const ex = map.get(key) || { medium: key, sessions: 0, users: 0 };
      ex.sessions += r.sessions; ex.users += r.users;
      map.set(key, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
  }, [utms]);

  const byCampaign = useMemo(() => {
    if (!utms) return [];
    const map = new Map<string, { campaign: string; sessions: number; users: number; bounceRate: number; avgDuration: number }>();
    for (const r of utms as any[]) {
      const key = r.campaign === "(not set)" ? "(sem campanha)" : r.campaign;
      const ex = map.get(key) || { campaign: key, sessions: 0, users: 0, bounceRate: 0, avgDuration: 0 };
      ex.sessions += r.sessions; ex.users += r.users;
      map.set(key, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
  }, [utms]);

  const UTM_VIEWS = [
    { id: "overview" as const, label: "Visao Geral" },
    { id: "campaigns" as const, label: "Campanhas" },
    { id: "sources" as const, label: "Fontes" },
    { id: "mediums" as const, label: "Midias" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl h-full bg-background border-l border-border overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brandColor }} />
            <div>
              <h2 className="text-sm font-bold text-foreground">{label}</h2>
              <a href={`https://lp.carrera.com.br${page}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                lp.carrera.com.br{page}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Sessions by Day */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-foreground/80 mb-3">Visitas por Dia</h3>
            {loadingDays ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={byDay as any[] || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 9, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "sessions" ? "Sessoes" : "Usuarios"]} labelFormatter={formatDate} />
                  <Bar dataKey="sessions" fill={brandColor} radius={[3, 3, 0, 0]} maxBarSize={30} opacity={0.85} />
                  <Line type="monotone" dataKey="users" stroke={brandColor} strokeWidth={1.5} dot={false} strokeOpacity={0.5} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* UTM Section */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground/80">Analise de UTMs</h3>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {UTM_VIEWS.map(v => (
                  <button key={v.id} onClick={() => setUtmView(v.id)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                      utmView === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Campanhas</p>
                <p className="text-xl font-bold text-foreground">{byCampaign.length}</p>
                <p className="text-[10px] text-muted-foreground/60">utm_campaign</p>
              </div>
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Fontes</p>
                <p className="text-xl font-bold text-foreground">{bySource.length}</p>
                <p className="text-[10px] text-muted-foreground/60">utm_source</p>
              </div>
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Midias</p>
                <p className="text-xl font-bold text-foreground">{byMedium.length}</p>
                <p className="text-[10px] text-muted-foreground/60">utm_medium</p>
              </div>
            </div>

            {loadingUTMs ? <LoadingSpinner /> : (
              <>
                {/* Overview: top campaigns + sources side by side */}
                {utmView === "overview" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Campanhas</p>
                      <div className="space-y-2">
                        {byCampaign.slice(0, 8).map((c: any, i: number) => {
                          const maxVal = byCampaign[0]?.sessions || 1;
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-foreground/80 truncate max-w-[130px]">{c.campaign}</span>
                                <span className="font-bold text-foreground flex-shrink-0 ml-1">{c.sessions.toLocaleString("pt-BR")}</span>
                              </div>
                              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(c.sessions / maxVal) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                              </div>
                            </div>
                          );
                        })}
                        {byCampaign.length === 0 && <p className="text-xs text-muted-foreground/60 py-3 text-center">Sem campanhas</p>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Fontes</p>
                      <div className="space-y-2">
                        {bySource.slice(0, 8).map((s: any, i: number) => {
                          const maxVal = bySource[0]?.sessions || 1;
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-foreground/80 truncate max-w-[130px]">{s.source}</span>
                                <span className="font-bold text-foreground flex-shrink-0 ml-1">{s.sessions.toLocaleString("pt-BR")}</span>
                              </div>
                              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(s.sessions / maxVal) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                              </div>
                            </div>
                          );
                        })}
                        {bySource.length === 0 && <p className="text-xs text-muted-foreground/60 py-3 text-center">Sem fontes</p>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Campaigns view */}
                {utmView === "campaigns" && (
                  <div className="space-y-2">
                    {byCampaign.map((c: any, i: number) => {
                      const maxVal = byCampaign[0]?.sessions || 1;
                      const pct = totalSessions > 0 ? Math.round((c.sessions / totalSessions) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-foreground/80 truncate">{c.campaign}</span>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className="text-muted-foreground/60">{pct}%</span>
                                <span className="font-bold text-foreground">{c.sessions.toLocaleString("pt-BR")}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(c.sessions / maxVal) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {byCampaign.length === 0 && <p className="text-xs text-muted-foreground/60 py-4 text-center">Sem campanhas UTM no periodo</p>}
                  </div>
                )}

                {/* Sources view */}
                {utmView === "sources" && (
                  <div className="space-y-2">
                    {bySource.map((s: any, i: number) => {
                      const maxVal = bySource[0]?.sessions || 1;
                      const pct = totalSessions > 0 ? Math.round((s.sessions / totalSessions) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-foreground/80 truncate">{s.source}</span>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className="text-muted-foreground/60">{pct}%</span>
                                <span className="font-bold text-foreground">{s.sessions.toLocaleString("pt-BR")}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(s.sessions / maxVal) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {bySource.length === 0 && <p className="text-xs text-muted-foreground/60 py-4 text-center">Sem fontes no periodo</p>}
                  </div>
                )}

                {/* Mediums view */}
                {utmView === "mediums" && (
                  <div className="space-y-2">
                    {byMedium.map((m: any, i: number) => {
                      const maxVal = byMedium[0]?.sessions || 1;
                      const pct = totalSessions > 0 ? Math.round((m.sessions / totalSessions) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-foreground/80 truncate">{m.medium}</span>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className="text-muted-foreground/60">{pct}%</span>
                                <span className="font-bold text-foreground">{m.sessions.toLocaleString("pt-BR")}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(m.sessions / maxVal) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {byMedium.length === 0 && <p className="text-xs text-muted-foreground/60 py-4 text-center">Sem midias no periodo</p>}
                  </div>
                )}

                {/* Full UTM table */}
                {utmView !== "overview" && utms && (utms as any[]).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detalhamento Completo</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1.5 text-muted-foreground font-medium">Source</th>
                            <th className="text-left py-1.5 text-muted-foreground font-medium">Medium</th>
                            <th className="text-left py-1.5 text-muted-foreground font-medium">Campaign</th>
                            <th className="text-right py-1.5 text-muted-foreground font-medium">Sess.</th>
                            <th className="text-right py-1.5 text-muted-foreground font-medium">Bounce</th>
                            <th className="text-right py-1.5 text-muted-foreground font-medium">Duracao</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(utms as any[]).slice(0, 50).map((r: any, i: number) => (
                            <tr key={i} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                              <td className="py-1.5 text-foreground/80 max-w-[80px] truncate">{r.source}</td>
                              <td className="py-1.5 text-muted-foreground max-w-[70px] truncate">{r.medium}</td>
                              <td className="py-1.5 text-muted-foreground max-w-[110px] truncate">{r.campaign === "(not set)" ? <span className="opacity-40">n/a</span> : r.campaign}</td>
                              <td className="py-1.5 text-right font-bold text-foreground">{r.sessions.toLocaleString("pt-BR")}</td>
                              <td className="py-1.5 text-right text-muted-foreground">{r.bounceRate.toFixed(1)}%</td>
                              <td className="py-1.5 text-right text-muted-foreground">{formatDuration(r.avgDuration)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- BRAND GROUP CARD ----
function BrandGroupCard({
  group, period, customStart, customEnd, onSelectPage,
}: {
  group: { brand: string; sessions: number; users: number; newUsers: number; bounceRate: number; avgDuration: number; pages: any[] };
  period: Period; customStart?: string; customEnd?: string;
  onSelectPage: (page: { path: string; label: string; brand: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const brandColor = BRAND_COLORS[group.brand] || "#6366f1";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Brand header row */}
      <div
        className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-accent/20 transition-colors group"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: brandColor }} />
          <span className="text-sm font-bold text-foreground">{group.brand}</span>
          <span className="text-[10px] text-muted-foreground/60">{group.pages.length} {group.pages.length === 1 ? "pagina" : "paginas"}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:grid grid-cols-4 gap-4 text-right">
            <div>
              <p className="text-sm font-bold text-foreground">{group.sessions.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-muted-foreground">Sessoes</p>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{group.users.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-muted-foreground">Usuarios</p>
            </div>
            <div>
              <p className={`text-sm font-bold ${group.bounceRate > 70 ? "text-red-400" : group.bounceRate < 40 ? "text-emerald-400" : "text-foreground"}`}>{group.bounceRate.toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground">Bounce</p>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{formatDuration(group.avgDuration)}</p>
              <p className="text-[10px] text-muted-foreground">Tempo Medio</p>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Mobile metrics (shown always) */}
      <div className="sm:hidden grid grid-cols-4 gap-2 px-4 pb-3 border-t border-border/40 pt-2">
        <MetricBadge label="Sessoes" value={group.sessions.toLocaleString("pt-BR")} />
        <MetricBadge label="Usuarios" value={group.users.toLocaleString("pt-BR")} />
        <MetricBadge label="Bounce" value={`${group.bounceRate.toFixed(1)}%`} color={group.bounceRate > 70 ? "text-red-400" : group.bounceRate < 40 ? "text-emerald-400" : "text-foreground"} />
        <MetricBadge label="Tempo" value={formatDuration(group.avgDuration)} />
      </div>

      {/* Subpages list */}
      {expanded && (
        <div className="border-t border-border/60">
          {group.pages.map((lp: any, i: number) => (
            <div
              key={lp.path}
              className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-accent/20 transition-colors group/row ${
                i < group.pages.length - 1 ? "border-b border-border/30" : ""
              }`}
              onClick={() => onSelectPage({ path: lp.path, label: lp.label, brand: lp.brand })}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-50" style={{ backgroundColor: brandColor }} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{lp.label}</p>
                  <a
                    href={`https://lp.carrera.com.br${lp.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
                  >
                    {lp.path}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="hidden sm:grid grid-cols-4 gap-4 text-right">
                  <div className="text-xs font-semibold text-foreground w-16 text-right">{lp.sessions.toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-muted-foreground w-16 text-right">{lp.users.toLocaleString("pt-BR")}</div>
                  <div className={`text-xs w-12 text-right ${lp.bounceRate > 70 ? "text-red-400" : lp.bounceRate < 40 ? "text-emerald-400" : "text-muted-foreground"}`}>{lp.bounceRate.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground w-14 text-right">{formatDuration(lp.avgDuration)}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover/row:text-primary transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- MAIN LPS DASHBOARD ----
export default function LPsDashboard() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("30days");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [now, setNow] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedLP, setSelectedLP] = useState<{ path: string; label: string; brand: string } | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("Todas");
  const [sortBy, setSortBy] = useState<"sessions" | "users" | "bounceRate" | "avgDuration">("sessions");

  const input = useMemo(() => ({ period, customStart, customEnd }), [period, customStart, customEnd]);

  const { data: realtime } = trpc.analytics.lpsRealtimeUsers.useQuery(undefined, { refetchInterval: 30000 });
  const { data: summary, isLoading: loadingSummary } = trpc.analytics.lpsSummary.useQuery(input);
  const { data: groupedBrands, isLoading: loadingPages } = trpc.analytics.lpsGroupedByBrand.useQuery(input);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formattedDate = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  function handleApplyCustomDate(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
    setPeriod("custom");
    setShowDatePicker(false);
  }

  function handlePeriodSelect(p: Exclude<Period, "custom">) {
    setPeriod(p);
    setCustomStart(undefined);
    setCustomEnd(undefined);
  }

  const periodLabel = period === "custom" && customStart && customEnd
    ? `${customStart.slice(5).replace("-", "/")} - ${customEnd.slice(5).replace("-", "/")}`
    : null;

  // All unique brands from grouped data
  const brands = useMemo(() => {
    if (!groupedBrands) return ["Todas"];
    return ["Todas", ...(groupedBrands as any[]).map((g: any) => g.brand)];
  }, [groupedBrands]);

  // Filtered + sorted brand groups
  const filteredGroups = useMemo(() => {
    if (!groupedBrands) return [];
    let groups = groupedBrands as any[];
    if (brandFilter !== "Todas") {
      groups = groups.filter((g: any) => g.brand === brandFilter);
    }
    return [...groups].sort((a: any, b: any) => {
      if (sortBy === "bounceRate") return b.bounceRate - a.bounceRate;
      return b[sortBy] - a[sortBy];
    });
  }, [groupedBrands, brandFilter, sortBy]);

  // Summary by brand for the bar chart
  const brandSummary = useMemo(() => {
    if (!groupedBrands) return [];
    return (groupedBrands as any[]).map((g: any) => ({ brand: g.brand, sessions: g.sessions, users: g.users }));
  }, [groupedBrands]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Carrera Novos</span>
            </button>
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">Carrera LPs</h1>
              <p className="text-xs text-muted-foreground">Landing Pages Analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-violet-400/10 border border-violet-400/20 rounded-lg px-2.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500"></span>
              </span>
              <span className="text-xs font-semibold text-violet-400">{realtime?.activeUsers ?? "-"}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">ativos agora</span>
            </div>
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-mono text-foreground/80">{formattedTime}</span>
              <span className="text-xs text-muted-foreground capitalize">{formattedDate}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-4 lg:py-6 space-y-5">
        {/* Period filter */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 relative overflow-x-auto">
          {(Object.keys(PERIOD_LABELS) as Exclude<Period, "custom">[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodSelect(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                period === p
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${
              period === "custom"
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            <Calendar className="w-3 h-3" />
            {periodLabel || "Personalizado"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showDatePicker && (
            <CustomDatePicker
              onApply={handleApplyCustomDate}
              onCancel={() => setShowDatePicker(false)}
            />
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: <TrendingUp className="w-4 h-4 text-primary" />, label: "Total de Sessoes", value: loadingSummary ? "..." : (summary?.sessions?.toLocaleString("pt-BR") ?? "0"), color: "bg-primary/10" },
            { icon: <Users className="w-4 h-4 text-cyan-400" />, label: "Usuarios", value: loadingSummary ? "..." : (summary?.users?.toLocaleString("pt-BR") ?? "0"), sub: `${summary?.newUsers?.toLocaleString("pt-BR") ?? 0} novos`, color: "bg-cyan-400/10" },
            { icon: <MousePointerClick className="w-4 h-4 text-emerald-400" />, label: "Taxa de Rejeicao", value: loadingSummary ? "..." : `${(summary?.bounceRate ?? 0).toFixed(1)}%`, color: "bg-emerald-400/10" },
            { icon: <Clock className="w-4 h-4 text-violet-400" />, label: "Duracao Media", value: loadingSummary ? "..." : formatDuration(summary?.avgDuration ?? 0), color: "bg-violet-400/10" },
          ].map((m, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className={`p-2 rounded-lg w-fit mb-3 ${m.color}`}>{m.icon}</div>
              <p className="text-xl font-bold text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
              {m.sub && <p className="text-xs text-muted-foreground/60">{m.sub}</p>}
            </div>
          ))}
        </div>

        {/* Brand summary chart */}
        {brandSummary.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground/80 mb-1">Sessoes por Marca</h3>
            <p className="text-xs text-muted-foreground/60 mb-3">Total de sessoes agrupado por marca no periodo selecionado. Clique em uma LP abaixo para ver detalhes.</p>
            <ResponsiveContainer width="100%" height={Math.max(160, brandSummary.length * 38)}>
              <BarChart data={brandSummary} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="brand" tick={{ fontSize: 11, fill: "oklch(0.75 0.01 240)" }} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "sessions" ? "Sessoes" : "Usuarios"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "sessions" ? "Sessoes" : "Usuarios"} />
                <Bar dataKey="sessions" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: "oklch(0.6 0.01 240)", formatter: (v: number) => v.toLocaleString("pt-BR") }}>
                  {brandSummary.map((s: any, i: number) => (
                    <Cell key={i} fill={BRAND_COLORS[s.brand] || "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          {/* Brand filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            {brands.map((b) => (
              <button
                key={b}
                onClick={() => setBrandFilter(b)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  brandFilter === b
                    ? "text-white shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
                style={brandFilter === b ? { backgroundColor: b === "Todas" ? "#6366f1" : (BRAND_COLORS[b] || "#6366f1") } : {}}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Ordenar por:</span>
            {(["sessions", "users", "bounceRate", "avgDuration"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  sortBy === s ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {s === "sessions" ? "Sessoes" : s === "users" ? "Usuarios" : s === "bounceRate" ? "Bounce" : "Duracao"}
              </button>
            ))}
          </div>
        </div>

        {/* Brand Group Cards */}
        {loadingPages ? (
          <LoadingSpinner />
        ) : filteredGroups.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma LP encontrada para o periodo selecionado.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tente um periodo maior ou verifique se as LPs estao recebendo trafego.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGroups.map((group: any) => (
              <BrandGroupCard
                key={group.brand}
                group={group}
                period={period}
                customStart={customStart}
                customEnd={customEnd}
                onSelectPage={(page) => setSelectedLP(page)}
              />
            ))}
          </div>
        )}

        {/* Info note */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card/50 border border-border/50 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 text-primary/60 mt-0.5 flex-shrink-0" />
          <span>Clique em qualquer LP para ver o detalhamento completo: visitas por dia, origem do trafego (source/medium), campanhas UTM e metricas de engajamento.</span>
        </div>
      </main>

      {/* LP Detail Panel */}
      {selectedLP && (
        <LPDetailPanel
          page={selectedLP.path}
          label={selectedLP.label}
          brand={selectedLP.brand}
          period={period}
          customStart={customStart}
          customEnd={customEnd}
          onClose={() => setSelectedLP(null)}
        />
      )}
    </div>
  );
}
