import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, BarChart, Bar, ComposedChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, AreaChart, Area,
} from "recharts";
import {
  Users, TrendingUp, Clock, MousePointerClick, Activity,
  Globe, ArrowUpRight, ArrowDownRight,
  Minus, BarChart2, Calendar, Home,
  Award, AlertTriangle, Car, Target, Info,
  PhoneCall, MessageCircle, Zap, Link2, Search, Mail, Share2,
  ChevronDown,
} from "lucide-react";

// ---- TYPES ----
type Period = "today" | "yesterday" | "7days" | "15days" | "30days" | "90days" | "custom";
type Tab = "overview" | "comparison" | "sections" | "history" | "leads" | "utms" | "tv" | "urlmonitor" | "attribution" | "about";

const PERIOD_LABELS: Record<Exclude<Period, "custom">, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7days": "7 dias",
  "15days": "15 dias",
  "30days": "30 dias",
  "90days": "90 dias",
};

const PERIOD_VS_LABELS: Record<Period, string> = {
  today: "vs. ontem",
  yesterday: "vs. anteontem",
  "7days": "vs. 7 dias anteriores",
  "15days": "vs. 15 dias anteriores",
  "30days": "vs. 30 dias anteriores",
  "90days": "vs. 90 dias anteriores",
  custom: "vs. periodo anterior equivalente",
};

const TABS: { id: Tab; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "overview", label: "Visao Geral", icon: <Home className="w-3.5 h-3.5" />, description: "Resumo do desempenho do site: sessoes, usuarios, taxa de rejeicao, origem do trafego e paginas mais visitadas." },
  { id: "comparison", label: "Comparativo", icon: <BarChart2 className="w-3.5 h-3.5" />, description: "Compare o periodo selecionado com o periodo anterior equivalente. Veja se o site esta crescendo ou caindo." },
  { id: "sections", label: "Marcas", icon: <Car className="w-3.5 h-3.5" />, description: "Distribuicao do trafego por marca e secao do site (Nissan, Chevrolet, Usados, Servicos, etc.)." },
  { id: "leads", label: "Leads", icon: <Target className="w-3.5 h-3.5" />, description: "Contatos e leads gerados por marca. Mostra quais secoes do site geram mais interesse e conversoes." },
  { id: "utms", label: "UTMs", icon: <Link2 className="w-3.5 h-3.5" />, description: "Analise de campanhas de marketing por UTM: origem, midia e campanha. Veja quais campanhas trazem mais trafego e conversoes." },
  { id: "history", label: "Historico", icon: <Calendar className="w-3.5 h-3.5" />, description: "Historico de 90 dias com ranking dos melhores e piores dias de trafego." },
  { id: "tv", label: "TV", icon: <Activity className="w-3.5 h-3.5" />, description: "Analise de correlacao entre as insercoes na TV aberta e o trafego no site. Veja o impacto de cada programa e horario." },
  { id: "urlmonitor", label: "Monitor de URLs", icon: <Search className="w-3.5 h-3.5" />, description: "Monitore o desempenho de cada pagina: picos, baixas, media diaria e tendencia de crescimento ou queda." },
  { id: "attribution", label: "Atribuicao", icon: <Share2 className="w-3.5 h-3.5" />, description: "Analise de trafego sem atribuicao (Unassigned + Direct). Diagnostico de causas e plano de acao para corrigir antes de campanhas de midia paga." },
  { id: "about", label: "Sobre o Dashboard", icon: <Info className="w-3.5 h-3.5" />, description: "Definicoes, regras e logicas usadas em cada aba do dashboard. Entenda como os dados sao calculados." },
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

const CHART_COLORS = [
  "#6366f1", "#22d3ee", "#4ade80", "#f472b6", "#fb923c",
  "#a78bfa", "#34d399", "#f87171", "#60a5fa", "#fbbf24",
  "#e879f9", "#2dd4bf",
];

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

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ---- SHARED COMPONENTS ----
function ChangeIndicator({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const positive = inverse ? value < 0 : value > 0;
  const neutral = value === 0;
  if (neutral) return <span className="flex items-center gap-0.5 text-muted-foreground text-xs"><Minus className="w-3 h-3" /> 0%</span>;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-400" : "text-red-400"}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value)}%
    </span>
  );
}

function MetricCard({ icon, label, value, sub, color, change, inverseChange, tooltip }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
  change?: number; inverseChange?: boolean; tooltip?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl p-4 lg:p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 relative">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color || "bg-primary/10"}`}>
          {icon}
        </div>
        <div className="flex items-center gap-1.5">
          {change !== undefined && <ChangeIndicator value={change} inverse={inverseChange} />}
          {tooltip && (
            <div className="relative">
              <button
                onMouseEnter={() => setShowTip(true)}
                onMouseLeave={() => setShowTip(false)}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <Info className="w-3 h-3" />
              </button>
              {showTip && (
                <div className="absolute right-0 top-5 z-50 w-48 bg-popover border border-border rounded-lg p-2.5 text-xs text-muted-foreground shadow-lg">
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-1">
        <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ChartCard({ title, children, className = "", badge, description }: {
  title: string; children: React.ReactNode; className?: string; badge?: string | React.ReactNode; description?: string;
}) {
  return (
    <div className={`bg-card border border-border rounded-xl p-4 lg:p-5 ${className}`}>
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-semibold text-foreground/80">{title}</h3>
        {badge && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap ml-2">{badge}</span>}
      </div>
      {description && <p className="text-xs text-muted-foreground/60 mb-3">{description}</p>}
      {!description && <div className="mb-3" />}
      {children}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

// ---- TOP PAGES CARD (with URL search) ----
function TopPagesCard({ topPages, isLoading, period, customStart, customEnd }: { topPages: { page: string; title: string; views: number; sessions: number; change?: number }[]; isLoading: boolean; period: string; customStart?: string; customEnd?: string }) {
  const [urlFilter, setUrlFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  // Debounce the search query to avoid too many GA4 requests
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(urlFilter.trim()), 500);
    return () => clearTimeout(timer);
  }, [urlFilter]);
  const isSearching = debouncedFilter.length >= 2;
  const { data: searchResults, isLoading: searchLoading } = trpc.analytics.searchPages.useQuery(
    { query: debouncedFilter, period: period as any, customStart, customEnd },
    { enabled: isSearching }
  );
  const displayPages = isSearching ? (searchResults || []) : topPages;
  const filtered = isSearching ? displayPages : (urlFilter.trim() ? topPages.filter(p => p.page.toLowerCase().includes(urlFilter.trim().toLowerCase())) : topPages);
  const maxViews = filtered[0]?.views || topPages[0]?.views || 1;
  return (
    <ChartCard title="Paginas Mais Visitadas" description="Top 50 paginas com mais visualizacoes. Use a busca para filtrar por palavra-chave na URL.">
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Buscar por URL (ex: gwm, chevrolet, usados...)"
              value={urlFilter}
              onChange={e => setUrlFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-muted/40 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
            {urlFilter && (
              <button onClick={() => setUrlFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors text-xs">
                ✕
              </button>
            )}
          </div>
          {urlFilter && (
            <p className="text-xs text-muted-foreground/60">
              {isSearching && searchLoading
                ? "Buscando no GA4..."
                : isSearching
                ? `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""} no GA4 para "${urlFilter}"`
                : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""} para "${urlFilter}"`}
            </p>
          )}
          <div className="space-y-2">
            {filtered.length === 0 && !(isSearching && searchLoading) ? (
              <p className="text-xs text-muted-foreground/60 text-center py-6">Nenhuma URL encontrada com "{urlFilter}"</p>
            ) : (
              filtered.map((p, i) => (
                <div key={`${p.page}-${i}`} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <a
                        href={`https://www.carrera.com.br${p.page}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 group min-w-0"
                      >
                        <span className="text-foreground/80 font-medium truncate group-hover:text-primary transition-colors">{p.page}</span>
                        <ArrowUpRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 transition-colors" />
                      </a>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                        <span className="text-muted-foreground/60">{p.sessions.toLocaleString("pt-BR")} sess.</span>
                        <span className="text-muted-foreground">{p.views.toLocaleString("pt-BR")} views</span>
                        {p.change !== undefined && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            p.change > 10 ? 'bg-emerald-500/20 text-emerald-400' :
                            p.change < -10 ? 'bg-red-500/20 text-red-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {p.change > 0 ? '+' : ''}{p.change}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(p.views / maxViews) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ---- DAY DIAGNOSIS PANEL ----
function DayDiagnosisPanel({ date, sessions, avgSessions, onClose }: { date: string; sessions: number; avgSessions: number; onClose: () => void }) {
  const { data, isLoading } = trpc.analytics.dayDiagnosis.useQuery({ date });
  const deviation = avgSessions > 0 ? ((sessions - avgSessions) / avgSessions * 100).toFixed(0) : "0";
  const isPeak = sessions > avgSessions * 1.1;
  const isDip = sessions < avgSessions * 0.9;
  const statusColor = isPeak ? "text-emerald-400" : isDip ? "text-red-400" : "text-muted-foreground";
  const statusLabel = isPeak ? "Pico de Trafego" : isDip ? "Baixa de Trafego" : "Dia Normal";
  const statusBg = isPeak ? "bg-emerald-400/10 border-emerald-400/30" : isDip ? "bg-red-400/10 border-red-400/30" : "bg-muted/40 border-border";

  const CHANNEL_COLORS: Record<string, string> = {
    "Organic Search": "#4ade80",
    "Direct": "#6366f1",
    "Paid Search": "#f472b6",
    "Organic Social": "#22d3ee",
    "Referral": "#fb923c",
    "Email": "#fbbf24",
    "Display": "#a78bfa",
    "Cross-network": "#2dd4bf",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-xs text-muted-foreground">Investigador de Picos</p>
            <h2 className="text-base font-bold text-foreground">{formatDateFull(date)}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${statusBg} ${statusColor}`}>
              {statusLabel} {isPeak || isDip ? `(${isPeak ? "+" : ""}${deviation}% da media)` : ""}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm">
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Sessoes no Dia</p>
              <p className="text-xl font-bold text-foreground">{sessions.toLocaleString("pt-BR")}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Media do Periodo</p>
              <p className="text-xl font-bold text-muted-foreground">{Math.round(avgSessions).toLocaleString("pt-BR")}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Variacao</p>
              <p className={`text-xl font-bold ${isPeak ? "text-emerald-400" : isDip ? "text-red-400" : "text-muted-foreground"}`}>
                {isPeak ? "+" : ""}{deviation}%
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="ml-3 text-sm text-muted-foreground">Analisando o dia...</span>
            </div>
          ) : data ? (
            <>
              {/* Hourly chart */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Distribuicao por Hora</h3>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-muted-foreground">Pico:</span>
                  <span className="text-xs font-bold text-foreground">{data.peakHour?.label} ({data.peakHour?.sessions.toLocaleString("pt-BR")} sessoes)</span>
                </div>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={data.hourly} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} interval={3} />
                    <YAxis hide />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Sessoes"]} />
                    <Bar dataKey="sessions" radius={[2, 2, 0, 0]}>
                      {data.hourly.map((h: any, i: number) => (
                        <Cell key={i} fill={h.sessions === data.peakHour?.sessions ? "#f59e0b" : "#6366f1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Traffic sources */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Origem do Trafego</h3>
                <div className="space-y-2">
                  {data.trafficSources.slice(0, 6).map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHANNEL_COLORS[s.channel] || CHART_COLORS[i % CHART_COLORS.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-foreground/80 truncate">{SOURCE_LABELS[s.channel] || s.channel}</span>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <span className="text-muted-foreground">{s.sessions.toLocaleString("pt-BR")}</span>
                            <span className="font-semibold text-foreground/70 w-8 text-right">{s.percentage}%</span>
                          </div>
                        </div>
                        <div className="h-1 bg-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, backgroundColor: CHANNEL_COLORS[s.channel] || CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top UTMs */}
              {data.topUtms.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Campanhas com UTM Ativas</h3>
                  <div className="space-y-2">
                    {data.topUtms.slice(0, 8).map((u: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{u.campaign === "(not set)" ? <span className="italic text-muted-foreground">sem campanha</span> : u.campaign}</p>
                          <p className="text-[10px] text-muted-foreground">{u.source} / {u.medium}</p>
                        </div>
                        <span className="text-xs font-bold text-primary flex-shrink-0">{u.sessions.toLocaleString("pt-BR")} sess.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.topUtms.length === 0 && (
                <div className="bg-emerald-400/5 border border-emerald-400/20 rounded-xl p-3">
                  <p className="text-xs text-emerald-400 font-medium">Sem campanhas pagas ativas neste dia</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Todo o trafego foi organico, direto ou sem rastreamento UTM.</p>
                </div>
              )}

              {/* Top URLs */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Paginas Mais Acessadas</h3>
                <div className="space-y-1.5">
                  {data.topUrls.slice(0, 10).map((u: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground/50 w-4 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs">
                          <a
                            href={`https://www.carrera.com.br${u.page}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/80 hover:text-primary transition-colors truncate max-w-[280px] font-mono text-[10px]"
                          >
                            {u.page}
                          </a>
                          <span className="font-bold text-foreground flex-shrink-0 ml-2">{u.sessions.toLocaleString("pt-BR")}</span>
                        </div>
                        <div className="h-0.5 bg-border rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-primary/50 rounded-full" style={{ width: `${(u.sessions / (data.topUrls[0]?.sessions || 1)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Devices */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dispositivos</h3>
                <div className="flex gap-3">
                  {data.devices.map((d: any, i: number) => (
                    <div key={i} className="flex-1 bg-muted/30 rounded-xl p-3 text-center">
                      <p className="text-lg mb-1">{d.device === "mobile" ? "📱" : d.device === "desktop" ? "💻" : "📟"}</p>
                      <p className="text-sm font-bold text-foreground">{d.percentage}%</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{d.device}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---- CUSTOM BAR WITH PEAK INDICATOR ----
function PeakBar(props: any) {
  const { x, y, width, height, isPeak, isDip } = props;
  if (!height || height <= 0) return null;
  const color = isPeak ? "#f59e0b" : isDip ? "#f87171" : "#6366f1";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={3} ry={3} fillOpacity={isPeak || isDip ? 1 : 0.85} />
      {isPeak && (
        <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#f59e0b">▲</text>
      )}
      {isDip && (
        <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#f87171">▼</text>
      )}
    </g>
  );
}

// ---- OVERVIEW TAB ----
function OverviewTab({ period, customStart, customEnd }: { period: Period; customStart?: string; customEnd?: string }) {
  const baseInput = { period, customStart, customEnd };
  const [selectedDay, setSelectedDay] = useState<{ date: string; sessions: number } | null>(null);

  // Filter state
  const [urlFilterInput, setUrlFilterInput] = useState("");
  const [urlFilter, setUrlFilter] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");

  // Debounce URL filter
  useEffect(() => {
    const t = setTimeout(() => setUrlFilter(urlFilterInput), 500);
    return () => clearTimeout(t);
  }, [urlFilterInput]);

  // Reset medium/campaign when source changes
  const handleSourceChange = (val: string) => { setUtmSource(val); setUtmMedium(""); setUtmCampaign(""); };
  const handleMediumChange = (val: string) => { setUtmMedium(val); setUtmCampaign(""); };

  const hasFilters = !!(urlFilter || utmSource || utmMedium || utmCampaign);
  const filterInput = { ...baseInput, urlFilter: urlFilter || undefined, utmSource: utmSource || undefined, utmMedium: utmMedium || undefined, utmCampaign: utmCampaign || undefined };

  // UTM dimension dropdowns (cascade)
  const { data: utmDims } = trpc.analytics.utmDimensions.useQuery({ ...baseInput, utmSource: utmSource || undefined, utmMedium: utmMedium || undefined });

  const input = hasFilters ? filterInput : baseInput;

  const { data: keyMetrics, isLoading: loadingMetrics } = hasFilters
    ? trpc.analytics.keyMetricsFiltered.useQuery(filterInput)
    : trpc.analytics.keyMetrics.useQuery(baseInput);
  const { data: comparison } = trpc.analytics.periodComparison.useQuery(baseInput);
  const { data: sessionsByDay, isLoading: loadingDays } = hasFilters
    ? trpc.analytics.sessionsByDayFiltered.useQuery(filterInput)
    : trpc.analytics.sessionsByDay.useQuery(baseInput);
  const { data: sessionsByHour, isLoading: loadingHours } = hasFilters
    ? trpc.analytics.sessionsByHourFiltered.useQuery(filterInput)
    : trpc.analytics.sessionsByHour.useQuery(baseInput);
  const { data: trafficSources } = hasFilters
    ? trpc.analytics.trafficSourcesFiltered.useQuery(filterInput)
    : trpc.analytics.trafficSources.useQuery(baseInput);
  const { data: deviceDist } = hasFilters
    ? trpc.analytics.deviceDistributionFiltered.useQuery(filterInput)
    : trpc.analytics.deviceDistribution.useQuery(baseInput);
  const { data: topPages, isLoading: loadingPages } = hasFilters
    ? trpc.analytics.topPagesFiltered.useQuery(filterInput)
    : trpc.analytics.topPages.useQuery(baseInput);
  const { data: utmData } = trpc.analytics.utmAnalysis.useQuery(baseInput);

  // Compute mean and std dev for peak detection
  const days = sessionsByDay || [];
  const avgSessions = days.length > 0 ? days.reduce((s: number, d: any) => s + d.sessions, 0) / days.length : 0;
  const stdDev = days.length > 1 ? Math.sqrt(days.reduce((s: number, d: any) => s + Math.pow(d.sessions - avgSessions, 2), 0) / days.length) : 0;
  const daysWithFlags = days.map((d: any) => ({
    ...d,
    isPeak: d.sessions > avgSessions + stdDev * 1.2,
    isDip: d.sessions < avgSessions - stdDev * 1.2 && avgSessions > 0,
  }));
  const peakCount = daysWithFlags.filter((d: any) => d.isPeak).length;
  const dipCount = daysWithFlags.filter((d: any) => d.isDip).length;

  const c = comparison?.changes;
  const vsLabel = PERIOD_VS_LABELS[period];

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
          {hasFilters && (
            <button
              onClick={() => { setUrlFilterInput(""); setUrlFilter(""); setUtmSource(""); setUtmMedium(""); setUtmCampaign(""); }}
              className="ml-auto text-xs text-primary hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* URL Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Filtrar por URL (ex: /gwm)"
              value={urlFilterInput}
              onChange={e => setUrlFilterInput(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* UTM Source */}
          <select
            value={utmSource}
            onChange={e => handleSourceChange(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todas as fontes (source)</option>
            {(utmDims?.sources || []).map((s: string) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {/* UTM Medium */}
          <select
            value={utmMedium}
            onChange={e => handleMediumChange(e.target.value)}
            disabled={!utmSource}
            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="">Todas as midias (medium)</option>
            {(utmDims?.mediums || []).map((m: string) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {/* UTM Campaign */}
          <select
            value={utmCampaign}
            onChange={e => setUtmCampaign(e.target.value)}
            disabled={!utmSource}
            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="">Todas as campanhas</option>
            {(utmDims?.campaigns || []).map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <div className="flex flex-wrap gap-2 pt-1">
            {urlFilter && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">URL: {urlFilter}</span>}
            {utmSource && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs">source: {utmSource}</span>}
            {utmMedium && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-xs">medium: {utmMedium}</span>}
            {utmCampaign && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs">campaign: {utmCampaign}</span>}
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <MetricCard
          icon={<TrendingUp className="w-4 h-4 text-primary" />}
          label="Total de Sessoes"
          value={loadingMetrics ? "..." : (keyMetrics?.sessions?.toLocaleString("pt-BR") ?? "0")}
          color="bg-primary/10"
          change={c?.sessions}
          sub={vsLabel}
          tooltip="Cada vez que alguem acessa o site e navega por ele. Uma mesma pessoa pode gerar varias sessoes."
        />
        <MetricCard
          icon={<Users className="w-4 h-4 text-cyan-400" />}
          label="Usuarios"
          value={loadingMetrics ? "..." : (keyMetrics?.totalUsers?.toLocaleString("pt-BR") ?? "0")}
          sub={`${keyMetrics?.newUsers?.toLocaleString("pt-BR") ?? 0} novos`}
          color="bg-cyan-400/10"
          change={c?.users}
          tooltip="Numero de pessoas distintas que visitaram o site. Novos sao os que visitaram pela primeira vez."
        />
        <MetricCard
          icon={<MousePointerClick className="w-4 h-4 text-emerald-400" />}
          label="Taxa de Rejeicao"
          value={loadingMetrics ? "..." : `${(keyMetrics?.bounceRate ?? 0).toFixed(1)}%`}
          color="bg-emerald-400/10"
          change={c?.bounceRate}
          inverseChange
          tooltip="Percentual de visitas em que o usuario entrou e saiu sem interagir. Quanto menor, melhor."
        />
        <MetricCard
          icon={<Clock className="w-4 h-4 text-violet-400" />}
          label="Duracao Media"
          value={loadingMetrics ? "..." : formatDuration(keyMetrics?.avgSessionDuration ?? 0)}
          sub={`${(keyMetrics?.screenPageViewsPerSession ?? 0).toFixed(1)} pag/sessao`}
          color="bg-violet-400/10"
          change={c?.avgSessionDuration}
          tooltip="Tempo medio que cada visitante passa no site por sessao. Mais tempo geralmente indica maior interesse."
        />
      </div>

      {/* Sessions by Day - with peak detection */}
      <ChartCard
        title={`Visitas por Dia - ${period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}`}
        badge={vsLabel}
        description="Clique em qualquer barra para investigar o dia. Barras amarelas = pico acima da media. Barras vermelhas = baixa abaixo da media."
      >
        {loadingDays ? <LoadingSpinner /> : (
          <>
            {(peakCount > 0 || dipCount > 0) && (
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {peakCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 flex-shrink-0" />
                    <span className="text-amber-400 font-medium">{peakCount} dia{peakCount > 1 ? "s" : ""} de pico</span>
                  </div>
                )}
                {dipCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-400 flex-shrink-0" />
                    <span className="text-red-400 font-medium">{dipCount} dia{dipCount > 1 ? "s" : ""} de baixa</span>
                  </div>
                )}
                <span className="text-xs text-muted-foreground/60">Clique para investigar</span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart
                data={daysWithFlags}
                margin={{ top: 14, right: 10, left: -10, bottom: 0 }}
                barCategoryGap="20%"
                onClick={(payload) => {
                  if (payload?.activePayload?.[0]?.payload) {
                    const d = payload.activePayload[0].payload;
                    setSelectedDay({ date: d.date, sessions: d.sessions });
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} interval={(daysWithFlags.length || 0) <= 10 ? 0 : (daysWithFlags.length || 0) <= 20 ? 1 : "preserveStartEnd"} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "sessions" ? "Sessoes" : n === "users" ? "Usuarios" : ""]}
                  labelFormatter={(label) => `${formatDate(label)} - clique para investigar`}
                />
                <ReferenceLine y={avgSessions} stroke="oklch(0.5 0.01 240)" strokeDasharray="4 4" strokeWidth={1} label={{ value: `Media: ${Math.round(avgSessions).toLocaleString("pt-BR")}`, position: "insideTopRight", fontSize: 9, fill: "oklch(0.55 0.01 240)" }} />
                <Bar dataKey="sessions" maxBarSize={40} shape={(props: any) => <PeakBar {...props} isPeak={props.isPeak} isDip={props.isDip} />} />
                <Bar dataKey="users" fill="#22d3ee" radius={[3, 3, 0, 0]} maxBarSize={40} fillOpacity={0.5} />
                <Line type="monotone" dataKey="sessions" stroke="#a5b4fc" strokeWidth={1.5} dot={false} strokeOpacity={0.4} legendType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </ChartCard>

      {/* Day Diagnosis Modal */}
      {selectedDay && (
        <DayDiagnosisPanel
          date={selectedDay.date}
          sessions={selectedDay.sessions}
          avgSessions={avgSessions}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Sessions by Hour */}
      <ChartCard
        title={period === "today" ? "Visitas por Hora - Hoje" : `Distribuicao por Hora - ${period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}`}
        description={period === "today"
          ? "Distribuicao das sessoes ao longo do dia de hoje (horario de Brasilia). Identifique os horarios de pico de acesso."
          : "Media de sessoes por hora do dia ao longo do periodo selecionado. Mostra quais horarios concentram mais trafego."}
      >
        {loadingHours ? <LoadingSpinner /> : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sessionsByHour || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), period === "today" ? "Sessoes" : "Media/dia"]} />
              <Bar dataKey="sessions" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Traffic Sources + Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Origem do Trafego" description="De onde vem os visitantes: busca organica, acesso direto, redes sociais, campanhas pagas, etc.">
          <div className="space-y-2">
            {(trafficSources || []).map((s: { source: string; sessions: number; percentage: number }, i: number) => (
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

        <ChartCard title="Dispositivos" description="Proporcao de acessos por tipo de dispositivo: celular, computador ou tablet.">
          <div className="space-y-3">
            {(deviceDist || []).map((d: { device: string; sessions: number; percentage: number }, i: number) => (
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
      {utmData && (utmData.byCampaign.length > 0 || utmData.bySource.length > 0) && (
        <ChartCard title="Resumo de Campanhas UTM" badge="Top campanhas" description="Principais campanhas de marketing ativas no periodo. Acesse a aba UTMs para analise completa.">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {utmData.byCampaign.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Campanhas</p>
                <div className="space-y-2">
                  {utmData.byCampaign.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-foreground/80 truncate max-w-[160px]">{c.campaign}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-muted-foreground">{c.sessions.toLocaleString("pt-BR")} sess.</span>
                        {c.conversions > 0 && <span className="text-emerald-400 font-semibold">{c.conversions} conv.</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {utmData.bySource.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Fontes</p>
                <div className="space-y-2">
                  {utmData.bySource.slice(0, 5).map((s, i) => (
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
      <TopPagesCard topPages={topPages || []} isLoading={loadingPages} period={period} customStart={customStart} customEnd={customEnd} />
    </div>
  );
}

// ---- COMPARISON PAGES CARD (with URL search) ----
function ComparisonPagesCard({ pages, isLoading }: { pages: { page: string; current: number; previous: number; change: number }[]; isLoading: boolean }) {
  const [urlFilter, setUrlFilter] = useState("");
  const filtered = urlFilter.trim()
    ? pages.filter(p => p.page.toLowerCase().includes(urlFilter.trim().toLowerCase()))
    : pages;
  return (
    <ChartCard title="Paginas: Crescimento e Queda" description="Top 50 paginas ordenadas por visualizacoes. Use a busca para filtrar por palavra-chave na URL.">
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Buscar por URL (ex: gwm, chevrolet, usados...)"
              value={urlFilter}
              onChange={e => setUrlFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-muted/40 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
            {urlFilter && (
              <button onClick={() => setUrlFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors text-xs">
                ✕
              </button>
            )}
          </div>
          {urlFilter && (
            <p className="text-xs text-muted-foreground/60">
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} para "{urlFilter}"
            </p>
          )}
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
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground/60">Nenhuma URL encontrada com "{urlFilter}"</td></tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                      <td className="py-2 text-foreground/80 max-w-[200px] truncate font-mono text-[10px]">{p.page}</td>
                      <td className="py-2 text-right font-bold text-foreground">{p.current.toLocaleString("pt-BR")}</td>
                      <td className="py-2 text-right text-muted-foreground">{p.previous.toLocaleString("pt-BR")}</td>
                      <td className="py-2 text-right"><ChangeIndicator value={p.change} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ---- COMPARISON TAB ----
function ComparisonTab({ period, customStart, customEnd }: { period: Period; customStart?: string; customEnd?: string }) {
  const input = { period, customStart, customEnd };
    const { data: comparison, isLoading } = trpc.analytics.periodComparison.useQuery(input);
  const { data: chartRaw, isLoading: loadingChart } = trpc.analytics.sessionsByDayComparison.useQuery(input);
  const { data: details, isLoading: loadingDetails } = trpc.analytics.comparisonDetails.useQuery(input);
  const { data: leadsComp, isLoading: loadingLeads } = trpc.analytics.leadsComparison.useQuery(input);
  const vsLabel = PERIOD_VS_LABELS[period];;

  if (isLoading) return <LoadingSpinner />;
  if (!comparison) return null;

  const { current, previous, changes } = comparison;

  const metrics = [
    { label: "Sessoes", cur: current.sessions, prev: previous.sessions, change: changes.sessions, fmt: (v: number) => v.toLocaleString("pt-BR") },
    { label: "Usuarios", cur: current.users, prev: previous.users, change: changes.users, fmt: (v: number) => v.toLocaleString("pt-BR") },
    { label: "Novos Usuarios", cur: current.newUsers, prev: previous.newUsers, change: changes.newUsers, fmt: (v: number) => v.toLocaleString("pt-BR") },
    { label: "Taxa de Rejeicao", cur: current.bounceRate, prev: previous.bounceRate, change: changes.bounceRate, fmt: (v: number) => `${v.toFixed(1)}%`, inverse: true },
    { label: "Duracao Media", cur: current.avgSessionDuration, prev: previous.avgSessionDuration, change: changes.avgSessionDuration, fmt: formatDuration },
    { label: "Pag/Sessao", cur: current.pageViewsPerSession, prev: previous.pageViewsPerSession, change: changes.pageViewsPerSession, fmt: (v: number) => v.toFixed(2) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-2.5">
        <BarChart2 className="w-4 h-4 text-primary" />
        <span>Comparando <strong className="text-foreground">{period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}</strong> {vsLabel}</span>
      </div>

      {/* Comparison table */}
      <ChartCard title="Metricas Comparativas" description="Comparacao detalhada de cada metrica entre o periodo atual e o anterior. Setas verdes indicam melhora, vermelhas indicam queda.">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-muted-foreground font-medium">Metrica</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Periodo Atual</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Periodo Anterior</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Variacao</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                  <td className="py-2.5 text-foreground/80 font-medium">{m.label}</td>
                  <td className="py-2.5 text-right font-bold text-foreground">{m.fmt(m.cur)}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{m.fmt(m.prev)}</td>
                  <td className="py-2.5 text-right"><ChangeIndicator value={m.change} inverse={m.inverse} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Comparison chart */}
      <ChartCard title="Sessoes: Periodo Atual vs. Anterior" description="Grafico comparativo dia a dia entre os dois periodos. Linha roxa = atual, linha cinza = anterior.">
        {loadingChart ? <LoadingSpinner /> : (() => {
          const raw = chartRaw as { current: { date: string; sessions: number }[]; previous: { date: string; sessions: number }[] } | undefined;
          const maxLen = Math.max(raw?.current?.length ?? 0, raw?.previous?.length ?? 0);
          const merged = Array.from({ length: maxLen }, (_, i) => ({
            index: i,
            current: raw?.current?.[i]?.sessions ?? 0,
            previous: raw?.previous?.[i]?.sessions ?? 0,
          }));
          return (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={merged} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="index" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `Dia ${v + 1}`} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "current" ? "Atual" : "Anterior"]} labelFormatter={(v) => `Dia ${(v as number) + 1}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "current" ? "Periodo Atual" : "Periodo Anterior"} />
              <Line type="monotone" dataKey="current" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="previous" stroke="#6b7280" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          );
        })()}
       </ChartCard>

      {/* Hourly comparison */}
      <ChartCard
        title={period === "today" ? "Visitas por Hora: Hoje vs. Ontem" : "Distribuicao por Hora: Atual vs. Anterior"}
        description="Comparativo da distribuicao horaria de sessoes entre os dois periodos. Identifique mudancas no horario de pico."
      >
        {loadingDetails ? <LoadingSpinner /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={details?.hourly || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR"), n === "current" ? "Atual" : "Anterior"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "current" ? "Periodo Atual" : "Periodo Anterior"} />
              <Line type="monotone" dataKey="current" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="previous" stroke="#6b7280" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Channels + Devices comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Origem do Trafego: Atual vs. Anterior" description="Variacao de sessoes por canal entre os dois periodos. Verde = crescimento, vermelho = queda.">
          {loadingDetails ? <LoadingSpinner /> : (
            <div className="space-y-2.5">
              {(details?.channels || []).map((ch, i) => {
                const maxVal = Math.max(...(details?.channels || []).map(c => Math.max(c.current, c.previous)), 1);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground/80 font-medium truncate max-w-[140px]">{SOURCE_LABELS[ch.source] || ch.source}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-muted-foreground">{ch.previous.toLocaleString("pt-BR")}</span>
                        <span className="font-bold text-foreground">{ch.current.toLocaleString("pt-BR")}</span>
                        <ChangeIndicator value={ch.change} />
                      </div>
                    </div>
                    <div className="relative h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="absolute h-full bg-muted-foreground/30 rounded-full" style={{ width: `${(ch.previous / maxVal) * 100}%` }} />
                      <div className="absolute h-full bg-primary rounded-full" style={{ width: `${(ch.current / maxVal) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Dispositivos: Atual vs. Anterior" description="Mudanca na distribuicao de sessoes por tipo de dispositivo entre os periodos.">
          {loadingDetails ? <LoadingSpinner /> : (
            <div className="space-y-3">
              {(details?.devices || []).map((dev, i) => {
                const DEVICE_LABELS: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };
                const maxVal = Math.max(...(details?.devices || []).map(d => Math.max(d.current, d.previous)), 1);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground/80 font-medium">{DEVICE_LABELS[dev.device] || dev.device}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{dev.previous.toLocaleString("pt-BR")}</span>
                        <span className="font-bold text-foreground">{dev.current.toLocaleString("pt-BR")}</span>
                        <ChangeIndicator value={dev.change} />
                      </div>
                    </div>
                    <div className="relative h-2 bg-border rounded-full overflow-hidden">
                      <div className="absolute h-full rounded-full" style={{ width: `${(dev.previous / maxVal) * 100}%`, backgroundColor: CHART_COLORS[i + 3] + "55" }} />
                      <div className="absolute h-full rounded-full" style={{ width: `${(dev.current / maxVal) * 100}%`, backgroundColor: CHART_COLORS[i + 3] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Leads & Sessions organic vs UTM comparison */}
      <ChartCard title="Comparativo: Organico vs. Com UTM" description={`Variacao de visitas e leads organicos (sem UTM) e com UTM ${vsLabel}.`}>
        {loadingLeads ? <LoadingSpinner /> : leadsComp ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Metrica</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Periodo Atual</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Periodo Anterior</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Variacao</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Visitas Totais", cur: leadsComp.current.totalSessions, prev: leadsComp.previous.totalSessions, change: leadsComp.changes.totalSessions, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Visitas Organicas (sem UTM)", cur: leadsComp.current.totalOrganicSessions, prev: leadsComp.previous.totalOrganicSessions, change: leadsComp.changes.totalOrganicSessions, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Visitas com UTM", cur: leadsComp.current.totalSessions - leadsComp.current.totalOrganicSessions, prev: leadsComp.previous.totalSessions - leadsComp.previous.totalOrganicSessions, change: leadsComp.changes.totalSessions - leadsComp.changes.totalOrganicSessions, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Contatos Totais", cur: leadsComp.current.totalContacts, prev: leadsComp.previous.totalContacts, change: leadsComp.changes.totalContacts, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Contatos Organicos (sem UTM)", cur: leadsComp.current.organicContacts, prev: leadsComp.previous.organicContacts, change: leadsComp.changes.organicContacts, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Contatos com UTM", cur: leadsComp.current.totalContacts - leadsComp.current.organicContacts, prev: leadsComp.previous.totalContacts - leadsComp.previous.organicContacts, change: leadsComp.changes.totalContacts - leadsComp.changes.organicContacts, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Leads Organicos (sem UTM)", cur: leadsComp.current.organicLeads, prev: leadsComp.previous.organicLeads, change: leadsComp.changes.organicLeads, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Leads com UTM", cur: leadsComp.current.totalLeads - leadsComp.current.organicLeads, prev: leadsComp.previous.totalLeads - leadsComp.previous.organicLeads, change: leadsComp.changes.totalLeads - leadsComp.changes.organicLeads, fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "% Organico / Total Visitas", cur: leadsComp.current.totalSessions > 0 ? Math.round((leadsComp.current.totalOrganicSessions / leadsComp.current.totalSessions) * 100) : 0, prev: leadsComp.previous.totalSessions > 0 ? Math.round((leadsComp.previous.totalOrganicSessions / leadsComp.previous.totalSessions) * 100) : 0, change: (leadsComp.current.totalSessions > 0 ? (leadsComp.current.totalOrganicSessions / leadsComp.current.totalSessions) * 100 : 0) - (leadsComp.previous.totalSessions > 0 ? (leadsComp.previous.totalOrganicSessions / leadsComp.previous.totalSessions) * 100 : 0), fmt: (v: number) => `${v.toFixed(1)}%`, isAbsolute: true },
                ].map((m, i) => (
                  <tr key={i} className={`border-b border-border/50 hover:bg-accent/20 transition-colors ${i === 2 || i === 5 || i === 7 ? "opacity-60" : ""}`}>
                    <td className="py-2.5 text-foreground/80 font-medium">{m.label}</td>
                    <td className="py-2.5 text-right font-bold text-foreground">{m.fmt(m.cur)}</td>
                    <td className="py-2.5 text-right text-muted-foreground">{m.fmt(m.prev)}</td>
                    <td className="py-2.5 text-right"><ChangeIndicator value={m.change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ChartCard>

      {/* Top pages with growth/decline */}
      <ComparisonPagesCard pages={details?.pages || []} isLoading={loadingDetails} />
    </div>
  );
}
// ---- SECTIONS TAB ----
const SECTION_ICONS: Record<string, React.ReactNode> = {
  "Chevrolet": <Car className="w-4 h-4" />,
  "Nissan": <Car className="w-4 h-4" />,
  "GWM/Haval": <Car className="w-4 h-4" />,
  "Zeekr": <Car className="w-4 h-4" />,
  "Omoda/Jaecoo": <Car className="w-4 h-4" />,
  "VW": <Car className="w-4 h-4" />,
  "GAC": <Car className="w-4 h-4" />,
  "Usados": <Car className="w-4 h-4" />,
  "Servicos": <Globe className="w-4 h-4" />,
  "Outros": <Globe className="w-4 h-4" />,
};

function SectionsTab({ period, customStart, customEnd }: { period: Period; customStart?: string; customEnd?: string }) {
  const { data, isLoading } = trpc.analytics.sectionAnalysis.useQuery({ period, customStart, customEnd });

  const sections = (data && !Array.isArray(data) && data.sections ? data.sections : (Array.isArray(data) ? data : [])) as { label: string; sessions: number; pageViews: number; percentage: number; color: string }[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-2.5">
        <Car className="w-4 h-4 text-primary" />
        <span>Distribuicao de trafego por marca e secao - <strong className="text-foreground">{period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}</strong></span>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <>
          <ChartCard title="Sessoes por Marca / Secao">
            <ResponsiveContainer width="100%" height={Math.max(200, sections.length * 36)}>
              <BarChart data={sections} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.75 0.01 240)" }} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Sessoes"]} />
                <Bar dataKey="sessions" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: "oklch(0.6 0.01 240)", formatter: (v: number) => v.toLocaleString("pt-BR") }}>
                  {sections.map((s: { color: string }, i: number) => <Cell key={i} fill={s.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sections.map((s: { label: string; sessions: number; pageViews: number; percentage: number; color: string }, i: number) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${s.color}20` }}>
                  <span style={{ color: s.color }}>{SECTION_ICONS[s.label] || <Globe className="w-4 h-4" />}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.sessions.toLocaleString("pt-BR")} sessoes</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold" style={{ color: s.color }}>{s.percentage}%</p>
                  <p className="text-xs text-muted-foreground">{s.pageViews.toLocaleString("pt-BR")} views</p>
                </div>
              </div>
            ))}
          </div>

          <ChartCard title="Distribuicao Visual">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={sections} dataKey="sessions" nameKey="label" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2}>
                  {sections.map((_: unknown, i: number) => <Cell key={i} fill={sections[i].color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR") + " sessoes", n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  );
}

// ---- HISTORY TAB ----
function HistoryTab({ period, customStart, customEnd }: { period: Period; customStart?: string; customEnd?: string }) {
  const { data, isLoading } = trpc.analytics.dayHistory.useQuery({ period, customStart, customEnd });

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
        <span>Historico - <strong className="text-foreground">{period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}</strong> - media diaria: <strong className="text-foreground">{avg.toLocaleString("pt-BR")}</strong> sessoes</span>
      </div>

      <ChartCard title={`Sessoes por Dia - ${period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}`} badge="Verde = acima da media | Vermelho = abaixo">
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
        <ChartCard title="10 Melhores Dias" badge={`${period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}`}>
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

        <ChartCard title="10 Piores Dias" badge={`${period === "custom" ? "Periodo personalizado" : PERIOD_LABELS[period as Exclude<Period, "custom">]}`}>
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

// ---- LEADS TAB ----
function LeadsTab({ period, customStart, customEnd }: { period: Period; customStart?: string; customEnd?: string }) {
  const { data, isLoading } = trpc.analytics.leadsAnalysis.useQuery({ period, customStart, customEnd });
  const [chartView, setChartView] = useState<"contacts" | "leads">("contacts");

  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const { totalContacts, totalLeads, byBrand, topProducts, byDay,
    organicLeads, paidLeads, organicContacts, paidContacts,
    totalSessions, totalOrganicSessions, paidSessions } = data as any;
  const conversionRate = totalContacts > 0 ? ((totalLeads / totalContacts) * 100).toFixed(1) : "0.0";
  const organicConvRate = organicContacts > 0 ? ((organicLeads / organicContacts) * 100).toFixed(1) : "0.0";
  const organicShare = totalContacts > 0 ? Math.round((organicContacts / totalContacts) * 100) : 0;
  const organicSessionShare = (totalSessions || 0) > 0 ? Math.round(((totalOrganicSessions || 0) / (totalSessions || 1)) * 100) : 0;
  const LEAD_COLORS = ["#6366f1", "#4ade80", "#f59e0b", "#f87171", "#22d3ee", "#a78bfa", "#fb923c", "#34d399", "#e879f9", "#94a3b8"];

  // Prepare chart data: conversion rate per day
  const chartData = byDay.map((d: any) => ({
    date: d.date,
    totalContacts: d.contacts,
    totalLeads: d.leads,
    organicContacts: d.organicContacts,
    organicLeads: d.organicLeads,
    paidContacts: d.contacts - d.organicContacts,
    paidLeads: d.leads - d.organicLeads,
    sessions: d.sessions,
    organicSessions: d.organicSessions || 0,
    paidSessions: (d.sessions || 0) - (d.organicSessions || 0),
    convRate: d.sessions > 0 ? parseFloat(((d.contacts / d.sessions) * 100).toFixed(2)) : 0,
    organicConvRate: d.sessions > 0 ? parseFloat(((d.organicContacts / d.sessions) * 100).toFixed(2)) : 0,
  }));

  const formatDate = (d: string) => {
    if (!d) return "";
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  const exportCSV = () => {
    const header = ["Data", "Visitas Totais", "Visitas Organicas", "Visitas com UTM", "Contatos Totais", "Contatos Organicos", "Contatos com UTM", "Leads Totais", "Leads Organicos", "Leads com UTM", "Taxa Conv. Total (%)", "Taxa Conv. Organica (%)"];
    const rows = chartData.map((d: typeof chartData[0]) => [
      d.date,
      d.sessions,
      d.organicSessions,
      d.paidSessions,
      d.totalContacts,
      d.organicContacts,
      d.paidContacts,
      d.totalLeads,
      d.organicLeads,
      d.paidLeads,
      d.convRate.toFixed(2),
      d.organicConvRate.toFixed(2),
    ]);
    const csv = [header, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-organico-utm-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-3 flex-1">
          <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <span>
            Contatos e leads gerados pelo site no periodo selecionado. <strong className="text-foreground">Lead organico</strong> e aquele gerado em sessoes sem nenhum parametro UTM (campanha, midia e source todos como "not set"). <strong className="text-foreground">Lead pago</strong> vem de sessoes com UTM preenchido.
          </span>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent/80 text-foreground text-xs font-medium transition-colors flex-shrink-0 border border-border"
          title="Exportar dados diarios em CSV"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Exportar CSV
        </button>
      </div>

      {/* Summary cards - sessions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Users className="w-4 h-4 text-violet-400" />}
          label="Total de Visitas"
          value={(totalSessions || 0).toLocaleString("pt-BR")}
          color="bg-violet-400/10"
          tooltip="Total de sessoes no periodo selecionado, independente da origem."
        />
        <MetricCard
          icon={<Globe className="w-4 h-4 text-sky-400" />}
          label="Visitas Organicas"
          value={(totalOrganicSessions || 0).toLocaleString("pt-BR")}
          sub={`${organicSessionShare}% do total`}
          color="bg-sky-400/10"
          tooltip="Sessoes sem nenhum parametro UTM (campanha, midia e source todos como 'not set'). Representa o trafego organico puro."
        />
        <MetricCard
          icon={<MousePointerClick className="w-4 h-4 text-indigo-400" />}
          label="Visitas com UTM"
          value={(paidSessions || 0).toLocaleString("pt-BR")}
          sub={`${(totalSessions || 0) > 0 ? Math.round(((paidSessions || 0) / (totalSessions || 1)) * 100) : 0}% do total`}
          color="bg-indigo-400/10"
          tooltip="Sessoes originadas de campanhas com UTM preenchido (trafego pago, e-mail, social rastreado, etc.)."
        />
        <MetricCard
          icon={<Target className="w-4 h-4 text-emerald-400" />}
          label="Conv. Organica"
          value={`${(totalOrganicSessions || 0) > 0 ? ((organicContacts / (totalOrganicSessions || 1)) * 100).toFixed(1) : "0.0"}%`}
          sub="contatos / visitas org."
          color="bg-emerald-400/10"
          tooltip="Percentual de visitas organicas que geraram ao menos um contato. Indica a qualidade do trafego sem midia paga."
        />
      </div>

      {/* Sessions organic vs paid bar */}
      <ChartCard title="Visitas: Organico (sem UTM) vs. Com UTM" description="Proporcao das visitas do periodo por origem. Organico = sem nenhum parametro UTM. Com UTM = trafego rastreado (pago, e-mail, social, etc.).">
        <div className="space-y-3">
          {[
            { label: "Organico (sem UTM)", value: totalOrganicSessions || 0, total: totalSessions || 1, color: "#38bdf8" },
            { label: "Com UTM (rastreado)", value: paidSessions || 0, total: totalSessions || 1, color: "#6366f1" },
          ].map((item, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-foreground/80 font-medium">{item.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-foreground">{item.value.toLocaleString("pt-BR")}</span>
                  <span className="text-muted-foreground w-10 text-right">{item.total > 0 ? Math.round((item.value / item.total) * 100) : 0}%</span>
                </div>
              </div>
              <div className="h-3 bg-border rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%`, backgroundColor: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Summary cards - leads/contacts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<PhoneCall className="w-4 h-4 text-primary" />}
          label="Total de Contatos"
          value={totalContacts.toLocaleString("pt-BR")}
          color="bg-primary/10"
          tooltip="Soma de todas as interacoes de contato: WhatsApp, formularios, cliques em telefone e outros eventos de engajamento."
        />
        <MetricCard
          icon={<Target className="w-4 h-4 text-emerald-400" />}
          label="Leads Qualificados"
          value={totalLeads.toLocaleString("pt-BR")}
          color="bg-emerald-400/10"
          tooltip="Conversoes mais qualificadas: formularios enviados, solicitacoes de proposta ou orcamento."
        />
        <MetricCard
          icon={<Search className="w-4 h-4 text-sky-400" />}
          label="Contatos Organicos"
          value={organicContacts.toLocaleString("pt-BR")}
          sub={`${organicShare}% do total`}
          color="bg-sky-400/10"
          tooltip="Contatos gerados em sessoes sem nenhum parametro UTM preenchido (campanha, midia e source todos como 'not set')."
        />
        <MetricCard
          icon={<Zap className="w-4 h-4 text-amber-400" />}
          label="Leads Organicos"
          value={organicLeads.toLocaleString("pt-BR")}
          sub={`conv. org. ${organicConvRate}%`}
          color="bg-amber-400/10"
          tooltip="Leads gerados em sessoes organicas (sem UTM). A taxa de conversao organica e leads organicos / contatos organicos."
        />
      </div>

      {/* Organic vs Paid breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Organico vs. Pago - Contatos" description="Proporcao de contatos gerados por trafego organico (sem UTM) versus trafego pago/rastreado (com UTM).">
          <div className="space-y-3">
            {[
              { label: "Organico (sem UTM)", value: organicContacts, total: totalContacts, color: "#38bdf8" },
              { label: "Pago / Rastreado (com UTM)", value: paidContacts, total: totalContacts, color: "#6366f1" },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-foreground/80 font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{item.value.toLocaleString("pt-BR")}</span>
                    <span className="text-muted-foreground">{item.total > 0 ? Math.round((item.value / item.total) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%`, backgroundColor: item.color }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-border">
              {[
                { label: "Organico (sem UTM)", value: organicLeads, total: totalLeads, color: "#4ade80" },
                { label: "Pago / Rastreado (com UTM)", value: paidLeads, total: totalLeads, color: "#f59e0b" },
              ].map((item, i) => (
                <div key={i} className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-foreground/80">{item.label} <span className="text-muted-foreground">(leads)</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{item.value.toLocaleString("pt-BR")}</span>
                      <span className="text-muted-foreground">{item.total > 0 ? Math.round((item.value / item.total) * 100) : 0}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Distribuicao de Leads por Marca" description="Proporcao de leads qualificados gerados por cada marca.">
          {byBrand.filter((b: { leads: number }) => b.leads > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={byBrand.filter((b: { leads: number }) => b.leads > 0).slice(0, 8)}
                  dataKey="leads"
                  nameKey="label"
                  cx="50%" cy="50%"
                  outerRadius={90} innerRadius={45}
                  paddingAngle={2}
                >
                  {byBrand.filter((b: { leads: number }) => b.leads > 0).slice(0, 8).map((_: unknown, i: number) => (
                    <Cell key={i} fill={LEAD_COLORS[i % LEAD_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("pt-BR") + " leads", n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Sem dados de leads para o periodo selecionado
            </div>
          )}
        </ChartCard>
      </div>

      {/* Evolutionary chart: organic vs paid vs sessions */}
      {chartData.length > 1 && (
        <ChartCard
          title="Evolucao Diaria: Organico vs. Pago vs. Visitantes"
          description="Acompanhe a evolucao diaria de contatos organicos e pagos em relacao ao volume de sessoes. O eixo direito mostra as sessoes."
          badge={
            <div className="flex items-center gap-1">
              {(["contacts", "leads"] as const).map(v => (
                <button key={v} onClick={() => setChartView(v)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    chartView === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}>
                  {v === "contacts" ? "Contatos" : "Leads"}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 40, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                interval={chartData.length <= 10 ? 0 : chartData.length <= 20 ? 1 : "preserveStartEnd"} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={formatDate}
                formatter={(v: number, name: string) => [
                  v.toLocaleString("pt-BR"),
                  name === "organicVal" ? "Organico" :
                  name === "paidVal" ? "Pago/Rastreado" :
                  name === "sessions" ? "Sessoes" : name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }}
                formatter={(v) => v === "organicVal" ? "Organico (sem UTM)" : v === "paidVal" ? "Pago/Rastreado" : "Sessoes"} />
              <Bar yAxisId="left" dataKey={chartView === "contacts" ? "organicContacts" : "organicLeads"} name="organicVal" fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={32} stackId="a" />
              <Bar yAxisId="left" dataKey={chartView === "contacts" ? "paidContacts" : "paidLeads"} name="paidVal" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={32} stackId="a" />
              <Line yAxisId="right" type="monotone" dataKey="sessions" name="sessions" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeOpacity={0.8} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Sessions organic vs UTM daily chart */}
      {chartData.length > 1 && (
        <ChartCard
          title="Evolucao Diaria de Visitas: Organico vs. Com UTM"
          description="Volume diario de sessoes organicas (sem UTM) versus sessoes com UTM. Permite ver como o trafego rastreado e o organico evoluem juntos."
        >
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                interval={chartData.length <= 10 ? 0 : chartData.length <= 20 ? 1 : "preserveStartEnd"} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={formatDate}
                formatter={(v: number, name: string) => [
                  v.toLocaleString("pt-BR") + " sess.",
                  name === "organicSessions" ? "Organico (sem UTM)" : "Com UTM",
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }}
                formatter={(v) => v === "organicSessions" ? "Organico (sem UTM)" : "Com UTM"} />
              <Bar dataKey="organicSessions" name="organicSessions" fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={32} stackId="s" />
              <Bar dataKey="paidSessions" name="paidSessions" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={32} stackId="s" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Crossed chart: organic sessions + organic leads/contacts */}
      {chartData.length > 1 && (
        <ChartCard
          title="Visitas Organicas x Leads Organicos (Correlacao Diaria)"
          description="Barras = visitas organicas (sem UTM). Linha verde = leads organicos. Linha azul = contatos organicos. Permite ver se o volume de trafego organico se converte em leads."
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 50, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                interval={chartData.length <= 10 ? 0 : chartData.length <= 20 ? 1 : "preserveStartEnd"} />
              <YAxis yAxisId="sessions" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={formatDate}
                formatter={(v: number, name: string) => [
                  v.toLocaleString("pt-BR"),
                  name === "organicSessions" ? "Visitas Organicas" :
                  name === "organicLeads" ? "Leads Organicos" : "Contatos Organicos",
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }}
                formatter={(v) =>
                  v === "organicSessions" ? "Visitas Org. (eixo esq.)" :
                  v === "organicLeads" ? "Leads Org. (eixo dir.)" : "Contatos Org. (eixo dir.)"} />
              <Bar yAxisId="sessions" dataKey="organicSessions" name="organicSessions" fill="#38bdf840" stroke="#38bdf8" strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={36} />
              <Line yAxisId="leads" type="monotone" dataKey="organicContacts" name="organicContacts" stroke="#38bdf8" strokeWidth={2} dot={false} />
              <Line yAxisId="leads" type="monotone" dataKey="organicLeads" name="organicLeads" stroke="#4ade80" strokeWidth={2} dot={false} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Conversion rate evolution */}
      {chartData.length > 1 && (
        <ChartCard
          title="Taxa de Conversao Diaria (Contatos / Sessoes)"
          description="Percentual de sessoes que geraram ao menos um contato. Linha azul = total, linha verde = somente organico."
        >
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                interval={chartData.length <= 10 ? 0 : chartData.length <= 20 ? 1 : "preserveStartEnd"} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate}
                formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === "convRate" ? "Total" : "Organico"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "convRate" ? "Taxa Total" : "Taxa Organica"} />
              <Area type="monotone" dataKey="convRate" fill="#6366f130" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="organicConvRate" stroke="#4ade80" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Contacts by brand */}
      <ChartCard
        title="Contatos por Marca / Secao"
        description="Distribuicao dos contatos gerados por cada marca ou secao do site."
      >
        <div className="space-y-3">
          {byBrand.slice(0, 10).map((b: { label: string; contacts: number; leads: number }, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: LEAD_COLORS[i % LEAD_COLORS.length] }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground/80 font-medium truncate">{b.label}</span>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-muted-foreground">{b.contacts.toLocaleString("pt-BR")} cont.</span>
                    {b.leads > 0 && <span className="text-emerald-400 font-semibold">{b.leads.toLocaleString("pt-BR")} leads</span>}
                  </div>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(b.contacts / (byBrand[0]?.contacts || 1)) * 100}%`,
                      backgroundColor: LEAD_COLORS[i % LEAD_COLORS.length],
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Top pages */}
      <ChartCard
        title="Paginas com Mais Contatos"
        description="As paginas do site que geraram mais contatos e leads."
      >
        <div className="space-y-2">
          {topProducts.slice(0, 8).map((p: { page: string; contacts: number; leads: number }, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                {i < 3 ? <MessageCircle className="w-3 h-3 text-primary" /> : <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs">
                  <a
                    href={`https://www.carrera.com.br${p.page}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 group"
                  >
                    <span className="text-foreground/80 font-medium truncate max-w-[140px] group-hover:text-primary transition-colors">{p.page}</span>
                    <ArrowUpRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 transition-colors" />
                  </a>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className="text-muted-foreground">{p.contacts.toLocaleString("pt-BR")} cont.</span>
                    {p.leads > 0 && <span className="font-bold text-emerald-400">{p.leads.toLocaleString("pt-BR")} leads</span>}
                  </div>
                </div>
                <div className="h-1 bg-border rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${((p.contacts + p.leads) / ((topProducts[0]?.contacts + topProducts[0]?.leads) || 1)) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

// ---- UTMs TAB ----
function UTMsTab({ period, customStart, customEnd }: { period: Period; customStart?: string; customEnd?: string }) {
  const [utmView, setUtmView] = useState<"overview" | "campaign" | "source" | "medium" | "combinations">("overview");
  const { data, isLoading } = trpc.analytics.utmAnalysis.useQuery({ period, customStart, customEnd });

  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const { byCampaign, bySource, byMedium, topCombinations } = data;

  const hasCampaigns = byCampaign.length > 0;
  const hasSources = bySource.length > 0;
  const hasMediums = byMedium.length > 0;

  const totalSessions = bySource.reduce((s: number, r: { sessions: number }) => s + r.sessions, 0);

  const UTM_COLORS = ["#6366f1", "#22d3ee", "#4ade80", "#f472b6", "#fb923c", "#a78bfa", "#34d399", "#f87171", "#60a5fa", "#fbbf24"];

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
        <span>
          Analise de campanhas de marketing rastreadas por <strong className="text-foreground">parametros UTM</strong>. Mostra quais campanhas, fontes e midias trazem mais trafego e conversoes para o site.
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Campanhas Ativas</p>
          <p className="text-2xl font-bold text-foreground">{byCampaign.length}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">utm_campaign distintas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Fontes (Sources)</p>
          <p className="text-2xl font-bold text-foreground">{bySource.length}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">utm_source distintas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Midias (Mediums)</p>
          <p className="text-2xl font-bold text-foreground">{byMedium.length}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">utm_medium distintas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Conversoes</p>
          <p className="text-2xl font-bold text-emerald-400">
            {byCampaign.reduce((s: number, c: { conversions: number }) => s + c.conversions, 0).toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">via campanhas UTM</p>
        </div>
      </div>

      {/* View selector */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {[
          { id: "overview" as const, label: "Visao Geral" },
          { id: "campaign" as const, label: "Campanhas" },
          { id: "source" as const, label: "Fontes" },
          { id: "medium" as const, label: "Midias" },
          { id: "combinations" as const, label: "Combinacoes" },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => setUtmView(v.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
              utmView === v.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Overview: Campaigns + Sources side by side */}
      {utmView === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Top Campanhas (utm_campaign)" description="Principais campanhas por sessoes no periodo.">
            {!hasCampaigns ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Link2 className="w-8 h-8 opacity-30" />
                <p className="text-sm">Nenhuma campanha UTM encontrada.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {byCampaign.slice(0, 10).map((c: { campaign: string; sessions: number; users: number; conversions: number }, i: number) => {
                  const maxSess = byCampaign[0]?.sessions || 1;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-foreground/80 font-medium truncate max-w-[160px]">{c.campaign}</span>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="font-bold text-foreground">{c.sessions.toLocaleString("pt-BR")}</span>
                          {c.conversions > 0 && <span className="text-emerald-400 text-[10px]">{c.conversions} conv.</span>}
                        </div>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(c.sessions / maxSess) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setUtmView("campaign")} className="text-xs text-primary hover:underline mt-1">Ver todas as campanhas →</button>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Top Fontes (utm_source)" description="Principais fontes de trafego rastreadas por UTM no periodo.">
            {!hasSources ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Search className="w-8 h-8 opacity-30" />
                <p className="text-sm">Nenhuma fonte UTM encontrada.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {bySource.slice(0, 10).map((s: { source: string; sessions: number; users: number }, i: number) => {
                  const maxSess = bySource[0]?.sessions || 1;
                  const pct = totalSessions > 0 ? Math.round((s.sessions / totalSessions) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ color: UTM_COLORS[i % UTM_COLORS.length] }}>
                            {sourceIcons[s.source.toLowerCase()] || <Globe className="w-3.5 h-3.5" />}
                          </span>
                          <span className="text-foreground/80 font-medium truncate">{s.source}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="font-bold text-foreground">{s.sessions.toLocaleString("pt-BR")}</span>
                          <span className="text-muted-foreground text-[10px]">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.sessions / maxSess) * 100}%`, backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
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

      {/* Campaign view */}
      {utmView === "campaign" && (
        <ChartCard
          title="Sessoes por Campanha (utm_campaign)"
          description="Cada campanha de marketing rastreada com utm_campaign. Mostra sessoes, usuarios e conversoes geradas por cada campanha."
        >
          {!hasCampaigns ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Link2 className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma campanha UTM encontrada no periodo selecionado.</p>
              <p className="text-xs opacity-60">Verifique se as URLs das campanhas incluem o parametro utm_campaign.</p>
            </div>
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
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                            {c.campaign}
                          </div>
                        </td>
                        <td className="py-2 text-right font-bold text-foreground">{c.sessions.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right text-muted-foreground">{c.users.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right">
                          {c.conversions > 0 ? (
                            <span className="text-emerald-400 font-semibold">{c.conversions.toLocaleString("pt-BR")}</span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </ChartCard>
      )}

      {/* Source view */}
      {utmView === "source" && (
        <ChartCard
          title="Sessoes por Fonte (utm_source)"
          description="De qual plataforma ou site vieram os usuarios rastreados. Ex: google, facebook, instagram, email."
        >
          {!hasSources ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Search className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma fonte UTM encontrada no periodo selecionado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bySource.map((s: { source: string; sessions: number; users: number }, i: number) => {
                const pct = totalSessions > 0 ? Math.round((s.sessions / totalSessions) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${UTM_COLORS[i % UTM_COLORS.length]}20` }}>
                      <span style={{ color: UTM_COLORS[i % UTM_COLORS.length] }}>
                        {sourceIcons[s.source.toLowerCase()] || <Globe className="w-3.5 h-3.5" />}
                      </span>
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

      {/* Medium view */}
      {utmView === "medium" && (
        <ChartCard
          title="Sessoes por Midia (utm_medium)"
          description="Qual tipo de midia trouxe os usuarios. Ex: cpc (anuncio pago), organic, email, social, referral."
        >
          {!hasMediums ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Share2 className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma midia UTM encontrada no periodo selecionado.</p>
            </div>
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
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                      <span className="text-foreground/80 font-medium">{m.medium}</span>
                    </div>
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

      {/* Combinations view */}
      {utmView === "combinations" && (
        <ChartCard
          title="Combinacoes Source / Medium / Campaign"
          description="Visao completa das combinacoes de parametros UTM. Mostra exatamente de onde vieram os usuarios rastreados."
        >
          {topCombinations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Link2 className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma combinacao UTM encontrada no periodo selecionado.</p>
            </div>
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
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: UTM_COLORS[i % UTM_COLORS.length] }} />
                          <span className="text-foreground/80 font-medium">{c.source}</span>
                        </div>
                      </td>
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

      {/* Footer */}
      <div className="border-t border-border/40 pt-4 mt-2">
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          <strong className="text-muted-foreground">Logica desta aba:</strong> UTM Source = parametro utm_source da URL. UTM Medium = utm_medium. UTM Campaign = utm_campaign. Sessoes sem UTM incluem trafego direto, busca organica e acessos sem rastreamento. Sessoes com UTM representam trafego de campanhas rastreadas (pago, e-mail, social rastreado, etc.).
        </p>
      </div>
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
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Data final</label>
          <input
            type="date"
            value={end}
            min={start}
            max={today}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onApply(start, end)}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- TV CAMPAIGNS ----
const BRAND_COLORS: Record<string, string> = {
  VW: "#6366f1",
  Chevrolet: "#f59e0b",
  GWM: "#10b981",
};

// GWM Maio 2026 static insertion schedule
const GWM_MAI_INSERTIONS = [
  // Bom Dia Praca 15" - dias 21 e 22
  { date: "2026-05-21", program: "Bom Dia Praca", hour: 8, duration: "15s", brand: "GWM" },
  { date: "2026-05-22", program: "Bom Dia Praca", hour: 8, duration: "15s", brand: "GWM" },
  // Auto Esporte 15" - dias 24 e 31
  { date: "2026-05-24", program: "Auto Esporte", hour: 8, duration: "15s", brand: "GWM" },
  { date: "2026-05-31", program: "Auto Esporte", hour: 8, duration: "15s", brand: "GWM" },
  // Praca 1a Edicao 15" - dias 22 e 23
  { date: "2026-05-22", program: "Praca 1a Edicao", hour: 14, duration: "15s", brand: "GWM" },
  { date: "2026-05-23", program: "Praca 1a Edicao", hour: 14, duration: "15s", brand: "GWM" },
  // Globo Esporte 30" - dias 22 e 23
  { date: "2026-05-22", program: "Globo Esporte", hour: 13, duration: "30s", brand: "GWM" },
  { date: "2026-05-23", program: "Globo Esporte", hour: 13, duration: "30s", brand: "GWM" },
  // Jornal Nacional 30" - dia 22
  { date: "2026-05-22", program: "Jornal Nacional", hour: 20, duration: "30s", brand: "GWM" },
  // Estudio I 13h 30" - 21,22,23,26,27,28,29,30,31 (2x cada)
  ...([21,22,23,26,27,28,29,30,31].flatMap(d => [
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Estudio I", hour: 13, duration: "30s", brand: "GWM" },
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Estudio I", hour: 13, duration: "30s", brand: "GWM" },
  ])),
  // Globonews em Pauta 20h 30" - 21,22,23,26,27,28,29,30,31 (2x cada)
  ...([21,22,23,26,27,28,29,30,31].flatMap(d => [
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Globonews em Pauta", hour: 20, duration: "30s", brand: "GWM" },
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Globonews em Pauta", hour: 20, duration: "30s", brand: "GWM" },
  ])),
  // Jornal das Dez 22h 30" - 21,22,23,26,27,28,29,30,31 (2x cada)
  ...([21,22,23,26,27,28,29,30,31].flatMap(d => [
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Jornal das Dez", hour: 22, duration: "30s", brand: "GWM" },
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Jornal das Dez", hour: 22, duration: "30s", brand: "GWM" },
  ])),
  // Faixa Horaria 06h-12h 30" - 21,22,23,26,27,28,29,30,31 (4x cada)
  ...([21,22,23,26,27,28,29,30,31].flatMap(d => Array(4).fill(null).map(() =>
    ({ date: `2026-05-${String(d).padStart(2,"0")}`, program: "Faixa 06h-12h", hour: 9, duration: "30s", brand: "GWM" })
  ))),
  // Faixa Horaria 12h-18h 30" - 21,22,23,26,27,28,29,30,31 (4x cada)
  ...([21,22,23,26,27,28,29,30,31].flatMap(d => Array(4).fill(null).map(() =>
    ({ date: `2026-05-${String(d).padStart(2,"0")}`, program: "Faixa 12h-18h", hour: 15, duration: "30s", brand: "GWM" })
  ))),
  // Faixa Horaria 18h-01h 30" - 21,22,23,26,27,28,29,30,31 (4x cada)
  ...([21,22,23,26,27,28,29,30,31].flatMap(d => Array(4).fill(null).map(() =>
    ({ date: `2026-05-${String(d).padStart(2,"0")}`, program: "Faixa 18h-01h", hour: 19, duration: "30s", brand: "GWM" })
  ))),
];

// Todos os dias da campanha GWM conforme mapa de mídia (21-31/05/2026)
const GWM_MAI_DAYS = [21,22,23,24,25,26,27,28,29,30,31].map(d => `2026-05-${String(d).padStart(2,"0")}`);

function GWMCampaignDetail() {
  const { data, isLoading } = trpc.analytics.gwmCampaign.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const [selectedDay, setSelectedDay] = useState(0);
  const [showInsertions, setShowInsertions] = useState(false);
  const [showImpactTable, setShowImpactTable] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadGWMPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // Relatório de campanha passada: pré-gerado e servido como arquivo estático
      const response = await fetch(`${import.meta.env.BASE_URL}reports/Relatorio-TV-GWM-Maio-2026.pdf`);
      if (!response.ok) throw new Error("Erro ao gerar PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Relatorio-TV-GWM-Maio-2026.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erro ao gerar o relatorio PDF. Tente novamente.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Todos os dias da campanha GWM conforme mapa de mídia (21-31/05/2026)
  const dayNames: Record<string, string> = {
    "2026-05-21": "Qui 21/05", "2026-05-22": "Sex 22/05", "2026-05-23": "Sab 23/05",
    "2026-05-24": "Dom 24/05", "2026-05-25": "Seg 25/05", "2026-05-26": "Ter 26/05",
    "2026-05-27": "Qua 27/05", "2026-05-28": "Qui 28/05", "2026-05-29": "Sex 29/05",
    "2026-05-30": "Sab 30/05", "2026-05-31": "Dom 31/05",
  };

  // Build chart data for selected day
  const currentDayData = data?.campaignDays[selectedDay];
  const baselineDayData = data?.baselineDays[selectedDay];
  const chartData = currentDayData?.hours.map((h, i) => ({
    hour: h.hour,
    campanha: h.sessions,
    baseline: baselineDayData?.hours[i]?.sessions || 0,
  })) || [];

  // Insertions for selected day
  const currentDate = currentDayData?.date || "";
  const dayInsertions = GWM_MAI_INSERTIONS.filter(ins => ins.date === currentDate);

  // Program impact ranking (unique programs, best lift)
  const programRanking = Object.values(
    (data?.programImpact || []).reduce((acc: Record<string, { program: string; totalLift: number; count: number; bestLift: number }>, imp) => {
      if (!acc[imp.program]) acc[imp.program] = { program: imp.program, totalLift: 0, count: 0, bestLift: -999 };
      acc[imp.program].totalLift += imp.windowLift;
      acc[imp.program].count += 1;
      if (imp.windowLift > acc[imp.program].bestLift) acc[imp.program].bestLift = imp.windowLift;
      return acc;
    }, {})
  ).map(p => ({ ...p, avgLift: Math.round(p.totalLift / p.count) }))
    .sort((a, b) => b.avgLift - a.avgLift);

  // Program summary for accordion
  const programSummary = GWM_MAI_INSERTIONS.reduce((acc: Record<string, { count: number; duration: string; hours: number[] }>, ins) => {
    if (!acc[ins.program]) acc[ins.program] = { count: 0, duration: ins.duration, hours: [] };
    acc[ins.program].count += 1;
    if (!acc[ins.program].hours.includes(ins.hour)) acc[ins.program].hours.push(ins.hour);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Campaign header */}
      <div className="bg-gradient-to-r from-emerald-900/40 to-slate-900 border border-emerald-500/20 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-base font-bold text-white">GWM, Maio 2026</div>
              <div className="text-xs text-slate-400">21 a 31 de maio de 2026, Rede Globo e GloboNews</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-400">171</div>
              <div className="text-xs text-slate-400">insercoes totais</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-white">11</div>
              <div className="text-xs text-slate-400">dias de campanha</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-white">11</div>
              <div className="text-xs text-slate-400">programas</div>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Download Banner */}
      <div className="bg-gradient-to-r from-emerald-900/30 to-slate-900 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Relatorio Completo, GWM Maio 2026</div>
            <div className="text-xs text-slate-400">Resumo executivo + analise por dia (11 dias) + ranking de programas · 13 paginas · PDF</div>
          </div>
        </div>
        <button
          onClick={handleDownloadGWMPDF}
          disabled={isGeneratingPDF}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
        >
          {isGeneratingPDF ? (
            <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block" />
          ) : (
            <span>&#11015;</span>
          )}
          <span>{isGeneratingPDF ? "Gerando PDF..." : "Gerar PDF"}</span>
        </button>
      </div>

      {/* Day selector */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Selecione o dia para ver o grafico hora a hora:</p>
        <div className="flex flex-wrap gap-1.5">
          {(data?.campaignDays || GWM_MAI_DAYS.map((d, i) => ({ date: d, label: dayNames[d], hours: [] }))).map((day, i) => (
            <button
              key={day.date}
              onClick={() => setSelectedDay(i)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                selectedDay === i ? "bg-emerald-500 text-white border-emerald-500" : "bg-card text-muted-foreground border-border hover:border-emerald-500/40"
              }`}
            >{dayNames[day.date] || day.date}</button>
          ))}
        </div>
      </div>

      {/* Hourly chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-foreground">
            Trafego por Hora, {dayNames[currentDate] || currentDate}
          </h3>
          {isLoading && <span className="text-xs text-muted-foreground">Carregando...</span>}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          <span className="inline-flex items-center gap-1 mr-3"><span className="inline-block w-3 h-2 rounded-sm bg-slate-500"></span> Barra cinza = semana anterior sem TV</span>
          <span className="inline-flex items-center gap-1 mr-3"><span className="inline-block w-3 h-0.5 bg-emerald-400"></span> Linha verde = trafego com TV (campanha)</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-0.5 h-3 bg-emerald-400 border-dashed"></span> Linha tracejada = horario de insercao</span>
        </p>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">Buscando dados do GA4...</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={36} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [v.toLocaleString("pt-BR"), name === "campanha" ? "Com campanha" : "Semana anterior"]}
              />
              <Legend formatter={(v) => v === "campanha" ? "Trafego com TV (campanha)" : "Semana anterior sem TV"} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="baseline" fill="#475569" radius={[2,2,0,0]} name="baseline" />
              <Line dataKey="campanha" stroke="#10b981" strokeWidth={2} dot={false} name="campanha" />
              {dayInsertions.map((ins, i) => (
                <ReferenceLine
                  key={i}
                  x={`${String(ins.hour).padStart(2,"0")}:00`}
                  stroke="#34d399"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                  label={{ value: ins.program.split(" ")[0], position: "top", fontSize: 9, fill: "#34d399" }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Program impact ranking */}
      {!isLoading && programRanking.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Ranking de Programas por Impacto</h3>
          <p className="text-xs text-muted-foreground mb-3">Variacao media de trafego na janela de 2h apos cada insercao, comparado com a semana anterior no mesmo horario.</p>
          <div className="space-y-2">
            {programRanking.slice(0, 8).map((p, i) => (
              <div key={p.program} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                <span className="text-xs text-foreground flex-1 truncate">{p.program}</span>
                <span className="text-xs text-muted-foreground">{p.count}x</span>
                <span className={`text-xs font-bold w-14 text-right ${
                  p.avgLift > 10 ? "text-emerald-400" : p.avgLift < -5 ? "text-red-400" : "text-yellow-400"
                }`}>
                  {p.avgLift > 0 ? "+" : ""}{p.avgLift}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inserções do Dia Selecionado */}
      {dayInsertions.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Inserções de {dayNames[currentDate] || currentDate}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {dayInsertions.length} inserção{dayInsertions.length !== 1 ? "ões" : ""} programadas para este dia.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Programa</th>
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Horário</th>
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Duração</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Impacto</th>
                </tr>
              </thead>
              <tbody>
                {dayInsertions.map((ins, i) => {
                  const impact = data?.programImpact?.find(
                    p => p.date === ins.date && p.hour === ins.hour && p.program === ins.program
                  );
                  return (
                    <tr key={i} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                      <td className="py-2 pr-3 text-foreground font-medium">{ins.program}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{String(ins.hour).padStart(2, "0")}h00</td>
                      <td className="py-2 pr-3 text-muted-foreground">{ins.duration}</td>
                      <td className={`py-2 text-right font-bold ${
                        impact && impact.windowLift > 0 ? "text-emerald-400" :
                        impact && impact.windowLift < 0 ? "text-red-400" :
                        "text-muted-foreground"
                      }`}>
                        {impact ? `${impact.windowLift > 0 ? "+" : ""}${impact.windowLift}%` : "aguardando"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Janela de Resposta Pos-Insercao */}
      {!isLoading && data?.responseWindow && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Janela de Resposta Pos-Insercao</h3>
          <p className="text-xs text-muted-foreground mb-3">Lift medio de sessoes por hora apos cada insercao de TV, comparado com a semana anterior no mesmo horario. Mostra em qual hora o pico de acesso acontece.</p>
          <div className="grid grid-cols-4 gap-3">
            {data.responseWindow.map(w => (
              <div key={w.hour} className={`rounded-lg p-3 text-center border ${
                w.avgLift > 15 ? "bg-emerald-500/15 border-emerald-500/30" :
                w.avgLift > 5 ? "bg-sky-500/10 border-sky-500/20" :
                w.avgLift < 0 ? "bg-red-500/10 border-red-500/20" :
                "bg-card border-border"
              }`}>
                <div className={`text-xl font-bold ${
                  w.avgLift > 15 ? "text-emerald-400" :
                  w.avgLift > 5 ? "text-sky-400" :
                  w.avgLift < 0 ? "text-red-400" : "text-muted-foreground"
                }`}>{w.avgLift > 0 ? "+" : ""}{w.avgLift}%</div>
                <div className="text-xs text-foreground font-medium mt-0.5">{w.hour}</div>
                <div className="text-xs text-muted-foreground">{w.insertions} insercoes</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impacto por Insercao */}
      {!isLoading && programRanking.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowImpactTable(v => !v)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition-colors"
          >
            <div>
              <span className="text-sm font-semibold text-foreground">Impacto por Insercao</span>
              <span className="text-xs text-muted-foreground ml-2">Ranking de programas por lift de trafego</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showImpactTable ? "rotate-180" : ""}`} />
          </button>
          {showImpactTable && (
            <div className="px-4 pb-4 space-y-2">
              {programRanking.slice(0, 10).map((p, i) => (
                <div key={p.program} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                  <span className="text-xs text-foreground flex-1 truncate">{p.program}</span>
                  <span className="text-xs text-muted-foreground">{p.count}x</span>
                  <span className={`text-xs font-bold w-14 text-right ${
                    p.avgLift > 10 ? "text-emerald-400" : p.avgLift < -5 ? "text-red-400" : "text-yellow-400"
                  }`}>{p.avgLift > 0 ? "+" : ""}{p.avgLift}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leads e Contatos por Dia */}
      {!isLoading && data?.leadsByDay && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Leads e Contatos por Dia</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Apenas paginas GWM/Haval.
            <span className="text-foreground font-medium"> Lead</span> = formulario enviado.
            <span className="text-foreground font-medium"> Contato</span> = clique em WhatsApp/telefone.
            Comparado com semana anterior sem TV.
          </p>
          {/* Totals com comparacao */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-emerald-400">{(data.totalLeads || 0).toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Leads Totais (com TV)</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500">{(data.totalBaseLeads || 0).toLocaleString("pt-BR")} sem TV</div>
                  {data.totalLeadsLift != null && (
                    <div className={`text-sm font-bold ${data.totalLeadsLift >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {data.totalLeadsLift >= 0 ? "+" : ""}{data.totalLeadsLift}%
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-3">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-sky-400">{(data.totalContacts || 0).toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Contatos Totais (com TV)</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500">{(data.totalBaseContacts || 0).toLocaleString("pt-BR")} sem TV</div>
                  {data.totalContactsLift != null && (
                    <div className={`text-sm font-bold ${data.totalContactsLift >= 0 ? "text-sky-400" : "text-red-400"}`}>
                      {data.totalContactsLift >= 0 ? "+" : ""}{data.totalContactsLift}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Table by day com comparacao */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Dia</th>
                  <th className="text-right py-2 pr-2 text-muted-foreground font-medium">Leads</th>
                  <th className="text-right py-2 pr-2 text-muted-foreground font-medium">Sem TV</th>
                  <th className="text-right py-2 pr-2 text-muted-foreground font-medium">Var. Leads</th>
                  <th className="text-right py-2 pr-2 text-muted-foreground font-medium">Contatos</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Var. Cont.</th>
                </tr>
              </thead>
              <tbody>
                {data.leadsByDay.map((d: { date: string; leads: number; contacts: number; baseLeads: number; baseContacts: number; leadsLift: number | null; contactsLift: number | null }) => (
                  <tr key={d.date} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                    <td className="py-2 pr-3 text-foreground font-medium">{dayNames[d.date] || d.date}</td>
                    <td className="py-2 pr-2 text-right font-bold text-emerald-400">{d.leads}</td>
                    <td className="py-2 pr-2 text-right text-slate-500">{d.baseLeads}</td>
                    <td className="py-2 pr-2 text-right">
                      {d.leadsLift != null ? (
                        <span className={`font-bold ${d.leadsLift >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {d.leadsLift >= 0 ? "+" : ""}{d.leadsLift}%
                        </span>
                      ) : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-2 pr-2 text-right text-sky-400">{d.contacts}</td>
                    <td className="py-2 text-right">
                      {d.contactsLift != null ? (
                        <span className={`font-bold ${d.contactsLift >= 0 ? "text-sky-400" : "text-red-400"}`}>
                          {d.contactsLift >= 0 ? "+" : ""}{d.contactsLift}%
                        </span>
                      ) : <span className="text-slate-600">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-accent/20">
                  <td className="py-2 pr-3 font-bold text-foreground">TOTAL</td>
                  <td className="py-2 pr-2 text-right font-bold text-emerald-400">{data.totalLeads}</td>
                  <td className="py-2 pr-2 text-right text-slate-500">{data.totalBaseLeads}</td>
                  <td className="py-2 pr-2 text-right">
                    {data.totalLeadsLift != null && (
                      <span className={`font-bold ${data.totalLeadsLift >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {data.totalLeadsLift >= 0 ? "+" : ""}{data.totalLeadsLift}%
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right text-sky-400">{data.totalContacts}</td>
                  <td className="py-2 text-right">
                    {data.totalContactsLift != null && (
                      <span className={`font-bold ${data.totalContactsLift >= 0 ? "text-sky-400" : "text-red-400"}`}>
                        {data.totalContactsLift >= 0 ? "+" : ""}{data.totalContactsLift}%
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Grade de Veiculacao */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowInsertions(v => !v)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition-colors"
        >
          <div>
            <span className="text-sm font-semibold text-foreground">Grade de Veiculacao</span>
            <span className="text-xs text-muted-foreground ml-2">171 insercoes, 21-31/05</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showInsertions ? "rotate-180" : ""}`} />
        </button>
        {showInsertions && (
          <div className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Programa</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Horario</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Duracao</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Insercoes</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(programSummary).map(([prog, info]) => (
                    <tr key={prog} className="border-b border-border/30 hover:bg-accent/30">
                      <td className="py-2 pr-4 text-foreground font-medium">{prog}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{info.hours.map(h => `${String(h).padStart(2,"0")}h`).join(", ")}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{info.duration}</td>
                      <td className="py-2 text-right font-bold text-foreground">{info.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- ABOUT TAB ----
const ABOUT_SECTIONS = [
  {
    id: "source",
    title: "Fonte dos Dados",
    icon: "database",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    items: [
      { label: "Propriedade GA4 principal", desc: "Carrera Novos (ID configurado via variavel de ambiente). Todos os dados de sessoes, usuarios, leads e UTMs vem desta propriedade." },
      { label: "Propriedade GA4 das BIOs", desc: "ID 503617174, usada exclusivamente na aba Carrera BIO. Os dados das BIOs sao independentes do site principal." },
      { label: "Atualizacao dos dados", desc: "Os dados do GA4 tem latencia de ate 24-48 horas para o dia atual. O periodo 'Hoje' pode estar incompleto." },
      { label: "Fuso horario", desc: "Os dados seguem o fuso horario configurado na propriedade GA4 (America/Sao_Paulo). Datas e horas exibidas no dashboard refletem o horario de Brasilia." },
    ],
  },
  {
    id: "metrics",
    title: "Metricas Principais",
    icon: "bar",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    items: [
      { label: "Sessoes", desc: "Numero total de sessoes iniciadas no site no periodo. Uma sessao e encerrada apos 30 minutos de inatividade ou a meia-noite." },
      { label: "Usuarios", desc: "Numero de usuarios unicos (ativos) que visitaram o site. Um usuario pode ter multiplas sessoes." },
      { label: "Novos Usuarios", desc: "Usuarios que visitaram o site pela primeira vez no periodo selecionado." },
      { label: "Taxa de Rejeicao", desc: "Percentual de sessoes em que o usuario saiu sem interagir com a pagina (sem clique, scroll ou segunda pagina). Quanto menor, melhor o engajamento." },
      { label: "Duracao Media", desc: "Tempo medio de cada sessao no site. Calculado como a soma de todas as duracoes dividida pelo numero de sessoes." },
      { label: "Paginas por Sessao", desc: "Media de paginas visualizadas por sessao. Indica profundidade de navegacao." },
    ],
  },
  {
    id: "periods",
    title: "Periodos e Comparacao",
    icon: "calendar",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    items: [
      { label: "Periodo atual", desc: "O intervalo de datas selecionado no seletor superior (Hoje, Ontem, 7 dias, 15 dias, 30 dias, 90 dias ou personalizado)." },
      { label: "Periodo anterior (comparacao)", desc: "Periodo imediatamente anterior de mesma duracao. Exemplo: para '30 dias', o periodo anterior sao os 30 dias que precedem o periodo atual. Para 'Hoje', o anterior e 'Ontem'." },
      { label: "Variacao percentual", desc: "Calculada como: ((valor atual - valor anterior) / valor anterior) x 100. Seta verde indica crescimento, seta vermelha indica queda. Traço horizontal indica variacao menor que 0,1%." },
      { label: "Periodo personalizado", desc: "Ao selecionar datas customizadas, o periodo anterior equivalente e calculado automaticamente com a mesma quantidade de dias, imediatamente antes da data inicial escolhida." },
    ],
  },
  {
    id: "brands",
    title: "Classificacao por Marca",
    icon: "car",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    items: [
      { label: "Regra de classificacao", desc: "Cada pagina e classificada pela marca com base no caminho da URL (pagePath). A primeira regra que corresponder define a marca da pagina." },
      { label: "Nissan", desc: "URLs contendo /nissan ou /whatsapp/nissan" },
      { label: "Chevrolet", desc: "URLs contendo /chevrolet ou /whatsapp/chevrolet" },
      { label: "GWM / Haval", desc: "URLs contendo /gwm, /haval ou /whatsapp/gwm" },
      { label: "Omoda / Jaecoo", desc: "URLs contendo /omoda, /jaecoo ou /whatsapp/omoda" },
      { label: "Volkswagen", desc: "URLs contendo /volkswagen ou /whatsapp/volkswagen" },
      { label: "Zeekr", desc: "URLs contendo /zeekr ou /whatsapp/zeekr" },
      { label: "GAC", desc: "URLs contendo /gac ou /whatsapp/gac" },
      { label: "Bajaj / Motos", desc: "URLs contendo /bajaj, /motos ou /whatsapp/bajaj" },
      { label: "Seminovos", desc: "URLs contendo /usados, /seminovos ou /whatsapp/carreraSeminovos" },
      { label: "Servicos / Oficina", desc: "URLs contendo /servicos ou /oficina" },
      { label: "Assinatura", desc: "URLs contendo /assinatura ou /carro-por-assinatura" },
      { label: "Empresas / PCD", desc: "URLs contendo /empresas, /pcd, /taxistas ou /frotista" },
      { label: "Consorcio", desc: "URLs contendo /consorcio" },
      { label: "Vender", desc: "URLs contendo /vender" },
      { label: "Outros", desc: "Todas as demais URLs que nao se encaixam nas categorias acima (homepage, blog, paginas institucionais, etc.)." },
    ],
  },
  {
    id: "leads",
    title: "Leads e Contatos",
    icon: "target",
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    items: [
      { label: "Contato", desc: "Evento GA4 'contact' disparado quando o usuario clica em um botao de contato (WhatsApp, telefone, e-mail). Indica intencao de contato imediato." },
      { label: "Lead Qualificado", desc: "Evento GA4 'generate_lead' disparado quando o usuario envia um formulario de contato ou solicita uma proposta. Indica intencao mais qualificada." },
      { label: "Lead Organico (sem UTM)", desc: "Lead ou contato gerado em uma sessao onde os tres campos de UTM estao vazios: sessionCampaignName = '(not set)', sessionMedium = '(none)', '(not set)' ou 'organic'. Representa trafego direto, busca organica ou navegacao sem campanha rastreada." },
      { label: "Lead Pago (com UTM)", desc: "Lead ou contato gerado em uma sessao com pelo menos um parametro UTM preenchido (campanha, midia ou source). Representa trafego de campanhas pagas, e-mail marketing, social rastreado, etc." },
      { label: "Taxa de Conversao", desc: "Calculada como: (numero de leads / numero de contatos) x 100. Indica qual percentual dos contatos evolui para um lead qualificado." },
      { label: "Taxa de Conversao Organica", desc: "Calculada como: (leads organicos / contatos organicos) x 100. Mede a eficiencia do trafego sem midia paga em gerar leads qualificados." },
    ],
  },
  {
    id: "urlmonitor",
    title: "Monitor de URLs",
    icon: "search",
    color: "text-indigo-400",
    bg: "bg-indigo-400/10",
    items: [
      { label: "Paginas monitoradas", desc: "Ate 100 paginas com maior volume de sessoes no periodo, excluindo a homepage (/) e URLs com menos de 10 sessoes no periodo (consideradas ruido estatistico)." },
      { label: "Media diaria", desc: "Total de sessoes da pagina no periodo dividido pelo numero de dias com pelo menos uma sessao registrada." },
      { label: "Pico", desc: "Maior numero de sessoes registradas em um unico dia dentro do periodo selecionado, com a data correspondente." },
      { label: "Baixa", desc: "Menor numero de sessoes registradas em um unico dia dentro do periodo selecionado, com a data correspondente." },
      { label: "Tendencia: Subindo", desc: "A media de sessoes da segunda metade do periodo e mais de 10% maior que a media da primeira metade. Exemplo: em 30 dias, compara os ultimos 15 dias com os primeiros 15 dias. Se a segunda metade tiver mais de 10% de sessoes a mais, a URL e marcada como 'Subindo'." },
      { label: "Tendencia: Caindo", desc: "A media de sessoes da segunda metade do periodo e mais de 10% menor que a media da primeira metade. Regra simetrica ao 'Subindo'." },
      { label: "Tendencia: Estavel", desc: "A variacao entre as duas metades do periodo e menor que 10% para cima ou para baixo. Tambem aplicado quando o periodo tem menos de 4 dias de dados para a pagina." },
      { label: "Variacao vs periodo anterior", desc: "Compara o total de sessoes da pagina no periodo atual com o total do periodo anterior equivalente. Calculada como: ((atual - anterior) / anterior) x 100." },
      { label: "Sparkline", desc: "Mini-grafico de linha mostrando os ultimos 14 dias de sessoes da pagina (ou todos os dias se o periodo for menor). Verde = tendencia de alta, vermelho = tendencia de queda, cinza = estavel." },
    ],
  },
  {
    id: "utms",
    title: "UTMs e Campanhas",
    icon: "link",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    items: [
      { label: "UTM Source", desc: "Origem do trafego rastreado. Exemplos: google, facebook, instagram, email. Preenchido via parametro utm_source na URL da campanha." },
      { label: "UTM Medium", desc: "Midia ou canal da campanha. Exemplos: cpc, email, social, banner. Preenchido via parametro utm_medium." },
      { label: "UTM Campaign", desc: "Nome da campanha. Preenchido via parametro utm_campaign. Permite identificar qual campanha especifica gerou o trafego." },
      { label: "UTM Content", desc: "Diferencia anuncios ou links dentro da mesma campanha. Preenchido via parametro utm_content." },
      { label: "Sessoes sem UTM", desc: "Sessoes onde nenhum parametro UTM foi identificado. Incluem trafego direto (digitar a URL), busca organica, referencia sem rastreamento e acesso via favoritos." },
    ],
  },
  {
    id: "bio",
    title: "Carrera BIO",
    icon: "globe",
    color: "text-pink-400",
    bg: "bg-pink-400/10",
    items: [
      { label: "Propriedade separada", desc: "Os dados das BIOs vem da propriedade GA4 com ID 503617174, separada do site principal. Sao paginas de link-in-bio usadas nas redes sociais de cada marca." },
      { label: "Metricas das BIOs", desc: "Sessoes, usuarios, taxa de rejeicao e duracao media, com a mesma logica de calculo do site principal." },
      { label: "Filtro por marca", desc: "As BIOs sao classificadas por marca com base no nome da pagina ou no caminho da URL dentro da propriedade de BIOs." },
      { label: "Visao diaria", desc: "Ao selecionar uma marca no filtro, o grafico diario exibe as sessoes daquela marca especifica no periodo selecionado." },
    ],
  },
];

function AboutTab() {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const getIcon = (icon: string) => {
    const cls = "w-4 h-4";
    switch (icon) {
      case "database": return <Activity className={cls} />;
      case "bar": return <BarChart2 className={cls} />;
      case "calendar": return <Calendar className={cls} />;
      case "car": return <Car className={cls} />;
      case "target": return <Target className={cls} />;
      case "search": return <Search className={cls} />;
      case "link": return <Link2 className={cls} />;
      case "globe": return <Globe className={cls} />;
      default: return <Info className={cls} />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-3">
        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <span>
          Esta aba documenta todas as definicoes, regras e logicas usadas no dashboard. Clique em cada secao para expandir os detalhes.
        </span>
      </div>

      {ABOUT_SECTIONS.map(section => (
        <div key={section.id} className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/20 transition-colors"
            onClick={() => setOpenSection(prev => prev === section.id ? null : section.id)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${section.bg} flex items-center justify-center flex-shrink-0`}>
                <span className={section.color}>{getIcon(section.icon)}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{section.title}</span>
              <span className="text-xs text-muted-foreground">{section.items.length} definicoes</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openSection === section.id ? "rotate-180" : ""}`} />
          </button>

          {openSection === section.id && (
            <div className="border-t border-border">
              {section.items.map((item, i) => (
                <div key={i} className={`px-4 py-3 flex gap-3 ${i < section.items.length - 1 ? "border-b border-border/40" : ""}  hover:bg-accent/10 transition-colors`}>
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${section.color.replace("text-", "bg-")}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="text-xs text-muted-foreground text-center py-2">
        Dashboard Carrera Analytics, alimentado pelo Google Analytics 4 (GA4). Dados atualizados com latencia de ate 24-48h.
      </div>
    </div>
  );
}

// ---- URL MONITOR TAB ----
function URLMonitorTab({ period, customStart, customEnd }: { period: Period; customStart?: string; customEnd?: string }) {
  const input = { period, customStart, customEnd };
  const { data, isLoading } = trpc.analytics.urlMonitor.useQuery(input);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"totalSessions" | "change" | "peak" | "avgDaily">("totalSessions");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [filterTrend, setFilterTrend] = useState<"all" | "up" | "down" | "stable">("all");
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const vsLabel = PERIOD_VS_LABELS[period];

  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const { pages } = data;

  const filtered = pages
    .filter(p => {
      if (search && !p.page.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTrend !== "all" && p.trend !== filterTrend) return false;
      return true;
    })
    .sort((a, b) => {
      const va = a[sortBy] as number;
      const vb = b[sortBy] as number;
      return sortDir === "desc" ? vb - va : va - vb;
    });

  const selectedData = selectedPage ? pages.find(p => p.page === selectedPage) : null;

  const formatDate = (d: string) => {
    if (!d) return "";
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  const trendBadge = (trend: "up" | "down" | "stable") => {
    if (trend === "up") return <span className="inline-flex items-center gap-0.5 text-emerald-400 text-xs font-medium"><ArrowUpRight className="w-3 h-3" />Subindo</span>;
    if (trend === "down") return <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-medium"><ArrowDownRight className="w-3 h-3" />Caindo</span>;
    return <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs font-medium"><Minus className="w-3 h-3" />Estavel</span>;
  };

  const SortHeader = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <th
      className="text-right py-2 text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={() => { if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc"); else { setSortBy(col); setSortDir("desc"); } }}
    >
      {label}{sortBy === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  // Sparkline mini chart
  const Sparkline = ({ values, trend }: { values: number[]; trend: "up" | "down" | "stable" }) => {
    if (!values.length) return null;
    const max = Math.max(...values, 1);
    const w = 60, h = 24;
    const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / max) * h}`).join(" ");
    const color = trend === "up" ? "#34d399" : trend === "down" ? "#f87171" : "#94a3b8";
    return (
      <svg width={w} height={h} className="overflow-visible">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  };

  // Counts by trend
  const upCount = pages.filter(p => p.trend === "up").length;
  const downCount = pages.filter(p => p.trend === "down").length;
  const stableCount = pages.filter(p => p.trend === "stable").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-3">
        <Search className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <span>
          Monitore o desempenho individual de cada pagina. Veja quais URLs estao ganhando ou perdendo trafego, com pico, baixa, media diaria e tendencia no periodo selecionado {vsLabel}.
        </span>
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className={`bg-card border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
            filterTrend === "up" ? "border-emerald-400 bg-emerald-400/10" : "border-border hover:border-emerald-400/50"
          }`}
          onClick={() => setFilterTrend(f => f === "up" ? "all" : "up")}
        >
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            <span className="text-2xl font-bold text-emerald-400">{upCount}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">URLs em alta</p>
        </div>
        <div
          className={`bg-card border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
            filterTrend === "down" ? "border-red-400 bg-red-400/10" : "border-border hover:border-red-400/50"
          }`}
          onClick={() => setFilterTrend(f => f === "down" ? "all" : "down")}
        >
          <div className="flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4 text-red-400" />
            <span className="text-2xl font-bold text-red-400">{downCount}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">URLs em queda</p>
        </div>
        <div
          className={`bg-card border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
            filterTrend === "stable" ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
          }`}
          onClick={() => setFilterTrend(f => f === "stable" ? "all" : "stable")}
        >
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-muted-foreground" />
            <span className="text-2xl font-bold text-foreground">{stableCount}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">URLs estaveis</p>
        </div>
      </div>

      {/* Selected page sparkline detail */}
      {selectedData && (
        <div className="bg-card border border-primary/40 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Pagina selecionada</p>
              <a
                href={`https://www.carrera.com.br${selectedData.page}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-primary hover:underline break-all"
              >
                {selectedData.page}
              </a>
            </div>
            <button onClick={() => setSelectedPage(null)} className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0">Fechar</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted-foreground">Total de Sessoes</p>
              <p className="text-lg font-bold text-foreground">{selectedData.totalSessions.toLocaleString("pt-BR")}</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted-foreground">Media Diaria</p>
              <p className="text-lg font-bold text-foreground">{selectedData.avgDaily.toLocaleString("pt-BR")}</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted-foreground">Pico</p>
              <p className="text-lg font-bold text-emerald-400">{selectedData.peak.toLocaleString("pt-BR")}</p>
              <p className="text-muted-foreground/70">{formatDate(selectedData.peakDate)}</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted-foreground">Baixa</p>
              <p className="text-lg font-bold text-red-400">{selectedData.low.toLocaleString("pt-BR")}</p>
              <p className="text-muted-foreground/70">{formatDate(selectedData.lowDate)}</p>
            </div>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selectedData.sparkline.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={selectedData.trend === "up" ? "#34d399" : selectedData.trend === "down" ? "#f87171" : "#94a3b8"} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={selectedData.trend === "up" ? "#34d399" : selectedData.trend === "down" ? "#f87171" : "#94a3b8"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="i" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                  formatter={(v: number) => [v.toLocaleString("pt-BR"), "Sessoes"]}
                  labelFormatter={(i: number) => `Dia ${i + 1}`}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={selectedData.trend === "up" ? "#34d399" : selectedData.trend === "down" ? "#f87171" : "#94a3b8"}
                  fill="url(#sparkGrad)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filtrar por URL..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "up", "down", "stable"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterTrend(t)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                filterTrend === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "Todos" : t === "up" ? "Alta" : t === "down" ? "Queda" : "Estavel"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border">
              <tr>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">URL</th>
                <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Tendencia</th>
                <SortHeader col="totalSessions" label="Total" />
                <SortHeader col="avgDaily" label="Media/dia" />
                <SortHeader col="peak" label="Pico" />
                <SortHeader col="change" label={`Var. ${vsLabel}`} />
                <th className="text-right py-2.5 px-4 text-muted-foreground font-medium">Sparkline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 80).map((p, i) => (
                <tr
                  key={i}
                  className={`border-b border-border/40 hover:bg-accent/20 transition-colors cursor-pointer ${
                    selectedPage === p.page ? "bg-primary/5 border-primary/20" : ""
                  }`}
                  onClick={() => setSelectedPage(prev => prev === p.page ? null : p.page)}
                >
                  <td className="py-2.5 px-4 max-w-[220px]">
                    <a
                      href={`https://www.carrera.com.br${p.page}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono truncate block"
                      onClick={e => e.stopPropagation()}
                    >
                      {p.page.length > 45 ? p.page.slice(0, 45) + "..." : p.page}
                    </a>
                  </td>
                  <td className="py-2.5 px-3 text-center">{trendBadge(p.trend)}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-foreground">{p.totalSessions.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{p.avgDaily.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="text-emerald-400 font-medium">{p.peak.toLocaleString("pt-BR")}</span>
                    <span className="text-muted-foreground/60 ml-1">{formatDate(p.peakDate)}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right"><ChangeIndicator value={p.change} /></td>
                  <td className="py-2.5 px-4 text-right">
                    <Sparkline values={p.sparkline} trend={p.trend} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma pagina encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 80 && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
            Exibindo 80 de {filtered.length} paginas. Use o filtro de URL para refinar.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/40 pt-4 mt-2">
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          <strong className="text-muted-foreground">Logica desta aba:</strong> Tendencia Subindo = media da segunda metade do periodo mais de 10% maior que a primeira metade. Tendencia Caindo = media da segunda metade mais de 10% menor. Estavel = variacao menor que 10% entre as metades, ou menos de 4 dias de dados. Pico = maior sessoes em um unico dia. Baixa = menor sessoes em um unico dia. Paginas com menos de 10 sessoes no periodo sao excluidas.
        </p>
      </div>
    </div>
  );
}

function CarreraDaysCampaignDetail() {
  // ALL hooks must come before any conditional returns (React rules of hooks)
  const { data, isLoading } = trpc.analytics.tvCampaign.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { data: leadsData } = trpc.analytics.tvLeads.useQuery({}, { staleTime: 5 * 60 * 1000 });
  const [selectedDay, setSelectedDay] = useState(0);
  const [brandFilter, setBrandFilter] = useState<"all" | "VW" | "Chevrolet" | "GWM">("all");
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [downloadingBrand, setDownloadingBrand] = useState<string | null>(null);

  const handleDownloadPDF = async (brand?: string) => {
    const key = brand || "geral";
    setDownloadingBrand(key);
    setIsGeneratingPDF(true);
    try {
      // Relatórios de campanha passada: pré-gerados e servidos como arquivos estáticos
      const filename = brand ? `Relatorio-TV-Carrera-Days-${brand}-2026.pdf` : "Relatorio-TV-Carrera-Days-2026.pdf";
      const response = await fetch(`${import.meta.env.BASE_URL}reports/${filename}`);
      if (!response.ok) throw new Error("Erro ao gerar PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = brand ? `Relatorio-TV-Carrera-Days-${brand}-2026.pdf` : "Relatorio-TV-Carrera-Days-2026.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erro ao gerar o relatório PDF. Tente novamente.");
    } finally {
      setIsGeneratingPDF(false);
      setDownloadingBrand(null);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (!data) return <div className="text-muted-foreground text-sm">Sem dados disponíveis.</div>;
  const { campaignDays, baselineDays, insertions, programImpact } = data;

  // Build per-day chart data: merge campaign hours with baseline hours + insertion markers
  const buildChartData = (dayIndex: number) => {
    const camp = campaignDays[dayIndex];
    const base = baselineDays[dayIndex];
    if (!camp) return [];
    return camp.hours.map((h, i) => ({
      hour: h.hour,
      campanha: h.sessions,
      baseline: base?.hours[i]?.sessions || 0,
      insertions: insertions.filter(ins =>
        ins.date === camp.date && ins.hour === i &&
        (brandFilter === "all" || ins.brand === brandFilter)
      ),
    }));
  };

  // Helper: get color based on lift value (green=positive, yellow=neutral, red=negative)
  const getImpactColor = (lift: number) => lift > 5 ? "#22c55e" : lift < -5 ? "#ef4444" : "#f59e0b";
  // Program impact sorted by lift descending, filtered by brand
  const filteredImpact = brandFilter === "all" ? programImpact : programImpact.filter(i => i.brand === brandFilter);
  const sortedImpact = [...filteredImpact].sort((a, b) => b.lift - a.lift);

  // Aggregate by program name for ranking
  const programRanking = Object.values(
    filteredImpact.reduce((acc: Record<string, { program: string; totalLift: number; count: number; avgSessions: number }>, imp) => {
      if (!acc[imp.program]) acc[imp.program] = { program: imp.program, totalLift: 0, count: 0, avgSessions: 0 };
      acc[imp.program].totalLift += imp.lift;
      acc[imp.program].count += 1;
      acc[imp.program].avgSessions += imp.sessionsAfter;
      return acc;
    }, {})
  ).map(p => ({ ...p, avgLift: Math.round(p.totalLift / p.count), avgSessions: Math.round(p.avgSessions / p.count) }))
    .sort((a, b) => b.avgLift - a.avgLift);

  // Response window: sessions in hour of insertion + next hour vs baseline, filtered by selected day
  const selectedDate = campaignDays[selectedDay]?.date;
  const responseWindow = filteredImpact.filter(imp => imp.date === selectedDate).map(imp => {
    const campDay = campaignDays.find(d => d.date === imp.date);
    const baseDay = baselineDays.find(d => {
      const campDow = new Date(imp.date + "T12:00:00").getDay();
      const baseDow = new Date(d.date + "T12:00:00").getDay();
      return campDow === baseDow;
    });
    const h0 = imp.hour;
    const h1 = Math.min(imp.hour + 1, 23);
    const campSess = (campDay?.hours[h0]?.sessions || 0) + (campDay?.hours[h1]?.sessions || 0);
    const baseSess = (baseDay?.hours[h0]?.sessions || 0) + (baseDay?.hours[h1]?.sessions || 0);
    const windowLift = baseSess > 0 ? Math.round(((campSess - baseSess) / baseSess) * 100) : 0;
    return { ...imp, campSess, baseSess, windowLift };
  }).sort((a, b) => b.windowLift - a.windowLift);
  const chartData = buildChartData(selectedDay);
  const currentCampDay = campaignDays[selectedDay];
  const currentBaseDay = baselineDays[selectedDay];
  const totalCamp = currentCampDay?.hours.reduce((s, h) => s + h.sessions, 0) || 0;
  const totalBase = currentBaseDay?.hours.reduce((s, h) => s + h.sessions, 0) || 0;
  const dayLift = totalBase > 0 ? Math.round(((totalCamp - totalBase) / totalBase) * 100) : 0;

  const tooltipStyle = { backgroundColor: "oklch(0.18 0.015 240)", border: "1px solid oklch(0.28 0.02 240)", borderRadius: "8px", fontSize: "11px" };

  // Build summary text
  const totalCampAll = campaignDays.reduce((s, d) => s + d.hours.reduce((h, r) => h + r.sessions, 0), 0);
  const totalBaseAll = baselineDays.reduce((s, d) => s + d.hours.reduce((h, r) => h + r.sessions, 0), 0);
  const overallLift = totalBaseAll > 0 ? Math.round(((totalCampAll - totalBaseAll) / totalBaseAll) * 100) : 0;
  const bestImpact = responseWindow[0];
  const worstImpact = responseWindow[responseWindow.length - 1];
  const brandNames: Record<string, string> = { VW: "Volkswagen", Chevrolet: "Chevrolet", GWM: "GWM" };
  const summaryText = brandFilter === "all"
    ? `Durante os 4 dias de campanha (19-22/03), o site registrou ${totalCampAll.toLocaleString("pt-BR")} sess\u00f5es, ${overallLift > 0 ? `+${overallLift}%` : `${overallLift}%`} em rela\u00e7\u00e3o \u00e0 semana anterior sem TV. ${
        bestImpact ? `A inser\u00e7\u00e3o de maior impacto foi ${bestImpact.program} (${bestImpact.brand}) na ${String(bestImpact.hour).padStart(2, "0")}h de ${new Date(bestImpact.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}, com +${bestImpact.windowLift}% de resposta na janela de 2 horas.` : ""
      }${
        worstImpact && worstImpact.windowLift < 0 ? ` A inser\u00e7\u00e3o de menor impacto foi ${worstImpact.program} (${worstImpact.brand}) em ${new Date(worstImpact.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}, com ${worstImpact.windowLift}%.` : ""
      }`
    : `Para a marca ${brandNames[brandFilter] || brandFilter}, foram ${filteredImpact.length} inser\u00e7\u00f5es no per\u00edodo. ${
        bestImpact ? `O melhor resultado foi ${bestImpact.program} na ${String(bestImpact.hour).padStart(2, "0")}h de ${new Date(bestImpact.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}, com +${bestImpact.windowLift}% de aumento de tr\u00e1fego na janela de 2 horas.` : "Sem dados de impacto dispon\u00edveis para este per\u00edodo."
      }${
        worstImpact && worstImpact.windowLift < 0 ? ` O pior resultado foi ${worstImpact.program} em ${new Date(worstImpact.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}, com ${worstImpact.windowLift}%.` : ""
      }`;

  return (
    <div className="space-y-5">
      {/* PDF Download Banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Relatorio Completo, Carrera Days</div>
            <div className="text-xs text-slate-400">Resumão executivo + análise por dia + leads captados + ranking de programas · 7 páginas · PDF</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {([{ label: "Geral", brand: undefined }, { label: "Chevrolet", brand: "Chevrolet" }, { label: "GWM", brand: "GWM" }, { label: "VW", brand: "VW" }] as { label: string; brand?: string }[]).map(({ label, brand }) => {
            const key = brand || "geral";
            const loading = isGeneratingPDF && downloadingBrand === key;
            return (
              <button
                key={key}
                onClick={() => handleDownloadPDF(brand)}
                disabled={isGeneratingPDF}
                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                {loading ? (
                  <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block" />
                ) : (
                  <span>⬇</span>
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {/* Summary text card */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">Resumo da Campanha</h3>
              {brandFilter !== "all" && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: BRAND_COLORS[brandFilter] + "33", color: BRAND_COLORS[brandFilter] }}>
                  {brandFilter}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{summaryText}</p>
          </div>
        </div>
      </div>

      {/* Campaign summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {campaignDays.map((day, i) => {
          const base = baselineDays[i];
          const total = day.hours.reduce((s, h) => s + h.sessions, 0);
          const baseTotal = base?.hours.reduce((s, h) => s + h.sessions, 0) || 0;
          const lift = baseTotal > 0 ? Math.round(((total - baseTotal) / baseTotal) * 100) : 0;
          const insCount = insertions.filter(ins => ins.date === day.date).length;
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDay(i)}
              className={`text-left p-3 rounded-xl border transition-all ${
                selectedDay === i
                  ? "bg-primary/10 border-primary/40 shadow-sm"
                  : "bg-card border-border hover:border-primary/20"
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">{day.label}</div>
              <div className="text-lg font-bold text-foreground">{total.toLocaleString("pt-BR")}</div>
              <div className="text-xs text-muted-foreground">sessões · {insCount} inserção{insCount !== 1 ? "ões" : ""}</div>
              <div className={`text-xs font-semibold mt-1 ${lift > 0 ? "text-emerald-400" : lift < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {lift > 0 ? "+" : ""}{lift}% vs. semana anterior
              </div>
            </button>
          );
        })}
      </div>

      {/* Brand filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filtrar por marca:</span>
        {(["all", "VW", "Chevrolet", "GWM"] as const).map(b => (
          <button
            key={b}
            onClick={() => setBrandFilter(b)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
              brandFilter === b
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/30"
            }`}
            style={b !== "all" && brandFilter === b ? { backgroundColor: BRAND_COLORS[b], borderColor: BRAND_COLORS[b], color: "#fff" } : {}}
          >
            {b === "all" ? "Todas" : b}
          </button>
        ))}
      </div>

      {/* Hourly chart for selected day */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Tráfego por Hora, {currentCampDay?.label}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Campanha: <span className="text-foreground font-medium">{totalCamp.toLocaleString("pt-BR")}</span> sessões
              {" · "}
              Semana anterior: <span className="text-muted-foreground">{totalBase.toLocaleString("pt-BR")}</span>
              {" · "}
              <span className={dayLift > 0 ? "text-emerald-400 font-semibold" : dayLift < 0 ? "text-red-400 font-semibold" : "text-muted-foreground"}>
                {dayLift > 0 ? "+" : ""}{dayLift}%
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-primary inline-block"></span> Campanha</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-muted-foreground/40 inline-block"></span> Sem TV</span>
            <span className="flex items-center gap-1"><span className="w-0.5 h-3 rounded inline-block bg-green-500"></span> Inserção +impacto</span>
            <span className="flex items-center gap-1"><span className="w-0.5 h-3 rounded inline-block bg-yellow-400"></span> Inserção neutro</span>
            <span className="flex items-center gap-1"><span className="w-0.5 h-3 rounded inline-block bg-red-500"></span> Inserção -impacto</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 240)" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.01 240)" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const ins = chartData.find(d => d.hour === label)?.insertions || [];
                return (
                  <div style={tooltipStyle} className="p-2 space-y-1">
                    <div className="font-semibold text-foreground">{label}</div>
                    {payload.map((p: any) => (
                      <div key={p.name} style={{ color: p.color }}>
                        {p.name === "campanha" ? "Campanha" : "Sem TV"}: {(p.value as number).toLocaleString("pt-BR")}
                      </div>
                    ))}
                    {ins.length > 0 && (
                      <div className="border-t border-border/40 pt-1 mt-1">
                        {ins.map((ins, i) => {
                          const impact = programImpact.find(p => p.date === currentCampDay?.date && p.hour === ins.hour && p.program === ins.program && p.brand === ins.brand);
                          const impactColor = impact ? getImpactColor(impact.lift) : "#f59e0b";
                          return (
                            <div key={i} className="text-xs" style={{ color: impactColor }}>
                              📺 {ins.program} · {ins.brand} {ins.duration}{impact ? ` (${impact.lift > 0 ? "+" : ""}${impact.lift}%)` : ""}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {/* Insertion reference lines - color based on impact (green=positive, yellow=neutral, red=negative) */}
            {insertions
              .filter(ins => ins.date === currentCampDay?.date && (brandFilter === "all" || ins.brand === brandFilter))
              .map((ins, i) => {
                const impact = programImpact.find(p => p.date === ins.date && p.hour === ins.hour && p.program === ins.program && p.brand === ins.brand);
                const impactColor = impact ? getImpactColor(impact.lift) : "#f59e0b";
                return (
                  <ReferenceLine
                    key={i}
                    x={`${String(ins.hour).padStart(2, "0")}:00`}
                    stroke={impactColor}
                    strokeDasharray="4 2"
                    strokeWidth={1.5}
                    label={{ value: ins.program.split(" ")[0], position: "top", fontSize: 8, fill: impactColor }}
                  />
                );
              })}
            <Bar dataKey="baseline" fill="oklch(0.35 0.02 240)" radius={[2, 2, 0, 0]} maxBarSize={20} name="baseline" />
            <Bar dataKey="campanha" fill="#6366f1" radius={[2, 2, 0, 0]} maxBarSize={20} name="campanha" />
            <Line type="monotone" dataKey="campanha" stroke="#818cf8" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Response window analysis */}
      {responseWindow.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Janela de Resposta Pós-Inserção</h3>
          <p className="text-xs text-muted-foreground mb-3">Sessões acumuladas na hora da inserção + 1 hora seguinte, comparado com o mesmo período sem TV.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Programa</th>
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Marca</th>
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Data / Hora</th>
                  <th className="text-right py-2 pr-3 text-muted-foreground font-medium">Sess. com TV</th>
                  <th className="text-right py-2 pr-3 text-muted-foreground font-medium">Sess. sem TV</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Resposta</th>
                </tr>
              </thead>
              <tbody>
                {responseWindow.map((imp, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                    <td className="py-2 pr-3 text-foreground font-medium">{imp.program}</td>
                    <td className="py-2 pr-3">
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: BRAND_COLORS[imp.brand] + "33", color: BRAND_COLORS[imp.brand] }}>
                        {imp.brand}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {new Date(imp.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} · {String(imp.hour).padStart(2, "0")}h
                    </td>
                    <td className="py-2 pr-3 text-right text-foreground font-medium">{imp.campSess.toLocaleString("pt-BR")}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{imp.baseSess.toLocaleString("pt-BR")}</td>
                    <td className={`py-2 text-right font-bold ${
                      imp.windowLift > 0 ? "text-emerald-400" : imp.windowLift < 0 ? "text-red-400" : "text-muted-foreground"
                    }`}>{imp.windowLift > 0 ? "+" : ""}{imp.windowLift}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Program impact table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking by program */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Ranking de Programas</h3>
          <div className="space-y-2">
            {programRanking.map((p, i) => (
              <div key={p.program} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{p.program}</div>
                  <div className="text-xs text-muted-foreground">{p.count} inserção{p.count !== 1 ? "ões" : ""} · média {p.avgSessions.toLocaleString("pt-BR")} sess/hora</div>
                </div>
                <div className={`text-xs font-bold ${
                  p.avgLift > 20 ? "text-emerald-400" : p.avgLift > 0 ? "text-emerald-300" : "text-red-400"
                }`}>
                  {p.avgLift > 0 ? "+" : ""}{p.avgLift}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-insertion impact */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Impacto por Inserção</h3>
          <div className="space-y-2">
            {sortedImpact.map((imp, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BRAND_COLORS[imp.brand] || "#6366f1" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{imp.program}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(imp.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} · {String(imp.hour).padStart(2, "0")}h · {imp.brand}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-foreground">{imp.sessionsAfter.toLocaleString("pt-BR")}</div>
                  <div className={`text-xs font-semibold ${
                    imp.lift > 0 ? "text-emerald-400" : imp.lift < 0 ? "text-red-400" : "text-muted-foreground"
                  }`}>{imp.lift > 0 ? "+" : ""}{imp.lift}% vs. sem TV</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Insertion schedule table */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Grade de Veiculação</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Programa</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Marca</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Data</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Horário</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Dur.</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Sess. na hora</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Sem TV</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Variação</th>
              </tr>
            </thead>
            <tbody>
              {sortedImpact.map((imp, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                  <td className="py-2 pr-3 text-foreground font-medium">{imp.program}</td>
                  <td className="py-2 pr-3">
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: BRAND_COLORS[imp.brand] + "33", color: BRAND_COLORS[imp.brand] }}>
                      {imp.brand}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {new Date(imp.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{String(imp.hour).padStart(2, "0")}h</td>
                  <td className="py-2 pr-3 text-muted-foreground">{insertions.find(ins => ins.date === imp.date && ins.hour === imp.hour && ins.brand === imp.brand)?.duration}</td>
                  <td className="py-2 text-right text-foreground font-medium">{imp.sessionsAfter.toLocaleString("pt-BR")}</td>
                  <td className="py-2 text-right text-muted-foreground">{imp.sessionsBefore.toLocaleString("pt-BR")}</td>
                  <td className={`py-2 text-right font-bold ${
                    imp.lift > 0 ? "text-emerald-400" : imp.lift < 0 ? "text-red-400" : "text-muted-foreground"
                  }`}>{imp.lift > 0 ? "+" : ""}{imp.lift}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LEADS SECTION */}
      {leadsData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-emerald-500 rounded-full" />
            <h2 className="text-base font-bold text-foreground">Leads Captados na Campanha</h2>
            <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-0.5 rounded-full">19-22/03 vs 12-15/03</span>
          </div>

          {/* Leads summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Leads Campanha</p>
              <p className="text-2xl font-bold text-foreground">{leadsData.campTotal}</p>
              <p className="text-xs text-emerald-400 font-medium mt-1">+{leadsData.lift}% vs semana anterior</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Leads Baseline</p>
              <p className="text-2xl font-bold text-foreground">{leadsData.baseTotal}</p>
              <p className="text-xs text-muted-foreground mt-1">12-15/03 (sem TV)</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Via Site</p>
              <p className="text-2xl font-bold text-foreground">{leadsData.campaignDays.reduce((s, d) => s + d.site, 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">formularios no site</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Via WhatsApp</p>
              <p className="text-2xl font-bold text-foreground">{leadsData.campaignDays.reduce((s, d) => s + d.whatsapp, 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">contatos pelo WhatsApp</p>
            </div>
          </div>

          {/* Leads per day comparison */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground/80 mb-3">Leads por Dia, Campanha vs Baseline</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Dia</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Campanha</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Baseline</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Variacao</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Site</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsData.campaignDays.map((cd, i) => {
                    const bd = leadsData.baselineDays[i];
                    const lift = bd.total > 0 ? Math.round(((cd.total / bd.total) - 1) * 100) : 0;
                    const dayNames = ["Qui 19/03", "Sex 20/03", "Sab 21/03", "Dom 22/03"];
                    return (
                      <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                        <td className="py-2 pr-4 text-foreground font-medium">{dayNames[i]}</td>
                        <td className="py-2 pr-4 text-right text-foreground font-bold">{cd.total}</td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">{bd.total}</td>
                        <td className={`py-2 pr-4 text-right font-bold ${lift > 0 ? "text-emerald-400" : lift < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {lift > 0 ? "+" : ""}{lift}%
                        </td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">{cd.site}</td>
                        <td className="py-2 text-right text-muted-foreground">{cd.whatsapp}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leads by TV brand */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground/80 mb-3">Leads por Marca (TV), Campanha vs Baseline</h3>
            <div className="grid grid-cols-3 gap-3">
              {(["Chevrolet", "GWM", "VW"] as const).map((brand) => {
                const bt = leadsData.brandTotals[brand];
                if (!bt) return null;
                return (
                  <div key={brand} className="bg-background/50 rounded-lg p-3 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND_COLORS[brand] }} />
                      <span className="text-xs font-semibold text-foreground">{brand}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{bt.camp}</p>
                    <p className="text-xs text-muted-foreground">baseline: {bt.base}</p>
                    <p className={`text-xs font-bold mt-1 ${bt.lift > 0 ? "text-emerald-400" : bt.lift < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {bt.lift > 0 ? "+" : ""}{bt.lift}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- TV TAB (campaign selector) ----
function TVTab() {
  const [activeCampaign, setActiveCampaign] = useState<"carrera-days" | "gwm-mai-2026" | null>(null);

  if (activeCampaign === "carrera-days") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveCampaign(null)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>&#8592;</span> Voltar para campanhas
        </button>
        <CarreraDaysCampaignDetail />
      </div>
    );
  }

  if (activeCampaign === "gwm-mai-2026") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveCampaign(null)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>&#8592;</span> Voltar para campanhas
        </button>
        <GWMCampaignDetail />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-foreground">Campanhas de TV</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Selecione uma campanha para ver a analise detalhada de impacto no trafego do site.</p>
      </div>

      {/* Campaign cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Carrera Days Mar/2026 */}
        <button
          onClick={() => setActiveCampaign("carrera-days")}
          className="text-left bg-card border border-border hover:border-primary/40 rounded-xl p-5 transition-all group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Concluida</span>
          </div>
          <div className="text-sm font-bold text-foreground mb-1">Carrera Days</div>
          <div className="text-xs text-muted-foreground mb-3">19 a 22 de marco de 2026, Rede Globo</div>
          <div className="flex gap-4">
            <div>
              <div className="text-lg font-bold text-foreground">VW, Chevrolet, GWM</div>
              <div className="text-xs text-muted-foreground">marcas veiculadas</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary">4 dias</div>
              <div className="text-xs text-muted-foreground">de campanha</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-primary font-medium group-hover:underline">Ver analise completa &#8594;</div>
        </button>

        {/* GWM Mai/2026 */}
        <button
          onClick={() => setActiveCampaign("gwm-mai-2026")}
          className="text-left bg-card border border-border hover:border-emerald-500/40 rounded-xl p-5 transition-all group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Em andamento</span>
          </div>
          <div className="text-sm font-bold text-foreground mb-1">GWM, Maio 2026</div>
          <div className="text-xs text-muted-foreground mb-3">21 a 31 de maio de 2026, Rede Globo e GloboNews</div>
          <div className="flex gap-4">
            <div>
              <div className="text-lg font-bold text-emerald-400">171</div>
              <div className="text-xs text-muted-foreground">insercoes totais</div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">11 dias</div>
              <div className="text-xs text-muted-foreground">de campanha</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-emerald-400 font-medium group-hover:underline">Ver grade de veiculacao &#8594;</div>
        </button>
      </div>

      {/* Footer note */}
      <div className="bg-card/50 border border-border/50 rounded-xl p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Como funciona:</span> cada campanha exibe a grade de insercoes e, quando os dados de GA4 estao disponiveis, a analise de correlacao entre os horarios de veiculacao e o trafego do site (grafico hora a hora, janela de resposta pos-insercao, ranking de programas por impacto).
      </div>
    </div>
  );
}

// ---- MAIN DASHBOARD ----
export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("30days");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [tab, setTab] = useState<Tab>("overview");
  const [now, setNow] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { data: realtime } = trpc.analytics.realtimeUsers.useQuery(undefined, {
    refetchInterval: 30000,
  });

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">Carrera Novos</h1>
              <p className="text-xs text-muted-foreground">Analytics Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Realtime badge */}
            <div className="flex items-center gap-1.5 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-2 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-400">{realtime?.activeUsers ?? "-"}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">ativos agora</span>
            </div>
            <button
              onClick={() => setLocation("/bio")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs font-medium text-violet-400 hover:bg-violet-500/20 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Carrera BIO</span>
              <span className="sm:hidden">BIO</span>
            </button>
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-mono text-foreground/80">{formattedTime}</span>
              <span className="text-xs text-muted-foreground capitalize">{formattedDate}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-4 lg:py-6 space-y-4 lg:space-y-5">
        {/* Controls row */}
        <div className="flex flex-col gap-2">
          {/* Tabs - scrollable on mobile */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Period filter */}
          <div className="relative">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {(Object.keys(PERIOD_LABELS) as Exclude<Period, "custom">[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodSelect(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                  period === p
                    ? "bg-accent text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
            {/* Custom date button */}
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                period === "custom"
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Calendar className="w-3 h-3" />
              {periodLabel || "Personalizado"}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
            {showDatePicker && (
              <CustomDatePicker
                onApply={handleApplyCustomDate}
                onCancel={() => setShowDatePicker(false)}
              />
            )}
          </div>
        </div>

        {/* Tab description banner */}
        {TABS.find(t => t.id === tab)?.description && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card/50 border border-border/50 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 text-primary/60 mt-0.5 flex-shrink-0" />
            <span>{TABS.find(t => t.id === tab)?.description}</span>
          </div>
        )}

        {tab === "overview" && <OverviewTab period={period} customStart={customStart} customEnd={customEnd} />}
        {tab === "comparison" && <ComparisonTab period={period} customStart={customStart} customEnd={customEnd} />}
        {tab === "sections" && <SectionsTab period={period} customStart={customStart} customEnd={customEnd} />}
        {tab === "leads" && <LeadsTab period={period} customStart={customStart} customEnd={customEnd} />}
        {tab === "utms" && <UTMsTab period={period} customStart={customStart} customEnd={customEnd} />}
        {tab === "history" && <HistoryTab period={period} customStart={customStart} customEnd={customEnd} />}
        {tab === "tv" && <TVTab />}

        {tab === "urlmonitor" && <URLMonitorTab period={period} customStart={customStart} customEnd={customEnd} />}
        {tab === "attribution" && <AttributionTab />}
        {tab === "about" && <AboutTab />}
      </main>
    </div>
  );
}

// ---- ATTRIBUTION TAB ----
function AttributionTab() {
  const { data, isLoading } = trpc.analytics.attributionAnalysis.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSpinner />;
  if (!data) return <div className="text-muted-foreground text-sm p-8 text-center">Erro ao carregar dados de atribuicao.</div>;

  const severityColors: Record<string, string> = {
    critical: "bg-red-500/10 border-red-500/30 text-red-400",
    high: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    medium: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
    low: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  };
  const severityLabels: Record<string, string> = {
    critical: "CRITICO",
    high: "ALTO",
    medium: "MEDIO",
    low: "BAIXO",
  };
  const impactColors: Record<string, string> = {
    high: "text-red-400 bg-red-400/10",
    medium: "text-orange-400 bg-orange-400/10",
    low: "text-yellow-400 bg-yellow-400/10",
  };
  const priorityColors: Record<string, string> = {
    urgente: "text-red-400 bg-red-400/10 border-red-400/20",
    importante: "text-orange-400 bg-orange-400/10 border-orange-400/20",
    sugerido: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  };

  // Histrico completo para o grfico principal
  const fullHistoryChartData = (data.fullHistory || data.monthly).map(m => ({
    label: m.label,
    total: m.total,
    atribuido: m.total - m.semAtrib,
    semAtrib: m.semAtrib,
    direct: m.direct,
    unassigned: m.unassigned,
    pct: m.pct,
  }));

  const monthlyChartData = data.monthly.map(m => ({
    label: m.label,
    total: m.total,
    atribuido: m.total - m.semAtrib,
    semAtrib: m.semAtrib,
    direct: m.direct,
    unassigned: m.unassigned,
    pct: m.pct,
  }));

  const channelChartData = data.channels.slice(0, 8).map(c => ({
    name: SOURCE_LABELS[c.channel as keyof typeof SOURCE_LABELS] || c.channel,
    sessions: c.sessions,
    pct: c.pct,
  }));

  const deviceData = [
    { name: "Mobile", unassigned: data.deviceBreakdown.find(d => d.device === "mobile" && d.channel === "Unassigned")?.sessions || 0, direct: data.deviceBreakdown.find(d => d.device === "mobile" && d.channel === "Direct")?.sessions || 0 },
    { name: "Desktop", unassigned: data.deviceBreakdown.find(d => d.device === "desktop" && d.channel === "Unassigned")?.sessions || 0, direct: data.deviceBreakdown.find(d => d.device === "desktop" && d.channel === "Direct")?.sessions || 0 },
    { name: "Tablet", unassigned: data.deviceBreakdown.find(d => d.device === "tablet" && d.channel === "Unassigned")?.sessions || 0, direct: data.deviceBreakdown.find(d => d.device === "tablet" && d.channel === "Direct")?.sessions || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Alert banner */}
      <div className={`border rounded-xl p-4 ${severityColors[data.diagnosis.severity]}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold">NIVEL DE RISCO: {severityLabels[data.diagnosis.severity]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-current/10 font-mono">{data.semAtribPct}% sem atribuicao</span>
            </div>
            <p className="text-xs opacity-80">{data.diagnosis.mainCause}</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Activity className="w-4 h-4 text-primary" />}
          label="Total de Sessoes (90 dias)"
          value={data.totalSessions.toLocaleString("pt-BR")}
          color="bg-primary/10"
        />
        <MetricCard
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          label="Sem Atribuicao (Unassigned)"
          value={data.unassignedSessions.toLocaleString("pt-BR")}
          sub={`${data.channels.find(c => c.channel === "Unassigned")?.pct || 0}% do total`}
          color="bg-red-400/10"
        />
        <MetricCard
          icon={<Globe className="w-4 h-4 text-orange-400" />}
          label="Direto (Direct / none)"
          value={data.directSessions.toLocaleString("pt-BR")}
          sub={`${data.channels.find(c => c.channel === "Direct")?.pct || 0}% do total`}
          color="bg-orange-400/10"
        />
        <MetricCard
          icon={<Share2 className="w-4 h-4 text-emerald-400" />}
          label="Total Sem Atribuicao"
          value={data.semAtribTotal.toLocaleString("pt-BR")}
          sub={`${data.semAtribPct}% do total`}
          color="bg-emerald-400/10"
        />
      </div>

      {/* Histrico completo - grfico largo */}
      <ChartCard
        title="Historico Completo de Atribuicao (desde Mar/25)"
        description="Sessoes com atribuicao (verde) vs. sem atribuicao (vermelho) por mes. Dois eventos de degradacao identificados: Out/25 e Mar/26."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={fullHistoryChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={55} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => [v.toLocaleString("pt-BR"), name === "atribuido" ? "Com atribuicao" : "Sem atribuicao"]}
              labelFormatter={(label: string) => {
                const m = fullHistoryChartData.find(d => d.label === label);
                return m ? `${label} - ${m.pct}% sem atrib.` : label;
              }}
            />
            <Legend formatter={(v: string) => v === "atribuido" ? "Com atribuicao" : "Sem atribuicao"} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="atribuido" stackId="a" fill="#22c55e" radius={[0,0,0,0]} name="atribuido" />
            <Bar dataKey="semAtrib" stackId="a" fill="#ef4444" radius={[3,3,0,0]} name="semAtrib" />
          </BarChart>
        </ResponsiveContainer>
        {/* Anotacoes dos dois eventos */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-orange-400">EVENTO 1: Out/Nov/Dez 2025</span>
              <span className="text-xs text-orange-400/70">66% a 76% sem atrib.</span>
            </div>
            <p className="text-xs text-muted-foreground">Primeiro episodio de degradacao. Unassigned subiu de 0.8% (Ago/25) para 42% (Out/25) e 64% (Nov/25). Em Jan/26 voltou ao normal (2.4%), indicando que a causa foi corrigida ou encerrada.</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-red-400">EVENTO 2: Mar/26 ate hoje</span>
              <span className="text-xs text-red-400/70">53% a 78% sem atrib. - NAO RESOLVIDO</span>
            </div>
            <p className="text-xs text-muted-foreground">Segundo episodio, ainda ativo. Unassigned voltou a explodir em Mar/26 (44%) e piorou progressivamente ate 71% em Abr e Mai/26. Diferente do primeiro evento, nao houve recuperacao.</p>
          </div>
        </div>
        {/* Tabela historica */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Mes</th>
                <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Total</th>
                <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Unassigned</th>
                <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Direct</th>
                <th className="text-right py-1.5 text-muted-foreground font-medium">% Sem Atrib.</th>
              </tr>
            </thead>
            <tbody>
              {(data.fullHistory || data.monthly).map(m => (
                <tr key={m.month} className={`border-b border-border/30 ${
                  m.pct > 60 ? "bg-red-500/5" : m.pct > 30 ? "bg-orange-500/5" : ""
                }`}>
                  <td className="py-1.5 pr-3 font-medium text-foreground">{m.label}</td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">{m.total.toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 pr-3 text-right text-red-400">{m.unassigned.toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 pr-3 text-right text-orange-400">{m.direct.toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 text-right">
                    <span className={`font-bold ${
                      m.pct > 60 ? "text-red-400" : m.pct > 30 ? "text-orange-400" : "text-emerald-400"
                    }`}>{m.pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Trend chart + channel breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Ultimos 6 Meses - Detalhe"
          description="Sessoes com atribuicao (verde) vs. sem atribuicao (vermelho). O crescimento do vermelho indica piora no rastreamento."
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={50} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [v.toLocaleString("pt-BR"), name === "atribuido" ? "Com atribuicao" : "Sem atribuicao"]} />
              <Legend formatter={(v: string) => v === "atribuido" ? "Com atribuicao" : "Sem atribuicao"} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="atribuido" stackId="a" fill="#22c55e" radius={[0,0,0,0]} name="atribuido" />
              <Bar dataKey="semAtrib" stackId="a" fill="#ef4444" radius={[3,3,0,0]} name="semAtrib" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {data.monthly.slice(-3).map(m => (
              <div key={m.month} className="bg-muted/20 rounded-lg p-2">
                <div className="text-xs text-muted-foreground">{m.label}</div>
                <div className={`text-sm font-bold ${m.pct > 60 ? "text-red-400" : m.pct > 30 ? "text-orange-400" : "text-emerald-400"}`}>{m.pct}%</div>
                <div className="text-xs text-muted-foreground">sem atrib.</div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Distribuicao por Canal (90 dias)"
          description="Todos os canais. Unassigned e Direct sao os que precisam de correcao."
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={channelChartData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={110} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Sessoes"]} />
              {channelChartData.map((entry, i) => null)}
              <Bar dataKey="sessions" radius={[0,3,3,0]}>
                {channelChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.name === "Nao atribuido" ? "#ef4444" : entry.name === "Direto" ? "#f97316" : CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {data.channels.slice(0, 5).map(c => (
              <div key={c.channel} className="flex items-center justify-between text-xs">
                <span className={`font-medium ${c.channel === "Unassigned" ? "text-red-400" : c.channel === "Direct" ? "text-orange-400" : "text-muted-foreground"}`}>
                  {SOURCE_LABELS[c.channel as keyof typeof SOURCE_LABELS] || c.channel}
                </span>
                <span className="text-muted-foreground">{c.sessions.toLocaleString("pt-BR")} ({c.pct}%)</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Device breakdown + Source/Medium detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Sem Atribuicao por Dispositivo"
          description="Mobile representa a maior parte do trafego sem atribuicao, tipico de campanhas em apps."
        >
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={deviceData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={50} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [v.toLocaleString("pt-BR"), name === "unassigned" ? "Unassigned" : "Direct"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => v === "unassigned" ? "Unassigned" : "Direct"} />
              <Bar dataKey="unassigned" fill="#ef4444" radius={[2,2,0,0]} name="unassigned" />
              <Bar dataKey="direct" fill="#f97316" radius={[2,2,0,0]} name="direct" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Unassigned: Source / Medium"
          description="De onde vem o trafego classificado como Unassigned. (not set)/(not set) = sem nenhum UTM."
        >
          <div className="space-y-2 mt-1">
            {data.unassignedDetail.slice(0, 8).map((item, i) => {
              const maxSess = data.unassignedDetail[0]?.sessions || 1;
              const barW = Math.max(4, (item.sessions / maxSess) * 100);
              const isNotSet = item.source === "(not set)" && item.medium === "(not set)";
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className={`font-mono truncate max-w-[200px] ${isNotSet ? "text-red-400 font-semibold" : "text-muted-foreground"}`}>
                      {item.source === "(not set)" ? "(sem source)" : item.source.length > 30 ? item.source.slice(0, 30) + "..." : item.source}
                      {" / "}
                      {item.medium === "(not set)" ? "(sem medium)" : item.medium}
                    </span>
                    <span className="text-muted-foreground ml-2 flex-shrink-0">{item.sessions.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/20">
                    <div className={`h-1.5 rounded-full ${isNotSet ? "bg-red-500" : "bg-slate-500"}`} style={{ width: `${barW}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      {/* Diagnosis: causes */}
      <ChartCard title="Diagnostico: Causas Identificadas" description="Analise das principais razoes para o alto volume de trafego sem atribuicao.">
        <div className="space-y-3 mt-1">
          {data.diagnosis.causes.map((cause, i) => (
            <div key={i} className="border border-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-foreground">{cause.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${impactColors[cause.impact]}`}>
                  {cause.impact === "high" ? "Alto impacto" : cause.impact === "medium" ? "Medio impacto" : "Baixo impacto"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{cause.description}</p>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Recommendations */}
      <ChartCard title="Plano de Acao: Recomendacoes" description="Acoes para corrigir o problema antes da campanha de midia paga. Ordenadas por prioridade.">
        <div className="space-y-3 mt-1">
          {data.diagnosis.recommendations.map((rec, i) => (
            <div key={i} className="border border-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-foreground">{i + 1}. {rec.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 font-medium uppercase ${priorityColors[rec.priority]}`}>
                  {rec.priority}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Painel Server-Side Attribution */}
      <ServerSideAttributionPanel />

      {/* Landing pages Direct */}
      <ChartCard title="Paginas de Entrada - Trafego Direto" description="Quais paginas recebem mais trafego classificado como Direct. Paginas internas com alto volume de Direct podem indicar redirecionamentos internos sem UTM.">
        <div className="space-y-2 mt-1">
          {data.topLandingDirect.slice(0, 10).map((item, i) => {
            const maxSess = data.topLandingDirect[0]?.sessions || 1;
            const barW = Math.max(4, (item.sessions / maxSess) * 100);
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="font-mono text-muted-foreground truncate max-w-[280px]">{item.page === "(not set)" ? "(pagina nao identificada)" : item.page}</span>
                  <span className="text-muted-foreground ml-2 flex-shrink-0">{item.sessions.toLocaleString("pt-BR")}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/20">
                  <div className="h-1.5 rounded-full bg-orange-500/60" style={{ width: `${barW}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}

// ============================================================
// Painel de Origem Real via GTM Server-Side
// ============================================================
function ServerSideAttributionPanel() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = trpc.analytics.serverAttributionData.useQuery(
    { days },
    { staleTime: 2 * 60 * 1000 }
  );

  const CHANNEL_COLORS: Record<string, string> = {
    "Paid Search": "#3b82f6",
    "Organic Search": "#22c55e",
    "Paid Social": "#a855f7",
    "Organic Social": "#f97316",
    "Direct": "#94a3b8",
    "Referral": "#06b6d4",
    "Display": "#eab308",
    "Email": "#ec4899",
    "Affiliates": "#84cc16",
    "Organic Video": "#14b8a6",
    "Other": "#6b7280",
  };

  const hasData = data && data.totalHits > 0;

  return (
    <div className="space-y-4">
      {/* Header do painel */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-semibold text-emerald-400">Origem Real, 100% do Trafego (Server-Side)</h3>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              Dados capturados diretamente no GTM Server-side antes do filtro de consentimento do GA4.
              Representa 100% das visitas, incluindo quem nao aceitou cookies.
              Nenhum dado pessoal e armazenado, apenas source/medium/campaign/pagina de forma agregada.
            </p>
          </div>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
          >
            <option value={7}>Ultimos 7 dias</option>
            <option value={14}>Ultimos 14 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={60}>Ultimos 60 dias</option>
            <option value={90}>Ultimos 90 dias</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground text-sm">Carregando dados server-side...</div>
      )}

      {!isLoading && !hasData && (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <div className="text-2xl">📡</div>
          <p className="text-sm font-medium text-foreground">Aguardando dados do GTM Server-side</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            O endpoint esta pronto e funcionando. Assim que a tag for criada no GTM Server container
            e publicada, os dados comecarao a aparecer aqui em tempo real.
          </p>
          <div className="mt-4 rounded-lg bg-muted/30 border border-border p-3 text-left max-w-lg mx-auto">
            <p className="text-xs font-mono text-muted-foreground mb-1">Endpoint para configurar no GTM Server:</p>
            <p className="text-xs font-mono text-emerald-400 break-all">
              {window.location.origin}/api/attribution-collect
            </p>
          </div>
          {data?.dataAvailableFrom && (
            <p className="text-xs text-muted-foreground">
              Dados disponiveis a partir de: {data.dataAvailableFrom}
            </p>
          )}
        </div>
      )}

      {!isLoading && hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Distribuicao por canal */}
          <ChartCard
            title={`Distribuicao por Canal, ${data.totalHits.toLocaleString("pt-BR")} hits`}
            description="Classificacao de todos os hits recebidos pelo server container no periodo"
          >
            <div className="space-y-2 mt-2">
              {data.byChannel.map((ch, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: CHANNEL_COLORS[ch.channel] || "#6b7280" }}
                      />
                      <span className="text-foreground font-medium">{ch.channel}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">{ch.source}/{ch.medium}</span>
                    </span>
                    <span className="text-muted-foreground ml-2 flex-shrink-0">
                      {ch.sessions.toLocaleString("pt-BR")} ({ch.pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/20">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${ch.pct}%`, background: CHANNEL_COLORS[ch.channel] || "#6b7280" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Top campanhas */}
          <ChartCard
            title="Top Campanhas (utm_campaign)"
            description="Campanhas com mais hits no periodo"
          >
            {data.topCampaigns.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">Nenhuma campanha com UTM detectada ainda.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {data.topCampaigns.slice(0, 10).map((c, i) => {
                  const maxC = data.topCampaigns[0]?.sessions || 1;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-foreground truncate max-w-[220px]">{c.campaign}</span>
                        <span className="text-muted-foreground ml-2 flex-shrink-0">{c.sessions.toLocaleString("pt-BR")}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/20">
                        <div className="h-1.5 rounded-full bg-blue-500/60" style={{ width: `${Math.max(4, (c.sessions / maxC) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>

          {/* Top landing pages */}
          <ChartCard
            title="Top Paginas de Entrada (Server-Side)"
            description="Paginas que recebem mais trafego, independente de consentimento"
          >
            <div className="space-y-2 mt-2">
              {data.topLandingPages.slice(0, 10).map((p, i) => {
                const maxP = data.topLandingPages[0]?.sessions || 1;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-mono text-muted-foreground truncate max-w-[220px]">{p.page}</span>
                      <span className="text-muted-foreground ml-2 flex-shrink-0">{p.sessions.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/20">
                      <div className="h-1.5 rounded-full bg-emerald-500/60" style={{ width: `${Math.max(4, (p.sessions / maxP) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          {/* Tendencia diaria */}
          <ChartCard
            title="Tendencia Diaria (Server-Side)"
            description="Volume de hits capturados por dia no periodo"
          >
            <div className="space-y-1 mt-2">
              {data.byDay.slice(-14).map((d, i) => {
                const maxDay = Math.max(...data.byDay.map(x => x.total), 1);
                const topCh = d.byChannel[0];
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-20 flex-shrink-0">{d.date}</span>
                    <div className="flex-1 h-4 bg-muted/20 rounded-full overflow-hidden">
                      <div
                        className="h-4 rounded-full bg-emerald-500/60"
                        style={{ width: `${Math.max(2, (d.total / maxDay) * 100)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-16 text-right flex-shrink-0">
                      {d.total.toLocaleString("pt-BR")}
                    </span>
                    {topCh && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: (CHANNEL_COLORS[topCh.channel] || "#6b7280") + "22",
                          color: CHANNEL_COLORS[topCh.channel] || "#6b7280",
                        }}
                      >
                        {topCh.channel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
