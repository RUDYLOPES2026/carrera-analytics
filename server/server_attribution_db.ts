import type { D1Database } from "./_core/workerTypes";

export interface ChannelSummary {
  channel: string;
  source: string;
  medium: string;
  sessions: number;
  pct: number;
}

export interface DaySummary {
  date: string;
  total: number;
  byChannel: ChannelSummary[];
  topSources: { source: string; medium: string; sessions: number }[];
}

export interface ServerAttributionResult {
  totalHits: number;
  byChannel: ChannelSummary[];
  byDay: DaySummary[];
  topLandingPages: { page: string; sessions: number }[];
  topCampaigns: { campaign: string; sessions: number }[];
  dataAvailableFrom: string | null;
  lastUpdated: string;
}

interface AttributionRow {
  eventDate: string;
  source: string;
  medium: string;
  campaign: string;
  landingPage: string;
  hitCount: number;
}

function classifyChannel(source: string, medium: string): string {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  if (s === "(direct)" || s === "" || m === "(none)" || m === "") return "Direct";
  if (m === "organic" && (s === "google" || s === "bing" || s === "yahoo" || s === "duckduckgo")) return "Organic Search";
  if (m === "cpc" || m === "ppc" || m === "paid search" || m === "paidsearch") return "Paid Search";
  if (m === "email" || m === "e-mail") return "Email";
  if (m === "social" || m === "social-network" || s === "facebook" || s === "instagram" || s === "linkedin" || s === "twitter" || s === "tiktok") return "Organic Social";
  if (m === "paid social" || m === "paidsocial" || m === "cpm") return "Paid Social";
  if (m === "display" || m === "banner") return "Display";
  if (m === "referral") return "Referral";
  if (m === "affiliate") return "Affiliates";
  if (m === "video" || s === "youtube") return "Organic Video";
  return "Other";
}

export async function getServerAttributionData(db: D1Database | null, days: number = 30): Promise<ServerAttributionResult> {
  const lastUpdated = new Date().toISOString();

  if (!db) {
    return {
      totalHits: 0,
      byChannel: [],
      byDay: [],
      topLandingPages: [],
      topCampaigns: [],
      dataAvailableFrom: null,
      lastUpdated,
    };
  }

  // Calcular data de inicio
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);

  // Buscar todos os eventos no periodo
  const { results: events } = await db
    .prepare(
      "SELECT eventDate, source, medium, campaign, landingPage, hitCount FROM serverAttributionEvents WHERE eventDate >= ? LIMIT 100000"
    )
    .bind(startDateStr)
    .all<AttributionRow>();

  const getOldestDate = async (): Promise<string | null> => {
    const oldest = await db
      .prepare("SELECT eventDate FROM serverAttributionEvents ORDER BY eventDate ASC LIMIT 1")
      .first<string>("eventDate");
    return oldest ?? null;
  };

  if (events.length === 0) {
    return {
      totalHits: 0,
      byChannel: [],
      byDay: [],
      topLandingPages: [],
      topCampaigns: [],
      dataAvailableFrom: await getOldestDate(),
      lastUpdated,
    };
  }

  // Agregar por canal
  const channelMap: Record<string, { source: string; medium: string; sessions: number }> = {};
  const dayMap: Record<string, Record<string, { source: string; medium: string; sessions: number }>> = {};
  const pageMap: Record<string, number> = {};
  const campaignMap: Record<string, number> = {};
  let totalHits = 0;

  for (const ev of events) {
    const hits = ev.hitCount || 1;
    totalHits += hits;
    const channel = classifyChannel(ev.source, ev.medium);
    const key = `${ev.source}|||${ev.medium}`;

    // Por canal global
    if (!channelMap[channel]) channelMap[channel] = { source: ev.source, medium: ev.medium, sessions: 0 };
    channelMap[channel].sessions += hits;

    // Por dia
    if (!dayMap[ev.eventDate]) dayMap[ev.eventDate] = {};
    if (!dayMap[ev.eventDate][key]) dayMap[ev.eventDate][key] = { source: ev.source, medium: ev.medium, sessions: 0 };
    dayMap[ev.eventDate][key].sessions += hits;

    // Landing pages
    const page = ev.landingPage || "/";
    pageMap[page] = (pageMap[page] || 0) + hits;

    // Campanhas
    if (ev.campaign && ev.campaign !== "(not set)" && ev.campaign !== "") {
      campaignMap[ev.campaign] = (campaignMap[ev.campaign] || 0) + hits;
    }
  }

  // Montar byChannel com percentual
  const byChannel: ChannelSummary[] = Object.entries(channelMap)
    .map(([channel, d]) => ({
      channel,
      source: d.source,
      medium: d.medium,
      sessions: d.sessions,
      pct: totalHits > 0 ? Math.round((d.sessions / totalHits) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // Montar byDay
  const byDay: DaySummary[] = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sources]) => {
      const dayTotal = Object.values(sources).reduce((s, v) => s + v.sessions, 0);
      const channelAgg: Record<string, ChannelSummary> = {};
      for (const [, d] of Object.entries(sources)) {
        const ch = classifyChannel(d.source, d.medium);
        if (!channelAgg[ch]) channelAgg[ch] = { channel: ch, source: d.source, medium: d.medium, sessions: 0, pct: 0 };
        channelAgg[ch].sessions += d.sessions;
      }
      const byChannelDay = Object.values(channelAgg)
        .map(c => ({ ...c, pct: dayTotal > 0 ? Math.round((c.sessions / dayTotal) * 1000) / 10 : 0 }))
        .sort((a, b) => b.sessions - a.sessions);
      const topSources = Object.entries(sources)
        .map(([, d]) => ({ source: d.source, medium: d.medium, sessions: d.sessions }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 5);
      return { date, total: dayTotal, byChannel: byChannelDay, topSources };
    });

  const topLandingPages = Object.entries(pageMap)
    .map(([page, sessions]) => ({ page, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  const topCampaigns = Object.entries(campaignMap)
    .map(([campaign, sessions]) => ({ campaign, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  return {
    totalHits,
    byChannel,
    byDay,
    topLandingPages,
    topCampaigns,
    dataAvailableFrom: await getOldestDate(),
    lastUpdated,
  };
}
