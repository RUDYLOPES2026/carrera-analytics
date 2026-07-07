import { ENV } from "./_core/env";
import { getAccessToken } from "./_core/googleAuth";

export async function gaRequest(endpoint: string, body: object, propertyId?: string): Promise<any> {
  const token = await getAccessToken();
  const pid = propertyId ?? ENV.gaPropertyId;
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GA API error ${response.status}: ${error}`);
  }
  return response.json();
}

function getDateRange(period: string, customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
  // If custom dates are provided (YYYY-MM-DD format), use them directly
  if (period === "custom" && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }
  // Use GA's built-in relative date strings to avoid timezone issues between
  // the server (UTC) and the GA property timezone (America/Sao_Paulo)
  switch (period) {
    case "today":
      return { startDate: "today", endDate: "today" };
    case "yesterday":
      return { startDate: "yesterday", endDate: "yesterday" };
    case "7days":
      return { startDate: "6daysAgo", endDate: "today" };
    case "15days":
      return { startDate: "14daysAgo", endDate: "today" };
    case "90days":
      return { startDate: "89daysAgo", endDate: "today" };
    case "30days":
    default:
      return { startDate: "29daysAgo", endDate: "today" };
  }
}

// Real-time active users
export async function getRealtimeUsers(): Promise<{ activeUsers: number; activeUsersByMinute: { minute: string; users: number }[] }> {
  // Get by minute breakdown (the totals field is unreliable for realtime reports without dimensions)
  const minuteData = await gaRequest(":runRealtimeReport", {
    dimensions: [{ name: "minutesAgo" }],
    metrics: [{ name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "minutesAgo" } }],
  });
  
  const activeUsersByMinute = (minuteData.rows || []).map((row: any) => ({
    minute: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value),
  })).slice(0, 30);

  // Sum users from the last 30 minutes as the active users count
  // (GA's totals field returns 0 for realtime reports without dimensions)
  const activeUsers = activeUsersByMinute.reduce((sum: number, m: { users: number }) => sum + m.users, 0);

  return { activeUsers, activeUsersByMinute };
}

// Sessions per day
export async function getSessionsByDay(period: string, customStart?: string, customEnd?: string): Promise<{ date: string; sessions: number; users: number }[]> {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  return (data.rows || []).map((row: any) => {
    const raw = row.dimensionValues[0].value; // YYYYMMDD
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return {
      date,
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    };
  });
}

// Sessions per hour — adaptive:
//   period="today"  → raw hourly counts for today (00h-23h)
//   any other period → average sessions per hour across all days in the period
export async function getSessionsByHour(
  period: string = "today",
  customStart?: string,
  customEnd?: string
): Promise<{ hour: string; sessions: number; isAverage: boolean }[]> {
  // Use dateHour dimension which returns YYYYMMDDHH in the property's timezone (America/Sao_Paulo)
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "dateHour" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "dateHour" } }],
  });

  // Aggregate by hour slot; also track distinct days for averaging
  const hourMap: Record<string, number> = {};
  const daySet = new Set<string>();
  (data.rows || []).forEach((row: any) => {
    const dateHour: string = row.dimensionValues[0].value; // e.g. "2026031907"
    const hour = dateHour.slice(-2); // "07"
    const day = dateHour.slice(0, 8); // "20260319"
    hourMap[hour] = (hourMap[hour] || 0) + parseInt(row.metricValues[0].value);
    daySet.add(day);
  });

  const isAverage = period !== "today";
  const numDays = Math.max(daySet.size, 1);

  // Return all 24 hours in order (00-23)
  return Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    const total = hourMap[h] || 0;
    return {
      hour: `${h}:00`,
      sessions: isAverage ? Math.round(total / numDays) : total,
      isAverage,
    };
  });
}

// Traffic sources
export async function getTrafficSources(period: string, customStart?: string, customEnd?: string): Promise<{ source: string; sessions: number; percentage: number }[]> {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "sessionDefaultChannelGrouping" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  const rows = data.rows || [];
  const total = rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);

  return rows.map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return {
      source: row.dimensionValues[0].value,
      sessions,
      percentage: total > 0 ? Math.round((sessions / total) * 100) : 0,
    };
  });
}

// Device distribution
export async function getDeviceDistribution(period: string, customStart?: string, customEnd?: string): Promise<{ device: string; sessions: number; percentage: number }[]> {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  const rows = data.rows || [];
  const total = rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);

  return rows.map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return {
      device: row.dimensionValues[0].value,
      sessions,
      percentage: total > 0 ? Math.round((sessions / total) * 100) : 0,
    };
  });
}

// Key metrics
export async function getKeyMetrics(period: string, customStart?: string, customEnd?: string): Promise<{
  sessions: number;
  bounceRate: number;
  avgSessionDuration: number;
  screenPageViewsPerSession: number;
  newUsers: number;
  totalUsers: number;
}> {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    metrics: [
      { name: "sessions" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
      { name: "newUsers" },
      { name: "activeUsers" },
    ],
    keepEmptyRows: false,
    returnPropertyQuota: false,
  });

  // The GA Data API returns totals in the `totals` field when no dimensions are specified
  // but sometimes returns them in `rows` as a single row
  const vals = data.totals?.[0]?.metricValues || data.rows?.[0]?.metricValues || [];
  return {
    sessions: parseInt(vals[0]?.value || "0"),
    bounceRate: parseFloat(vals[1]?.value || "0") * 100,
    avgSessionDuration: parseFloat(vals[2]?.value || "0"),
    screenPageViewsPerSession: parseFloat(vals[3]?.value || "0"),
    newUsers: parseInt(vals[4]?.value || "0"),
    totalUsers: parseInt(vals[5]?.value || "0"),
  };
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

// Top pages
export async function getTopPages(period: string, customStart?: string, customEnd?: string): Promise<{ page: string; title: string; views: number; sessions: number; change: number }[]> {
  const dateRange = getDateRange(period, customStart, customEnd);
  // Build previous range (same logic as getPeriodComparison)
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else if (period === "today") {
    previousRange = { startDate: "yesterday", endDate: "yesterday" };
  } else if (period === "yesterday") {
    previousRange = { startDate: "2daysAgo", endDate: "2daysAgo" };
  } else if (period === "7days") {
    previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
  } else if (period === "15days") {
    previousRange = { startDate: "29daysAgo", endDate: "15daysAgo" };
  } else if (period === "90days") {
    previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
  } else {
    // 30days default
    previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange, previousRange],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 60,
  });
  // Aggregate rows with the same pagePath, separating current vs previous
  const currentMap: Record<string, { title: string; views: number; sessions: number }> = {};
  const previousMap: Record<string, number> = {};
  (data.rows || []).forEach((row: any) => {
    const path = row.dimensionValues[0].value;
    const title = row.dimensionValues[1].value;
    const views = parseInt(row.metricValues[0].value);
    const sessions = parseInt(row.metricValues[1].value);
    const range = row.dimensionValues[2]?.value; // "date_range_0" or "date_range_1"
    if (range === "date_range_1") {
      previousMap[path] = (previousMap[path] || 0) + views;
    } else {
      if (currentMap[path]) {
        currentMap[path].views += views;
        currentMap[path].sessions += sessions;
        if (title.length > currentMap[path].title.length) currentMap[path].title = title;
      } else {
        currentMap[path] = { title, views, sessions };
      }
    }
  });
  return Object.entries(currentMap)
    .map(([page, d]) => ({
      page,
      title: d.title,
      views: d.views,
      sessions: d.sessions,
      change: pctChange(d.views, previousMap[page] || 0),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 50);
}

// --- SEARCH PAGES (full GA4 search by URL keyword, no limit) -----------------
export async function searchPages(query: string, period: string, customStart?: string, customEnd?: string): Promise<{ page: string; title: string; views: number; sessions: number; change: number }[]> {
  const dateRange = getDateRange(period, customStart, customEnd);
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else if (period === "today") {
    previousRange = { startDate: "yesterday", endDate: "yesterday" };
  } else if (period === "yesterday") {
    previousRange = { startDate: "2daysAgo", endDate: "2daysAgo" };
  } else if (period === "7days") {
    previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
  } else if (period === "15days") {
    previousRange = { startDate: "29daysAgo", endDate: "15daysAgo" };
  } else if (period === "90days") {
    previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
  } else {
    previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange, previousRange],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    dimensionFilter: {
      filter: {
        fieldName: "pagePath",
        stringFilter: { matchType: "CONTAINS", value: query, caseSensitive: false },
      },
    },
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 250,
  });
  const currentMap: Record<string, { title: string; views: number; sessions: number }> = {};
  const previousMap: Record<string, number> = {};
  (data.rows || []).forEach((row: any) => {
    const path = row.dimensionValues[0].value;
    const title = row.dimensionValues[1].value;
    const views = parseInt(row.metricValues[0].value);
    const sessions = parseInt(row.metricValues[1].value);
    const range = row.dimensionValues[2]?.value;
    if (range === "date_range_1") {
      previousMap[path] = (previousMap[path] || 0) + views;
    } else {
      if (currentMap[path]) {
        currentMap[path].views += views;
        currentMap[path].sessions += sessions;
        if (title.length > currentMap[path].title.length) currentMap[path].title = title;
      } else {
        currentMap[path] = { title, views, sessions };
      }
    }
  });
  return Object.entries(currentMap)
    .map(([page, d]) => ({
      page,
      title: d.title,
      views: d.views,
      sessions: d.sessions,
      change: pctChange(d.views, previousMap[page] || 0),
    }))
    .sort((a, b) => b.views - a.views);
}

// --- PERIOD COMPARISON --------------------------------------------------------
// Returns metrics for current period AND previous period of same length
export async function getPeriodComparison(period: string, customStart?: string, customEnd?: string): Promise<{
  current: { sessions: number; users: number; newUsers: number; bounceRate: number; avgSessionDuration: number; pageViewsPerSession: number };
  previous: { sessions: number; users: number; newUsers: number; bounceRate: number; avgSessionDuration: number; pageViewsPerSession: number };
  changes: { sessions: number; users: number; newUsers: number; bounceRate: number; avgSessionDuration: number; pageViewsPerSession: number };
}> {
  // Map period to two date ranges: current + previous
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };

  if (period === "custom" && customStart && customEnd) {
    // For custom range, calculate an equivalent previous period of the same length
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = {
      startDate: prevStart.toISOString().slice(0, 10),
      endDate: prevEnd.toISOString().slice(0, 10),
    };
  } else switch (period) {
    case "today":
      currentRange = { startDate: "today", endDate: "today" };
      previousRange = { startDate: "yesterday", endDate: "yesterday" };
      break;
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }

  const data = await gaRequest(":runReport", {
    dateRanges: [currentRange, previousRange],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
    ],
  });

  function parseMetrics(row: any) {
    const vals = row?.metricValues || [];
    return {
      sessions: parseInt(vals[0]?.value || "0"),
      users: parseInt(vals[1]?.value || "0"),
      newUsers: parseInt(vals[2]?.value || "0"),
      bounceRate: parseFloat(vals[3]?.value || "0") * 100,
      avgSessionDuration: parseFloat(vals[4]?.value || "0"),
      pageViewsPerSession: parseFloat(vals[5]?.value || "0"),
    };
  }

  // GA returns rows with dimensionValues[0].value = "date_range_0" (current) or "date_range_1" (previous)
  const rows = data.rows || [];
  const currentRow = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_0");
  const previousRow = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_1");

  const current = parseMetrics(currentRow);
  const previous = parseMetrics(previousRow);

  function pctChange(curr: number, prev: number) {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  return {
    current,
    previous,
    changes: {
      sessions: pctChange(current.sessions, previous.sessions),
      users: pctChange(current.users, previous.users),
      newUsers: pctChange(current.newUsers, previous.newUsers),
      bounceRate: pctChange(current.bounceRate, previous.bounceRate),
      avgSessionDuration: pctChange(current.avgSessionDuration, previous.avgSessionDuration),
      pageViewsPerSession: pctChange(current.pageViewsPerSession, previous.pageViewsPerSession),
    },
  };
}

// --- SECTION / BRAND ANALYSIS -------------------------------------------------
// Map URL patterns to brand/section names
const SECTION_MAP: { label: string; pattern: RegExp; color: string }[] = [
  { label: "Chevrolet", pattern: /\/chevrolet/, color: "#f59e0b" },
  { label: "Nissan", pattern: /\/nissan/, color: "#3b82f6" },
  { label: "GWM / Haval", pattern: /\/gwm|\/haval/, color: "#10b981" },
  { label: "Zeekr", pattern: /\/zeekr/, color: "#8b5cf6" },
  { label: "Omoda / Jaecoo", pattern: /\/omoda|\/jaecoo/, color: "#ec4899" },
  { label: "Volkswagen", pattern: /\/volkswagen/, color: "#06b6d4" },
  { label: "GAC", pattern: /\/gac/, color: "#f97316" },
  { label: "Bajaj / Motos", pattern: /\/bajaj|\/motos/, color: "#84cc16" },
  { label: "Usados", pattern: /\/usados|\/carros\/usados|\/comprar\/usados/, color: "#a78bfa" },
  { label: "Servicos", pattern: /\/servicos|\/oficina|\/consorcio/, color: "#fb923c" },
  { label: "Assinatura", pattern: /\/assinatura/, color: "#34d399" },
  { label: "PCD / Empresas", pattern: /\/pcd|\/empresas|\/taxistas|\/frotista/, color: "#60a5fa" },
  { label: "Home / Outros", pattern: /.*/, color: "#6b7280" },
];

export async function getSectionAnalysis(period: string, customStart?: string, customEnd?: string): Promise<{
  sections: { label: string; sessions: number; pageViews: number; percentage: number; color: string }[];
}> {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "sessions" }, { name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 200,
  });

  const sectionTotals: Record<string, { sessions: number; pageViews: number; color: string }> = {};

  (data.rows || []).forEach((row: any) => {
    const path: string = row.dimensionValues[0].value;
    const sessions = parseInt(row.metricValues[0].value);
    const pageViews = parseInt(row.metricValues[1].value);

    const section = SECTION_MAP.find(s => s.pattern.test(path));
    if (section) {
      if (!sectionTotals[section.label]) {
        sectionTotals[section.label] = { sessions: 0, pageViews: 0, color: section.color };
      }
      sectionTotals[section.label].sessions += sessions;
      sectionTotals[section.label].pageViews += pageViews;
    }
  });

  const totalSessions = Object.values(sectionTotals).reduce((s, v) => s + v.sessions, 0);

  return {
    sections: Object.entries(sectionTotals)
      .map(([label, v]) => ({
        label,
        sessions: v.sessions,
        pageViews: v.pageViews,
        percentage: totalSessions > 0 ? Math.round((v.sessions / totalSessions) * 100) : 0,
        color: v.color,
      }))
      .sort((a, b) => b.sessions - a.sessions),
  };
}

// --- DAY HISTORY (adaptive period) ------------------------------------------
export async function getDayHistory(period: string = "90days", customStart?: string, customEnd?: string): Promise<{
  days: { date: string; sessions: number; users: number; label: string }[];
  best: { date: string; sessions: number; users: number; label: string }[];
  worst: { date: string; sessions: number; users: number; label: string }[];
  avg: number;
}> {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await gaRequest(":runReport", {
    dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
    dimensions: [{ name: "date" }, { name: "dayOfWeekName" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  const days = (data.rows || []).map((row: any) => {
    const raw: string = row.dimensionValues[0].value; // YYYYMMDD
    const dow: string = row.dimensionValues[1].value;
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return {
      date,
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
      label: dow,
    };
  });

  const sorted = [...days].sort((a, b) => b.sessions - a.sessions);
  const avg = days.length > 0 ? Math.round(days.reduce((s: number, d: { sessions: number }) => s + d.sessions, 0) / days.length) : 0;
  // Limit best/worst to at most half the days to avoid overlap
  const maxRank = Math.max(1, Math.floor(days.length / 2));
  const rankCount = Math.min(10, maxRank);
  return {
    days,
    best: sorted.slice(0, rankCount),
    worst: sorted.slice(-rankCount).reverse(),
    avg,
  };
}

// --- COMPARISON BY DAY (two periods side by side) -----------------------------
export async function getSessionsByDayComparison(period: string, customStart?: string, customEnd?: string): Promise<{
  current: { date: string; sessions: number; users: number }[];
  previous: { date: string; sessions: number; users: number }[];
}> {
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };

  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = {
      startDate: prevStart.toISOString().slice(0, 10),
      endDate: prevEnd.toISOString().slice(0, 10),
    };
  } else switch (period) {
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }

  const data = await gaRequest(":runReport", {
    dateRanges: [currentRange, previousRange],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  function parseRows(rows: any[], dateRangeIndex: number) {
    return (rows || [])
      .filter((row: any) => row.dimensionValues[1]?.value === String(dateRangeIndex))
      .map((row: any) => {
        const raw: string = row.dimensionValues[0].value;
        return {
          date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
          sessions: parseInt(row.metricValues[0].value),
          users: parseInt(row.metricValues[1].value),
        };
      });
  }

  return {
    current: parseRows(data.rows, 0),
    previous: parseRows(data.rows, 1),
  };
}

// --- LEADS / CONVERSIONS ------------------------------------------------------
const BRAND_PATTERNS: { label: string; pattern: RegExp; color: string }[] = [
  { label: "Nissan", pattern: /\/nissan|\/whatsapp\/nissan/, color: "#3b82f6" },
  { label: "Chevrolet", pattern: /\/chevrolet|\/whatsapp\/chevrolet/, color: "#f59e0b" },
  { label: "GWM / Haval", pattern: /\/gwm|\/haval|\/whatsapp\/gwm/, color: "#10b981" },
  { label: "Omoda / Jaecoo", pattern: /\/omoda|\/jaecoo|\/whatsapp\/omoda/, color: "#ec4899" },
  { label: "Volkswagen", pattern: /\/volkswagen|\/whatsapp\/volkswagen/, color: "#06b6d4" },
  { label: "Zeekr", pattern: /\/zeekr|\/whatsapp\/zeekr/, color: "#8b5cf6" },
  { label: "GAC", pattern: /\/gac|\/whatsapp\/gac/, color: "#f97316" },
  { label: "Bajaj / Motos", pattern: /\/bajaj|\/motos|\/whatsapp\/bajaj/, color: "#84cc16" },
  { label: "Seminovos", pattern: /\/usados|\/seminovos|\/whatsapp\/carreraSeminovos/, color: "#a78bfa" },
  { label: "Servicos / Oficina", pattern: /\/servicos|\/oficina/, color: "#fb923c" },
  { label: "Assinatura", pattern: /\/assinatura|\/carro-por-assinatura/, color: "#34d399" },
  { label: "Empresas / PCD", pattern: /\/empresas|\/pcd|\/taxistas|\/frotista/, color: "#60a5fa" },
  { label: "Consorcio", pattern: /\/consorcio/, color: "#fbbf24" },
  { label: "Vender", pattern: /\/vender/, color: "#94a3b8" },
  { label: "Outros", pattern: /.*/, color: "#6b7280" },
];

export async function getLeadsAnalysis(period: string, customStart?: string, customEnd?: string): Promise<{
  totalContacts: number;
  totalLeads: number;
  conversionRate: number;
  organicLeads: number;
  paidLeads: number;
  organicContacts: number;
  paidContacts: number;
  totalSessions: number;
  totalOrganicSessions: number;
  paidSessions: number;
  byBrand: { label: string; contacts: number; leads: number; total: number; color: string }[];
  topProducts: { page: string; contacts: number; leads: number }[];
  byDay: { date: string; contacts: number; leads: number; organicContacts: number; organicLeads: number; sessions: number; organicSessions: number }[];
}> {
  const dateRange = getDateRange(period, customStart, customEnd);

  // Get all contact + generate_lead events with page path
  // Also get organic leads (sessionCampaignName = (not set) AND sessionMedium in none/organic)
  // And sessions by day for conversion rate calculation
  const [eventsByPage, eventsByDay, organicEventsByDay, sessionsByDay, organicSessionsByDay] = await Promise.all([
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "eventName" }, { name: "pagePath" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: ["generate_lead", "contact"] },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 200,
    }),
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "date" }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: ["generate_lead", "contact"] },
        },
      },
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    // Organic leads/contacts: sessions where campaign is (not set) and medium is (none) or organic
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "date" }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "eventName",
                inListFilter: { values: ["generate_lead", "contact"] },
              },
            },
            {
              filter: {
                fieldName: "sessionCampaignName",
                stringFilter: { matchType: "EXACT", value: "(not set)" },
              },
            },
            {
              filter: {
                fieldName: "sessionMedium",
                inListFilter: { values: ["(none)", "organic", "(not set)"] },
              },
            },
          ],
        },
      },
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    // Sessions by day for conversion rate
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    // Organic sessions by day (no UTM)
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "sessionCampaignName",
                stringFilter: { matchType: "EXACT", value: "(not set)" },
              },
            },
            {
              filter: {
                fieldName: "sessionMedium",
                inListFilter: { values: ["(none)", "organic", "(not set)"] },
              },
            },
          ],
        },
      },
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
  ]);

  // Aggregate by brand
  const brandMap: Record<string, { contacts: number; leads: number; color: string }> = {};
  let totalContacts = 0;
  let totalLeads = 0;

  (eventsByPage.rows || []).forEach((row: any) => {
    const eventName: string = row.dimensionValues[0].value;
    const path: string = row.dimensionValues[1].value;
    const count = parseInt(row.metricValues[0].value);

    const brand = BRAND_PATTERNS.find(b => b.pattern.test(path));
    if (brand) {
      if (!brandMap[brand.label]) brandMap[brand.label] = { contacts: 0, leads: 0, color: brand.color };
      if (eventName === "contact") {
        brandMap[brand.label].contacts += count;
        totalContacts += count;
      } else {
        brandMap[brand.label].leads += count;
        totalLeads += count;
      }
    }
  });

  // Top products (pages with most contacts+leads, excluding whatsapp shortcuts)
  const productMap: Record<string, { contacts: number; leads: number }> = {};
  (eventsByPage.rows || []).forEach((row: any) => {
    const eventName: string = row.dimensionValues[0].value;
    const path: string = row.dimensionValues[1].value;
    const count = parseInt(row.metricValues[0].value);
    if (!path.startsWith("/whatsapp")) {
      if (!productMap[path]) productMap[path] = { contacts: 0, leads: 0 };
      if (eventName === "contact") productMap[path].contacts += count;
      else productMap[path].leads += count;
    }
  });

  const topProducts = Object.entries(productMap)
    .map(([page, v]) => ({ page, ...v }))
    .sort((a, b) => (b.contacts + b.leads) - (a.contacts + a.leads))
    .slice(0, 15);

  // By day (all events)
  const dayMap: Record<string, { contacts: number; leads: number; organicContacts: number; organicLeads: number; sessions: number; organicSessions: number }> = {};
  (eventsByDay.rows || []).forEach((row: any) => {
    const raw: string = row.dimensionValues[0].value;
    const eventName: string = row.dimensionValues[1].value;
    const count = parseInt(row.metricValues[0].value);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (!dayMap[date]) dayMap[date] = { contacts: 0, leads: 0, organicContacts: 0, organicLeads: 0, sessions: 0, organicSessions: 0 };
    if (eventName === "contact") dayMap[date].contacts += count;
    else dayMap[date].leads += count;
  });

  // Organic events by day
  let organicContacts = 0;
  let organicLeads = 0;
  (organicEventsByDay.rows || []).forEach((row: any) => {
    const raw: string = row.dimensionValues[0].value;
    const eventName: string = row.dimensionValues[1].value;
    const count = parseInt(row.metricValues[0].value);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (!dayMap[date]) dayMap[date] = { contacts: 0, leads: 0, organicContacts: 0, organicLeads: 0, sessions: 0, organicSessions: 0 };
    if (eventName === "contact") {
      dayMap[date].organicContacts += count;
      organicContacts += count;
    } else {
      dayMap[date].organicLeads += count;
      organicLeads += count;
    }
  });

  // All sessions by day
  let totalSessions = 0;
  (sessionsByDay.rows || []).forEach((row: any) => {
    const raw: string = row.dimensionValues[0].value;
    const sessions = parseInt(row.metricValues[0].value);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (!dayMap[date]) dayMap[date] = { contacts: 0, leads: 0, organicContacts: 0, organicLeads: 0, sessions: 0, organicSessions: 0 };
    dayMap[date].sessions += sessions;
    totalSessions += sessions;
  });

  // Organic sessions by day
  let totalOrganicSessions = 0;
  (organicSessionsByDay.rows || []).forEach((row: any) => {
    const raw: string = row.dimensionValues[0].value;
    const sessions = parseInt(row.metricValues[0].value);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (!dayMap[date]) dayMap[date] = { contacts: 0, leads: 0, organicContacts: 0, organicLeads: 0, sessions: 0, organicSessions: 0 };
    dayMap[date].organicSessions += sessions;
    totalOrganicSessions += sessions;
  });

  const byDay = Object.entries(dayMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byBrand = Object.entries(brandMap)
    .map(([label, v]) => ({ label, ...v, total: v.contacts + v.leads }))
    .sort((a, b) => b.total - a.total);

  const conversionRate = totalContacts > 0
    ? Math.round((totalLeads / totalContacts) * 100 * 10) / 10
    : 0;

  const paidLeads = totalLeads - organicLeads;
  const paidContacts = totalContacts - organicContacts;
  const paidSessions = totalSessions - totalOrganicSessions;

  return { totalContacts, totalLeads, conversionRate, organicLeads, paidLeads, organicContacts, paidContacts, totalSessions, totalOrganicSessions, paidSessions, byBrand, topProducts, byDay };
}

// --- LEADS COMPARISON ---
export async function getLeadsComparison(period: string, customStart?: string, customEnd?: string): Promise<{
  current: { totalContacts: number; totalLeads: number; organicContacts: number; organicLeads: number; totalSessions: number; totalOrganicSessions: number };
  previous: { totalContacts: number; totalLeads: number; organicContacts: number; organicLeads: number; totalSessions: number; totalOrganicSessions: number };
  changes: { totalContacts: number; totalLeads: number; organicContacts: number; organicLeads: number; totalSessions: number; totalOrganicSessions: number };
}> {
  // Build current + previous date ranges (same logic as getPeriodComparison)
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };

  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else switch (period) {
    case "today":
      currentRange = { startDate: "today", endDate: "today" };
      previousRange = { startDate: "yesterday", endDate: "yesterday" };
      break;
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "15days":
      currentRange = { startDate: "14daysAgo", endDate: "today" };
      previousRange = { startDate: "29daysAgo", endDate: "15daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }

  // Helper to aggregate leads/contacts from a date range
  async function fetchLeadMetrics(dateRange: { startDate: string; endDate: string }) {
    const [allEvents, organicEvents, allSessions, organicSessions] = await Promise.all([
      gaRequest(":runReport", {
        dateRanges: [dateRange],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          filter: {
            fieldName: "eventName",
            inListFilter: { values: ["generate_lead", "contact"] },
          },
        },
      }),
      gaRequest(":runReport", {
        dateRanges: [dateRange],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: "eventName", inListFilter: { values: ["generate_lead", "contact"] } } },
              { filter: { fieldName: "sessionCampaignName", stringFilter: { matchType: "EXACT", value: "(not set)" } } },
              { filter: { fieldName: "sessionMedium", inListFilter: { values: ["(none)", "organic", "(not set)"] } } },
            ],
          },
        },
      }),
      gaRequest(":runReport", {
        dateRanges: [dateRange],
        metrics: [{ name: "sessions" }],
      }),
      gaRequest(":runReport", {
        dateRanges: [dateRange],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: "sessionCampaignName", stringFilter: { matchType: "EXACT", value: "(not set)" } } },
              { filter: { fieldName: "sessionMedium", inListFilter: { values: ["(none)", "organic", "(not set)"] } } },
            ],
          },
        },
      }),
    ]);

    let totalContacts = 0, totalLeads = 0, organicContacts = 0, organicLeads = 0;
    (allEvents.rows || []).forEach((row: any) => {
      const name = row.dimensionValues[0].value;
      const count = parseInt(row.metricValues[0].value);
      if (name === "contact") totalContacts += count;
      else totalLeads += count;
    });
    (organicEvents.rows || []).forEach((row: any) => {
      const name = row.dimensionValues[0].value;
      const count = parseInt(row.metricValues[0].value);
      if (name === "contact") organicContacts += count;
      else organicLeads += count;
    });
    const totalSessions = parseInt(allSessions.rows?.[0]?.metricValues?.[0]?.value ?? "0");
    const totalOrganicSessions = parseInt(organicSessions.rows?.[0]?.metricValues?.[0]?.value ?? "0");
    return { totalContacts, totalLeads, organicContacts, organicLeads, totalSessions, totalOrganicSessions };
  }

  const [current, previous] = await Promise.all([
    fetchLeadMetrics(currentRange),
    fetchLeadMetrics(previousRange),
  ]);

  const pct = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10;

  const changes = {
    totalContacts: pct(current.totalContacts, previous.totalContacts),
    totalLeads: pct(current.totalLeads, previous.totalLeads),
    organicContacts: pct(current.organicContacts, previous.organicContacts),
    organicLeads: pct(current.organicLeads, previous.organicLeads),
    totalSessions: pct(current.totalSessions, previous.totalSessions),
    totalOrganicSessions: pct(current.totalOrganicSessions, previous.totalOrganicSessions),
  };

  return { current, previous, changes };
}

// --- URL MONITOR ---
export async function getURLMonitor(period: string, customStart?: string, customEnd?: string): Promise<{
  pages: {
    page: string;
    totalSessions: number;
    avgDaily: number;
    peak: number;
    peakDate: string;
    low: number;
    lowDate: string;
    change: number;
    trend: "up" | "down" | "stable";
    sparkline: number[];
  }[];
}> {
  // Build current + previous date ranges
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };

  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else switch (period) {
    case "today":
      currentRange = { startDate: "today", endDate: "today" };
      previousRange = { startDate: "yesterday", endDate: "yesterday" };
      break;
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "15days":
      currentRange = { startDate: "14daysAgo", endDate: "today" };
      previousRange = { startDate: "29daysAgo", endDate: "15daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }

  // Sessions by page+date (current period) - top 50 pages
  const [byPageDay, prevByPage] = await Promise.all([
    gaRequest(":runReport", {
      dateRanges: [currentRange],
      dimensions: [{ name: "pagePath" }, { name: "date" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 2000,
    }),
    gaRequest(":runReport", {
      dateRanges: [previousRange],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 200,
    }),
  ]);

  // Build page -> date -> sessions map
  const pageMap: Record<string, Record<string, number>> = {};
  (byPageDay.rows || []).forEach((row: any) => {
    const page: string = row.dimensionValues[0].value;
    const raw: string = row.dimensionValues[1].value;
    const sessions = parseInt(row.metricValues[0].value);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    // Skip homepage and very short paths that are noise
    if (page === "/" || page.length < 3) return;
    if (!pageMap[page]) pageMap[page] = {};
    pageMap[page][date] = (pageMap[page][date] || 0) + sessions;
  });

  // Build previous period totals
  const prevMap: Record<string, number> = {};
  (prevByPage.rows || []).forEach((row: any) => {
    const page: string = row.dimensionValues[0].value;
    const sessions = parseInt(row.metricValues[0].value);
    prevMap[page] = sessions;
  });

  // Aggregate stats per page
  const pages = Object.entries(pageMap)
    .map(([page, dayMap]) => {
      const days = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b));
      const values = days.map(([, v]) => v);
      const totalSessions = values.reduce((s, v) => s + v, 0);
      const avgDaily = values.length > 0 ? Math.round(totalSessions / values.length) : 0;
      const peak = Math.max(...values);
      const peakDate = days.find(([, v]) => v === peak)?.[0] ?? "";
      const low = Math.min(...values);
      const lowDate = days.find(([, v]) => v === low)?.[0] ?? "";
      const prevTotal = prevMap[page] ?? 0;
      const change = prevTotal === 0 ? (totalSessions > 0 ? 100 : 0) : Math.round(((totalSessions - prevTotal) / prevTotal) * 1000) / 10;
      // Trend: compare last 3 days avg vs first 3 days avg
      const trend: "up" | "down" | "stable" = (() => {
        if (values.length < 4) return "stable";
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
        if (secondAvg > firstAvg * 1.1) return "up";
        if (secondAvg < firstAvg * 0.9) return "down";
        return "stable";
      })();
      // Sparkline: last 14 values (or all if fewer)
      const sparkline = values.slice(-14);
      return { page, totalSessions, avgDaily, peak, peakDate, low, lowDate, change, trend, sparkline };
    })
    .filter(p => p.totalSessions >= 10) // ignore very low traffic pages
    .sort((a, b) => b.totalSessions - a.totalSessions)
    .slice(0, 100);

  return { pages };
}

// --- UTM ANALYSIS ---
export async function getUTMAnalysis(period: string, customStart?: string, customEnd?: string): Promise<{
  byCampaign: { campaign: string; sessions: number; users: number; conversions: number }[];
  bySource: { source: string; sessions: number; users: number }[];
  byMedium: { medium: string; sessions: number; users: number }[];
  byContent: { content: string; sessions: number }[];
  topCombinations: { source: string; medium: string; campaign: string; sessions: number; users: number }[];
}> {
  const dateRange = getDateRange(period, customStart, customEnd);

  const [campaignData, sourceData, mediumData, contentData, comboData] = await Promise.all([
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionCampaignName" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionMedium" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionManualAdContent" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "sessionCampaignName" },
      ],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 25,
    }),
  ]);

  const byCampaign = (campaignData.rows || [])
    .map((row: any) => ({
      campaign: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
      conversions: parseInt(row.metricValues[2].value),
    }))
    .filter((r: any) => r.campaign !== "(not set)" && r.campaign !== "(none)");

  const bySource = (sourceData.rows || [])
    .map((row: any) => ({
      source: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    }))
    .filter((r: any) => r.source !== "(not set)");

  const byMedium = (mediumData.rows || [])
    .map((row: any) => ({
      medium: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    }))
    .filter((r: any) => r.medium !== "(not set)" && r.medium !== "(none)");

  const byContent = (contentData.rows || [])
    .map((row: any) => ({
      content: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
    }))
    .filter((r: any) => r.content !== "(not set)" && r.content !== "(none)");

  const topCombinations = (comboData.rows || [])
    .map((row: any) => ({
      source: row.dimensionValues[0].value || "(not set)",
      medium: row.dimensionValues[1].value || "(not set)",
      campaign: row.dimensionValues[2].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    }))
    .filter((r: any) => r.source !== "(not set)");

  return { byCampaign, bySource, byMedium, byContent, topCombinations };
}

// --- COMPARISON DETAILS -------------------------------------------------------
// Returns hourly, channel, device and top-pages data for current AND previous period
export async function getComparisonDetails(period: string, customStart?: string, customEnd?: string): Promise<{
  hourly: { hour: string; current: number; previous: number }[];
  channels: { source: string; current: number; previous: number; change: number }[];
  devices: { device: string; current: number; previous: number; change: number }[];
  pages: { page: string; current: number; previous: number; change: number }[];
}> {
  // Build current + previous date ranges (same logic as getPeriodComparison)
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = {
      startDate: prevStart.toISOString().slice(0, 10),
      endDate: prevEnd.toISOString().slice(0, 10),
    };
  } else switch (period) {
    case "today":
      currentRange = { startDate: "today", endDate: "today" };
      previousRange = { startDate: "yesterday", endDate: "yesterday" };
      break;
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }

  function pctChange(curr: number, prev: number) {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  // Fire all 3 GA requests in parallel (hourly, channels, devices+pages)
  const [hourlyData, channelData, deviceData, pagesData] = await Promise.all([
    // Hourly: use two dateRanges so GA returns both periods in one call
    gaRequest(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "hour" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "hour" } }],
    }),
    // Channels
    gaRequest(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "sessionDefaultChannelGrouping" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
    // Devices
    gaRequest(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
    }),
    // Top pages
    gaRequest(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 60,
    }),
  ]);

  // --- Hourly ---
  // GA returns rows tagged with dateRangeValue "date_range_0" (current) or "date_range_1" (previous)
  const hourCurrent: Record<string, number> = {};
  const hourPrevious: Record<string, number> = {};
  (hourlyData.rows || []).forEach((row: any) => {
    const h = row.dimensionValues[0].value.padStart(2, "0"); // "07"
    const range = row.dimensionValues[1]?.value; // "date_range_0" or "date_range_1"
    const sessions = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") hourCurrent[h] = (hourCurrent[h] || 0) + sessions;
    else hourPrevious[h] = (hourPrevious[h] || 0) + sessions;
  });
  // For multi-day periods, compute averages per hour
  const isMultiDay = period !== "today";
  // Count distinct days per range from hourlyData to compute averages
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    return { hour: `${h}:00`, current: hourCurrent[h] || 0, previous: hourPrevious[h] || 0 };
  });

  // --- Channels ---
  const chanCurrent: Record<string, number> = {};
  const chanPrevious: Record<string, number> = {};
  (channelData.rows || []).forEach((row: any) => {
    const name = row.dimensionValues[0].value;
    const range = row.dimensionValues[1]?.value;
    const sessions = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") chanCurrent[name] = (chanCurrent[name] || 0) + sessions;
    else chanPrevious[name] = (chanPrevious[name] || 0) + sessions;
  });
  const allChannels = new Set([...Object.keys(chanCurrent), ...Object.keys(chanPrevious)]);
  const channels = Array.from(allChannels)
    .map(source => ({
      source,
      current: chanCurrent[source] || 0,
      previous: chanPrevious[source] || 0,
      change: pctChange(chanCurrent[source] || 0, chanPrevious[source] || 0),
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 10);

  // --- Devices ---
  const devCurrent: Record<string, number> = {};
  const devPrevious: Record<string, number> = {};
  (deviceData.rows || []).forEach((row: any) => {
    const name = row.dimensionValues[0].value;
    const range = row.dimensionValues[1]?.value;
    const sessions = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") devCurrent[name] = (devCurrent[name] || 0) + sessions;
    else devPrevious[name] = (devPrevious[name] || 0) + sessions;
  });
  const allDevices = new Set([...Object.keys(devCurrent), ...Object.keys(devPrevious)]);
  const devices = Array.from(allDevices).map(device => ({
    device,
    current: devCurrent[device] || 0,
    previous: devPrevious[device] || 0,
    change: pctChange(devCurrent[device] || 0, devPrevious[device] || 0),
  })).sort((a, b) => b.current - a.current);

  // --- Pages ---
  const pageCurrent: Record<string, number> = {};
  const pagePrevious: Record<string, number> = {};
  (pagesData.rows || []).forEach((row: any) => {
    const path = row.dimensionValues[0].value;
    const range = row.dimensionValues[1]?.value;
    const views = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") pageCurrent[path] = (pageCurrent[path] || 0) + views;
    else pagePrevious[path] = (pagePrevious[path] || 0) + views;
  });
  const allPages = new Set([...Object.keys(pageCurrent), ...Object.keys(pagePrevious)]);
  const pages = Array.from(allPages)
    .map(page => ({
      page,
      current: pageCurrent[page] || 0,
      previous: pagePrevious[page] || 0,
      change: pctChange(pageCurrent[page] || 0, pagePrevious[page] || 0),
    }))
    .filter(p => p.current > 0 || p.previous > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 50);

  return { hourly, channels, devices, pages };
}

// --- TV CARRERA DAYS CAMPAIGN ANALYSIS (19-22 Mar 2026) -------------------
// TV insertion schedule (fixed data from the campaign page)
export const TV_INSERTIONS = [
  // QUI 19/03 - SP1 11h45 (Chevrolet), Globo Esporte 13h00 (GWM), Jornal Hoje 13h25 (GWM)
  { date: "2026-03-19", hour: 11, minute: 45, program: "SP1", brand: "Chevrolet", duration: "15\"", type: "Jornal" },
  { date: "2026-03-19", hour: 13, minute: 0, program: "Globo Esporte", brand: "GWM", duration: "30\"", type: "Esporte" },
  { date: "2026-03-19", hour: 13, minute: 25, program: "Jornal Hoje", brand: "GWM", duration: "30\"", type: "Jornal" },
  // SEX 20/03 - Bom Dia Brasil 8h30, SP1 11h45, Jornal Hoje 13h25, SP2 19h10, Jornal Nacional 20h39
  { date: "2026-03-20", hour: 8, minute: 30, program: "Bom Dia Brasil", brand: "VW", duration: "15\"", type: "Matinal" },
  { date: "2026-03-20", hour: 8, minute: 30, program: "Bom Dia Brasil", brand: "Chevrolet", duration: "15\"", type: "Matinal" },
  { date: "2026-03-20", hour: 8, minute: 30, program: "Bom Dia Brasil", brand: "GWM", duration: "15\"", type: "Matinal" },
  { date: "2026-03-20", hour: 8, minute: 30, program: "Bom Dia Brasil", brand: "GWM", duration: "30\"", type: "Matinal" },
  { date: "2026-03-20", hour: 11, minute: 45, program: "SP1", brand: "Chevrolet", duration: "15\"", type: "Jornal" },
  { date: "2026-03-20", hour: 11, minute: 45, program: "SP1", brand: "GWM", duration: "15\"", type: "Jornal" },
  { date: "2026-03-20", hour: 13, minute: 25, program: "Jornal Hoje", brand: "GWM", duration: "30\"", type: "Jornal" },
  { date: "2026-03-20", hour: 19, minute: 10, program: "SP2", brand: "GWM", duration: "30\"", type: "Jornal" },
  { date: "2026-03-20", hour: 20, minute: 39, program: "Jornal Nacional", brand: "GWM", duration: "30\"", type: "Jornal" },
  // SAB 21/03 - SP1 11h45, Jornal Hoje 13h25, Show Sabado 14h40, Novela 21h20
  { date: "2026-03-21", hour: 11, minute: 45, program: "SP1", brand: "VW", duration: "15\"", type: "Jornal" },
  { date: "2026-03-21", hour: 11, minute: 45, program: "SP1", brand: "Chevrolet", duration: "15\"", type: "Jornal" },
  { date: "2026-03-21", hour: 11, minute: 45, program: "SP1", brand: "GWM", duration: "15\"", type: "Jornal" },
  { date: "2026-03-21", hour: 13, minute: 25, program: "Jornal Hoje", brand: "GWM", duration: "30\"", type: "Jornal" },
  { date: "2026-03-21", hour: 14, minute: 40, program: "Show Sábado Vespertino", brand: "Chevrolet", duration: "15\"", type: "Variedades" },
  { date: "2026-03-21", hour: 21, minute: 20, program: "NOVELA: Três Graças", brand: "GWM", duration: "30\"", type: "Novela" },
  // DOM 22/03 - Auto Esporte 8h05
  { date: "2026-03-22", hour: 8, minute: 5, program: "Auto Esporte", brand: "VW", duration: "15\"", type: "Esporte" },
  { date: "2026-03-22", hour: 8, minute: 5, program: "Auto Esporte", brand: "Chevrolet", duration: "15\"", type: "Esporte" },
  { date: "2026-03-22", hour: 8, minute: 5, program: "Auto Esporte", brand: "GWM", duration: "15\"", type: "Esporte" },
];

export async function getTVCampaignData(): Promise<{
  campaignDays: { date: string; label: string; hours: { hour: string; sessions: number }[] }[];
  baselineDays: { date: string; label: string; hours: { hour: string; sessions: number }[] }[];
  insertions: typeof TV_INSERTIONS;
  programImpact: { program: string; brand: string; date: string; hour: number; sessionsBefore: number; sessionsAfter: number; lift: number }[];
}> {
  // Fetch hour-by-hour data for campaign days (19-22 Mar) and baseline days (12-15 Mar)
  const campaignDates = ["2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22"];
  const baselineDates = ["2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15"];
  const dayLabels: Record<string, string> = {
    "2026-03-19": "Qui 19/03",
    "2026-03-20": "Sex 20/03",
    "2026-03-21": "Sáb 21/03",
    "2026-03-22": "Dom 22/03",
    "2026-03-12": "Qui 12/03",
    "2026-03-13": "Sex 13/03",
    "2026-03-14": "Sáb 14/03",
    "2026-03-15": "Dom 15/03",
  };

  // Fetch all 8 days in a single GA request using dateHour dimension
  const data = await gaRequest(":runReport", {
    dateRanges: [{ startDate: "2026-03-12", endDate: "2026-03-22" }],
    dimensions: [{ name: "dateHour" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "dateHour" } }],
  });

  // Build map: date -> hour -> sessions
  const hourMap: Record<string, Record<string, number>> = {};
  (data.rows || []).forEach((row: any) => {
    const dateHour: string = row.dimensionValues[0].value; // "2026031907"
    const date = `${dateHour.slice(0, 4)}-${dateHour.slice(4, 6)}-${dateHour.slice(6, 8)}`;
    const hour = dateHour.slice(-2);
    if (!hourMap[date]) hourMap[date] = {};
    hourMap[date][hour] = (hourMap[date][hour] || 0) + parseInt(row.metricValues[0].value);
  });

  const buildDayHours = (date: string) =>
    Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, "0");
      return { hour: `${h}:00`, sessions: hourMap[date]?.[h] || 0 };
    });

  const campaignDays = campaignDates.map(date => ({
    date,
    label: dayLabels[date],
    hours: buildDayHours(date),
  }));

  const baselineDays = baselineDates.map(date => ({
    date,
    label: dayLabels[date],
    hours: buildDayHours(date),
  }));

  // Calculate program impact: sessions in the hour of insertion vs. same hour in baseline
  const programImpact = TV_INSERTIONS.map(ins => {
    const campaignDay = campaignDays.find(d => d.date === ins.date);
    const baselineDay = baselineDays.find(d => {
      // Match same day of week: Thu->Thu, Fri->Fri, Sat->Sat, Sun->Sun
      const campaignDow = new Date(ins.date).getDay();
      const baselineDow = new Date(d.date).getDay();
      return campaignDow === baselineDow;
    });
    const hourStr = String(ins.hour).padStart(2, "0") + ":00";
    const sessionsAfter = campaignDay?.hours.find(h => h.hour === hourStr)?.sessions || 0;
    const sessionsBefore = baselineDay?.hours.find(h => h.hour === hourStr)?.sessions || 0;
    const lift = sessionsBefore > 0 ? Math.round(((sessionsAfter - sessionsBefore) / sessionsBefore) * 100) : 0;
    return {
      program: ins.program,
      brand: ins.brand,
      date: ins.date,
      hour: ins.hour,
      sessionsBefore,
      sessionsAfter,
      lift,
    };
  });

  return { campaignDays, baselineDays, insertions: TV_INSERTIONS, programImpact };
}
export const TV_LEADS = [
  { date: "2026-03-22", hour: 23, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 23, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 22, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-22", hour: 22, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-22", hour: 21, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 21, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-22", hour: 21, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-22", hour: 21, midia: "Site", brand: "GWM" },
  { date: "2026-03-22", hour: 20, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 19, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-22", hour: 19, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-22", hour: 18, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-22", hour: 18, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-22", hour: 17, midia: "Site", brand: "VW" },
  { date: "2026-03-22", hour: 17, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 17, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 17, midia: "Site", brand: "GWM" },
  { date: "2026-03-22", hour: 17, midia: "Site", brand: "Nissan" },
  { date: "2026-03-22", hour: 17, midia: "Site", brand: "VW" },
  { date: "2026-03-22", hour: 17, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-22", hour: 16, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-22", hour: 16, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-22", hour: 16, midia: "Site", brand: "GWM" },
  { date: "2026-03-22", hour: 16, midia: "Site", brand: "Nissan" },
  { date: "2026-03-22", hour: 15, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-22", hour: 14, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-22", hour: 14, midia: "Site", brand: "VW" },
  { date: "2026-03-22", hour: 14, midia: "Site", brand: "VW" },
  { date: "2026-03-22", hour: 13, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-22", hour: 12, midia: "Site", brand: "GWM" },
  { date: "2026-03-22", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-22", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-22", hour: 10, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 10, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-22", hour: 10, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-22", hour: 9, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-22", hour: 9, midia: "Site", brand: "VW" },
  { date: "2026-03-22", hour: 8, midia: "Site", brand: "VW" },
  { date: "2026-03-22", hour: 8, midia: "Site", brand: "GWM" },
  { date: "2026-03-22", hour: 8, midia: "Site", brand: "GAC" },
  { date: "2026-03-22", hour: 8, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-22", hour: 4, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-22", hour: 2, midia: "Site", brand: "Nissan" },
  { date: "2026-03-22", hour: 2, midia: "Site", brand: "Nissan" },
  { date: "2026-03-22", hour: 0, midia: "Site", brand: "GWM" },
  { date: "2026-03-22", hour: 0, midia: "Site", brand: "Nissan" },
  { date: "2026-03-21", hour: 23, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 23, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 22, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 22, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 22, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 22, midia: "Site", brand: "GWM" },
  { date: "2026-03-21", hour: 22, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-21", hour: 21, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 21, midia: "Site", brand: "Nissan" },
  { date: "2026-03-21", hour: 20, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-21", hour: 19, midia: "Site", brand: "Omoda" },
  { date: "2026-03-21", hour: 19, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-21", hour: 19, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-21", hour: 19, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 19, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 18, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-21", hour: 17, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 17, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-21", hour: 17, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 17, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-21", hour: 17, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 17, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 16, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 16, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-21", hour: 15, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-21", hour: 15, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 15, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-21", hour: 14, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 14, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 14, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 14, midia: "Site", brand: "Nissan" },
  { date: "2026-03-21", hour: 14, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-21", hour: 14, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-21", hour: 14, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-21", hour: 13, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-21", hour: 13, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-21", hour: 13, midia: "Site", brand: "Nissan" },
  { date: "2026-03-21", hour: 12, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-21", hour: 12, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 12, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-21", hour: 12, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 12, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-21", hour: 12, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 11, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-21", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-21", hour: 11, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 11, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "VW" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "GWM" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "GWM" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "GWM" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "Omoda" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "GWM" },
  { date: "2026-03-21", hour: 10, midia: "Site", brand: "GWM" },
  { date: "2026-03-21", hour: 9, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 9, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-21", hour: 9, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-21", hour: 9, midia: "Site", brand: "Omoda" },
  { date: "2026-03-21", hour: 8, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 7, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 7, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 6, midia: "Site", brand: "GAC" },
  { date: "2026-03-21", hour: 6, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-21", hour: 2, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-21", hour: 2, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 23, midia: "Site", brand: "GAC" },
  { date: "2026-03-20", hour: 22, midia: "Site", brand: "Nissan" },
  { date: "2026-03-20", hour: 21, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-20", hour: 21, midia: "Site", brand: "VW" },
  { date: "2026-03-20", hour: 20, midia: "Site", brand: "Omoda" },
  { date: "2026-03-20", hour: 19, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-20", hour: 19, midia: "Site", brand: "GAC" },
  { date: "2026-03-20", hour: 19, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-20", hour: 19, midia: "Site", brand: "Nissan" },
  { date: "2026-03-20", hour: 19, midia: "Site", brand: "VW" },
  { date: "2026-03-20", hour: 18, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-20", hour: 18, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-20", hour: 18, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-20", hour: 17, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-20", hour: 17, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-20", hour: 16, midia: "Site", brand: "GAC" },
  { date: "2026-03-20", hour: 16, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-20", hour: 16, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-20", hour: 15, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-20", hour: 14, midia: "Site", brand: "Omoda" },
  { date: "2026-03-20", hour: 13, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-20", hour: 13, midia: "Site", brand: "Nissan" },
  { date: "2026-03-20", hour: 13, midia: "Site", brand: "VW" },
  { date: "2026-03-20", hour: 13, midia: "Site", brand: "Nissan" },
  { date: "2026-03-20", hour: 12, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-20", hour: 12, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 12, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-20", hour: 12, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 12, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-20", hour: 12, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 12, midia: "Site", brand: "VW" },
  { date: "2026-03-20", hour: 11, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-20", hour: 11, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 11, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 11, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-20", hour: 11, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 11, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 11, midia: "Site", brand: "GWM" },
  { date: "2026-03-20", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-20", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-20", hour: 10, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-20", hour: 10, midia: "Site", brand: "VW" },
  { date: "2026-03-20", hour: 9, midia: "Site", brand: "GAC" },
  { date: "2026-03-20", hour: 9, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-20", hour: 8, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-20", hour: 8, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-20", hour: 8, midia: "Site", brand: "Omoda" },
  { date: "2026-03-20", hour: 8, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-20", hour: 7, midia: "Site", brand: "GAC" },
  { date: "2026-03-20", hour: 6, midia: "Site", brand: "VW" },
  { date: "2026-03-20", hour: 0, midia: "Site", brand: "GAC" },
  { date: "2026-03-19", hour: 23, midia: "Site", brand: "VW" },
  { date: "2026-03-19", hour: 22, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 22, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 22, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 20, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-19", hour: 19, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-19", hour: 19, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-19", hour: 18, midia: "Site", brand: "GWM" },
  { date: "2026-03-19", hour: 18, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-19", hour: 18, midia: "Site", brand: "GAC" },
  { date: "2026-03-19", hour: 18, midia: "Site", brand: "VW" },
  { date: "2026-03-19", hour: 18, midia: "Site", brand: "Nissan" },
  { date: "2026-03-19", hour: 17, midia: "Site", brand: "GAC" },
  { date: "2026-03-19", hour: 17, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 17, midia: "Site", brand: "Omoda" },
  { date: "2026-03-19", hour: 16, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-19", hour: 16, midia: "Site", brand: "GWM" },
  { date: "2026-03-19", hour: 16, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 14, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-19", hour: 14, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-19", hour: 13, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-19", hour: 13, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-19", hour: 12, midia: "Site", brand: "Nissan" },
  { date: "2026-03-19", hour: 12, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 12, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-19", hour: 12, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-19", hour: 12, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-19", hour: 12, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-19", hour: 11, midia: "Site", brand: "GWM" },
  { date: "2026-03-19", hour: 10, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 10, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 10, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-19", hour: 9, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-19", hour: 9, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 9, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 9, midia: "Site", brand: "Nissan" },
  { date: "2026-03-19", hour: 8, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-19", hour: 8, midia: "Site", brand: "Nissan" },
  { date: "2026-03-19", hour: 8, midia: "Site", brand: "Omoda" },
  { date: "2026-03-19", hour: 8, midia: "Site", brand: "GAC" },
  { date: "2026-03-19", hour: 7, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-19", hour: 1, midia: "Site", brand: "GWM" },
  { date: "2026-03-19", hour: 0, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-15", hour: 23, midia: "Site", brand: "VW" },
  { date: "2026-03-15", hour: 23, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-15", hour: 23, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-15", hour: 22, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-15", hour: 21, midia: "Site", brand: "GAC" },
  { date: "2026-03-15", hour: 21, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-15", hour: 21, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-15", hour: 20, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-15", hour: 20, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-15", hour: 19, midia: "Site", brand: "Nissan" },
  { date: "2026-03-15", hour: 17, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-15", hour: 17, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-15", hour: 15, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-15", hour: 14, midia: "Site", brand: "Nissan" },
  { date: "2026-03-15", hour: 14, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-15", hour: 14, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-15", hour: 13, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-15", hour: 13, midia: "Site", brand: "GWM" },
  { date: "2026-03-15", hour: 13, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-15", hour: 12, midia: "Site", brand: "Nissan" },
  { date: "2026-03-15", hour: 12, midia: "Site", brand: "Omoda" },
  { date: "2026-03-15", hour: 12, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-15", hour: 12, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-15", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-15", hour: 11, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-15", hour: 9, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-15", hour: 7, midia: "Site", brand: "GAC" },
  { date: "2026-03-15", hour: 6, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-15", hour: 6, midia: "Site", brand: "VW" },
  { date: "2026-03-14", hour: 23, midia: "Site", brand: "GAC" },
  { date: "2026-03-14", hour: 21, midia: "Site", brand: "VW" },
  { date: "2026-03-14", hour: 20, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-14", hour: 19, midia: "Site", brand: "VW" },
  { date: "2026-03-14", hour: 19, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-14", hour: 19, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-14", hour: 18, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-14", hour: 18, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-14", hour: 18, midia: "Site", brand: "GWM" },
  { date: "2026-03-14", hour: 17, midia: "Site", brand: "GWM" },
  { date: "2026-03-14", hour: 16, midia: "Site", brand: "GWM" },
  { date: "2026-03-14", hour: 16, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-14", hour: 16, midia: "Site", brand: "Zeekr" },
  { date: "2026-03-14", hour: 16, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-14", hour: 16, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-14", hour: 15, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-14", hour: 14, midia: "Site", brand: "Omoda" },
  { date: "2026-03-14", hour: 14, midia: "Site", brand: "GWM" },
  { date: "2026-03-14", hour: 13, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-14", hour: 13, midia: "Site", brand: "VW" },
  { date: "2026-03-14", hour: 13, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-14", hour: 12, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-14", hour: 11, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-14", hour: 11, midia: "Site", brand: "Omoda" },
  { date: "2026-03-14", hour: 10, midia: "Site", brand: "GAC" },
  { date: "2026-03-14", hour: 10, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-14", hour: 10, midia: "Site", brand: "Nissan" },
  { date: "2026-03-14", hour: 9, midia: "Site", brand: "GWM" },
  { date: "2026-03-14", hour: 9, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-14", hour: 8, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-14", hour: 7, midia: "Site", brand: "VW" },
  { date: "2026-03-14", hour: 6, midia: "Site", brand: "Nissan" },
  { date: "2026-03-14", hour: 6, midia: "Site", brand: "Nissan" },
  { date: "2026-03-13", hour: 23, midia: "Site", brand: "VW" },
  { date: "2026-03-13", hour: 23, midia: "Site", brand: "VW" },
  { date: "2026-03-13", hour: 22, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-13", hour: 22, midia: "Site", brand: "GAC" },
  { date: "2026-03-13", hour: 22, midia: "Site", brand: "VW" },
  { date: "2026-03-13", hour: 22, midia: "Site", brand: "GAC" },
  { date: "2026-03-13", hour: 21, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 19, midia: "Site", brand: "GWM" },
  { date: "2026-03-13", hour: 19, midia: "Site", brand: "GWM" },
  { date: "2026-03-13", hour: 19, midia: "Site", brand: "Omoda" },
  { date: "2026-03-13", hour: 19, midia: "Site", brand: "GAC" },
  { date: "2026-03-13", hour: 19, midia: "Site", brand: "GWM" },
  { date: "2026-03-13", hour: 19, midia: "Site", brand: "Omoda" },
  { date: "2026-03-13", hour: 18, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-13", hour: 18, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-13", hour: 17, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-13", hour: 16, midia: "Site", brand: "GWM" },
  { date: "2026-03-13", hour: 16, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-13", hour: 16, midia: "Site", brand: "Omoda" },
  { date: "2026-03-13", hour: 15, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 15, midia: "Site", brand: "GAC" },
  { date: "2026-03-13", hour: 14, midia: "Site", brand: "VW" },
  { date: "2026-03-13", hour: 13, midia: "Site", brand: "Nissan" },
  { date: "2026-03-13", hour: 13, midia: "Site", brand: "VW" },
  { date: "2026-03-13", hour: 13, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 13, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-13", hour: 13, midia: "Site", brand: "VW" },
  { date: "2026-03-13", hour: 12, midia: "Site", brand: "VW" },
  { date: "2026-03-13", hour: 11, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-13", hour: 11, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 10, midia: "Site", brand: "Omoda" },
  { date: "2026-03-13", hour: 10, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-13", hour: 10, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-13", hour: 9, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 9, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 9, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 9, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 9, midia: "Site", brand: "Nissan" },
  { date: "2026-03-13", hour: 8, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-13", hour: 8, midia: "Site", brand: "Nissan" },
  { date: "2026-03-13", hour: 7, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-13", hour: 6, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-13", hour: 6, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-13", hour: 0, midia: "Site", brand: "VW" },
  { date: "2026-03-12", hour: 23, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-12", hour: 22, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-12", hour: 21, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-12", hour: 21, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 21, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-12", hour: 20, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-12", hour: 19, midia: "WhatsApp", brand: "Bajaj" },
  { date: "2026-03-12", hour: 19, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-12", hour: 19, midia: "WhatsApp", brand: "GAC" },
  { date: "2026-03-12", hour: 19, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 19, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-12", hour: 19, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-12", hour: 18, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 18, midia: "Site", brand: "Nissan" },
  { date: "2026-03-12", hour: 17, midia: "WhatsApp", brand: "Nissan" },
  { date: "2026-03-12", hour: 17, midia: "Site", brand: "VW" },
  { date: "2026-03-12", hour: 16, midia: "Site", brand: "VW" },
  { date: "2026-03-12", hour: 15, midia: "WhatsApp", brand: "Omoda" },
  { date: "2026-03-12", hour: 15, midia: "Site", brand: "Nissan" },
  { date: "2026-03-12", hour: 14, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-12", hour: 14, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-12", hour: 14, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-12", hour: 13, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-12", hour: 13, midia: "WhatsApp", brand: "VW" },
  { date: "2026-03-12", hour: 12, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 11, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 11, midia: "Site", brand: "VW" },
  { date: "2026-03-12", hour: 11, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 11, midia: "Site", brand: "GWM" },
  { date: "2026-03-12", hour: 11, midia: "Site", brand: "Nissan" },
  { date: "2026-03-12", hour: 11, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-12", hour: 11, midia: "WhatsApp", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 9, midia: "Site", brand: "VW" },
  { date: "2026-03-12", hour: 8, midia: "WhatsApp", brand: "GWM" },
  { date: "2026-03-12", hour: 0, midia: "Site", brand: "Bajaj" },
  { date: "2026-03-12", hour: 0, midia: "Site", brand: "Chevrolet" },
  { date: "2026-03-12", hour: 0, midia: "Site", brand: "Nissan" },
];
// --- TV LEADS ANALYSIS ---------------------------------------------------
export interface TVLeadDay {
  date: string;
  label: string;
  total: number;
  site: number;
  whatsapp: number;
  byBrand: Record<string, number>;
  byHour: Record<number, number>;
}

export function getTVLeadsData(brandFilter?: string) {
  const campaignDates = ["2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22"];
  const baselineDates = ["2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15"];
  const dayLabels: Record<string, string> = {
    "2026-03-19": "QUINTA-FEIRA, 19 DE MARÇO",
    "2026-03-20": "SEXTA-FEIRA, 20 DE MARÇO",
    "2026-03-21": "SÁBADO, 21 DE MARÇO",
    "2026-03-22": "DOMINGO, 22 DE MARÇO",
    "2026-03-12": "QUINTA-FEIRA, 12 DE MARÇO",
    "2026-03-13": "SEXTA-FEIRA, 13 DE MARÇO",
    "2026-03-14": "SÁBADO, 14 DE MARÇO",
    "2026-03-15": "DOMINGO, 15 DE MARÇO",
  };

  const filtered = brandFilter
    ? TV_LEADS.filter((l) => l.brand === brandFilter)
    : TV_LEADS;

  function buildDay(date: string): TVLeadDay {
    const dayLeads = filtered.filter((l) => l.date === date);
    const byBrand: Record<string, number> = {};
    const byHour: Record<number, number> = {};
    let site = 0, whatsapp = 0;
    for (const l of dayLeads) {
      byBrand[l.brand] = (byBrand[l.brand] || 0) + 1;
      byHour[l.hour] = (byHour[l.hour] || 0) + 1;
      if (l.midia === "Site") site++; else whatsapp++;
    }
    return { date, label: dayLabels[date] || date, total: dayLeads.length, site, whatsapp, byBrand, byHour };
  }

  const campaignDays = campaignDates.map(buildDay);
  const baselineDays = baselineDates.map(buildDay);

  const campTotal = campaignDays.reduce((s, d) => s + d.total, 0);
  const baseTotal = baselineDays.reduce((s, d) => s + d.total, 0);
  const lift = baseTotal > 0 ? Math.round(((campTotal / baseTotal) - 1) * 100) : 0;

  // Brand totals for campaign period (always from full TV_LEADS, not filtered)
  const tvBrands = ["VW", "GWM", "Chevrolet"];
  const brandTotals: Record<string, { camp: number; base: number; lift: number }> = {};
  for (const brand of tvBrands) {
    const camp = campaignDates.reduce((s, d) => s + TV_LEADS.filter((l) => l.date === d && l.brand === brand).length, 0);
    const base = baselineDates.reduce((s, d) => s + TV_LEADS.filter((l) => l.date === d && l.brand === brand).length, 0);
    brandTotals[brand] = { camp, base, lift: base > 0 ? Math.round(((camp / base) - 1) * 100) : 0 };
  }

  return { campaignDays, baselineDays, campTotal, baseTotal, lift, brandTotals };
}


// =============================================================================
// CARRERA LPs — GA4 Property 503617174
// Mesmas funções do site principal, mas usando o propertyId das LPs.
// =============================================================================

const LPS_PROPERTY_ID = "503617174";

function lpsGa(endpoint: string, body: object) {
  return gaRequest(endpoint, body, LPS_PROPERTY_ID);
}

export async function getLPsKeyMetrics(period: string, customStart?: string, customEnd?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    metrics: [
      { name: "sessions" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
      { name: "newUsers" },
      { name: "activeUsers" },
    ],
    keepEmptyRows: false,
    returnPropertyQuota: false,
  });
  const vals = data.totals?.[0]?.metricValues || data.rows?.[0]?.metricValues || [];
  return {
    sessions: parseInt(vals[0]?.value || "0"),
    bounceRate: parseFloat(vals[1]?.value || "0") * 100,
    avgSessionDuration: parseFloat(vals[2]?.value || "0"),
    screenPageViewsPerSession: parseFloat(vals[3]?.value || "0"),
    newUsers: parseInt(vals[4]?.value || "0"),
    totalUsers: parseInt(vals[5]?.value || "0"),
  };
}

export async function getLPsSessionsByDay(period: string, customStart?: string, customEnd?: string, brandOrPath?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = buildLPsDimensionFilter(brandOrPath);
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  return (data.rows || []).map((row: any) => {
    const raw = row.dimensionValues[0].value;
    return {
      date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    };
  });
}

export async function getLPsTrafficSources(period: string, customStart?: string, customEnd?: string, brandOrPath?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = buildLPsDimensionFilter(brandOrPath);
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "sessionDefaultChannelGrouping" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  const rows = data.rows || [];
  const total = rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);
  return rows.map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return {
      source: row.dimensionValues[0].value,
      sessions,
      percentage: total > 0 ? Math.round((sessions / total) * 100) : 0,
    };
  });
}

export async function getLPsDeviceDistribution(period: string, customStart?: string, customEnd?: string, brandOrPath?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = buildLPsDimensionFilter(brandOrPath);
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  const rows = data.rows || [];
  const total = rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);
  return rows.map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return {
      device: row.dimensionValues[0].value,
      sessions,
      percentage: total > 0 ? Math.round((sessions / total) * 100) : 0,
    };
  });
}

export async function getLPsTopPages(period: string, customStart?: string, customEnd?: string, brandOrPath?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else if (period === "today") {
    previousRange = { startDate: "yesterday", endDate: "yesterday" };
  } else if (period === "yesterday") {
    previousRange = { startDate: "2daysAgo", endDate: "2daysAgo" };
  } else if (period === "7days") {
    previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
  } else if (period === "15days") {
    previousRange = { startDate: "29daysAgo", endDate: "15daysAgo" };
  } else if (period === "90days") {
    previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
  } else {
    previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }
  const dimensionFilter = buildLPsDimensionFilter(brandOrPath);
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange, previousRange],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
    limit: 60,
  });
  const currentMap: Record<string, { title: string; views: number; sessions: number }> = {};
  const previousMap: Record<string, number> = {};
  (data.rows || []).forEach((row: any) => {
    const path = row.dimensionValues[0].value;
    const title = row.dimensionValues[1].value;
    const views = parseInt(row.metricValues[0].value);
    const sessions = parseInt(row.metricValues[1].value);
    const range = row.dimensionValues[2]?.value;
    if (range === "date_range_1") {
      previousMap[path] = (previousMap[path] || 0) + views;
    } else {
      if (currentMap[path]) {
        currentMap[path].views += views;
        currentMap[path].sessions += sessions;
        if (title.length > currentMap[path].title.length) currentMap[path].title = title;
      } else {
        currentMap[path] = { title, views, sessions };
      }
    }
  });
  return Object.entries(currentMap)
    .map(([page, d]) => ({
      page,
      title: d.title,
      views: d.views,
      sessions: d.sessions,
      change: pctChange(d.views, previousMap[page] || 0),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 50);
}

export async function searchLPsPages(query: string, period: string, customStart?: string, customEnd?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else if (period === "today") {
    previousRange = { startDate: "yesterday", endDate: "yesterday" };
  } else if (period === "yesterday") {
    previousRange = { startDate: "2daysAgo", endDate: "2daysAgo" };
  } else if (period === "7days") {
    previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
  } else if (period === "15days") {
    previousRange = { startDate: "29daysAgo", endDate: "15daysAgo" };
  } else if (period === "90days") {
    previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
  } else {
    previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange, previousRange],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    dimensionFilter: {
      filter: {
        fieldName: "pagePath",
        stringFilter: { matchType: "CONTAINS", value: query, caseSensitive: false },
      },
    },
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 250,
  });
  const currentMap: Record<string, { title: string; views: number; sessions: number }> = {};
  const previousMap: Record<string, number> = {};
  (data.rows || []).forEach((row: any) => {
    const path = row.dimensionValues[0].value;
    const title = row.dimensionValues[1].value;
    const views = parseInt(row.metricValues[0].value);
    const sessions = parseInt(row.metricValues[1].value);
    const range = row.dimensionValues[2]?.value;
    if (range === "date_range_1") {
      previousMap[path] = (previousMap[path] || 0) + views;
    } else {
      if (currentMap[path]) {
        currentMap[path].views += views;
        currentMap[path].sessions += sessions;
        if (title.length > currentMap[path].title.length) currentMap[path].title = title;
      } else {
        currentMap[path] = { title, views, sessions };
      }
    }
  });
  return Object.entries(currentMap)
    .map(([page, d]) => ({
      page,
      title: d.title,
      views: d.views,
      sessions: d.sessions,
      change: pctChange(d.views, previousMap[page] || 0),
    }))
    .sort((a, b) => b.views - a.views);
}

export async function getLPsPeriodComparison(period: string, customStart?: string, customEnd?: string) {
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else switch (period) {
    case "today":
      currentRange = { startDate: "today", endDate: "today" };
      previousRange = { startDate: "yesterday", endDate: "yesterday" };
      break;
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }
  const data = await lpsGa(":runReport", {
    dateRanges: [currentRange, previousRange],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
    ],
  });
  function parseMetrics(row: any) {
    const vals = row?.metricValues || [];
    return {
      sessions: parseInt(vals[0]?.value || "0"),
      users: parseInt(vals[1]?.value || "0"),
      newUsers: parseInt(vals[2]?.value || "0"),
      bounceRate: parseFloat(vals[3]?.value || "0") * 100,
      avgSessionDuration: parseFloat(vals[4]?.value || "0"),
      pageViewsPerSession: parseFloat(vals[5]?.value || "0"),
    };
  }
  const rows = data.rows || [];
  const currentRow = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_0");
  const previousRow = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_1");
  const current = parseMetrics(currentRow);
  const previous = parseMetrics(previousRow);
  function pctChg(curr: number, prev: number) {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }
  return {
    current,
    previous,
    changes: {
      sessions: pctChg(current.sessions, previous.sessions),
      users: pctChg(current.users, previous.users),
      newUsers: pctChg(current.newUsers, previous.newUsers),
      bounceRate: pctChg(current.bounceRate, previous.bounceRate),
      avgSessionDuration: pctChg(current.avgSessionDuration, previous.avgSessionDuration),
      pageViewsPerSession: pctChg(current.pageViewsPerSession, previous.pageViewsPerSession),
    },
  };
}

export async function getLPsComparisonDetails(period: string, customStart?: string, customEnd?: string) {
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else switch (period) {
    case "today":
      currentRange = { startDate: "today", endDate: "today" };
      previousRange = { startDate: "yesterday", endDate: "yesterday" };
      break;
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }
  function pctChg(curr: number, prev: number) {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }
  const [hourlyData, channelData, deviceData, pagesData] = await Promise.all([
    lpsGa(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "hour" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "hour" } }],
    }),
    lpsGa(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "sessionDefaultChannelGrouping" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
    lpsGa(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
    }),
    lpsGa(":runReport", {
      dateRanges: [currentRange, previousRange],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 60,
    }),
  ]);
  const hourCurrent: Record<string, number> = {};
  const hourPrevious: Record<string, number> = {};
  (hourlyData.rows || []).forEach((row: any) => {
    const h = row.dimensionValues[0].value.padStart(2, "0");
    const range = row.dimensionValues[1]?.value;
    const sessions = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") hourCurrent[h] = (hourCurrent[h] || 0) + sessions;
    else hourPrevious[h] = (hourPrevious[h] || 0) + sessions;
  });
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    return { hour: `${h}:00`, current: hourCurrent[h] || 0, previous: hourPrevious[h] || 0 };
  });
  const chanCurrent: Record<string, number> = {};
  const chanPrevious: Record<string, number> = {};
  (channelData.rows || []).forEach((row: any) => {
    const name = row.dimensionValues[0].value;
    const range = row.dimensionValues[1]?.value;
    const sessions = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") chanCurrent[name] = (chanCurrent[name] || 0) + sessions;
    else chanPrevious[name] = (chanPrevious[name] || 0) + sessions;
  });
  const allChannels = new Set([...Object.keys(chanCurrent), ...Object.keys(chanPrevious)]);
  const channels = Array.from(allChannels)
    .map(source => ({
      source,
      current: chanCurrent[source] || 0,
      previous: chanPrevious[source] || 0,
      change: pctChg(chanCurrent[source] || 0, chanPrevious[source] || 0),
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 10);
  const devCurrent: Record<string, number> = {};
  const devPrevious: Record<string, number> = {};
  (deviceData.rows || []).forEach((row: any) => {
    const name = row.dimensionValues[0].value;
    const range = row.dimensionValues[1]?.value;
    const sessions = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") devCurrent[name] = (devCurrent[name] || 0) + sessions;
    else devPrevious[name] = (devPrevious[name] || 0) + sessions;
  });
  const allDevices = new Set([...Object.keys(devCurrent), ...Object.keys(devPrevious)]);
  const devices = Array.from(allDevices).map(device => ({
    device,
    current: devCurrent[device] || 0,
    previous: devPrevious[device] || 0,
    change: pctChg(devCurrent[device] || 0, devPrevious[device] || 0),
  })).sort((a, b) => b.current - a.current);
  const pageCurrent: Record<string, number> = {};
  const pagePrevious: Record<string, number> = {};
  (pagesData.rows || []).forEach((row: any) => {
    const path = row.dimensionValues[0].value;
    const range = row.dimensionValues[1]?.value;
    const views = parseInt(row.metricValues[0].value);
    if (range === "date_range_0") pageCurrent[path] = (pageCurrent[path] || 0) + views;
    else pagePrevious[path] = (pagePrevious[path] || 0) + views;
  });
  const allPages = new Set([...Object.keys(pageCurrent), ...Object.keys(pagePrevious)]);
  const pages = Array.from(allPages)
    .map(page => ({
      page,
      current: pageCurrent[page] || 0,
      previous: pagePrevious[page] || 0,
      change: pctChg(pageCurrent[page] || 0, pagePrevious[page] || 0),
    }))
    .filter(p => p.current > 0 || p.previous > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 50);
  return { hourly, channels, devices, pages };
}

export async function getLPsRealtimeUsers() {
  const minuteData = await lpsGa(":runRealtimeReport", {
    dimensions: [{ name: "minutesAgo" }],
    metrics: [{ name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "minutesAgo" } }],
  });
  const activeUsersByMinute = (minuteData.rows || []).map((row: any) => ({
    minute: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value),
  })).slice(0, 30);
  const activeUsers = activeUsersByMinute.reduce((sum: number, m: { users: number }) => sum + m.users, 0);
  return { activeUsers, activeUsersByMinute };
}

// =============================================================================
// CARRERA LPs — Métricas por LP específica
// =============================================================================

// Mapeamento de prefixos de URL para marcas (subpáginas de modelos)
export const LP_BRAND_PREFIXES: { prefix: string; brand: string }[] = [
  { prefix: "/chevrolet", brand: "Chevrolet" },
  { prefix: "/volkswagen", brand: "Volkswagen" },
  { prefix: "/nissan", brand: "Nissan" },
  { prefix: "/gwm", brand: "GWM" },
  { prefix: "/gac", brand: "GAC" },
  { prefix: "/zeekr", brand: "Zeekr" },
  { prefix: "/omoda", brand: "Omoda" },
  { prefix: "/bajaj", brand: "Bajaj" },
  { prefix: "/seminovos", brand: "Seminovos" },
];

// Todas as LPs conhecidas (com variantes de trailing slash)
export const LP_PAGES = [
  // Chevrolet
  { slug: "/chevrolet-sao-paulo", label: "Chevrolet SP", brand: "Chevrolet" },
  { slug: "/chevrolet-brasilia", label: "Chevrolet BSB", brand: "Chevrolet" },
  { slug: "/chevrolet", label: "Chevrolet Geral", brand: "Chevrolet" },
  // Nissan
  { slug: "/nissan-sao-paulo", label: "Nissan SP", brand: "Nissan" },
  { slug: "/nissan", label: "Nissan", brand: "Nissan" },
  // Bajaj
  { slug: "/bajaj-sao-paulo", label: "Bajaj SP", brand: "Bajaj" },
  { slug: "/bajaj-brasilia", label: "Bajaj BSB", brand: "Bajaj" },
  { slug: "/bajaj", label: "Bajaj", brand: "Bajaj" },
  // Omoda
  { slug: "/omoda-sao-paulo", label: "Omoda SP", brand: "Omoda" },
  { slug: "/omoda", label: "Omoda", brand: "Omoda" },
  // Zeekr
  { slug: "/zeekr-sao-paulo", label: "Zeekr SP", brand: "Zeekr" },
  { slug: "/zeekr", label: "Zeekr", brand: "Zeekr" },
  // GAC
  { slug: "/gac", label: "GAC", brand: "GAC" },
  // GWM
  { slug: "/gwm", label: "GWM", brand: "GWM" },
  // Volkswagen
  { slug: "/volkswagen", label: "Volkswagen", brand: "Volkswagen" },
  // Seminovos
  { slug: "/seminovos", label: "Seminovos", brand: "Seminovos" },
];

// Gera label legível para subpáginas de modelos (ex: /bajaj/dominar-ns400z -> "Bajaj Dominar NS400Z")
function generateSubpageLabel(path: string): string {
  const norm = path.replace(/\/$/, "");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length === 0) return path;

  // Detecta sufixos de cidade no path completo
  const fullPath = norm.toLowerCase();
  let citySuffix = "";
  if (fullPath.includes("-sao-paulo") || fullPath.includes("/sao-paulo")) citySuffix = " SP";
  else if (fullPath.includes("-brasilia") || fullPath.includes("/brasilia")) citySuffix = " BSB";

  // Formata cada segmento: remove sufixos de cidade, hifens viram espaços, palavras capitalizadas
  const formatSegment = (s: string) =>
    s.replace(/-sao-paulo$/i, "").replace(/-brasilia$/i, "")
     .replace(/^sao-paulo$/i, "").replace(/^brasilia$/i, "")
     .split("-").filter(Boolean)
     .map(w => w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const label = parts.map(formatSegment).filter(s => s.trim().length > 0).join(" ");
  return label + citySuffix;
}

export function getBrandFromPath(path: string): string {
  const normPath = path.replace(/\/$/, "").toLowerCase();
  // Primeiro tenta match exato com LP_PAGES
  const exactMatch = LP_PAGES.find(lp => lp.slug.replace(/\/$/, "").toLowerCase() === normPath);
  if (exactMatch) return exactMatch.brand;
  // Depois tenta prefixo (subpáginas de modelos)
  const prefixMatch = LP_BRAND_PREFIXES.find(p => normPath === p.prefix || normPath.startsWith(p.prefix + "/"));
  return prefixMatch ? prefixMatch.brand : "Outros";
}

export async function getLPsAllPagesMetrics(period: string, customStart?: string, customEnd?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "pagePath" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViews" },
      { name: "userEngagementDuration" },
    ],
    keepEmptyRows: false,
  });

  const rows = (data.rows || []) as any[];
  // Normalize URLs (remove trailing slash) and consolidate duplicates
  const agg = new Map<string, {
    sessions: number; users: number; newUsers: number;
    totalBounceWeighted: number; totalDurationWeighted: number;
    pageViews: number; engagementDuration: number;
  }>();
  for (const row of rows) {
    const rawPath = row.dimensionValues[0].value as string;
    const normPath = rawPath.replace(/\/$/, "") || "/";
    const sessions = parseInt(row.metricValues[0].value || "0");
    const users = parseInt(row.metricValues[1].value || "0");
    const newUsers = parseInt(row.metricValues[2].value || "0");
    const bounceRate = parseFloat(row.metricValues[3].value || "0") * 100;
    const avgDuration = parseFloat(row.metricValues[4].value || "0");
    const pageViews = parseInt(row.metricValues[5].value || "0");
    const engagementDuration = parseFloat(row.metricValues[6].value || "0");
    const ex = agg.get(normPath);
    if (ex) {
      ex.sessions += sessions;
      ex.users += users;
      ex.newUsers += newUsers;
      ex.totalBounceWeighted += bounceRate * sessions;
      ex.totalDurationWeighted += avgDuration * sessions;
      ex.pageViews += pageViews;
      ex.engagementDuration += engagementDuration;
    } else {
      agg.set(normPath, { sessions, users, newUsers, totalBounceWeighted: bounceRate * sessions, totalDurationWeighted: avgDuration * sessions, pageViews, engagementDuration });
    }
  }
  return Array.from(agg.entries()).map(([normPath, v]) => {
    const lpDef = LP_PAGES.find(lp => lp.slug.replace(/\/$/, "") === normPath);
    const brand = getBrandFromPath(normPath);
    const bounceRate = v.sessions > 0 ? Math.round((v.totalBounceWeighted / v.sessions) * 10) / 10 : 0;
    const avgDuration = v.sessions > 0 ? v.totalDurationWeighted / v.sessions : 0;
    return {
      path: normPath,
      label: lpDef?.label || generateSubpageLabel(normPath),
      brand,
      sessions: v.sessions,
      users: v.users,
      newUsers: v.newUsers,
      bounceRate,
      avgDuration,
      pageViews: v.pageViews,
      engagementDuration: v.engagementDuration,
    };
  });
}

export async function getLPsPageUTMs(page: string, period: string, customStart?: string, customEnd?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  // Normalize page slug: remove trailing slash for filter
  const normPage = page.replace(/\/$/, "");

  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
    ],
    dimensionFilter: {
      filter: {
        fieldName: "pagePath",
        stringFilter: {
          matchType: "BEGINS_WITH",
          value: normPage,
          caseSensitive: false,
        },
      },
    },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 50,
    keepEmptyRows: false,
  });

  const rows = (data.rows || []) as any[];
  return rows.map((row: any) => ({
    source: row.dimensionValues[0].value,
    medium: row.dimensionValues[1].value,
    campaign: row.dimensionValues[2].value,
    sessions: parseInt(row.metricValues[0].value || "0"),
    users: parseInt(row.metricValues[1].value || "0"),
    newUsers: parseInt(row.metricValues[2].value || "0"),
    bounceRate: Math.round(parseFloat(row.metricValues[3].value || "0") * 1000) / 10,
    avgDuration: parseFloat(row.metricValues[4].value || "0"),
  }));
}

export async function getLPsPageSessionsByDay(page: string, period: string, customStart?: string, customEnd?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const normPage = page.replace(/\/$/, "");
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "pagePath",
        stringFilter: {
          matchType: "BEGINS_WITH",
          value: normPage,
          caseSensitive: false,
        },
      },
    },
    orderBys: [{ dimension: { dimensionName: "date" } }],
    keepEmptyRows: false,
  });
  const rows = (data.rows || []) as any[];
  return rows.map((row: any) => ({
    date: `${row.dimensionValues[0].value.slice(0, 4)}-${row.dimensionValues[0].value.slice(4, 6)}-${row.dimensionValues[0].value.slice(6, 8)}`,
    sessions: parseInt(row.metricValues[0].value || "0"),
    users: parseInt(row.metricValues[1].value || "0"),
  }));
}

// Builds a GA4 dimensionFilter for pagePath based on brand name or exact page path
export function buildLPsDimensionFilter(brandOrPath?: string): object | undefined {
  if (!brandOrPath || brandOrPath === "Todas" || brandOrPath === "all") return undefined;
  if (brandOrPath.startsWith("/")) {
    const norm = brandOrPath.replace(/\/$/, "");
    return {
      filter: {
        fieldName: "pagePath",
        stringFilter: { matchType: "BEGINS_WITH", value: norm, caseSensitive: false },
      },
    };
  }
  const brandPrefixes = LP_BRAND_PREFIXES.filter(p => p.brand === brandOrPath).map(p => p.prefix);
  const brandSlugs = LP_PAGES.filter(p => p.brand === brandOrPath).map(p => p.slug.replace(/\/$/, ""));
  const allPaths = Array.from(new Set([...brandPrefixes, ...brandSlugs]));
  if (allPaths.length === 0) return undefined;
  return {
    orGroup: {
      expressions: allPaths.map(path => ({
        filter: {
          fieldName: "pagePath",
          stringFilter: { matchType: "BEGINS_WITH", value: path, caseSensitive: false },
        },
      })),
    },
  };
}

export async function getLPsSummaryMetrics(period: string, customStart?: string, customEnd?: string, brandOrPath?: string) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = buildLPsDimensionFilter(brandOrPath);
  const data = await lpsGa(":runReport", {
    dateRanges: [dateRange],
    ...(dimensionFilter ? { dimensions: [{ name: "pagePath" }] } : {}),
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViews" },
    ],
    ...(dimensionFilter ? { dimensionFilter } : {}),
    keepEmptyRows: false,
  });
  // When dimensions are present, aggregate from rows; otherwise use totals
  let vals: any[];
  if (dimensionFilter) {
    const rows = data.rows || [];
    const sessions = rows.reduce((s: number, r: any) => s + parseInt(r.metricValues[0].value || "0"), 0);
    const users = rows.reduce((s: number, r: any) => s + parseInt(r.metricValues[1].value || "0"), 0);
    const newUsers = rows.reduce((s: number, r: any) => s + parseInt(r.metricValues[2].value || "0"), 0);
    const pageViews = rows.reduce((s: number, r: any) => s + parseInt(r.metricValues[5].value || "0"), 0);
    const totalBounceW = rows.reduce((s: number, r: any) => s + parseFloat(r.metricValues[3].value || "0") * parseInt(r.metricValues[0].value || "0"), 0);
    const totalDurW = rows.reduce((s: number, r: any) => s + parseFloat(r.metricValues[4].value || "0") * parseInt(r.metricValues[0].value || "0"), 0);
    return {
      sessions,
      users,
      newUsers,
      bounceRate: sessions > 0 ? Math.round((totalBounceW / sessions) * 1000) / 10 : 0,
      avgDuration: sessions > 0 ? totalDurW / sessions : 0,
      pageViews,
    };
  }
  vals = data.totals?.[0]?.metricValues || data.rows?.[0]?.metricValues || [];
  return {
    sessions: parseInt(vals[0]?.value || "0"),
    users: parseInt(vals[1]?.value || "0"),
    newUsers: parseInt(vals[2]?.value || "0"),
    bounceRate: Math.round(parseFloat(vals[3]?.value || "0") * 1000) / 10,
    avgDuration: parseFloat(vals[4]?.value || "0"),
    pageViews: parseInt(vals[5]?.value || "0"),
  };
}

// Agrupa todas as URLs por marca, somando métricas e listando subpáginas
export async function getLPsGroupedByBrand(period: string, customStart?: string, customEnd?: string) {
  const pages = await getLPsAllPagesMetrics(period, customStart, customEnd);

  // Mapa de marca -> { totais, subpáginas }
  const brandMap: Record<string, {
    brand: string;
    sessions: number;
    users: number;
    newUsers: number;
    totalBounceWeighted: number; // soma de bounceRate * sessions para calcular média ponderada
    totalDurationWeighted: number; // soma de avgDuration * sessions
    pageViews: number;
    pages: typeof pages;
  }> = {};

  for (const page of pages) {
    const b = page.brand;
    if (!brandMap[b]) {
      brandMap[b] = { brand: b, sessions: 0, users: 0, newUsers: 0, totalBounceWeighted: 0, totalDurationWeighted: 0, pageViews: 0, pages: [] };
    }
    brandMap[b].sessions += page.sessions;
    brandMap[b].users += page.users;
    brandMap[b].newUsers += page.newUsers;
    brandMap[b].totalBounceWeighted += page.bounceRate * page.sessions;
    brandMap[b].totalDurationWeighted += page.avgDuration * page.sessions;
    brandMap[b].pageViews += page.pageViews;
    brandMap[b].pages.push(page);
  }

  return Object.values(brandMap)
    .map(b => ({
      brand: b.brand,
      sessions: b.sessions,
      users: b.users,
      newUsers: b.newUsers,
      bounceRate: b.sessions > 0 ? Math.round((b.totalBounceWeighted / b.sessions) * 10) / 10 : 0,
      avgDuration: b.sessions > 0 ? b.totalDurationWeighted / b.sessions : 0,
      pageViews: b.pageViews,
      pages: b.pages.sort((a, z) => z.sessions - a.sessions),
    }))
    .sort((a, z) => z.sessions - a.sessions);
}

// ---- LPs UTM Analysis ----
export async function getLPsUTMAnalysis(period: string, customStart?: string, customEnd?: string, brand?: string): Promise<{
  byCampaign: { campaign: string; sessions: number; users: number; conversions: number }[];
  bySource: { source: string; sessions: number; users: number }[];
  byMedium: { medium: string; sessions: number; users: number }[];
  byContent: { content: string; sessions: number }[];
  topCombinations: { source: string; medium: string; campaign: string; sessions: number; users: number }[];
}> {
  const dateRange = getDateRange(period, customStart, customEnd);
  // Build pagePath filter for brand if provided
  // Collect all slugs and prefixes for the brand
  let dimensionFilter: object | undefined;
  if (brand && brand !== "Todas") {
    const brandPrefixes = LP_BRAND_PREFIXES.filter(p => p.brand === brand).map(p => p.prefix);
    const brandSlugs = LP_PAGES.filter(p => p.brand === brand).map(p => p.slug.replace(/\/$/, ""));
    const allPaths = Array.from(new Set([...brandPrefixes, ...brandSlugs]));
    if (allPaths.length > 0) {
      dimensionFilter = {
        orGroup: {
          expressions: allPaths.map(path => ({
            filter: {
              fieldName: "pagePath",
              stringFilter: { matchType: "BEGINS_WITH", value: path, caseSensitive: false },
            },
          })),
        },
      };
    }
  }
  const baseBody = (dims: object[], metrics: object[], limit: number) => ({
    dateRanges: [dateRange],
    dimensions: dims,
    metrics,
    orderBys: [{ metric: { metricName: (metrics[0] as any).name }, desc: true }],
    limit,
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  const [campaignData, sourceData, mediumData, contentData, comboData] = await Promise.all([
    lpsGa(":runReport", baseBody(
      [{ name: "sessionCampaignName" }],
      [{ name: "sessions" }, { name: "activeUsers" }, { name: "conversions" }],
      50,
    )),
    lpsGa(":runReport", baseBody(
      [{ name: "sessionSource" }],
      [{ name: "sessions" }, { name: "activeUsers" }],
      30,
    )),
    lpsGa(":runReport", baseBody(
      [{ name: "sessionMedium" }],
      [{ name: "sessions" }, { name: "activeUsers" }],
      20,
    )),
    lpsGa(":runReport", baseBody(
      [{ name: "sessionManualAdContent" }],
      [{ name: "sessions" }],
      20,
    )),
    lpsGa(":runReport", baseBody(
      [{ name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }],
      [{ name: "sessions" }, { name: "activeUsers" }],
      50,
    )),
  ]);
  const byCampaign = (campaignData.rows || [])
    .map((row: any) => ({
      campaign: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
      conversions: parseInt(row.metricValues[2].value),
    }))
    .filter((r: any) => r.campaign !== "(not set)" && r.campaign !== "(none)");
  const bySource = (sourceData.rows || [])
    .map((row: any) => ({
      source: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    }))
    .filter((r: any) => r.source !== "(not set)");
  const byMedium = (mediumData.rows || [])
    .map((row: any) => ({
      medium: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    }))
    .filter((r: any) => r.medium !== "(not set)" && r.medium !== "(none)");
  const byContent = (contentData.rows || [])
    .map((row: any) => ({
      content: row.dimensionValues[0].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
    }))
    .filter((r: any) => r.content !== "(not set)" && r.content !== "(none)");
  const topCombinations = (comboData.rows || [])
    .map((row: any) => ({
      source: row.dimensionValues[0].value || "(not set)",
      medium: row.dimensionValues[1].value || "(not set)",
      campaign: row.dimensionValues[2].value || "(not set)",
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    }))
    .filter((r: any) => r.source !== "(not set)");
  return { byCampaign, bySource, byMedium, byContent, topCombinations };
}

// ---- LPs Day History ----
export async function getLPsDayHistory(period: string = "90days", customStart?: string, customEnd?: string): Promise<{
  days: { date: string; sessions: number; users: number; label: string }[];
  best: { date: string; sessions: number; users: number; label: string }[];
  worst: { date: string; sessions: number; users: number; label: string }[];
  avg: number;
}> {
  const dateRange = getDateRange(period, customStart, customEnd);
  const data = await lpsGa(":runReport", {
    dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
    dimensions: [{ name: "date" }, { name: "dayOfWeekName" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  const days = (data.rows || []).map((row: any) => {
    const raw: string = row.dimensionValues[0].value;
    const dow: string = row.dimensionValues[1].value;
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return {
      date,
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
      label: dow,
    };
  });
  const sorted = [...days].sort((a, b) => b.sessions - a.sessions);
  const avg = days.length > 0 ? Math.round(days.reduce((s: number, d: { sessions: number }) => s + d.sessions, 0) / days.length) : 0;
  const maxRank = Math.max(1, Math.floor(days.length / 2));
  const rankCount = Math.min(10, maxRank);
  return {
    days,
    best: sorted.slice(0, rankCount),
    worst: sorted.slice(-rankCount).reverse(),
    avg,
  };
}

// ---- LPs Sessions by Day Comparison ----
export async function getLPsSessionsByDayComparison(period: string, customStart?: string, customEnd?: string): Promise<{
  current: { date: string; sessions: number; users: number }[];
  previous: { date: string; sessions: number; users: number }[];
}> {
  let currentRange: { startDate: string; endDate: string };
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    currentRange = { startDate: customStart, endDate: customEnd };
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else switch (period) {
    case "today":
      currentRange = { startDate: "today", endDate: "today" };
      previousRange = { startDate: "yesterday", endDate: "yesterday" };
      break;
    case "7days":
      currentRange = { startDate: "6daysAgo", endDate: "today" };
      previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
      break;
    case "90days":
      currentRange = { startDate: "89daysAgo", endDate: "today" };
      previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
      break;
    case "30days":
    default:
      currentRange = { startDate: "29daysAgo", endDate: "today" };
      previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" };
  }
  const data = await lpsGa(":runReport", {
    dateRanges: [currentRange, previousRange],
    dimensions: [{ name: "dateRange" }, { name: "date" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  const current: { date: string; sessions: number; users: number }[] = [];
  const previous: { date: string; sessions: number; users: number }[] = [];
  (data.rows || []).forEach((row: any) => {
    const rangeId = row.dimensionValues[0].value;
    const raw: string = row.dimensionValues[1].value;
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const entry = { date, sessions: parseInt(row.metricValues[0].value), users: parseInt(row.metricValues[1].value) };
    if (rangeId === "date_range_0") current.push(entry);
    else previous.push(entry);
  });
  return { current, previous };
}

// ---- DAY DIAGNOSIS (Investigador de Picos) ----
export async function getDayDiagnosis(date: string) {
  // date format: YYYY-MM-DD
  // Run 5 parallel queries for the specific day
  const [urlsData, utmsData, sourcesData, devicesData, hoursData] = await Promise.all([
    // Top URLs by sessions on that day
    gaRequest(":runReport", {
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
    // Top UTM campaigns/sources on that day
    gaRequest(":runReport", {
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "sessionCampaignName" }, { name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
    // Traffic sources on that day
    gaRequest(":runReport", {
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }),
    // Device breakdown on that day
    gaRequest(":runReport", {
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }),
    // Hourly distribution on that day
    gaRequest(":runReport", {
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "hour" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "hour" } }],
    }),
  ]);

  // Parse top URLs
  const topUrls = (urlsData.rows || []).map((row: any) => ({
    page: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value),
    pageViews: parseInt(row.metricValues[1].value),
  }));

  // Parse UTMs (exclude organic/direct)
  const topUtms = (utmsData.rows || [])
    .map((row: any) => ({
      campaign: row.dimensionValues[0].value,
      source: row.dimensionValues[1].value,
      medium: row.dimensionValues[2].value,
      sessions: parseInt(row.metricValues[0].value),
    }))
    .filter((u: any) => u.campaign !== "(not set)" || (u.medium !== "(none)" && u.medium !== "organic" && u.medium !== "(not set)"));

  // Parse traffic sources
  const totalSourceSessions = (sourcesData.rows || []).reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);
  const trafficSources = (sourcesData.rows || []).map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return {
      channel: row.dimensionValues[0].value,
      sessions,
      users: parseInt(row.metricValues[1].value),
      percentage: totalSourceSessions > 0 ? Math.round((sessions / totalSourceSessions) * 100) : 0,
    };
  });

  // Parse devices
  const totalDeviceSessions = (devicesData.rows || []).reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);
  const devices = (devicesData.rows || []).map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return {
      device: row.dimensionValues[0].value,
      sessions,
      users: parseInt(row.metricValues[1].value),
      percentage: totalDeviceSessions > 0 ? Math.round((sessions / totalDeviceSessions) * 100) : 0,
    };
  });

  // Parse hourly distribution (fill all 24 hours)
  const hourMap: Record<string, number> = {};
  (hoursData.rows || []).forEach((row: any) => {
    hourMap[row.dimensionValues[0].value] = parseInt(row.metricValues[0].value);
  });
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    return { hour: i, label: `${h}h`, sessions: hourMap[h] ?? 0 };
  });

  const totalSessions = totalSourceSessions;
  const peakHour = hourly.reduce((max, h) => h.sessions > max.sessions ? h : max, hourly[0]);

  return {
    date,
    totalSessions,
    topUrls,
    topUtms,
    trafficSources,
    devices,
    hourly,
    peakHour,
  };
}

// ---- GWM MAI 2026 CAMPAIGN DATA ----
export const GWM_MAI_INSERTIONS_DATA = [
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
  ...[21,22,23,26,27,28,29,30,31].flatMap(d => [
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Estudio I", hour: 13, duration: "30s", brand: "GWM" },
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Estudio I", hour: 13, duration: "30s", brand: "GWM" },
  ]),
  // Globonews em Pauta 20h 30" - 21,22,23,26,27,28,29,30,31 (2x cada)
  ...[21,22,23,26,27,28,29,30,31].flatMap(d => [
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Globonews em Pauta", hour: 20, duration: "30s", brand: "GWM" },
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Globonews em Pauta", hour: 20, duration: "30s", brand: "GWM" },
  ]),
  // Jornal das Dez 22h 30" - 21,22,23,26,27,28,29,30,31 (2x cada)
  ...[21,22,23,26,27,28,29,30,31].flatMap(d => [
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Jornal das Dez", hour: 22, duration: "30s", brand: "GWM" },
    { date: `2026-05-${String(d).padStart(2,"0")}`, program: "Jornal das Dez", hour: 22, duration: "30s", brand: "GWM" },
  ]),
  // Faixa Horaria 06h-12h 30" - 21,22,23,26,27,28,29,30,31 (4x cada)
  ...[21,22,23,26,27,28,29,30,31].flatMap(d => Array(4).fill(null).map(() =>
    ({ date: `2026-05-${String(d).padStart(2,"0")}`, program: "Faixa 06h-12h", hour: 9, duration: "30s", brand: "GWM" })
  )),
  // Faixa Horaria 12h-18h 30" - 21,22,23,26,27,28,29,30,31 (4x cada)
  ...[21,22,23,26,27,28,29,30,31].flatMap(d => Array(4).fill(null).map(() =>
    ({ date: `2026-05-${String(d).padStart(2,"0")}`, program: "Faixa 12h-18h", hour: 15, duration: "30s", brand: "GWM" })
  )),
  // Faixa Horaria 18h-01h 30" - 21,22,23,26,27,28,29,30,31 (4x cada)
  ...[21,22,23,26,27,28,29,30,31].flatMap(d => Array(4).fill(null).map(() =>
    ({ date: `2026-05-${String(d).padStart(2,"0")}`, program: "Faixa 18h-01h", hour: 19, duration: "30s", brand: "GWM" })
  )),
];

export async function getGWMCampaignData(): Promise<{
  campaignDays: { date: string; label: string; hours: { hour: string; sessions: number }[] }[];
  baselineDays: { date: string; label: string; hours: { hour: string; sessions: number }[] }[];
  programImpact: { program: string; brand: string; date: string; hour: number; sessionsBefore: number; sessionsAfter: number; lift: number; windowLift: number }[];
  leadsByDay: { date: string; contacts: number; leads: number; baseContacts: number; baseLeads: number; leadsLift: number | null; contactsLift: number | null }[];
  totalLeads: number;
  totalContacts: number;
  totalBaseLeads: number;
  totalBaseContacts: number;
  totalLeadsLift: number | null;
  totalContactsLift: number | null;
  responseWindow: { hour: string; avgLift: number; insertions: number }[];
}> {
  // Campaign days available: 21-29/05/2026 (today is 29/05, data available up to today)
  // Baseline: same days of week one week before
  const allDates = ["2026-05-14","2026-05-15","2026-05-16","2026-05-17","2026-05-18","2026-05-19","2026-05-20","2026-05-21","2026-05-22","2026-05-23","2026-05-24","2026-05-25","2026-05-26","2026-05-27","2026-05-28","2026-05-29","2026-05-30","2026-05-31"];

  const dayLabels: Record<string, string> = {
    "2026-05-14": "Qui 14/05", "2026-05-15": "Sex 15/05", "2026-05-16": "Sab 16/05",
    "2026-05-19": "Ter 19/05", "2026-05-20": "Qua 20/05",
    "2026-05-21": "Qui 21/05", "2026-05-22": "Sex 22/05", "2026-05-23": "Sab 23/05",
    "2026-05-24": "Dom 24/05", "2026-05-25": "Seg 25/05", "2026-05-26": "Ter 26/05",
    "2026-05-27": "Qua 27/05", "2026-05-28": "Qui 28/05", "2026-05-29": "Sex 29/05",
    "2026-05-30": "Sab 30/05", "2026-05-31": "Dom 31/05",
  };

  // Filtro de paginas GWM/Haval para leads
  const gwmLeadsFilter = {
    andGroup: {
      expressions: [
        { filter: { fieldName: "eventName", inListFilter: { values: ["generate_lead", "contact"] } } },
        {
          orGroup: {
            expressions: [
              { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/gwm" } } },
              { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/haval" } } },
            ],
          },
        },
      ],
    },
  };

  // Fetch sessions by dateHour for the full range (14-29/05, limiting to available data)
  const [sessionsData, leadsData, leadsBaselineData] = await Promise.all([
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "2026-05-14", endDate: "2026-05-31" }],
      dimensions: [{ name: "dateHour" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "dateHour" } }],
    }),
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "2026-05-21", endDate: "2026-05-31" }],
      dimensions: [{ name: "date" }, { name: "eventName" }, { name: "pagePath" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: gwmLeadsFilter,
    }),
    gaRequest(":runReport", {
      dateRanges: [{ startDate: "2026-05-07", endDate: "2026-05-20" }],
      dimensions: [{ name: "date" }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: gwmLeadsFilter,
    }),
  ]);

  const hourMap: Record<string, Record<string, number>> = {};
  (sessionsData.rows || []).forEach((row: any) => {
    const dateHour: string = row.dimensionValues[0].value;
    const date = `${dateHour.slice(0, 4)}-${dateHour.slice(4, 6)}-${dateHour.slice(6, 8)}`;
    const hour = dateHour.slice(-2);
    if (!hourMap[date]) hourMap[date] = {};
    hourMap[date][hour] = (hourMap[date][hour] || 0) + parseInt(row.metricValues[0].value);
  });

  const buildDayHours = (date: string) =>
    Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, "0");
      return { hour: `${h}:00`, sessions: hourMap[date]?.[h] || 0 };
    });

  // Campaign days: all 11 days per media plan (21-31/05)
  const gwmCampaignDates = ["2026-05-21","2026-05-22","2026-05-23","2026-05-24","2026-05-25","2026-05-26","2026-05-27","2026-05-28","2026-05-29","2026-05-30","2026-05-31"];
  const campaignDays = gwmCampaignDates.map(date => ({
    date,
    label: dayLabels[date] || date,
    hours: buildDayHours(date),
  }));

  // Baseline days: same days of week, one week before
  const baselineMap: Record<string, string> = {
    "2026-05-21": "2026-05-14", // Thu -> Thu
    "2026-05-22": "2026-05-15", // Fri -> Fri
    "2026-05-23": "2026-05-16", // Sat -> Sat
    "2026-05-24": "2026-05-17", // Sun -> Sun
    "2026-05-25": "2026-05-18", // Mon -> Mon
    "2026-05-26": "2026-05-19", // Tue -> Tue
    "2026-05-27": "2026-05-20", // Wed -> Wed
    "2026-05-28": "2026-05-21", // Thu -> Thu
    "2026-05-29": "2026-05-22", // Fri -> Fri
    "2026-05-30": "2026-05-23", // Sat -> Sat
    "2026-05-31": "2026-05-24", // Sun -> Sun
  };
  const baselineDays = gwmCampaignDates.map(date => {
    const bDate = baselineMap[date] || date;
    return {
      date: bDate,
      label: dayLabels[bDate] || bDate,
      hours: buildDayHours(bDate),
    };
  });

  // Calculate program impact (only for dates with available data)
  const availableDates = new Set(gwmCampaignDates);
  const programImpact = GWM_MAI_INSERTIONS_DATA
    .filter(ins => availableDates.has(ins.date))
    .map(ins => {
      const campaignDay = campaignDays.find(d => d.date === ins.date);
      const baselineDate = baselineMap[ins.date];
      const baselineDay = baselineDays.find(d => d.date === baselineDate);
      const hourStr = String(ins.hour).padStart(2, "0") + ":00";
      const sessionsAfter = campaignDay?.hours.find(h => h.hour === hourStr)?.sessions || 0;
      const sessionsBefore = baselineDay?.hours.find(h => h.hour === hourStr)?.sessions || 0;
      const lift = sessionsBefore > 0 ? Math.round(((sessionsAfter - sessionsBefore) / sessionsBefore) * 100) : 0;
      const windowAfter = [0,1,2].reduce((sum, offset) => {
        const wh = String(ins.hour + offset).padStart(2, "0") + ":00";
        return sum + (campaignDay?.hours.find(h => h.hour === wh)?.sessions || 0);
      }, 0);
      const windowBefore = [0,1,2].reduce((sum, offset) => {
        const wh = String(ins.hour + offset).padStart(2, "0") + ":00";
        return sum + (baselineDay?.hours.find(h => h.hour === wh)?.sessions || 0);
      }, 0);
      const windowLift = windowBefore > 0 ? Math.round(((windowAfter - windowBefore) / windowBefore) * 100) : 0;
      return { program: ins.program, brand: ins.brand, date: ins.date, hour: ins.hour, sessionsBefore, sessionsAfter, lift, windowLift };
    });

  // Leads/contacts from GA4 by day (campanha 21-31/05)
  const leadsMap: Record<string, { contacts: number; leads: number }> = {};
  (leadsData.rows || []).forEach((row: any) => {
    const rawDate: string = row.dimensionValues[0].value;
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;
    const event = row.dimensionValues[1].value;
    const count = parseInt(row.metricValues[0].value);
    if (!leadsMap[date]) leadsMap[date] = { contacts: 0, leads: 0 };
    if (event === "contact") leadsMap[date].contacts += count;
    else if (event === "generate_lead") leadsMap[date].leads += count;
  });

  // Leads/contacts baseline (10-20/05) - mesmos dias da semana, 11 dias antes
  // Mapeia cada dia de campanha para o dia correspondente da semana anterior
  // 21/05 (Qui) -> 14/05 (Qui), 22/05 (Sex) -> 15/05 (Sex), etc.
  const baselineLeadsMap: Record<string, { contacts: number; leads: number }> = {};
  (leadsBaselineData.rows || []).forEach((row: any) => {
    const rawDate: string = row.dimensionValues[0].value;
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;
    const event = row.dimensionValues[1].value;
    const count = parseInt(row.metricValues[0].value);
    if (!baselineLeadsMap[date]) baselineLeadsMap[date] = { contacts: 0, leads: 0 };
    if (event === "contact") baselineLeadsMap[date].contacts += count;
    else if (event === "generate_lead") baselineLeadsMap[date].leads += count;
  });

  // Mapear dias de campanha para dias de baseline (7 dias antes = mesmos dias da semana)
  // Dias 28-31/05 usam 2 semanas antes (14 dias) pois 21-24/05 ja sao campanha
  const campaignToBaselineLeads: Record<string, string> = {
    "2026-05-21": "2026-05-14", "2026-05-22": "2026-05-15", "2026-05-23": "2026-05-16",
    "2026-05-24": "2026-05-17", "2026-05-25": "2026-05-18", "2026-05-26": "2026-05-19",
    "2026-05-27": "2026-05-20",
    "2026-05-28": "2026-05-14", "2026-05-29": "2026-05-15",
    "2026-05-30": "2026-05-16", "2026-05-31": "2026-05-17",
  };

  const leadsByDay = gwmCampaignDates.map(date => {
    const baseDate = campaignToBaselineLeads[date];
    const camp = leadsMap[date] || { contacts: 0, leads: 0 };
    const base = baselineLeadsMap[baseDate] || { contacts: 0, leads: 0 };
    const leadsLift = base.leads > 0 ? Math.round(((camp.leads - base.leads) / base.leads) * 100) : null;
    const contactsLift = base.contacts > 0 ? Math.round(((camp.contacts - base.contacts) / base.contacts) * 100) : null;
    return {
      date,
      contacts: camp.contacts,
      leads: camp.leads,
      baseContacts: base.contacts,
      baseLeads: base.leads,
      leadsLift,
      contactsLift,
    };
  });
  const totalContacts = leadsByDay.reduce((s, d) => s + d.contacts, 0);
  const totalLeads = leadsByDay.reduce((s, d) => s + d.leads, 0);
  const totalBaseLeads = leadsByDay.reduce((s, d) => s + d.baseLeads, 0);
  const totalBaseContacts = leadsByDay.reduce((s, d) => s + d.baseContacts, 0);
  const totalLeadsLift = totalBaseLeads > 0 ? Math.round(((totalLeads - totalBaseLeads) / totalBaseLeads) * 100) : null;
  const totalContactsLift = totalBaseContacts > 0 ? Math.round(((totalContacts - totalBaseContacts) / totalBaseContacts) * 100) : null;

  // Response window: average lift per hour offset after insertion (0h, 1h, 2h, 3h)
  const windowBuckets: Record<number, { totalLift: number; count: number }> = {};
  for (let offset = 0; offset <= 3; offset++) windowBuckets[offset] = { totalLift: 0, count: 0 };
  programImpact.forEach(ins => {
    const campaignDay = campaignDays.find(d => d.date === ins.date);
    const baselineDate = baselineMap[ins.date];
    const baselineDay = baselineDays.find(d => d.date === baselineDate);
    for (let offset = 0; offset <= 3; offset++) {
      const wh = String(ins.hour + offset).padStart(2, "0") + ":00";
      const after = campaignDay?.hours.find(h => h.hour === wh)?.sessions || 0;
      const before = baselineDay?.hours.find(h => h.hour === wh)?.sessions || 0;
      if (before > 0) {
        windowBuckets[offset].totalLift += Math.round(((after - before) / before) * 100);
        windowBuckets[offset].count++;
      }
    }
  });
  const responseWindow = [0,1,2,3].map(offset => ({
    hour: offset === 0 ? "Na hora" : `+${offset}h`,
    avgLift: windowBuckets[offset].count > 0 ? Math.round(windowBuckets[offset].totalLift / windowBuckets[offset].count) : 0,
    insertions: windowBuckets[offset].count,
  }));

  return { campaignDays, baselineDays, programImpact, leadsByDay, totalLeads, totalContacts, totalBaseLeads, totalBaseContacts, totalLeadsLift, totalContactsLift, responseWindow };
}


// ---- OVERVIEW FILTERS -------------------------------------------------------
// Builds a GA4 dimensionFilter combining optional URL filter and UTM filters.
// urlFilter: pagePath CONTAINS term
// utmSource: sessionSource EXACT
// utmMedium: sessionMedium EXACT
// utmCampaign: sessionCampaignName EXACT
export interface OverviewFilters {
  urlFilter?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export function buildOverviewFilter(filters: OverviewFilters): object | undefined {
  const expressions: object[] = [];

  if (filters.urlFilter && filters.urlFilter.trim()) {
    expressions.push({
      filter: {
        fieldName: "pagePath",
        stringFilter: { matchType: "CONTAINS", value: filters.urlFilter.trim(), caseSensitive: false },
      },
    });
  }
  if (filters.utmSource && filters.utmSource.trim()) {
    expressions.push({
      filter: {
        fieldName: "sessionSource",
        stringFilter: { matchType: "EXACT", value: filters.utmSource.trim(), caseSensitive: false },
      },
    });
  }
  if (filters.utmMedium && filters.utmMedium.trim()) {
    expressions.push({
      filter: {
        fieldName: "sessionMedium",
        stringFilter: { matchType: "EXACT", value: filters.utmMedium.trim(), caseSensitive: false },
      },
    });
  }
  if (filters.utmCampaign && filters.utmCampaign.trim()) {
    expressions.push({
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: filters.utmCampaign.trim(), caseSensitive: false },
      },
    });
  }

  if (expressions.length === 0) return undefined;
  if (expressions.length === 1) return expressions[0];
  return { andGroup: { expressions } };
}

// Returns available UTM dimension values for the current period (for dropdown population)
export async function getUtmDimensions(period: string, customStart?: string, customEnd?: string, utmSource?: string, utmMedium?: string): Promise<{
  sources: string[];
  mediums: string[];
  campaigns: string[];
}> {
  const dateRange = getDateRange(period, customStart, customEnd);

  // Build cascade filter for mediums (filter by source) and campaigns (filter by source+medium)
  const sourceFilter = utmSource ? {
    filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: utmSource, caseSensitive: false } },
  } : undefined;
  const sourceMediumFilter = utmSource && utmMedium ? {
    andGroup: {
      expressions: [
        { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: utmSource, caseSensitive: false } } },
        { filter: { fieldName: "sessionMedium", stringFilter: { matchType: "EXACT", value: utmMedium, caseSensitive: false } } },
      ],
    },
  } : sourceFilter;

  const [srcData, medData, campData] = await Promise.all([
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 50,
    }),
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 50,
      ...(sourceFilter ? { dimensionFilter: sourceFilter } : {}),
    }),
    gaRequest(":runReport", {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionCampaignName" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 100,
      ...(sourceMediumFilter ? { dimensionFilter: sourceMediumFilter } : {}),
    }),
  ]);

  const clean = (val: string) => val && val !== "(not set)" && val !== "(none)" && val !== "(direct)";

  const sources = (srcData.rows || [])
    .map((r: any) => r.dimensionValues[0].value)
    .filter(clean);

  const mediums = (medData.rows || [])
    .map((r: any) => r.dimensionValues[0].value)
    .filter(clean);

  const campaigns = (campData.rows || [])
    .map((r: any) => r.dimensionValues[0].value)
    .filter(clean);

  return { sources, mediums, campaigns };
}

// Filtered variants of Overview functions
export async function getKeyMetricsFiltered(period: string, customStart?: string, customEnd?: string, filters?: OverviewFilters) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = filters ? buildOverviewFilter(filters) : undefined;
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    ...(dimensionFilter ? { dimensions: [{ name: "pagePath" }] } : {}),
    metrics: [
      { name: "sessions" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
      { name: "newUsers" },
      { name: "activeUsers" },
    ],
    ...(dimensionFilter ? { dimensionFilter } : {}),
    keepEmptyRows: false,
  });

  if (dimensionFilter) {
    const rows = data.rows || [];
    const sessions = rows.reduce((s: number, r: any) => s + parseInt(r.metricValues[0].value || "0"), 0);
    const totalBounceW = rows.reduce((s: number, r: any) => s + parseFloat(r.metricValues[1].value || "0") * parseInt(r.metricValues[0].value || "0"), 0);
    const totalDurW = rows.reduce((s: number, r: any) => s + parseFloat(r.metricValues[2].value || "0") * parseInt(r.metricValues[0].value || "0"), 0);
    const totalPvW = rows.reduce((s: number, r: any) => s + parseFloat(r.metricValues[3].value || "0") * parseInt(r.metricValues[0].value || "0"), 0);
    const newUsers = rows.reduce((s: number, r: any) => s + parseInt(r.metricValues[4].value || "0"), 0);
    const totalUsers = rows.reduce((s: number, r: any) => s + parseInt(r.metricValues[5].value || "0"), 0);
    return {
      sessions,
      bounceRate: sessions > 0 ? (totalBounceW / sessions) * 100 : 0,
      avgSessionDuration: sessions > 0 ? totalDurW / sessions : 0,
      screenPageViewsPerSession: sessions > 0 ? totalPvW / sessions : 0,
      newUsers,
      totalUsers,
    };
  }

  const vals = data.totals?.[0]?.metricValues || data.rows?.[0]?.metricValues || [];
  return {
    sessions: parseInt(vals[0]?.value || "0"),
    bounceRate: parseFloat(vals[1]?.value || "0") * 100,
    avgSessionDuration: parseFloat(vals[2]?.value || "0"),
    screenPageViewsPerSession: parseFloat(vals[3]?.value || "0"),
    newUsers: parseInt(vals[4]?.value || "0"),
    totalUsers: parseInt(vals[5]?.value || "0"),
  };
}

export async function getSessionsByDayFiltered(period: string, customStart?: string, customEnd?: string, filters?: OverviewFilters) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = filters ? buildOverviewFilter(filters) : undefined;
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  return (data.rows || []).map((row: any) => {
    const raw = row.dimensionValues[0].value;
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return { date, sessions: parseInt(row.metricValues[0].value), users: parseInt(row.metricValues[1].value) };
  });
}

export async function getSessionsByHourFiltered(period: string = "today", customStart?: string, customEnd?: string, filters?: OverviewFilters) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = filters ? buildOverviewFilter(filters) : undefined;
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "dateHour" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "dateHour" } }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  const hourMap: Record<string, number> = {};
  const daySet = new Set<string>();
  (data.rows || []).forEach((row: any) => {
    const dateHour: string = row.dimensionValues[0].value;
    const hour = dateHour.slice(-2);
    const day = dateHour.slice(0, 8);
    hourMap[hour] = (hourMap[hour] || 0) + parseInt(row.metricValues[0].value);
    daySet.add(day);
  });
  const isAverage = period !== "today";
  const numDays = Math.max(daySet.size, 1);
  return Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    const total = hourMap[h] || 0;
    return { hour: `${h}:00`, sessions: isAverage ? Math.round(total / numDays) : total, isAverage };
  });
}

export async function getTrafficSourcesFiltered(period: string, customStart?: string, customEnd?: string, filters?: OverviewFilters) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = filters ? buildOverviewFilter(filters) : undefined;
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "sessionDefaultChannelGrouping" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  const rows = data.rows || [];
  const total = rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);
  return rows.map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return { source: row.dimensionValues[0].value, sessions, percentage: total > 0 ? Math.round((sessions / total) * 100) : 0 };
  });
}

export async function getDeviceDistributionFiltered(period: string, customStart?: string, customEnd?: string, filters?: OverviewFilters) {
  const dateRange = getDateRange(period, customStart, customEnd);
  const dimensionFilter = filters ? buildOverviewFilter(filters) : undefined;
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  const rows = data.rows || [];
  const total = rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value), 0);
  return rows.map((row: any) => {
    const sessions = parseInt(row.metricValues[0].value);
    return { device: row.dimensionValues[0].value, sessions, percentage: total > 0 ? Math.round((sessions / total) * 100) : 0 };
  });
}

export async function getTopPagesFiltered(period: string, customStart?: string, customEnd?: string, filters?: OverviewFilters) {
  const dateRange = getDateRange(period, customStart, customEnd);
  let previousRange: { startDate: string; endDate: string };
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart); const end = new Date(customEnd);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - diffDays);
    previousRange = { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
  } else if (period === "today") { previousRange = { startDate: "yesterday", endDate: "yesterday" };
  } else if (period === "yesterday") { previousRange = { startDate: "2daysAgo", endDate: "2daysAgo" };
  } else if (period === "7days") { previousRange = { startDate: "13daysAgo", endDate: "7daysAgo" };
  } else if (period === "15days") { previousRange = { startDate: "29daysAgo", endDate: "15daysAgo" };
  } else if (period === "90days") { previousRange = { startDate: "179daysAgo", endDate: "90daysAgo" };
  } else { previousRange = { startDate: "59daysAgo", endDate: "30daysAgo" }; }

  const dimensionFilter = filters ? buildOverviewFilter(filters) : undefined;
  const data = await gaRequest(":runReport", {
    dateRanges: [dateRange, previousRange],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 60,
    ...(dimensionFilter ? { dimensionFilter } : {}),
  });
  const currentMap: Record<string, { title: string; views: number; sessions: number }> = {};
  const previousMap: Record<string, number> = {};
  (data.rows || []).forEach((row: any) => {
    const path = row.dimensionValues[0].value;
    const title = row.dimensionValues[1].value;
    const views = parseInt(row.metricValues[0].value);
    const sessions = parseInt(row.metricValues[1].value);
    const range = row.dimensionValues[2]?.value;
    if (range === "date_range_1") { previousMap[path] = (previousMap[path] || 0) + views; }
    else {
      if (currentMap[path]) { currentMap[path].views += views; currentMap[path].sessions += sessions; }
      else { currentMap[path] = { title, views, sessions }; }
    }
  });
  return Object.entries(currentMap)
    .map(([page, d]) => ({ page, title: d.title, views: d.views, sessions: d.sessions, change: pctChange(d.views, previousMap[page] || 0) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 50);
}
