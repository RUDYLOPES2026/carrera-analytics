// Script de análise de tráfego sem atribuição
import { gaRequest } from "./analytics";

async function main() {
  // 1. Total por canal (90 dias)
  const channelData90 = await gaRequest(":runReport", {
    dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "newUsers" }, { name: "bounceRate" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  console.log("=== CANAIS (90 dias) ===");
  let totalSessions = 0;
  const channels: any[] = [];
  channelData90.rows?.forEach((r: any) => {
    const channel = r.dimensionValues[0].value;
    const sessions = parseInt(r.metricValues[0].value);
    const newUsers = parseInt(r.metricValues[1].value);
    const bounceRate = parseFloat(r.metricValues[2].value);
    totalSessions += sessions;
    channels.push({ channel, sessions, newUsers, bounceRate });
    console.log(`${channel}: ${sessions} sess, ${newUsers} novos, bounce=${(bounceRate*100).toFixed(1)}%`);
  });
  console.log(`TOTAL: ${totalSessions}`);

  const direct = channels.find(c => c.channel === "Direct");
  const unassigned = channels.find(c => c.channel === "Unassigned");
  const directSess = direct?.sessions || 0;
  const unassignedSess = unassigned?.sessions || 0;
  console.log(`\nDirect: ${directSess} (${((directSess/totalSessions)*100).toFixed(1)}%)`);
  console.log(`Unassigned: ${unassignedSess} (${((unassignedSess/totalSessions)*100).toFixed(1)}%)`);
  console.log(`Sem atribuição total: ${directSess+unassignedSess} (${(((directSess+unassignedSess)/totalSessions)*100).toFixed(1)}%)`);

  // 2. Tendência mensal (últimos 6 meses)
  const monthlyData = await gaRequest(":runReport", {
    dateRanges: [{ startDate: "179daysAgo", endDate: "today" }],
    dimensions: [{ name: "yearMonth" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "yearMonth" } }],
  });

  console.log("\n=== TENDÊNCIA MENSAL (6 meses) ===");
  const monthly: Record<string, Record<string, number>> = {};
  monthlyData.rows?.forEach((r: any) => {
    const month = r.dimensionValues[0].value;
    const channel = r.dimensionValues[1].value;
    const sessions = parseInt(r.metricValues[0].value);
    if (!monthly[month]) monthly[month] = {};
    monthly[month][channel] = sessions;
  });
  Object.entries(monthly).forEach(([month, chans]) => {
    const total = Object.values(chans).reduce((s: number, v: any) => s + v, 0);
    const dir = (chans["Direct"] as number) || 0;
    const unass = (chans["Unassigned"] as number) || 0;
    const pct = (((dir + unass) / total) * 100).toFixed(1);
    console.log(`${month}: total=${total}, direct=${dir}, unassigned=${unass}, sem_atrib=${dir+unass} (${pct}%)`);
  });

  // 3. Source/Medium detalhado para Direct e Unassigned
  const sourceMediumData = await gaRequest(":runReport", {
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
    limit: 30,
  });

  console.log("\n=== SOURCE/MEDIUM SEM ATRIBUIÇÃO (top 30) ===");
  sourceMediumData.rows?.forEach((r: any) => {
    const source = r.dimensionValues[0].value;
    const medium = r.dimensionValues[1].value;
    const channel = r.dimensionValues[2].value;
    const sessions = parseInt(r.metricValues[0].value);
    console.log(`${source} / ${medium} [${channel}]: ${sessions}`);
  });

  // 4. Páginas de entrada mais comuns para Direct
  const landingData = await gaRequest(":runReport", {
    dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
    dimensions: [{ name: "landingPagePlusQueryString" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Direct" } }
    },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 20,
  });

  console.log("\n=== PÁGINAS DE ENTRADA - DIRECT (top 20) ===");
  landingData.rows?.forEach((r: any) => {
    const page = r.dimensionValues[0].value;
    const sessions = parseInt(r.metricValues[0].value);
    console.log(`${page}: ${sessions}`);
  });

  // 5. Dispositivo para Direct + Unassigned
  const deviceData = await gaRequest(":runReport", {
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
  });

  console.log("\n=== DISPOSITIVO - SEM ATRIBUIÇÃO ===");
  deviceData.rows?.forEach((r: any) => {
    const device = r.dimensionValues[0].value;
    const channel = r.dimensionValues[1].value;
    const sessions = parseInt(r.metricValues[0].value);
    console.log(`${device} [${channel}]: ${sessions}`);
  });

  // 6. Unassigned por source/medium detalhado
  const unassignedDetail = await gaRequest(":runReport", {
    dateRanges: [{ startDate: "89daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Unassigned" } }
    },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 20,
  });

  console.log("\n=== UNASSIGNED - SOURCE/MEDIUM DETALHADO ===");
  unassignedDetail.rows?.forEach((r: any) => {
    const source = r.dimensionValues[0].value;
    const medium = r.dimensionValues[1].value;
    const sessions = parseInt(r.metricValues[0].value);
    console.log(`${source} / ${medium}: ${sessions}`);
  });
}

main().catch(console.error);
