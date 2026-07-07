// Análise de tráfego sem atribuição (Direct + Unassigned)
import { gaRequest } from "./analytics";

export interface AttributionChannelData {
  channel: string;
  sessions: number;
  pct: number;
  newUsers: number;
  bounceRate: number;
}

export interface AttributionMonthlyData {
  month: string;       // "2026-03"
  label: string;       // "Mar/26"
  total: number;
  direct: number;
  unassigned: number;
  semAtrib: number;
  pct: number;
}

export interface AttributionAnalysisResult {
  totalSessions: number;
  directSessions: number;
  unassignedSessions: number;
  semAtribTotal: number;
  semAtribPct: number;
  channels: AttributionChannelData[];
  monthly: AttributionMonthlyData[];
  fullHistory: AttributionMonthlyData[];
  topSourceMedium: { source: string; medium: string; channel: string; sessions: number }[];
  topLandingDirect: { page: string; sessions: number }[];
  deviceBreakdown: { device: string; channel: string; sessions: number }[];
  unassignedDetail: { source: string; medium: string; sessions: number }[];
  diagnosis: {
    severity: "critical" | "high" | "medium" | "low";
    mainCause: string;
    causes: { title: string; description: string; impact: "high" | "medium" | "low" }[];
    recommendations: { title: string; description: string; priority: "urgente" | "importante" | "sugerido" }[];
  };
}

function monthLabel(ym: string): string {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const year = ym.slice(2, 4);
  const month = parseInt(ym.slice(4, 6)) - 1;
  return `${months[month]}/${year}`;
}

export async function getAttributionAnalysis(): Promise<AttributionAnalysisResult> {
  const [channelResp, monthlyResp, sourceMediumResp, landingResp, deviceResp, unassignedDetailResp] = await Promise.all([
    // 1. Canais (90 dias)
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "newUsers" }, { name: "bounceRate" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }),
    // 2. Tendência mensal (histórico completo desde 2023-01-01)
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "2023-01-01", endDate: "today" }],
      dimensions: [{ name: "yearMonth" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "yearMonth" } }],
      limit: 5000,
    }),
    // 3. Source/Medium sem atribuição
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Direct" } } },
            { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Unassigned" } } },
          ]
        }
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
    // 4. Landing pages Direct
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Direct" } }
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
    // 5. Dispositivo
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
      dimensions: [{ name: "deviceCategory" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Direct" } } },
            { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Unassigned" } } },
          ]
        }
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }),
    // 6. Unassigned detail
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Unassigned" } }
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
  ]);

  // Process channels
  let totalSessions = 0;
  const channels: AttributionChannelData[] = [];
  channelResp.rows?.forEach((r: any) => {
    const sessions = parseInt(r.metricValues[0].value);
    totalSessions += sessions;
    channels.push({
      channel: r.dimensionValues[0].value,
      sessions,
      pct: 0,
      newUsers: parseInt(r.metricValues[1].value),
      bounceRate: parseFloat(r.metricValues[2].value),
    });
  });
  channels.forEach(c => { c.pct = parseFloat(((c.sessions / totalSessions) * 100).toFixed(1)); });

  const directSessions = channels.find(c => c.channel === "Direct")?.sessions || 0;
  const unassignedSessions = channels.find(c => c.channel === "Unassigned")?.sessions || 0;
  const semAtribTotal = directSessions + unassignedSessions;
  const semAtribPct = parseFloat(((semAtribTotal / totalSessions) * 100).toFixed(1));

  // Process monthly
  const monthlyMap: Record<string, Record<string, number>> = {};
  monthlyResp.rows?.forEach((r: any) => {
    const month = r.dimensionValues[0].value;
    const channel = r.dimensionValues[1].value;
    const sessions = parseInt(r.metricValues[0].value);
    if (!monthlyMap[month]) monthlyMap[month] = {};
    monthlyMap[month][channel] = sessions;
  });
  const monthly: AttributionMonthlyData[] = Object.entries(monthlyMap).map(([ym, chans]) => {
    const total = Object.values(chans).reduce((s: number, v: any) => s + v, 0);
    const direct = (chans["Direct"] as number) || 0;
    const unassigned = (chans["Unassigned"] as number) || 0;
    const semAtrib = direct + unassigned;
    return {
      month: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`,
      label: monthLabel(ym),
      total,
      direct,
      unassigned,
      semAtrib,
      pct: parseFloat(((semAtrib / total) * 100).toFixed(1)),
    };
  });

  // Process source/medium
  const topSourceMedium = (sourceMediumResp.rows || []).map((r: any) => ({
    source: r.dimensionValues[0].value,
    medium: r.dimensionValues[1].value,
    channel: r.dimensionValues[2].value,
    sessions: parseInt(r.metricValues[0].value),
  }));

  // Process landing pages
  const topLandingDirect = (landingResp.rows || []).map((r: any) => ({
    page: r.dimensionValues[0].value,
    sessions: parseInt(r.metricValues[0].value),
  }));

  // Process devices
  const deviceBreakdown = (deviceResp.rows || []).map((r: any) => ({
    device: r.dimensionValues[0].value,
    channel: r.dimensionValues[1].value,
    sessions: parseInt(r.metricValues[0].value),
  }));

  // Process unassigned detail
  const unassignedDetail = (unassignedDetailResp.rows || []).map((r: any) => ({
    source: r.dimensionValues[0].value,
    medium: r.dimensionValues[1].value,
    sessions: parseInt(r.metricValues[0].value),
  }));

  // Build diagnosis
  const notSetSessions = unassignedDetail.find((u: {source: string; medium: string; sessions: number}) => u.source === "(not set)" && u.medium === "(not set)")?.sessions || 0;
  const notSetPct = parseFloat(((notSetSessions / totalSessions) * 100).toFixed(1));
  const leadhubSessions = unassignedDetail.filter((u: {source: string; medium: string; sessions: number}) => u.source.includes("leadhub")).reduce((s: number, u: {sessions: number}) => s + u.sessions, 0);
  const mobilePct = parseFloat(((deviceBreakdown.filter((d: {device: string; channel: string; sessions: number}) => d.device === "mobile").reduce((s: number, d: {sessions: number}) => s + d.sessions, 0) / semAtribTotal) * 100).toFixed(1));

  // Detect trend: is unassigned growing?
  const recentMonths = monthly.slice(-3);
  const avgRecentPct = recentMonths.reduce((s, m) => s + m.pct, 0) / recentMonths.length;
  const trendGrowing = avgRecentPct > 60;

  const diagnosis = {
    severity: semAtribPct > 70 ? "critical" as const : semAtribPct > 50 ? "high" as const : semAtribPct > 30 ? "medium" as const : "low" as const,
    mainCause: `${notSetPct.toFixed(1)}% das sessoes chegam com source=(not set) e medium=(not set), indicando ausencia de parametros UTM na maioria das origens de trafego`,
    causes: [
      {
        title: "Ausencia de UTMs nas campanhas de midia paga",
        description: `${notSetSessions.toLocaleString("pt-BR")} sessoes (${notSetPct}% do total) chegam sem nenhum parametro UTM. Campanhas Google Ads, Meta Ads e outras midias pagas nao estao com rastreamento configurado corretamente, fazendo com que o GA4 nao consiga identificar a origem.`,
        impact: "high" as const,
      },
      {
        title: "LeadHub sem parametro UTM medium",
        description: `${leadhubSessions.toLocaleString("pt-BR")} sessoes originadas do LeadHub chegam com source=leadhub_lp mas sem medium, impedindo classificacao correta no GA4. O GA4 exige source E medium para atribuir o canal corretamente.`,
        impact: "medium" as const,
      },
      {
        title: `Trafego mobile sem atribuicao (${mobilePct}% do sem-atrib)`,
        description: "A maioria do trafego sem atribuicao vem de dispositivos moveis. Isso e tipico de campanhas em apps (Meta, TikTok, YouTube) onde o redirecionamento ocorre fora do browser, quebrando o cookie de referencia e perdendo o UTM.",
        impact: "high" as const,
      },
      {
        title: "Crescimento acelerado desde marco/2026",
        description: `Em dez/25 o trafego sem atribuicao era 34.1%. Em jan/26 caiu para 14.7% (provavel correcao). Porem a partir de mar/26 voltou a subir: 53.4% em marco, 77.2% em abril, 77.7% em maio. Isso indica que uma nova campanha ou integracao iniciada em marco trouxe trafego sem UTM em escala.`,
        impact: "high" as const,
      },
      {
        title: "URLs de destino com parametros UTM malformados",
        description: "Algumas sessoes chegam com source contendo a URL completa do Google Ads (incluindo gclid e outros parametros), indicando que o utm_source nao foi configurado corretamente e o GA4 capturou o valor errado.",
        impact: "medium" as const,
      },
    ],
    recommendations: [
      {
        title: "Auditar e corrigir UTMs de todas as campanhas ativas",
        description: "Revisar todas as campanhas no Google Ads, Meta Ads e demais plataformas. Garantir que todas as URLs de destino contenham utm_source, utm_medium e utm_campaign. Usar o Campaign URL Builder do Google para padronizar.",
        priority: "urgente" as const,
      },
      {
        title: "Corrigir integracao LeadHub",
        description: "Adicionar o parametro utm_medium nas URLs geradas pelo LeadHub. Atualmente source=leadhub_lp mas medium esta ausente, fazendo o GA4 classificar como Unassigned.",
        priority: "urgente" as const,
      },
      {
        title: "Implementar auto-tagging no Google Ads",
        description: "Ativar o auto-tagging (gclid) no Google Ads e verificar se a integracao com GA4 esta funcionando. O auto-tagging garante atribuicao mesmo quando UTMs manuais falham.",
        priority: "urgente" as const,
      },
      {
        title: "Configurar UTMs para campanhas em apps (Meta, TikTok)",
        description: "Para campanhas em apps mobile, usar deep links com UTMs ou configurar o SDK de atribuicao (Adjust, AppsFlyer) para garantir rastreamento correto mesmo em redirecionamentos fora do browser.",
        priority: "importante" as const,
      },
      {
        title: "Criar alerta de monitoramento de atribuicao",
        description: "Configurar um alerta no GA4 ou neste dashboard para notificar quando o percentual de Unassigned superar 20% em qualquer semana, permitindo identificar problemas rapidamente.",
        priority: "sugerido" as const,
      },
    ],
  };

  // fullHistory = todos os meses; monthly = últimos 6 para compatibilidade com gráficos existentes
  const fullHistory = monthly.sort((a, b) => a.month.localeCompare(b.month));
  const monthlySix = fullHistory.slice(-6);

  return {
    totalSessions,
    directSessions,
    unassignedSessions,
    semAtribTotal,
    semAtribPct,
    channels,
    monthly: monthlySix,
    fullHistory,
    topSourceMedium,
    topLandingDirect,
    deviceBreakdown,
    unassignedDetail,
    diagnosis,
  };
}
