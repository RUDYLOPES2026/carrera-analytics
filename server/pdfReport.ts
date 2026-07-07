import PDFDocument from "pdfkit";
import { getTVCampaignData, getTVLeadsData } from "./analytics";

// ---- COLORS ----
const C = {
  bg: "#ffffff",
  dark: "#1e293b",
  darkMid: "#334155",
  mid: "#64748b",
  light: "#94a3b8",
  lighter: "#cbd5e1",
  lightest: "#f1f5f9",
  primary: "#6366f1",
  green: "#22c55e",
  greenBg: "#dcfce7",
  yellow: "#f59e0b",
  yellowBg: "#fef9c3",
  red: "#ef4444",
  redBg: "#fee2e2",
  orange: "#f97316",
  blue: "#3b82f6",
  blueBg: "#dbeafe",
  purple: "#7c3aed",
  purpleBg: "#ede9fe",
  emerald: "#10b981",
  emeraldBg: "#d1fae5",
};

function liftColor(lift: number) {
  if (lift > 5) return C.green;
  if (lift < -5) return C.red;
  return C.yellow;
}
function liftBg(lift: number) {
  if (lift > 5) return C.greenBg;
  if (lift < -5) return C.redBg;
  return C.yellowBg;
}
function liftSign(lift: number) {
  return lift > 0 ? `+${lift}%` : `${lift}%`;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Draw a filled rounded rectangle
function roundRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number, fill: string) {
  doc.roundedRect(x, y, w, h, r).fill(fill);
}

// Draw a horizontal bar chart bar
function drawBar(doc: PDFKit.PDFDocument, x: number, y: number, maxW: number, value: number, maxValue: number, color: string, h = 14) {
  const barW = maxValue > 0 ? Math.max(4, (value / maxValue) * maxW) : 4;
  doc.rect(x, y, maxW, h).fill(C.lightest);
  doc.rect(x, y, barW, h).fill(color);
}

// Draw hourly bar chart
function drawHourlyChart(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  campHours: { hour: string; sessions: number }[],
  baseHours: { hour: string; sessions: number }[],
  insertionHours: number[]
) {
  const maxSess = Math.max(...campHours.map(h => h.sessions), ...baseHours.map(h => h.sessions), 1);
  const barW = (w - 2) / 24;
  const chartH = h - 20;

  // Background
  doc.rect(x, y, w, h).fill(C.lightest);

  // Draw baseline bars (lighter)
  baseHours.forEach((bh, i) => {
    const bx = x + i * barW + 1;
    const bh2 = (bh.sessions / maxSess) * chartH;
    const by = y + chartH - bh2;
    doc.rect(bx + barW * 0.1, by, barW * 0.8, bh2).fill(C.lighter);
  });

  // Draw campaign bars
  campHours.forEach((ch, i) => {
    const bx = x + i * barW + 1;
    const bh2 = (ch.sessions / maxSess) * chartH;
    const by = y + chartH - bh2;
    const isInsertion = insertionHours.includes(i);
    doc.rect(bx + barW * 0.2, by, barW * 0.6, bh2).fill(isInsertion ? C.orange : C.blue);
  });

  // X-axis labels (every 4 hours)
  doc.fontSize(6).fillColor(C.mid);
  [0, 4, 8, 12, 16, 20].forEach(h => {
    const lx = x + h * barW + barW / 2;
    doc.text(`${String(h).padStart(2, "0")}h`, lx - 5, y + chartH + 4, { width: 20, align: "center" });
  });

  // Legend
  const ly = y + h - 2;
  doc.rect(x, ly - 5, 8, 5).fill(C.blue);
  doc.fontSize(5.5).fillColor(C.mid).text("Com TV", x + 10, ly - 5);
  doc.rect(x + 45, ly - 5, 8, 5).fill(C.orange);
  doc.text("Insercao", x + 55, ly - 5);
  doc.rect(x + 95, ly - 5, 8, 5).fill(C.lighter);
  doc.text("Semana anterior", x + 105, ly - 5);
}

// Draw footer on a page
function drawFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number, brand?: string) {
  doc.moveTo(MARGIN, PAGE_H - 30).lineTo(PAGE_W - MARGIN, PAGE_H - 30).stroke(C.lighter);
  doc.fontSize(7.5).fillColor(C.light).font("Helvetica");
  doc.x = MARGIN; doc.y = PAGE_H - 22;
  const brandLabel = brand ? ` · ${brand}` : "";
  doc.text(`Carrera Novos${brandLabel} · TV Carrera Days 2026 · Dados: Google Analytics 4`, { lineBreak: false, continued: true });
  doc.text(`  Pagina ${pageNum} de ${totalPages}`, { align: "right", lineBreak: false });
}

// ---- MAIN EXPORT ----
export async function generateTVCampaignPDF(brand?: string): Promise<Buffer> {
  console.log(`[PDF] Starting TV campaign PDF generation (PDFKit)${brand ? ` brand=${brand}` : ""}...`);

  const data = await getTVCampaignData();
  const leadsData = getTVLeadsData(brand);
  let { campaignDays, baselineDays, insertions, programImpact } = data;

  // Filter by brand if specified
  if (brand) {
    insertions = insertions.filter(ins => ins.brand === brand);
    programImpact = programImpact.filter(p => p.brand === brand);
  }

  // Compute totals
  const totalCamp = campaignDays.reduce((s, d) => s + d.hours.reduce((h, r) => h + r.sessions, 0), 0);
  const totalBase = baselineDays.reduce((s, d) => s + d.hours.reduce((h, r) => h + r.sessions, 0), 0);
  const overallLift = totalBase > 0 ? Math.round(((totalCamp - totalBase) / totalBase) * 100) : 0;

  // Daily stats
  const dailyStats = campaignDays.map((day, i) => {
    const base = baselineDays[i];
    const total = day.hours.reduce((s, h) => s + h.sessions, 0);
    const baseTotal = base?.hours.reduce((s, h) => s + h.sessions, 0) || 0;
    const lift = baseTotal > 0 ? Math.round(((total - baseTotal) / baseTotal) * 100) : 0;
    return { date: day.date, label: day.label, total, baseTotal, lift };
  });

  const bestDay = [...dailyStats].sort((a, b) => b.lift - a.lift)[0];

  // Program ranking
  const programRanking = Object.values(
    programImpact.reduce((acc: Record<string, { program: string; totalLift: number; count: number; totalSessions: number }>, imp) => {
      if (!acc[imp.program]) acc[imp.program] = { program: imp.program, totalLift: 0, count: 0, totalSessions: 0 };
      acc[imp.program].totalLift += imp.lift;
      acc[imp.program].count += 1;
      acc[imp.program].totalSessions += imp.sessionsAfter;
      return acc;
    }, {})
  ).map(p => ({ ...p, avgLift: Math.round(p.totalLift / p.count) }))
    .sort((a, b) => b.avgLift - a.avgLift);

  const bestProgram = programRanking[0];

  // Brand analysis (only for general report)
  const brandStats = ["VW", "Chevrolet", "GWM"].map(b => {
    const brandImpacts = data.programImpact.filter(p => p.brand === b);
    const avgLift = brandImpacts.length > 0 ? Math.round(brandImpacts.reduce((s, p) => s + p.lift, 0) / brandImpacts.length) : 0;
    return { brand: b, count: brandImpacts.length, avgLift };
  });

  const dayLabels: Record<string, string> = {
    "2026-03-19": "QUINTA-FEIRA, 19 DE MARCO",
    "2026-03-20": "SEXTA-FEIRA, 20 DE MARCO",
    "2026-03-21": "SABADO, 21 DE MARCO",
    "2026-03-22": "DOMINGO, 22 DE MARCO",
  };

  // Leads summary
  const leadsCampTotal = leadsData.campTotal;
  const leadsBaseTotal = leadsData.baseTotal;
  const leadsLift = leadsData.lift;
  const leadsDays = leadsData.campaignDays;
  const leadsBaseDays = leadsData.baselineDays;

  // Total pages: 1 (resumao) + 4 (dias) + 1 (leads) + 1 (ranking/marcas) = 7 for general
  // For brand: 1 (resumao) + 4 (dias) + 1 (leads) + 1 (ranking) = 7
  const TOTAL_PAGES = 7;

  // Create PDF
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfDone = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const brandTitle = brand ? ` — ${brand}` : "";

  // ================================================================
  // PAGE 1: RESUMAO EXECUTIVO
  // ================================================================

  // Header bar
  roundRect(doc, 0, 0, PAGE_W, 70, 0, C.dark);
  doc.fontSize(9).fillColor(C.light).text("RELATORIO DE CAMPANHA", MARGIN, 14);
  doc.fontSize(22).fillColor("#ffffff").font("Helvetica-Bold").text(`TV Carrera Days${brandTitle}`, MARGIN, 26);
  doc.fontSize(9).fillColor(C.light).font("Helvetica").text("19 a 22 de marco de 2026  ·  Rede Globo", MARGIN, 52);

  // Date badge (top right)
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.fontSize(8).fillColor(C.light).text("GERADO EM", PAGE_W - MARGIN - 80, 14, { width: 80, align: "right" });
  doc.fontSize(9).fillColor("#ffffff").font("Helvetica-Bold").text(today, PAGE_W - MARGIN - 80, 26, { width: 80, align: "right" });
  roundRect(doc, PAGE_W - MARGIN - 70, 44, 70, 16, 8, C.orange);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("Carrera Novos", PAGE_W - MARGIN - 70, 48, { width: 70, align: "center" });

  let curY = 85;

  // Section label
  roundRect(doc, MARGIN, curY, 72, 16, 8, C.orange);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("RESUMAO", MARGIN + 4, curY + 4, { width: 64, align: "center" });
  doc.fontSize(13).fillColor(C.dark).font("Helvetica-Bold").text("O que aconteceu com o site durante a campanha?", MARGIN + 80, curY + 2);

  curY += 28;

  // 4 KPI cards — VISITAS
  const cardW = (CONTENT_W - 9) / 4;
  const kpiCards = [
    { label: "VISITAS AO SITE", value: totalCamp.toLocaleString("pt-BR"), sub: "em 4 dias de campanha", bg: C.blue, textColor: "#ffffff" },
    { label: "CRESCIMENTO DE VISITAS", value: liftSign(overallLift), sub: "vs. semana sem TV", bg: C.green, textColor: "#ffffff" },
    { label: "MELHOR DIA", value: bestDay?.label?.split(" ")[0] || "-", sub: liftSign(bestDay?.lift || 0), bg: C.orange, textColor: "#ffffff" },
    { label: "MELHOR PROGRAMA", value: bestProgram?.program || "-", sub: liftSign(bestProgram?.avgLift || 0), bg: C.purple, textColor: "#ffffff" },
  ];

  kpiCards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 3);
    roundRect(doc, cx, curY, cardW, 70, 8, card.bg);
    doc.fontSize(7.5).fillColor("#ffffff").font("Helvetica-Bold").text(card.label, cx + 8, curY + 8, { width: cardW - 16 });
    doc.fontSize(card.value.length > 6 ? 18 : 24).fillColor(card.textColor).font("Helvetica-Bold").text(card.value, cx + 8, curY + 22, { width: cardW - 16 });
    doc.fontSize(8).fillColor("#ffffff").font("Helvetica").text(card.sub, cx + 8, curY + 52, { width: cardW - 16 });
  });

  curY += 82;

  // 4 KPI cards — LEADS
  const leadsCards = [
    { label: "LEADS COM TV", value: String(leadsCampTotal), sub: "19-22/03 com TV", bg: C.emerald, textColor: "#ffffff" },
    { label: "LEADS SEM TV", value: String(leadsBaseTotal), sub: "12-15/03 sem TV", bg: C.darkMid, textColor: "#ffffff" },
    { label: "CRESCIMENTO DE LEADS", value: liftSign(leadsLift), sub: "vs. semana sem TV", bg: leadsLift > 5 ? C.green : leadsLift < -5 ? C.red : C.yellow, textColor: "#ffffff" },
    { label: "VARIACAO DE LEADS", value: String(leadsCampTotal - leadsBaseTotal), sub: "gerados pela TV", bg: C.blue, textColor: "#ffffff" },
  ];

  leadsCards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 3);
    roundRect(doc, cx, curY, cardW, 60, 8, card.bg);
    doc.fontSize(7.5).fillColor("#ffffff").font("Helvetica-Bold").text(card.label, cx + 8, curY + 8, { width: cardW - 16 });
    doc.fontSize(card.value.length > 6 ? 18 : 22).fillColor(card.textColor).font("Helvetica-Bold").text(card.value, cx + 8, curY + 20, { width: cardW - 16 });
    doc.fontSize(7.5).fillColor("#ffffff").font("Helvetica").text(card.sub, cx + 8, curY + 44, { width: cardW - 16 });
  });

  curY += 72;

  // Bar chart section — visitas
  roundRect(doc, MARGIN, curY, CONTENT_W, 120, 8, "#ffffff");
  doc.rect(MARGIN, curY, CONTENT_W, 120).stroke(C.lighter);
  doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text("CRESCIMENTO DE VISITAS POR DIA (VS. SEMANA ANTERIOR SEM TV)", MARGIN + 12, curY + 10);

  const maxLift = Math.max(...dailyStats.map(d => d.lift), 1);
  const barMaxW = CONTENT_W - 140;
  const dayNames = ["Qui", "Sex", "Sab", "Dom"];

  dailyStats.forEach((day, i) => {
    const by = curY + 28 + i * 22;
    doc.fontSize(9).fillColor(C.dark).font("Helvetica-Bold").text(dayNames[i], MARGIN + 12, by + 1, { width: 25 });
    drawBar(doc, MARGIN + 42, by, barMaxW, day.lift, maxLift, day.lift > 10 ? C.green : day.lift > 0 ? C.yellow : C.red);
    doc.fontSize(9).fillColor(liftColor(day.lift)).font("Helvetica-Bold").text(liftSign(day.lift), MARGIN + 42 + barMaxW + 6, by + 1, { width: 35 });
    doc.fontSize(8).fillColor(C.mid).font("Helvetica").text(`${day.total.toLocaleString("pt-BR")} visitas`, MARGIN + 42 + barMaxW + 44, by + 1, { width: 70 });
  });

  // Legend
  doc.fontSize(7).fillColor(C.mid).font("Helvetica");
  doc.rect(MARGIN + 12, curY + 108, 8, 6).fill(C.green);
  doc.text("Verde = crescimento acima de 10%", MARGIN + 24, curY + 108);
  doc.rect(MARGIN + 140, curY + 108, 8, 6).fill(C.yellow);
  doc.text("Amarelo = estavel", MARGIN + 152, curY + 108);
  doc.rect(MARGIN + 220, curY + 108, 8, 6).fill(C.red);
  doc.text("Vermelho = queda", MARGIN + 232, curY + 108);

  curY += 132;

  // Unified comparison table: visitas + leads per day
  const unifiedTableH = 20 + 14 + 5 * 18 + 10; // header + col headers + 4 days + total
  roundRect(doc, MARGIN, curY, CONTENT_W, unifiedTableH, 8, "#ffffff");
  doc.rect(MARGIN, curY, CONTENT_W, unifiedTableH).stroke(C.lighter);
  doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text("COMPARATIVO COMPLETO - VISITAS E LEADS (4 DIAS DE CAMPANHA)", MARGIN + 12, curY + 8);

  // Column positions for 8 columns
  const cols = [MARGIN + 8, MARGIN + 52, MARGIN + 120, MARGIN + 188, MARGIN + 250, MARGIN + 308, MARGIN + 360, MARGIN + 410];
  const headers = ["DIA", "VISITAS\nCOM TV", "VISITAS\nSEM TV", "LEADS\nCOM TV", "LEADS\nSEM TV", "INSERCOES", "RESULT.\nVISITAS", "RESULT.\nLEADS"];
  roundRect(doc, MARGIN + 4, curY + 20, CONTENT_W - 8, 16, 4, C.lightest);
  headers.forEach((h, i) => {
    const lines = h.split("\n");
    doc.fontSize(6).fillColor(C.mid).font("Helvetica-Bold").text(lines[0], cols[i], curY + 22, { width: 55, lineBreak: false });
    if (lines[1]) doc.text(" " + lines[1], { continued: false });
  });

  dailyStats.forEach((day, i) => {
    const ry = curY + 38 + i * 18;
    if (i % 2 === 0) doc.rect(MARGIN + 4, ry - 2, CONTENT_W - 8, 18).fill("#fafafa");
    const insCount = insertions.filter(ins => ins.date === day.date).length;
    const dl = leadsDays[i];
    const dlBase = leadsBaseDays[i];
    const leadsLiftDay = dlBase.total > 0 ? Math.round(((dl.total / dlBase.total) - 1) * 100) : 0;
    doc.fontSize(8).fillColor(C.dark).font("Helvetica-Bold").text(day.label.split(" ")[0], cols[0], ry, { width: 42 });
    doc.font("Helvetica").text(day.total.toLocaleString("pt-BR"), cols[1], ry, { width: 65 });
    doc.fillColor(C.mid).text(day.baseTotal.toLocaleString("pt-BR"), cols[2], ry, { width: 65 });
    doc.fillColor(C.emerald).font("Helvetica-Bold").text(String(dl.total), cols[3], ry, { width: 58 });
    doc.fillColor(C.mid).font("Helvetica").text(String(dlBase.total), cols[4], ry, { width: 55 });
    doc.fillColor(C.dark).text(String(insCount), cols[5], ry, { width: 48 });
    roundRect(doc, cols[6], ry - 2, 44, 14, 6, liftBg(day.lift));
    doc.fontSize(7.5).fillColor(liftColor(day.lift)).font("Helvetica-Bold").text(liftSign(day.lift), cols[6], ry, { width: 44, align: "center" });
    roundRect(doc, cols[7], ry - 2, 44, 14, 6, liftBg(leadsLiftDay));
    doc.fontSize(7.5).fillColor(liftColor(leadsLiftDay)).font("Helvetica-Bold").text(liftSign(leadsLiftDay), cols[7], ry, { width: 44, align: "center" });
  });

  const totalRow = curY + 38 + 4 * 18;
  roundRect(doc, MARGIN + 4, totalRow - 2, CONTENT_W - 8, 18, 4, C.lightest);
  doc.fontSize(8).fillColor(C.dark).font("Helvetica-Bold").text("TOTAL", cols[0], totalRow, { width: 42 });
  doc.text(totalCamp.toLocaleString("pt-BR"), cols[1], totalRow, { width: 65 });
  doc.fillColor(C.mid).font("Helvetica").text(totalBase.toLocaleString("pt-BR"), cols[2], totalRow, { width: 65 });
  doc.fillColor(C.emerald).font("Helvetica-Bold").text(String(leadsCampTotal), cols[3], totalRow, { width: 58 });
  doc.fillColor(C.mid).font("Helvetica").text(String(leadsBaseTotal), cols[4], totalRow, { width: 55 });
  doc.fillColor(C.dark).font("Helvetica-Bold").text(String(insertions.length), cols[5], totalRow, { width: 48 });
  roundRect(doc, cols[6], totalRow - 2, 44, 14, 6, liftBg(overallLift));
  doc.fontSize(7.5).fillColor(liftColor(overallLift)).font("Helvetica-Bold").text(liftSign(overallLift), cols[6], totalRow, { width: 44, align: "center" });
  roundRect(doc, cols[7], totalRow - 2, 44, 14, 6, liftBg(leadsLift));
  doc.fontSize(7.5).fillColor(liftColor(leadsLift)).font("Helvetica-Bold").text(liftSign(leadsLift), cols[7], totalRow, { width: 44, align: "center" });

  curY += unifiedTableH + 12;

  // Conclusion box
  roundRect(doc, MARGIN, curY, CONTENT_W, 52, 8, "#fffbeb");
  doc.rect(MARGIN, curY, CONTENT_W, 52).stroke("#fde68a");
  doc.rect(MARGIN, curY, 4, 52).fill(C.yellow);
  doc.fontSize(8).fillColor(C.yellow).font("Helvetica-Bold").text("CONCLUSAO PRINCIPAL", MARGIN + 12, curY + 8);
  const conclusionText = `A campanha TV Carrera Days${brandTitle} gerou ${(totalCamp - totalBase).toLocaleString("pt-BR")} visitas adicionais e ${leadsCampTotal - leadsBaseTotal} leads adicionais em 4 dias. Crescimento de ${liftSign(overallLift)} em visitas e ${liftSign(leadsLift)} em leads vs. semana anterior sem TV. Melhor programa: ${bestProgram?.program || "-"} com ${liftSign(bestProgram?.avgLift || 0)}.`;
  doc.fontSize(8.5).fillColor(C.darkMid).font("Helvetica").text(conclusionText, MARGIN + 12, curY + 20, { width: CONTENT_W - 24, lineGap: 2 });

  drawFooter(doc, 1, TOTAL_PAGES, brand);

  // ================================================================
  // PAGES 2-5: ANALISE POR DIA
  // ================================================================

  campaignDays.forEach((campDay, dayIdx) => {
    doc.addPage();

    const baseDay = baselineDays[dayIdx];
    const dayInsertions = insertions.filter(ins => ins.date === campDay.date);
    const insertionHours = dayInsertions.map(ins => ins.hour);
    const dayTotal = campDay.hours.reduce((s, h) => s + h.sessions, 0);
    const baseTotal = baseDay?.hours.reduce((s, h) => s + h.sessions, 0) || 0;
    const dayLift = baseTotal > 0 ? Math.round(((dayTotal - baseTotal) / baseTotal) * 100) : 0;

    // Leads for this day
    const dayLeads = leadsDays[dayIdx];
    const dayLeadsBase = leadsBaseDays[dayIdx];
    const dayLeadsLift = dayLeadsBase.total > 0 ? Math.round(((dayLeads.total / dayLeadsBase.total) - 1) * 100) : 0;

    // Header badge
    roundRect(doc, MARGIN, MARGIN, 110, 16, 8, C.dark);
    doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("ANALISE DETALHADA", MARGIN + 4, MARGIN + 4, { width: 102, align: "center" });
    doc.fontSize(9).fillColor(C.mid).font("Helvetica").text(`Dia ${dayIdx + 1} de 4`, MARGIN + 118, MARGIN + 4);

    // Day title
    let dy = MARGIN + 24;
    doc.fontSize(9).fillColor(C.mid).font("Helvetica-Bold").text(dayLabels[campDay.date] || campDay.label, MARGIN, dy);
    dy += 12;
    doc.fontSize(22).fillColor(C.dark).font("Helvetica-Bold").text(campDay.label, MARGIN, dy);

    // Lift badge (top right)
    const liftC = liftColor(dayLift);
    doc.fontSize(28).fillColor(liftC).font("Helvetica-Bold").text(liftSign(dayLift), PAGE_W - MARGIN - 80, dy - 4, { width: 80, align: "right" });
    doc.fontSize(8).fillColor(C.mid).font("Helvetica").text("vs. semana anterior", PAGE_W - MARGIN - 80, dy + 26, { width: 80, align: "right" });

    dy += 40;

    // 6 mini KPI cards: 4 visitas + 2 leads
    const mkW = (CONTENT_W - 15) / 6;
    const miniCards = [
      { label: "VISITAS NO DIA", value: dayTotal.toLocaleString("pt-BR"), bg: C.lightest, valueColor: C.dark },
      { label: "SEM TV (REF.)", value: baseTotal.toLocaleString("pt-BR"), bg: C.lightest, valueColor: C.mid },
      { label: "CRESCIMENTO", value: liftSign(dayLift), bg: liftBg(dayLift), valueColor: liftC },
      { label: "INSERCOES TV", value: String(dayInsertions.length), bg: C.lightest, valueColor: C.orange },
      { label: "LEADS COM TV", value: String(dayLeads.total), bg: C.emeraldBg, valueColor: C.emerald },
      { label: "LEADS SEM TV", value: String(dayLeadsBase.total), bg: C.lightest, valueColor: C.mid },
    ];
    miniCards.forEach((card, i) => {
      const cx = MARGIN + i * (mkW + 3);
      roundRect(doc, cx, dy, mkW, 50, 6, card.bg);
      doc.rect(cx, dy, mkW, 50).stroke(C.lighter);
      doc.fontSize(6.5).fillColor(C.mid).font("Helvetica-Bold").text(card.label, cx + 6, dy + 8, { width: mkW - 12 });
      doc.fontSize(16).fillColor(card.valueColor).font("Helvetica-Bold").text(card.value, cx + 6, dy + 22, { width: mkW - 12 });
    });

    dy += 62;

    // Hourly chart
    roundRect(doc, MARGIN, dy, CONTENT_W, 140, 6, "#ffffff");
    doc.rect(MARGIN, dy, CONTENT_W, 140).stroke(C.lighter);
    doc.fontSize(7.5).fillColor(C.mid).font("Helvetica-Bold").text("TRAFEGO POR HORA", MARGIN + 10, dy + 8);
    doc.fontSize(7).fillColor(C.mid).font("Helvetica").text("Azul = com TV   Laranja = hora com insercao   Cinza = semana anterior", MARGIN + 10, dy + 18);

    drawHourlyChart(
      doc,
      MARGIN + 8, dy + 28, CONTENT_W - 16, 105,
      campDay.hours,
      baseDay?.hours || campDay.hours.map(h => ({ ...h, sessions: 0 })),
      insertionHours
    );

    dy += 152;

    // Insertions table with leads-per-window column
    if (dayInsertions.length > 0) {
      const tableH = 20 + dayInsertions.length * 18 + 16;
      roundRect(doc, MARGIN, dy, CONTENT_W, tableH, 6, "#ffffff");
      doc.rect(MARGIN, dy, CONTENT_W, tableH).stroke(C.lighter);
      doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text("INSERCOES DO DIA E IMPACTO", MARGIN + 10, dy + 8);

      const tCols = [MARGIN + 8, MARGIN + 58, MARGIN + 185, MARGIN + 270, MARGIN + 330, MARGIN + 395];
      const tHeaders = ["HORARIO", "PROGRAMA", "MARCA", "IMPACTO\nVISITAS", "LEADS\nCOM TV", "LEADS\nSEM TV"];
      roundRect(doc, MARGIN + 4, dy + 18, CONTENT_W - 8, 14, 4, C.lightest);
      tHeaders.forEach((h, i) => {
        const lines = h.split("\n");
        doc.fontSize(6).fillColor(C.mid).font("Helvetica-Bold").text(lines[0], tCols[i], dy + 21, { width: 60, lineBreak: false });
        if (lines[1]) doc.text(" " + lines[1], { continued: false });
      });

      // Get leads byHour for this day
      const campDayLeads = leadsData.campaignDays[dayIdx];
      const baseDayLeads = leadsData.baselineDays[dayIdx];

      dayInsertions.forEach((ins, i) => {
        const ry = dy + 34 + i * 18;
        if (i % 2 === 0) doc.rect(MARGIN + 4, ry - 2, CONTENT_W - 8, 18).fill("#fafafa");
        const impactIns = data.programImpact.find(p => p.date === ins.date && p.hour === ins.hour && p.brand === ins.brand && p.program === ins.program);
        const impLift = impactIns?.lift || 0;
        const timeStr = `${String(ins.hour).padStart(2, "0")}h${String(ins.minute).padStart(2, "0")}`;
        // Leads in window: insertion hour + next hour
        const h0 = ins.hour;
        const h1 = Math.min(ins.hour + 1, 23);
        const campByHour = (campDayLeads?.byHour || {}) as Record<string, number>;
        const baseByHour = (baseDayLeads?.byHour || {}) as Record<string, number>;
        const campLeadsWindow = (campByHour[String(h0)] || 0) + (campByHour[String(h1)] || 0);
        const baseLeadsWindow = (baseByHour[String(h0)] || 0) + (baseByHour[String(h1)] || 0);
        doc.fontSize(8.5).fillColor(C.dark).font("Helvetica-Bold").text(timeStr, tCols[0], ry, { width: 48 });
        doc.font("Helvetica").text(ins.program, tCols[1], ry, { width: 122 });
        doc.text(ins.brand, tCols[2], ry, { width: 80 });
        roundRect(doc, tCols[3], ry - 2, 52, 14, 6, liftBg(impLift));
        doc.fontSize(7.5).fillColor(liftColor(impLift)).font("Helvetica-Bold").text(liftSign(impLift), tCols[3], ry, { width: 52, align: "center" });
        // Leads columns
        doc.fontSize(8.5).fillColor(C.emerald).font("Helvetica-Bold").text(String(campLeadsWindow), tCols[4], ry, { width: 52 });
        doc.fillColor(C.mid).font("Helvetica").text(String(baseLeadsWindow), tCols[5], ry, { width: 52 });
      });

      // Note below table
      const noteY = dy + 34 + dayInsertions.length * 18;
      doc.fontSize(6.5).fillColor(C.light).font("Helvetica").text("* Leads na janela = leads captados na hora da insercao + hora seguinte vs. mesma janela na semana anterior", MARGIN + 8, noteY, { width: CONTENT_W - 16 });
    }

    drawFooter(doc, dayIdx + 2, TOTAL_PAGES, brand);
  });

  // ================================================================
  // PAGE 6: LEADS — ANALISE COMPLETA
  // ================================================================

  doc.addPage();

  roundRect(doc, MARGIN, MARGIN, 90, 16, 8, C.emerald);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("LEADS", MARGIN + 4, MARGIN + 4, { width: 82, align: "center" });
  doc.fontSize(9).fillColor(C.mid).font("Helvetica").text("Captacao de Leads na Campanha", MARGIN + 98, MARGIN + 4);

  let lp = MARGIN + 26;

  doc.fontSize(14).fillColor(C.dark).font("Helvetica-Bold").text(`Leads Captados${brandTitle} — Campanha vs. Baseline`, MARGIN, lp);
  lp += 14;
  doc.fontSize(8.5).fillColor(C.mid).font("Helvetica").text("Comparativo de leads gerados durante a campanha de TV (19-22/03) vs. semana de referencia sem TV (12-15/03)", MARGIN, lp);
  lp += 18;

  // Summary cards
  const leadsKpiW = (CONTENT_W - 9) / 4;
  const leadsKpiCards = [
    { label: "TOTAL CAMPANHA", value: String(leadsCampTotal), sub: "19-22/03 com TV", bg: C.emerald, tc: "#ffffff" },
    { label: "TOTAL BASELINE", value: String(leadsBaseTotal), sub: "12-15/03 sem TV", bg: C.darkMid, tc: "#ffffff" },
    { label: "VARIACAO DE LEADS", value: String(leadsCampTotal - leadsBaseTotal), sub: "gerados pela TV", bg: C.blue, tc: "#ffffff" },
    { label: "CRESCIMENTO", value: liftSign(leadsLift), sub: "vs. semana anterior", bg: leadsLift > 5 ? C.green : leadsLift < -5 ? C.red : C.yellow, tc: "#ffffff" },
  ];
  leadsKpiCards.forEach((card, i) => {
    const cx = MARGIN + i * (leadsKpiW + 3);
    roundRect(doc, cx, lp, leadsKpiW, 65, 8, card.bg);
    doc.fontSize(7).fillColor("#ffffff").font("Helvetica-Bold").text(card.label, cx + 8, lp + 8, { width: leadsKpiW - 16 });
    doc.fontSize(22).fillColor(card.tc).font("Helvetica-Bold").text(card.value, cx + 8, lp + 22, { width: leadsKpiW - 16 });
    doc.fontSize(7.5).fillColor("#ffffff").font("Helvetica").text(card.sub, cx + 8, lp + 48, { width: leadsKpiW - 16 });
  });
  lp += 78;

  // Leads per day table
  doc.fontSize(11).fillColor(C.dark).font("Helvetica-Bold").text("Leads por Dia", MARGIN, lp);
  lp += 14;

  const ldCols = [MARGIN + 10, MARGIN + 100, MARGIN + 185, MARGIN + 265, MARGIN + 340, MARGIN + 415];
  const ldHeaders = ["DIA", "CAMPANHA", "BASELINE", "VARIACAO", "SITE", "WHATSAPP"];
  roundRect(doc, MARGIN, lp, CONTENT_W, 14, 4, C.lightest);
  doc.rect(MARGIN, lp, CONTENT_W, 14).stroke(C.lighter);
  ldHeaders.forEach((h, i) => {
    doc.fontSize(7).fillColor(C.mid).font("Helvetica-Bold").text(h, ldCols[i], lp + 4, { width: 80 });
  });
  lp += 16;

  const ldDayNames = ["Qui 19/03", "Sex 20/03", "Sab 21/03", "Dom 22/03"];
  leadsDays.forEach((cd, i) => {
    const bd = leadsBaseDays[i];
    const dl = bd.total > 0 ? Math.round(((cd.total / bd.total) - 1) * 100) : 0;
    const ry = lp + i * 18;
    if (i % 2 === 0) doc.rect(MARGIN, ry - 2, CONTENT_W, 18).fill("#fafafa");
    doc.fontSize(8.5).fillColor(C.dark).font("Helvetica-Bold").text(ldDayNames[i], ldCols[0], ry);
    doc.font("Helvetica").text(String(cd.total), ldCols[1], ry);
    doc.fillColor(C.mid).text(String(bd.total), ldCols[2], ry);
    roundRect(doc, ldCols[3], ry - 2, 50, 14, 6, liftBg(dl));
    doc.fontSize(8).fillColor(liftColor(dl)).font("Helvetica-Bold").text(liftSign(dl), ldCols[3], ry, { width: 50, align: "center" });
    doc.fontSize(8.5).fillColor(C.dark).font("Helvetica").text(String(cd.site), ldCols[4], ry);
    doc.text(String(cd.whatsapp), ldCols[5], ry);
  });

  // Total row
  const ldTotalY = lp + 4 * 18;
  roundRect(doc, MARGIN, ldTotalY - 2, CONTENT_W, 16, 4, C.lightest);
  doc.fontSize(8).fillColor(C.dark).font("Helvetica-Bold").text("TOTAL", ldCols[0], ldTotalY);
  doc.text(String(leadsCampTotal), ldCols[1], ldTotalY);
  doc.fillColor(C.mid).font("Helvetica").text(String(leadsBaseTotal), ldCols[2], ldTotalY);
  roundRect(doc, ldCols[3], ldTotalY - 2, 50, 14, 6, liftBg(leadsLift));
  doc.fontSize(8).fillColor(liftColor(leadsLift)).font("Helvetica-Bold").text(liftSign(leadsLift), ldCols[3], ldTotalY, { width: 50, align: "center" });
  const totalSite = leadsDays.reduce((s, d) => s + d.site, 0);
  const totalWpp = leadsDays.reduce((s, d) => s + d.whatsapp, 0);
  doc.fontSize(8.5).fillColor(C.dark).font("Helvetica").text(String(totalSite), ldCols[4], ldTotalY);
  doc.text(String(totalWpp), ldCols[5], ldTotalY);

  lp += 4 * 18 + 22;

  // Brand leads section (only for general report)
  if (!brand) {
    doc.fontSize(11).fillColor(C.dark).font("Helvetica-Bold").text("Leads por Marca (TV) — Campanha vs. Baseline", MARGIN, lp);
    lp += 14;

    const brandLeadsW = (CONTENT_W - 6) / 3;
    const brandLeadsColors: Record<string, string> = { VW: C.blue, Chevrolet: C.yellow, GWM: C.green };
    const leadsAllBrands = leadsData.brandTotals;

    (["Chevrolet", "GWM", "VW"] as const).forEach((b, i) => {
      const bt = leadsAllBrands[b];
      if (!bt) return;
      const bx = MARGIN + i * (brandLeadsW + 3);
      roundRect(doc, bx, lp, brandLeadsW, 80, 8, "#ffffff");
      doc.rect(bx, lp, brandLeadsW, 80).stroke(C.lighter);
      doc.rect(bx, lp, brandLeadsW, 4).fill(brandLeadsColors[b] || C.primary);
      doc.fontSize(14).fillColor(C.dark).font("Helvetica-Bold").text(b, bx + 10, lp + 12, { width: brandLeadsW - 20, align: "center" });
      doc.fontSize(22).fillColor(liftColor(bt.lift)).font("Helvetica-Bold").text(liftSign(bt.lift), bx + 10, lp + 28, { width: brandLeadsW - 20, align: "center" });
      doc.fontSize(8).fillColor(C.mid).font("Helvetica").text(`${bt.camp} leads na campanha`, bx + 10, lp + 54, { width: brandLeadsW - 20, align: "center" });
      doc.fontSize(7.5).fillColor(C.mid).text(`${bt.base} leads no baseline`, bx + 10, lp + 64, { width: brandLeadsW - 20, align: "center" });
    });

    lp += 92;
  }

  // Leads insight box
  const leadsInsightText = brand
    ? `Para a marca ${brand}, a campanha de TV gerou ${leadsCampTotal} leads em 4 dias, contra ${leadsBaseTotal} leads na semana de referencia sem TV — um crescimento de ${liftSign(leadsLift)}. Isso demonstra que alem de aumentar o trafego no site, a TV tambem impulsionou a captacao de contatos qualificados para ${brand}.`
    : `A campanha TV Carrera Days gerou ${leadsCampTotal} leads em 4 dias, contra ${leadsBaseTotal} na semana de referencia — crescimento de ${liftSign(leadsLift)}. GWM liderou com +${leadsData.brandTotals["GWM"]?.lift || 0}% de crescimento em leads, seguida de VW (+${leadsData.brandTotals["VW"]?.lift || 0}%) e Chevrolet (${liftSign(leadsData.brandTotals["Chevrolet"]?.lift || 0)}). A TV nao apenas trouxe mais visitas, mas tambem converteu em contatos qualificados.`;

  roundRect(doc, MARGIN, lp, CONTENT_W, 60, 8, "#ecfdf5");
  doc.rect(MARGIN, lp, CONTENT_W, 60).stroke("#6ee7b7");
  doc.rect(MARGIN, lp, 4, 60).fill(C.emerald);
  doc.fontSize(8).fillColor(C.emerald).font("Helvetica-Bold").text("INSIGHT DE LEADS", MARGIN + 12, lp + 8);
  doc.fontSize(8.5).fillColor(C.darkMid).font("Helvetica").text(leadsInsightText, MARGIN + 12, lp + 20, { width: CONTENT_W - 24, lineGap: 2 });

  drawFooter(doc, 6, TOTAL_PAGES, brand);

  // ================================================================
  // PAGE 7: RANKING DE PROGRAMAS + ANALISE POR MARCA
  // ================================================================

  doc.addPage();

  roundRect(doc, MARGIN, MARGIN, 90, 16, 8, C.purple);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("ANALISE FINAL", MARGIN + 4, MARGIN + 4, { width: 82, align: "center" });
  doc.fontSize(9).fillColor(C.mid).font("Helvetica").text("Programas e Marcas", MARGIN + 98, MARGIN + 4);

  let py = MARGIN + 26;

  // Program ranking
  doc.fontSize(14).fillColor(C.dark).font("Helvetica-Bold").text(`Ranking de Programas por Impacto${brandTitle}`, MARGIN, py);
  py += 16;
  doc.fontSize(8.5).fillColor(C.mid).font("Helvetica").text("Qual programa de TV gerou mais visitas ao site na hora da veiculacao?", MARGIN, py);
  py += 16;

  const pCols = [MARGIN + 10, MARGIN + 35, MARGIN + 200, MARGIN + 290, MARGIN + 380];
  const pHeaders = ["#", "PROGRAMA", "INSERCOES", "IMPACTO MEDIO", "TOTAL DE VISITAS"];
  roundRect(doc, MARGIN, py, CONTENT_W, 14, 4, C.lightest);
  doc.rect(MARGIN, py, CONTENT_W, 14).stroke(C.lighter);
  pHeaders.forEach((h, i) => {
    doc.fontSize(7).fillColor(C.mid).font("Helvetica-Bold").text(h, pCols[i], py + 4, { width: 100 });
  });
  py += 16;

  programRanking.forEach((prog, i) => {
    if (i % 2 === 0) doc.rect(MARGIN, py - 2, CONTENT_W, 16).fill("#fafafa");
    doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text(String(i + 1), pCols[0], py);
    doc.fillColor(C.dark).text(prog.program, pCols[1], py, { width: 160 });
    doc.font("Helvetica").text(String(prog.count), pCols[2], py, { width: 80 });
    roundRect(doc, pCols[3], py - 2, 50, 14, 6, liftBg(prog.avgLift));
    doc.fontSize(8).fillColor(liftColor(prog.avgLift)).font("Helvetica-Bold").text(liftSign(prog.avgLift), pCols[3], py, { width: 50, align: "center" });
    doc.fontSize(8).fillColor(C.dark).font("Helvetica").text(prog.totalSessions.toLocaleString("pt-BR"), pCols[4], py, { width: 80 });
    py += 18;
  });

  doc.fontSize(7).fillColor(C.light).font("Helvetica").text("* Impacto = variacao de sessoes na hora da insercao vs. mesma hora na semana anterior", MARGIN, py + 4);
  py += 22;

  // Brand analysis
  if (!brand) {
    doc.fontSize(14).fillColor(C.dark).font("Helvetica-Bold").text("Analise por Marca — Visitas e Leads", MARGIN, py);
    py += 14;
    doc.fontSize(8.5).fillColor(C.mid).font("Helvetica").text("Desempenho de cada marca durante a campanha (visitas + leads)", MARGIN, py);
    py += 16;

    const brandCardW = (CONTENT_W - 6) / 3;
    const brandColors = { VW: C.blue, Chevrolet: C.yellow, GWM: C.green };
    brandStats.forEach((b, i) => {
      const bx = MARGIN + i * (brandCardW + 3);
      const leadsB = leadsData.brandTotals[b.brand];
      roundRect(doc, bx, py, brandCardW, 100, 8, "#ffffff");
      doc.rect(bx, py, brandCardW, 100).stroke(C.lighter);
      doc.rect(bx, py, brandCardW, 4).fill(brandColors[b.brand as keyof typeof brandColors] || C.primary);
      doc.fontSize(16).fillColor(C.dark).font("Helvetica-Bold").text(b.brand, bx + 10, py + 12, { width: brandCardW - 20, align: "center" });
      // Visitas
      doc.fontSize(9).fillColor(C.mid).font("Helvetica").text("Impacto em visitas:", bx + 10, py + 34, { width: brandCardW - 20, align: "center" });
      doc.fontSize(20).fillColor(liftColor(b.avgLift)).font("Helvetica-Bold").text(liftSign(b.avgLift), bx + 10, py + 44, { width: brandCardW - 20, align: "center" });
      doc.fontSize(7.5).fillColor(C.mid).font("Helvetica").text(`${b.count} insercoes`, bx + 10, py + 66, { width: brandCardW - 20, align: "center" });
      // Leads
      if (leadsB) {
        doc.fontSize(8).fillColor(C.emerald).font("Helvetica-Bold").text(`Leads: ${leadsB.camp} (${liftSign(leadsB.lift)})`, bx + 10, py + 80, { width: brandCardW - 20, align: "center" });
      }
    });

    py += 112;
  }

  // Methodology box
  roundRect(doc, MARGIN, py, CONTENT_W, 82, 8, C.lightest);
  doc.rect(MARGIN, py, CONTENT_W, 82).stroke(C.lighter);
  doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text("METODOLOGIA", MARGIN + 10, py + 8);
  const methodLines = [
    "Baseline (referencia sem TV): Semana de 12 a 15 de marco de 2026 — mesmos dias da semana, sem veiculacao de TV.",
    "Impacto por insercao: Comparacao de sessoes na hora exata da veiculacao vs. mesma hora na semana de referencia.",
    "Leads: Dados de formularios e WhatsApp do CRM, filtrados por data e UTM de origem.",
    "Fonte dos dados: Google Analytics 4 — Propriedade Carrera Novos (ID: 483869089).",
    "Timezone: America/Sao_Paulo (UTC-3). Dados do GA4 podem ter atraso de 4-8h para consolidacao completa.",
  ];
  methodLines.forEach((line, i) => {
    doc.fontSize(7.5).fillColor(C.darkMid).font("Helvetica").text(`• ${line}`, MARGIN + 10, py + 20 + i * 12, { width: CONTENT_W - 20 });
  });

  drawFooter(doc, 7, TOTAL_PAGES, brand);

  doc.flushPages();
  doc.end();

  const pdfBuffer = await pdfDone;
  console.log(`[PDF] PDF generated successfully (PDFKit), size: ${pdfBuffer.length}`);
  return pdfBuffer;
}
