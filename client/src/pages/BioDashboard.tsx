import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, BarChart, Bar, ComposedChart, Cell, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  Users, TrendingUp, Clock, Globe, ArrowUpRight, ArrowDownRight,
  ArrowLeft, Minus, Calendar, ChevronDown, ChevronRight, ChevronUp,
  ExternalLink, Filter, Link2, Search, Share2, Mail, Award, AlertTriangle,
} from "lucide-react";

// ---- TYPES ----
type Period = "today" | "yesterday" | "7days" | "15days" | "30days" | "90days" | "custom";
type MainTab = "overview" | "comparison" | "utms" | "history";

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

const UTM_COLORS = ["#6366f1", "#22d3ee", "#4ade80", "#f472b6", "#fb923c", "#a78bfa", "#34d399", "#f87171", "#60a5fa", "#fbbf24"];

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
  if (!seconds || seconds < 1) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}
function formatDateFull(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ---- SHARED COMPONENTS ----
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ChartCard({ title, description, badge, children }: { title: string; description?: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground/80">{title}</h3>
          {description && <p className="text-xs text-muted-foreground/60 mt-0.5">{description}</p>}
        </div>
        {badge && <span className="text-[10px] bg-accent text-muted-foreground px-2 py-0.5 rounded-full flex-shrink-0">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function MetricCard({ icon, label, value, sub, color, tooltip }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string; tooltip?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4" title={tooltip}>
      <div className={`p-2 rounded-lg w-fit mb-3 ${color || "bg-primary/10"}`}>{icon}</div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

function PctChange({ value }: { value: number }) {
  if (value === 0) return <span className="flex items-center gap-0.5 text-muted-foreground text-xs"><Minus className="w-3 h-3" />0%</span>;
  if (value > 0) return <span className="flex items-center gap-0.5 text-emerald-400 text-xs"><ArrowUpRight className="w-3 h-3" />{value}%</span>;
  return <span className="flex items-center gap-0.5 text-red-400 text-xs"><ArrowDownRight className="w-3 h-3" />{Math.abs(value)}%</span>;
}

function MetricBadge({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ---- CUSTOM DATE PICKER ----
function CustomDatePicker({ onApply, onCancel }: { onApply: (start: string, end: string) => void; onCancel: () => void }) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [start, setStart] = useState(thirtyDaysAgo);
  const [end, setEnd] = useState(today);
  return (
    <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl p-4 shadow-xl w-72">
      <p className="text-xs font-semibold text-foreground mb-3">Periodo Personalizado</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Data inicial</label>
          <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Data final</label>
          <input type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-accent text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
          <button onClick={() => onApply(start, end)} className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Aplicar</button>
        </div>
      </div>
    </div>
  );
}

// ---- LP DETAIL PANEL ----
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
    const map = new Map<string, { campaign: string; sessions: number; users: number }>();
    for (const r of utms as any[]) {
      const key = r.campaign === "(not set)" ? "(sem campanha)" : r.campaign;
      const ex = map.get(key) || { campaign: key, sessions: 0, users: 0 };
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
          <ChartCard title="Visitas por Dia">
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
          </ChartCard>

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

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Campanhas", value: byCampaign.length, sub: "utm_campaign" },
                { label: "Fontes", value: bySource.length, sub: "utm_source" },
                { label: "Midias", value: byMedium.length, sub: "utm_medium" },
              ].map((m, i) => (
                <div key={i} className="bg-background rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                  <p className="text-xl font-bold text-foreground">{m.value}</p>
                  <p className="text-[10px] text-muted-foreground/60">{m.sub}</p>
                </div>
              ))}
            </div>

            {loadingUTMs ? <LoadingSpinner /> : (
              <>
                {utmView === "overview" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Campanhas</p>
                      <div className="space-y-2">
                        {byCampaign.slice(0, 8).map((c: any, i: number) => (
                          <div key={i}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-foreground/80 truncate max-w-[130px]">{c.campaign}</span>
                              <span className="font-bold text-foreground flex-shrink-0 ml-1">{c.sessions.toLocaleString("pt-BR")}</span>
                            </div>
                            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(c.sessions / (byCampaign[0]?.sessions || 1)) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            </div>
                          </div>
                        ))}
                        {byCampaign.length === 0 && <p className="text-xs text-muted-foreground/60 py-3 text-center">Sem campanhas</p>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Fontes</p>
                      <div className="space-y-2">
                        {bySource.slice(0, 8).map((s: any, i: number) => (
                          <div key={i}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-foreground/80 truncate max-w-[130px]">{s.source}</span>
                              <span className="font-bold text-foreground flex-shrink-0 ml-1">{s.sessions.toLocaleString("pt-BR")}</span>
                            </div>
                            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(s.sessions / (bySource[0]?.sessions || 1)) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            </div>
                          </div>
                        ))}
                        {bySource.length === 0 && <p className="text-xs text-muted-foreground/60 py-3 text-center">Sem fontes</p>}
                      </div>
                    </div>
                  </div>
                )}

                {utmView === "campaigns" && (
                  <div className="space-y-2">
                    {byCampaign.map((c: any, i: number) => {
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
                              <div className="h-full rounded-full" style={{ width: `${(c.sessions / (byCampaign[0]?.sessions || 1)) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {byCampaign.length === 0 && <p className="text-xs text-muted-foreground/60 py-4 text-center">Sem campanhas UTM no periodo</p>}
                  </div>
                )}

                {utmView === "sources" && (
                  <div className="space-y-2">
                    {bySource.map((s: any, i: number) => {
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
                              <div className="h-full rounded-full" style={{ width: `${(s.sessions / (bySource[0]?.sessions || 1)) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {bySource.length === 0 && <p className="text-xs text-muted-foreground/60 py-4 text-center">Sem fontes no periodo</p>}
                  </div>
                )}

                {utmView === "mediums" && (
                  <div className="space-y-2">
                    {byMedium.map((m: any, i: number) => {
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
                              <div className="h-full rounded-full" style={{ width: `${(m.sessions / (byMedium[0]?.sessions || 1)) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
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
  group, onSelectPage,
}: {
  group: { brand: string; sessions: number; users: number; newUsers: number; bounceRate: number; avgDuration: number; pages: any[] };
  onSelectPage: (page: { path: string; label: string; brand: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const brandColor = BRAND_COLORS[group.brand] || "#6366f1";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-accent/20 transition-colors group" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: brandColor }} />
          <span className="text-sm font-bold text-foreground">{group.brand}</span>
          <span className="text-[10px] text-muted-foreground/60">{group.pages.length} {group.pages.length === 1 ? "pagina" : "paginas"}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:grid grid-cols-4 gap-4 text-right">
            <div><p className="text-sm font-bold text-foreground">{group.sessions.toLocaleString("pt-BR")}</p><p className="text-[10px] text-muted-foreground">Sessoes</p></div>
            <div><p className="text-sm font-bold text-foreground">{group.users.toLocaleString("pt-BR")}</p><p className="text-[10px] text-muted-foreground">Usuarios</p></div>
            <div><p className={`text-sm font-bold ${group.bounceRate > 70 ? "text-red-400" : group.bounceRate < 40 ? "text-emerald-400" : "text-foreground"}`}>{group.bounceRate.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground">Bounce</p></div>
            <div><p className="text-sm font-bold text-foreground">{formatDuration(group.avgDuration)}</p><p className="text-[10px] text-muted-foreground">Tempo Medio</p></div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" />}
        </div>
      </div>
      <div className="sm:hidden grid grid-cols-4 gap-2 px-4 pb-3 border-t border-border/40 pt-2">
        <MetricBadge label="Sessoes" value={group.sessions.toLocaleString("pt-BR")} />
        <MetricBadge label="Usuarios" value={group.users.toLocaleString("pt-BR")} />
        <MetricBadge label="Bounce" value={`${group.bounceRate.toFixed(1)}%`} color={group.bounceRate > 70 ? "text-red-400" : group.bounceRate < 40 ? "text-emerald-400" : "text-foreground"} />
        <MetricBadge label="Tempo" value={formatDuration(group.avgDuration)} />
      </div>
      {expanded && (
        <div className="border-t border-border/60">
          {group.pages.map((lp: any, i: number) => (
            <div key={lp.path} className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-accent/20 transition-colors group/row ${i < group.pages.length - 1 ? "border-b border-border/30" : ""}`}
              onClick={() => onSelectPage({ path: lp.path, label: lp.label, brand: lp.brand })}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-50" style={{ backgroundColor: brandColor }} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{lp.label}</p>
                  <a href={`https://lp.carrera.com.br${lp.path}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors">
                    {lp.path}<ExternalLink className="w-2.5 h-2.5" />
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

const CHART_COLORS = [
  "#6366f1", "#22d3ee", "#4ade80", "#f472b6", "#fb923c",
  "#a78bfa", "#34d399", "#f87171", "#60a5fa", "#fbbf24",
  "#e879f9", "#2dd4bf",
];
const SOURCE_LABELS: Record<string, string> = {
  "Organic Search": "Busca Organica",
  "Direct": "Direto",
  "Referral": "Referencia",
  "Organic Social": "Social Organico",
  "Paid Search": "Busca Paga",
  "Email": "E-mail",
  "Unassigned": "Nao atribuido",
  "(none)": "Nenhum",
  "Cross-network": "Cross-network",
  "Display": "Display",
};
const PERIOD_VS_LABELS: Record<Period, string> = {
  today: "vs. ontem",
  yesterday: "vs. anteontem",
  "7days": "vs. 7 dias anteriores",
  "15days": "vs. 15 dias anteriores",
  "30days": "vs. 30 dias anteriores",
  "90days": "vs. 90 dias anteriores",
  custom: "vs. periodo anterior",
};
// ---- OVERVIEW TAB ----
function OverviewTab({ period, customStart, customEnd, input, baseInput, selectedBrand, selectedSubpage, onSelectBrand, onSelectSubpage }: {
  period: Period;
  customStart?: string;
  customEnd?: string;
  input: any;
  baseInput?: any;
  selectedBrand?: string | null;
  selectedSubpage?: { path: string; label: string; brand: string } | null;
  onSelectBrand?: (brand: string) => void;
  onSelectSubpage?: (sub: { path: string; label: string; brand: string }) => void;
}) {
  const [sortBy, setSortBy] = useState<"sessions" | "users" | "bounceRate" | "avgDuration">("sessions");
  const [pageSearch, setPageSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(pageSearch.trim()), 500);
    return () => clearTimeout(t);
  }, [pageSearch]);
  // input = filtered (with brandOrPath), baseInput = always all brands (for group chart)
  const groupInput = useMemo(() => baseInput ?? input, [baseInput, input]);
  const { data: summary, isLoading: loadingSummary } = trpc.analytics.lpsSummary.useQuery(input);
  const { data: sessionsByDay, isLoading: loadingDays } = trpc.analytics.lpsSessionsByDay.useQuery(input);
  const { data: trafficSources } = trpc.analytics.lpsTrafficSources.useQuery(input);
  const { data: deviceDist } = trpc.analytics.lpsDeviceDistribution.useQuery(input);
  // topPages usa o mesmo input filtrado (com brandOrPath) para mostrar apenas páginas da marca selecionada
  const { data: topPages, isLoading: loadingTopPages } = trpc.analytics.lpsTopPages.useQuery(input);
  const { data: utmData } = trpc.analytics.lpsUTMAnalysis.useQuery(input);
  // Always load all brands for the chart (unfiltered)
  const { data: groupedBrands, isLoading: loadingPages } = trpc.analytics.lpsGroupedByBrand.useQuery(groupInput);
  const vsLabel = PERIOD_VS_LABELS[period];

  const filteredGroups = useMemo(() => {
    if (!groupedBrands) return [];
    let groups = groupedBrands as any[];
    // When a brand is selected, show only that brand's subpages
    if (selectedBrand) groups = groups.filter((g: any) => g.brand === selectedBrand);
    return [...groups].sort((a: any, b: any) => {
      if (sortBy === "bounceRate") return b.bounceRate - a.bounceRate;
      return b[sortBy] - a[sortBy];
    });
  }, [groupedBrands, selectedBrand, sortBy]);

  const brandSummary = useMemo(() => {
    if (!groupedBrands) return [];
    return (groupedBrands as any[]).map((g: any) => ({ brand: g.brand, sessions: g.sessions, users: g.users }));
  }, [groupedBrands]);

  const activeBrandColor = selectedBrand ? (BRAND_COLORS[selectedBrand] || "#6366f1") : "#6366f1";

  return (
    <div className="space-y-4">
      {/* Brand filter buttons - TOP, always visible */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filtrar por Marca</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {["Todas", ...Object.keys(BRAND_COLORS)].filter(b => b === "Todas" || (groupedBrands as any[] || []).some((g: any) => g.brand === b)).map((b) => (
            <button key={b} onClick={() => { if (b === "Todas") { onSelectBrand && onSelectBrand(""); } else { onSelectBrand && onSelectBrand(b); } }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${(b === "Todas" ? !selectedBrand : selectedBrand === b) ? "text-white shadow-sm" : "bg-background border border-border text-muted-foreground hover:text-foreground"}`}
              style={(b === "Todas" ? !selectedBrand : selectedBrand === b) ? { backgroundColor: b === "Todas" ? "#6366f1" : (BRAND_COLORS[b] || "#6366f1") } : {}}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Summary metrics - filtered by selected brand */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: <TrendingUp className="w-4 h-4 text-primary" />, label: "Total de Sessoes", value: loadingSummary ? "..." : (summary?.sessions ?? 0).toLocaleString("pt-BR"), color: "bg-primary/10" },
          { icon: <Users className="w-4 h-4 text-cyan-400" />, label: "Usuarios", value: loadingSummary ? "..." : (summary?.users ?? 0).toLocaleString("pt-BR"), sub: `${(summary?.newUsers ?? 0).toLocaleString("pt-BR")} novos`, color: "bg-cyan-400/10" },
          { icon: <Globe className="w-4 h-4 text-emerald-400" />, label: "Taxa de Rejeicao", value: loadingSummary ? "..." : `${(summary?.bounceRate ?? 0).toFixed(1)}%`, color: "bg-emerald-400/10" },
          { icon: <Clock className="w-4 h-4 text-violet-400" />, label: "Duracao Media", value: loadingSummary ? "..." : formatDuration(summary?.avgDuration ?? 0), color: "bg-violet-400/10" },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4"
            style={selectedBrand ? { borderColor: `${activeBrandColor}40` } : {}}>
            <div className={`p-2 rounded-lg w-fit mb-3 ${m.color}`}>{m.icon}</div>
            <p className="text-xl font-bold text-foreground">{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
            {m.sub && <p className="text-xs text-muted-foreground/60">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* Sessions by Day - filtered, shown immediately after metrics */}
      <ChartCard
        title={`Visitas por Dia${selectedBrand ? ` - ${selectedBrand}` : ""} - ${period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}`}
        description={selectedBrand ? `Evolucao diaria de sessoes da marca ${selectedBrand} no periodo.` : "Evolucao diaria de sessoes e usuarios no periodo selecionado."}
      >
        {loadingDays ? <LoadingSpinner /> : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={sessionsByDay as any[] || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} interval={(sessionsByDay as any[] || []).length <= 10 ? 0 : (sessionsByDay as any[] || []).length <= 20 ? 1 : "preserveStartEnd"} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "sessions" ? "Sessoes" : "Usuarios"]} labelFormatter={formatDate} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "sessions" ? "Sessoes" : "Usuarios"} />
              <Bar dataKey="sessions" fill={selectedBrand ? activeBrandColor : "#6366f1"} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="users" fill="#22d3ee" radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Line type="monotone" dataKey="sessions" stroke={selectedBrand ? activeBrandColor : "#a5b4fc"} strokeWidth={1.5} dot={false} strokeOpacity={0.6} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Brand summary chart - always shows all brands for context */}
      {brandSummary.length > 0 && !selectedBrand && (
        <ChartCard title="Sessoes por Marca" description="Total de sessoes (visitas unicas) agrupadas por marca. Nota: o ranking de paginas usa visualizacoes (pageviews), que sao maiores que sessoes pois um usuario pode ver varias paginas na mesma visita. Por isso os numeros nao batem diretamente.">
          <ResponsiveContainer width="100%" height={Math.max(160, brandSummary.length * 38)}>
            <BarChart data={brandSummary} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="brand" tick={{ fontSize: 11, fill: "oklch(0.75 0.01 240)" }} tickLine={false} axisLine={false} width={80} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "sessions" ? "Sessoes" : "Usuarios"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "sessions" ? "Sessoes" : "Usuarios"} />
              <Bar dataKey="sessions" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: "oklch(0.6 0.01 240)", formatter: (v: number) => v.toLocaleString("pt-BR") }}>
                {brandSummary.map((s: any, i: number) => <Cell key={i} fill={BRAND_COLORS[s.brand] || "#6366f1"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Traffic Sources + Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Origem do Trafego" description="De onde vem os visitantes das BIOs.">
          <div className="space-y-2">
            {(trafficSources as any[] || []).map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground/80 font-medium truncate">{SOURCE_LABELS[s.source] || s.source}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-muted-foreground">{s.sessions.toLocaleString("pt-BR")}</span>
                      <span className="font-semibold text-foreground/70 w-10 text-right">{s.percentage}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Dispositivos" description="Proporcao de acessos por tipo de dispositivo.">
          <div className="space-y-3">
            {(deviceDist as any[] || []).map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${CHART_COLORS[i]}20` }}>
                  {d.device === "mobile" ? <span style={{ color: CHART_COLORS[i] }}>📱</span> : d.device === "desktop" ? <span style={{ color: CHART_COLORS[i] }}>💻</span> : <span style={{ color: CHART_COLORS[i] }}>📟</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground/80 font-medium capitalize">{d.device}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-muted-foreground">{d.sessions.toLocaleString("pt-BR")}</span>
                      <span className="font-bold text-foreground/70 w-10 text-right">{d.percentage}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${d.percentage}%`, backgroundColor: CHART_COLORS[i] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* UTM Summary Widget */}
      {utmData && ((utmData as any).byCampaign?.length > 0 || (utmData as any).bySource?.length > 0) && (
        <ChartCard title="Resumo de Campanhas UTM" badge="Top campanhas" description="Principais campanhas ativas no periodo. Acesse a aba UTMs para analise completa.">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(utmData as any).byCampaign?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Campanhas</p>
                <div className="space-y-2">
                  {(utmData as any).byCampaign.slice(0, 5).map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-foreground/80 truncate max-w-[160px]">{c.campaign}</span>
                      </div>
                      <span className="text-muted-foreground flex-shrink-0 ml-2">{c.sessions.toLocaleString("pt-BR")} sess.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(utmData as any).bySource?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Fontes</p>
                <div className="space-y-2">
                  {(utmData as any).bySource.slice(0, 5).map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-foreground/80 truncate max-w-[160px]">{s.source}</span>
                      </div>
                      <span className="text-muted-foreground flex-shrink-0 ml-2">{s.sessions.toLocaleString("pt-BR")} sess.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ChartCard>
      )}

      {/* Top Pages */}
      <ChartCard
        title={selectedBrand ? `Paginas Mais Visitadas - ${selectedBrand}` : "Paginas Mais Visitadas"}
        description={selectedBrand
          ? `Top BIOs da marca ${selectedBrand} com mais visualizacoes no periodo. Visualizacoes (vis.) contam cada carregamento de pagina; sessoes (sess.) contam visitas unicas agrupadas.`
          : "Top BIOs com mais visualizacoes no periodo. Visualizacoes (vis.) contam cada carregamento de pagina; sessoes (sess.) contam visitas unicas agrupadas. Por isso vis. >= sess. sempre."
        }
      >
        {loadingTopPages ? <LoadingSpinner /> : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Buscar por URL (ex: gwm, chevrolet, bajaj...)"
                value={pageSearch}
                onChange={e => setPageSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-muted/40 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
              />
              {pageSearch && <button onClick={() => setPageSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors text-xs">✕</button>}
            </div>
            <div className="space-y-2">
              {(topPages as any[] || []).filter((p: any) => !debouncedSearch || p.page.toLowerCase().includes(debouncedSearch.toLowerCase())).map((p: any, i: number) => {
                const maxViews = (topPages as any[])[0]?.views || 1;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <a href={`https://lp.carrera.com.br${p.page}`} target="_blank" rel="noopener noreferrer"
                          className="text-foreground/80 hover:text-primary transition-colors truncate max-w-[200px] flex items-center gap-1">
                          {p.page}
                          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                        </a>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-muted-foreground">{p.views.toLocaleString("pt-BR")} vis.</span>
                          <span className="text-foreground/60">{p.sessions.toLocaleString("pt-BR")} sess.</span>
                        </div>
                      </div>
                      <div className="h-1 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(p.views / maxViews) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ChartCard>

      {/* Sort controls for brand cards */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {selectedBrand ? `Subpaginas - ${selectedBrand}` : "Todas as Marcas"}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Ordenar por:</span>
          {(["sessions", "users", "bounceRate", "avgDuration"] as const).map((s) => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${sortBy === s ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
              {s === "sessions" ? "Sessoes" : s === "users" ? "Usuarios" : s === "bounceRate" ? "Bounce" : "Duracao"}
            </button>
          ))}
        </div>
      </div>

      {/* Brand Group Cards */}
      {loadingPages ? <LoadingSpinner /> : filteredGroups.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma BIO encontrada para o periodo selecionado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((group: any) => (
            <BrandGroupCard key={group.brand} group={group} onSelectPage={(page) => {
              onSelectSubpage && onSelectSubpage(page);
              if (!selectedBrand) onSelectBrand && onSelectBrand(page.brand);
            }} />
          ))}
        </div>
      )}

      {/* LP Detail Panel */}
      {selectedSubpage && (
        <LPDetailPanel
          page={selectedSubpage.path}
          label={selectedSubpage.label}
          brand={selectedSubpage.brand}
          period={period}
          customStart={customStart}
          customEnd={customEnd}
          onClose={() => onSelectSubpage && onSelectSubpage(null as any)}
        />
      )}

      {/* Rodape explicativo */}
      <div className="mt-4 p-4 bg-muted/30 border border-border/50 rounded-xl text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground/70 uppercase tracking-wide text-[10px]">Como interpretar os dados desta aba</p>
        <p><span className="font-medium text-foreground/80">Sessoes vs. Visualizacoes:</span> O grafico "Sessoes por Marca" conta visitas unicas (uma pessoa que acessa 3 paginas da Nissan = 1 sessao). O ranking "Paginas Mais Visitadas" conta visualizacoes (pageviews), ou seja, cada carregamento de pagina. Por isso o total de visualizacoes e sempre maior ou igual ao de sessoes.</p>
        <p><span className="font-medium text-foreground/80">Filtro por Marca:</span> Ao clicar em uma marca acima, todos os graficos, metricas e o ranking de paginas sao filtrados para mostrar apenas dados dessa marca. O grafico de distribuicao por marca some pois nao faz sentido com filtro ativo.</p>
        <p><span className="font-medium text-foreground/80">Propriedade GA4:</span> Estes dados vem da propriedade GA4 das Carrera BIOs (503617174), separada do site principal. Sessoes aqui sao independentes das sessoes do site carrera.com.br.</p>
      </div>
    </div>
  );
}

// ---- COMPARISON TAB ----
function ComparisonTab({ input }: { input: any }) {
  const { data: comparison, isLoading } = trpc.analytics.lpsPeriodComparison.useQuery(input);
  const { data: details, isLoading: loadingDetails } = trpc.analytics.lpsComparisonDetails.useQuery(input);

  if (isLoading || loadingDetails) return <LoadingSpinner />;
  if (!comparison) return null;

  const { current, previous, changes } = comparison;

  const metrics = [
    { label: "Sessoes", curr: current.sessions, prev: previous.sessions, chg: changes.sessions, fmt: (v: number) => v.toLocaleString("pt-BR"), icon: <TrendingUp className="w-4 h-4 text-primary" />, color: "bg-primary/10" },
    { label: "Usuarios", curr: current.users, prev: previous.users, chg: changes.users, fmt: (v: number) => v.toLocaleString("pt-BR"), icon: <Users className="w-4 h-4 text-cyan-400" />, color: "bg-cyan-400/10" },
    { label: "Novos Usuarios", curr: current.newUsers, prev: previous.newUsers, chg: changes.newUsers, fmt: (v: number) => v.toLocaleString("pt-BR"), icon: <Users className="w-4 h-4 text-emerald-400" />, color: "bg-emerald-400/10" },
    { label: "Taxa de Rejeicao", curr: current.bounceRate, prev: previous.bounceRate, chg: changes.bounceRate, fmt: (v: number) => `${v.toFixed(1)}%`, icon: <Globe className="w-4 h-4 text-amber-400" />, color: "bg-amber-400/10" },
    { label: "Duracao Media", curr: current.avgSessionDuration, prev: previous.avgSessionDuration, chg: changes.avgSessionDuration, fmt: formatDuration, icon: <Clock className="w-4 h-4 text-violet-400" />, color: "bg-violet-400/10" },
    { label: "Pags/Sessao", curr: current.pageViewsPerSession, prev: previous.pageViewsPerSession, chg: changes.pageViewsPerSession, fmt: (v: number) => v.toFixed(2), icon: <Globe className="w-4 h-4 text-pink-400" />, color: "bg-pink-400/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-2.5">
        <Calendar className="w-4 h-4 text-primary" />
        <span>Comparativo do periodo atual vs. periodo anterior de mesma duracao.</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-2 rounded-lg w-fit mb-2 ${m.color}`}>{m.icon}</div>
            <p className="text-xl font-bold text-foreground">{m.fmt(m.curr)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground/60">Anterior: {m.fmt(m.prev)}</span>
              <PctChange value={m.chg} />
            </div>
          </div>
        ))}
      </div>

      {details && (
        <>
          {/* Sessions by hour comparison */}
          {details.hourly && details.hourly.length > 0 && (
            <ChartCard title="Distribuicao por Hora: Periodo Atual vs. Anterior" description="Comparativo de sessoes por hora do dia entre os dois periodos.">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={details.hourly} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "current" ? "Atual" : "Anterior"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "current" ? "Periodo Atual" : "Periodo Anterior"} />
                  <Bar dataKey="current" fill="#6366f1" radius={[2, 2, 0, 0]} opacity={0.85} />
                  <Line type="monotone" dataKey="previous" stroke="#6366f1" strokeWidth={1.5} dot={false} strokeDasharray="4 3" strokeOpacity={0.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Channels comparison */}
          {details.channels && details.channels.length > 0 && (
              <ChartCard title="Canais de Trafego: Atual vs. Anterior">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Canal</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Atual</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Anterior</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Variacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.channels.map((c: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="py-2 font-medium text-foreground/80">{c.channel}</td>
                        <td className="py-2 text-right font-bold text-foreground">{c.current.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right text-muted-foreground">{c.previous.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right"><PctChange value={c.change} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          {/* Top pages comparison */}
          {details.pages && details.pages.length > 0 && (
              <ChartCard title="Top Paginas: Atual vs. Anterior">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Pagina</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Atual</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Anterior</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Variacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.pages.slice(0, 15).map((p: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="py-2 font-medium text-foreground/80 max-w-[200px] truncate">
                          <a href={`https://lp.carrera.com.br${p.page}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 group hover:text-primary transition-colors">
                            <span className="truncate">{p.page}</span>
                            <ArrowUpRight className="w-3 h-3 opacity-30 group-hover:opacity-100 flex-shrink-0" />
                          </a>
                        </td>
                        <td className="py-2 text-right font-bold text-foreground">{p.current.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right text-muted-foreground">{p.previous.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right"><PctChange value={p.change} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}

// ---- UTMs TAB ----
const BIO_BRANDS = ["Todas", "Chevrolet", "Nissan", "Omoda", "GAC", "Bajaj", "GWM", "Volkswagen", "Zeekr", "Seminovos"];

function UTMsTab({ input }: { input: any }) {
  const [utmView, setUtmView] = useState<"overview" | "campaign" | "source" | "medium" | "combinations">("overview");
  const [utmBrand, setUtmBrand] = useState<string>("Todas");
  const utmInput = useMemo(() => ({ ...input, brand: utmBrand === "Todas" ? undefined : utmBrand }), [input, utmBrand]);
  const { data, isLoading } = trpc.analytics.lpsUTMAnalysis.useQuery(utmInput);

  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const { byCampaign, bySource, byMedium, topCombinations } = data;
  const hasCampaigns = byCampaign.length > 0;
  const hasSources = bySource.length > 0;
  const hasMediums = byMedium.length > 0;
  const totalSessions = bySource.reduce((s: number, r: { sessions: number }) => s + r.sessions, 0);

  const sourceIcons: Record<string, React.ReactNode> = {
    google: <Search className="w-3.5 h-3.5" />,
    facebook: <Share2 className="w-3.5 h-3.5" />,
    instagram: <Share2 className="w-3.5 h-3.5" />,
    email: <Mail className="w-3.5 h-3.5" />,
    direct: <Globe className="w-3.5 h-3.5" />,
  };

  return (
    <div className="space-y-6">
       <div className="flex items-start gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-3">
        <Link2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <span>Analise de campanhas de marketing rastreadas por <strong className="text-foreground">parametros UTM</strong> nas BIOs. Mostra quais campanhas, fontes e midias trazem mais trafego.</span>
      </div>

      {/* Filtro de marca */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Filtrar por marca:</span>
        <div className="flex flex-wrap gap-1.5">
          {BIO_BRANDS.map(brand => (
            <button key={brand} onClick={() => setUtmBrand(brand)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 border ${
                utmBrand === brand
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
              }`}>
              {brand}
            </button>
          ))}
        </div>
        {utmBrand !== "Todas" && (
          <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
            Mostrando UTMs de: {utmBrand}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground mb-1">Campanhas Ativas</p><p className="text-2xl font-bold text-foreground">{byCampaign.length}</p><p className="text-xs text-muted-foreground/60 mt-0.5">utm_campaign distintas</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground mb-1">Fontes (Sources)</p><p className="text-2xl font-bold text-foreground">{bySource.length}</p><p className="text-xs text-muted-foreground/60 mt-0.5">utm_source distintas</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground mb-1">Midias (Mediums)</p><p className="text-2xl font-bold text-foreground">{byMedium.length}</p><p className="text-xs text-muted-foreground/60 mt-0.5">utm_medium distintas</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground mb-1">Total Conversoes</p><p className="text-2xl font-bold text-emerald-400">{byCampaign.reduce((s: number, c: { conversions: number }) => s + c.conversions, 0).toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground/60 mt-0.5">via campanhas UTM</p></div>
      </div>

      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {[
          { id: "overview" as const, label: "Visao Geral" },
          { id: "campaign" as const, label: "Campanhas" },
          { id: "source" as const, label: "Fontes" },
          { id: "medium" as const, label: "Midias" },
          { id: "combinations" as const, label: "Combinacoes" },
        ].map((v) => (
          <button key={v.id} onClick={() => setUtmView(v.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${utmView === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {utmView === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Top Campanhas (utm_campaign)" description="Principais campanhas por sessoes no periodo.">
            {!hasCampaigns ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground"><Link2 className="w-8 h-8 opacity-30" /><p className="text-sm">Nenhuma campanha UTM encontrada.</p></div>
            ) : (
              <div className="space-y-2.5">
                {byCampaign.slice(0, 10).map((c: { campaign: string; sessions: number; users: number; conversions: number }, i: number) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground/80 font-medium truncate max-w-[160px]">{c.campaign}</span>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="font-bold text-foreground">{c.sessions.toLocaleString("pt-BR")}</span>
                        {c.conversions > 0 && <span className="text-emerald-400 text-[10px]">{c.conversions} conv.</span>}
                      </div>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.sessions / (byCampaign[0]?.sessions || 1)) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                    </div>
                  </div>
                ))}
                <button onClick={() => setUtmView("campaign")} className="text-xs text-primary hover:underline mt-1">Ver todas as campanhas →</button>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Top Fontes (utm_source)" description="Principais fontes de trafego rastreadas por UTM no periodo.">
            {!hasSources ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground"><Search className="w-8 h-8 opacity-30" /><p className="text-sm">Nenhuma fonte UTM encontrada.</p></div>
            ) : (
              <div className="space-y-2.5">
                {bySource.slice(0, 10).map((s: { source: string; sessions: number; users: number }, i: number) => {
                  const pct = totalSessions > 0 ? Math.round((s.sessions / totalSessions) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ color: UTM_COLORS[i % UTM_COLORS.length] }}>{sourceIcons[s.source.toLowerCase()] || <Globe className="w-3.5 h-3.5" />}</span>
                          <span className="text-foreground/80 font-medium truncate">{s.source}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="font-bold text-foreground">{s.sessions.toLocaleString("pt-BR")}</span>
                          <span className="text-muted-foreground text-[10px]">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.sessions / (bySource[0]?.sessions || 1)) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setUtmView("source")} className="text-xs text-primary hover:underline mt-1">Ver todas as fontes →</button>
              </div>
            )}
          </ChartCard>
        </div>
      )}

      {utmView === "campaign" && (
        <ChartCard title="Sessoes por Campanha (utm_campaign)" description="Cada campanha de marketing rastreada com utm_campaign.">
          {!hasCampaigns ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground"><Link2 className="w-8 h-8 opacity-30" /><p className="text-sm">Nenhuma campanha UTM encontrada no periodo selecionado.</p></div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(200, byCampaign.length * 38)}>
                <BarChart data={byCampaign} layout="vertical" margin={{ top: 0, right: 80, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="campaign" tick={{ fontSize: 10, fill: "oklch(0.75 0.01 240)" }} tickLine={false} axisLine={false} width={140} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "sessions" ? "Sessoes" : n === "users" ? "Usuarios" : "Conversoes"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "sessions" ? "Sessoes" : v === "users" ? "Usuarios" : "Conversoes"} />
                  <Bar dataKey="sessions" fill="#6366f1" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: "oklch(0.6 0.01 240)", formatter: (v: number) => v.toLocaleString("pt-BR") }} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Campanha</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Sessoes</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Usuarios</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Conversoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCampaign.map((c: { campaign: string; sessions: number; users: number; conversions: number }, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="py-2 font-medium text-foreground/80">
                          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />{c.campaign}</div>
                        </td>
                        <td className="py-2 text-right font-bold text-foreground">{c.sessions.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right text-muted-foreground">{c.users.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right">{c.conversions > 0 ? <span className="text-emerald-400 font-semibold">{c.conversions.toLocaleString("pt-BR")}</span> : <span className="text-muted-foreground/50">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </ChartCard>
      )}

      {utmView === "source" && (
        <ChartCard title="Sessoes por Fonte (utm_source)" description="De qual plataforma ou site vieram os usuarios rastreados.">
          {!hasSources ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground"><Search className="w-8 h-8 opacity-30" /><p className="text-sm">Nenhuma fonte UTM encontrada no periodo selecionado.</p></div>
          ) : (
            <div className="space-y-3">
              {bySource.map((s: { source: string; sessions: number; users: number }, i: number) => {
                const pct = totalSessions > 0 ? Math.round((s.sessions / totalSessions) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${UTM_COLORS[i % UTM_COLORS.length]}20` }}>
                      <span style={{ color: UTM_COLORS[i % UTM_COLORS.length] }}>{sourceIcons[s.source.toLowerCase()] || <Globe className="w-3.5 h-3.5" />}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-foreground/80 font-medium truncate">{s.source}</span>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                          <span className="text-muted-foreground">{s.sessions.toLocaleString("pt-BR")} sess.</span>
                          <span className="text-muted-foreground">{s.users.toLocaleString("pt-BR")} users</span>
                          <span className="font-bold text-foreground/70 w-8 text-right">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      )}

      {utmView === "medium" && (
        <ChartCard title="Sessoes por Midia (utm_medium)" description="Qual tipo de midia trouxe os usuarios. Ex: cpc, organic, email, social, referral.">
          {!hasMediums ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground"><Share2 className="w-8 h-8 opacity-30" /><p className="text-sm">Nenhuma midia UTM encontrada no periodo selecionado.</p></div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={byMedium} dataKey="sessions" nameKey="medium" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2}>
                    {byMedium.map((_: unknown, i: number) => <Cell key={i} fill={UTM_COLORS[i % UTM_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR") + " sessoes", n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-2">
                {byMedium.map((m: { medium: string; sessions: number; users: number }, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50">
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} /><span className="text-foreground/80 font-medium">{m.medium}</span></div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{m.sessions.toLocaleString("pt-BR")} sessoes</span>
                      <span className="text-muted-foreground">{m.users.toLocaleString("pt-BR")} usuarios</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      )}

      {utmView === "combinations" && (
        <ChartCard title="Combinacoes Source / Medium / Campaign" description="Visao completa das combinacoes de parametros UTM nas BIOs.">
          {topCombinations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground"><Link2 className="w-8 h-8 opacity-30" /><p className="text-sm">Nenhuma combinacao UTM encontrada no periodo selecionado.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Fonte</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Midia</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Campanha</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Sessoes</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Usuarios</th>
                  </tr>
                </thead>
                <tbody>
                  {topCombinations.map((c: { source: string; medium: string; campaign: string; sessions: number; users: number }, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                      <td className="py-2.5"><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} /><span className="text-foreground/80 font-medium">{c.source}</span></div></td>
                      <td className="py-2.5 text-muted-foreground">{c.medium}</td>
                      <td className="py-2.5 text-muted-foreground max-w-[200px] truncate">{c.campaign === "(not set)" ? <span className="opacity-40 italic">nao definida</span> : c.campaign}</td>
                      <td className="py-2.5 text-right font-bold text-foreground">{c.sessions.toLocaleString("pt-BR")}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{c.users.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      )}
    </div>
  );
}

// ---- HISTORY TAB ----
function HistoryTab({ input, period }: { input: any; period: Period }) {
  const { data, isLoading } = trpc.analytics.lpsDayHistory.useQuery(input);

  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const { days, best, worst, avg } = data;

  const coloredDays = days.map((d: { date: string; sessions: number }) => ({
    ...d,
    fill: d.sessions >= avg * 1.2 ? "#4ade80" : d.sessions <= avg * 0.8 ? "#f87171" : "#6366f1",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-2.5">
        <Calendar className="w-4 h-4 text-primary" />
        <span>Historico das BIOs, <strong className="text-foreground">{period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}</strong>, media diaria: <strong className="text-foreground">{avg.toLocaleString("pt-BR")}</strong> sessoes</span>
      </div>

      <ChartCard title={`Sessoes por Dia, ${period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}`} badge="Verde = acima da media | Vermelho = abaixo">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={coloredDays} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 9, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} interval={coloredDays.length <= 10 ? 0 : coloredDays.length <= 20 ? 1 : Math.floor(coloredDays.length / 10)} />
            <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Sessoes"]} labelFormatter={formatDateFull} />
            <ReferenceLine y={avg} stroke="#fbbf24" strokeDasharray="4 3" label={{ value: `Media: ${avg.toLocaleString("pt-BR")}`, position: "right", fontSize: 9, fill: "#fbbf24" }} />
            <Bar dataKey="sessions" radius={[2, 2, 0, 0]}>
              {coloredDays.map((d: { fill: string }, i: number) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="10 Melhores Dias" badge={period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}>
          <div className="space-y-2">
            {best.map((d: { date: string; sessions: number }, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
                  {i === 0 ? <Award className="w-3 h-3 text-emerald-400" /> : <span className="text-xs font-bold text-emerald-400">{i + 1}</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground/80 font-medium">{formatDateFull(d.date)}</span>
                    <span className="font-bold text-emerald-400">{d.sessions.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-1 bg-border rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(d.sessions / best[0].sessions) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="10 Piores Dias" badge={period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}>
          <div className="space-y-2">
            {worst.map((d: { date: string; sessions: number }, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-red-400/10 flex items-center justify-center flex-shrink-0">
                  {i === 0 ? <AlertTriangle className="w-3 h-3 text-red-400" /> : <span className="text-xs font-bold text-red-400">{i + 1}</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground/80 font-medium">{formatDateFull(d.date)}</span>
                    <span className="font-bold text-red-400">{d.sessions.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-1 bg-border rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${(d.sessions / best[0].sessions) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ---- MAIN BIO DASHBOARD ----
export default function BioDashboard() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("30days");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [now, setNow] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("overview");
  // Navigation context: null = all brands, string = brand name or page path
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedSubpage, setSelectedSubpage] = useState<{ path: string; label: string; brand: string } | null>(null);

  const input = useMemo(() => ({ period, customStart, customEnd }), [period, customStart, customEnd]);
  // Input with brandOrPath filter applied
  const filteredInput = useMemo(() => ({
    period,
    customStart,
    customEnd,
    brandOrPath: selectedSubpage?.path ?? selectedBrand ?? undefined,
  }), [period, customStart, customEnd, selectedBrand, selectedSubpage]);
  const { data: realtime } = trpc.analytics.lpsRealtimeUsers.useQuery(undefined, { refetchInterval: 30000 });

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

  const MAIN_TABS = [
    { id: "overview" as const, label: "Visao Geral" },
    { id: "comparison" as const, label: "Comparativo" },
    { id: "utms" as const, label: "UTMs" },
    { id: "history" as const, label: "Historico" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Carrera Novos</span>
            </button>
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">Carrera BIO</h1>
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

      {/* Period selector + Main tabs */}
      <div className="border-b border-border bg-card/30">
        <div className="container py-3 space-y-3">
          {/* Period selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["today", "yesterday", "7days", "15days", "30days", "90days"] as const).map((p) => (
              <button key={p} onClick={() => handlePeriodSelect(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
            <div className="relative">
              <button onClick={() => setShowDatePicker(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${period === "custom" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`}>
                <Calendar className="w-3.5 h-3.5" />
                {periodLabel || "Personalizado"}
              </button>
              {showDatePicker && <CustomDatePicker onApply={handleApplyCustomDate} onCancel={() => setShowDatePicker(false)} />}
            </div>
          </div>

          {/* Main tabs */}
          <div className="flex items-center gap-1">
            {MAIN_TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="container py-6 space-y-4">
        {/* Breadcrumb navigation */}
        {(selectedBrand || selectedSubpage) && (
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => { setSelectedBrand(null); setSelectedSubpage(null); }}
              className="text-muted-foreground hover:text-foreground transition-colors font-medium">Todas as BIOs</button>
            {selectedBrand && (
              <>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <button
                  onClick={() => setSelectedSubpage(null)}
                  className={`font-medium transition-colors ${
                    !selectedSubpage ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ color: !selectedSubpage ? (BRAND_COLORS[selectedBrand] || undefined) : undefined }}>
                  {selectedBrand}
                </button>
              </>
            )}
            {selectedSubpage && (
              <>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground font-medium">{selectedSubpage.label}</span>
              </>
            )}
          </div>
        )}

        {activeTab === "overview" && (
          <OverviewTab
            period={period}
            customStart={customStart}
            customEnd={customEnd}
            input={filteredInput}
            baseInput={input}
            selectedBrand={selectedBrand}
            selectedSubpage={selectedSubpage}
            onSelectBrand={(brand) => { setSelectedBrand(brand || null); setSelectedSubpage(null); }}
            onSelectSubpage={setSelectedSubpage}
          />
        )}
        {activeTab === "comparison" && <ComparisonTab input={filteredInput} />}
        {activeTab === "utms" && <UTMsTab input={filteredInput} />}
        {activeTab === "history" && <HistoryTab input={filteredInput} period={period} />}
      </main>
    </div>
  );
}
