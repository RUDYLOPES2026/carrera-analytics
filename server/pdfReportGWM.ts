import PDFDocument from "pdfkit";
import { getGWMCampaignData, GWM_MAI_INSERTIONS_DATA } from "./analytics";

// ---- COLORS ----
const C = {
  bg: "#ffffff",
  dark: "#1e293b",
  darkMid: "#334155",
  mid: "#64748b",
  light: "#94a3b8",
  lighter: "#cbd5e1",
  lightest: "#f1f5f9",
  primary: "#10b981",
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
  gwm: "#059669",
  gwmBg: "#d1fae5",
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

function roundRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number, fill: string) {
  doc.roundedRect(x, y, w, h, r).fill(fill);
}

function drawBar(doc: PDFKit.PDFDocument, x: number, y: number, maxW: number, value: number, maxValue: number, color: string, h = 14) {
  const barW = maxValue > 0 ? Math.max(4, (value / maxValue) * maxW) : 4;
  doc.rect(x, y, maxW, h).fill(C.lightest);
  doc.rect(x, y, barW, h).fill(color);
}

function drawHourlyChart(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  campHours: { hour: string; sessions: number }[],
  baseHours: { hour: string; sessions: number }[],
  insertionHours: number[]
) {
  const maxSess = Math.max(...campHours.map(h => h.sessions), ...baseHours.map(h => h.sessions), 1);
  const barW = (w - 2) / 24;
  const chartH = h - 22;

  // Background
  doc.rect(x, y, w, h).fill(C.lightest);

  // Horizontal grid lines (light)
  [0.25, 0.5, 0.75, 1.0].forEach(frac => {
    const gy = y + chartH * (1 - frac);
    doc.moveTo(x, gy).lineTo(x + w, gy).stroke("#e2e8f0");
  });

  // Draw baseline (cinza escuro, barra larga) FIRST (behind)
  baseHours.forEach((bh, i) => {
    const bx = x + i * barW + 1;
    const bh2 = (bh.sessions / maxSess) * chartH;
    const by = y + chartH - bh2;
    doc.rect(bx + barW * 0.05, by, barW * 0.9, bh2).fill("#94a3b8");
  });

  // Draw campaign bars (verde) ON TOP, slightly narrower
  campHours.forEach((ch, i) => {
    const bx = x + i * barW + 1;
    const bh2 = (ch.sessions / maxSess) * chartH;
    const by = y + chartH - bh2;
    doc.rect(bx + barW * 0.2, by, barW * 0.6, bh2).fill(C.gwm);
  });

  // Draw insertion markers: orange triangle/flag at top of bar for insertion hours
  insertionHours.forEach(hr => {
    if (hr < 0 || hr >= 24) return;
    const ch = campHours[hr];
    if (!ch) return;
    const bx = x + hr * barW + 1;
    const bh2 = (ch.sessions / maxSess) * chartH;
    const by = y + chartH - bh2;
    const cx = bx + barW / 2;
    // Orange vertical line from top of bar to top of chart area
    doc.moveTo(cx, y + 2).lineTo(cx, by).stroke(C.orange);
    // Small orange diamond at top
    doc.polygon([cx, y + 2], [cx - 3, y + 7], [cx, y + 12], [cx + 3, y + 7]).fill(C.orange);
  });

  // Hour labels on X axis
  doc.fontSize(6).fillColor(C.mid);
  [0, 4, 8, 12, 16, 20].forEach(h => {
    const lx = x + h * barW + barW / 2;
    doc.text(`${String(h).padStart(2, "0")}h`, lx - 5, y + chartH + 4, { width: 20, align: "center" });
  });

  // Legend
  const ly = y + h - 2;
  doc.rect(x, ly - 5, 8, 5).fill(C.gwm);
  doc.fontSize(5.5).fillColor(C.mid).text("Com TV (campanha)", x + 10, ly - 5);
  doc.rect(x + 90, ly - 5, 8, 5).fill("#94a3b8");
  doc.text("Semana anterior (sem TV)", x + 100, ly - 5);
  doc.moveTo(x + 210, ly - 3).lineTo(x + 218, ly - 3).stroke(C.orange);
  doc.polygon([x + 214, ly - 5], [x + 211, ly], [x + 214, ly + 4], [x + 217, ly]).fill(C.orange);
  doc.fontSize(5.5).fillColor(C.mid).text("Hora com insercao de TV", x + 222, ly - 5);
}

function drawFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  doc.moveTo(MARGIN, PAGE_H - 30).lineTo(PAGE_W - MARGIN, PAGE_H - 30).stroke(C.lighter);
  doc.fontSize(7.5).fillColor(C.light).font("Helvetica");
  doc.x = MARGIN; doc.y = PAGE_H - 22;
  doc.text("Carrera Novos · GWM · Campanha TV Maio 2026 · Dados: Google Analytics 4", { lineBreak: false, continued: true });
  doc.text(`  Pagina ${pageNum} de ${totalPages}`, { align: "right", lineBreak: false });
}

// ---- MAIN EXPORT ----
export async function generateGWMCampaignPDF(): Promise<Buffer> {
  console.log("[PDF-GWM] Starting GWM campaign PDF generation (PDFKit)...");

  const data = await getGWMCampaignData();
  const { campaignDays, baselineDays, programImpact, leadsByDay } = data;

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

  // Leads totals (com TV)
  const totalLeads = data.totalLeads;
  const totalContacts = data.totalContacts;
  const totalBaseLeads = data.totalBaseLeads;
  const totalBaseContacts = data.totalBaseContacts;
  const totalLeadsLift = data.totalLeadsLift;
  const totalContactsLift = data.totalContactsLift;
  const liftSignOpt = (v: number | null) => v == null ? "-" : v >= 0 ? `+${v}%` : `${v}%`;

  // Day labels (full names for per-day pages)
  const dayFullLabels: Record<string, string> = {
    "2026-05-21": "QUINTA-FEIRA, 21 DE MAIO",
    "2026-05-22": "SEXTA-FEIRA, 22 DE MAIO",
    "2026-05-23": "SABADO, 23 DE MAIO",
    "2026-05-24": "DOMINGO, 24 DE MAIO",
    "2026-05-25": "SEGUNDA-FEIRA, 25 DE MAIO",
    "2026-05-26": "TERCA-FEIRA, 26 DE MAIO",
    "2026-05-27": "QUARTA-FEIRA, 27 DE MAIO",
    "2026-05-28": "QUINTA-FEIRA, 28 DE MAIO",
    "2026-05-29": "SEXTA-FEIRA, 29 DE MAIO",
    "2026-05-30": "SABADO, 30 DE MAIO",
    "2026-05-31": "DOMINGO, 31 DE MAIO",
  };

  // Short day names for bar chart
  const dayShortNames = ["Qui 21", "Sex 22", "Sab 23", "Dom 24", "Seg 25", "Ter 26", "Qua 27", "Qui 28", "Sex 29", "Sab 30", "Dom 31"];

  // Total pages: 1 (resumo) + 11 (dias) + 1 (ranking/metodologia) = 13
  const TOTAL_PAGES = 13;

  // Create PDF
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfDone = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ================================================================
  // PAGE 1: RESUMO EXECUTIVO
  // ================================================================

  // Header bar (GWM green)
  roundRect(doc, 0, 0, PAGE_W, 70, 0, C.dark);
  doc.fontSize(9).fillColor(C.light).text("RELATORIO DE CAMPANHA", MARGIN, 14);
  doc.fontSize(22).fillColor("#ffffff").font("Helvetica-Bold").text("TV GWM, Maio 2026", MARGIN, 26);
  doc.fontSize(9).fillColor(C.light).font("Helvetica").text("21 a 31 de maio de 2026  ·  Rede Globo e GloboNews  ·  171 insercoes", MARGIN, 52);

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.fontSize(8).fillColor(C.light).text("GERADO EM", PAGE_W - MARGIN - 80, 14, { width: 80, align: "right" });
  doc.fontSize(9).fillColor("#ffffff").font("Helvetica-Bold").text(today, PAGE_W - MARGIN - 80, 26, { width: 80, align: "right" });
  roundRect(doc, PAGE_W - MARGIN - 70, 44, 70, 16, 8, C.gwm);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("Carrera Novos", PAGE_W - MARGIN - 70, 48, { width: 70, align: "center" });

  let curY = 85;

  // Section label
  roundRect(doc, MARGIN, curY, 72, 16, 8, C.gwm);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("RESUMO", MARGIN + 4, curY + 4, { width: 64, align: "center" });
  doc.fontSize(13).fillColor(C.dark).font("Helvetica-Bold").text("O que aconteceu com o site durante a campanha?", MARGIN + 80, curY + 2);

  curY += 28;

  // 4 KPI cards
  const cardW = (CONTENT_W - 9) / 4;
  const kpiCards = [
    { label: "VISITAS AO SITE", value: totalCamp.toLocaleString("pt-BR"), sub: "em 11 dias de campanha", bg: C.gwm, textColor: "#ffffff" },
    { label: "CRESCIMENTO DE VISITAS", value: liftSign(overallLift), sub: "vs. semana sem TV", bg: overallLift > 5 ? C.green : overallLift < -5 ? C.red : C.yellow, textColor: "#ffffff" },
    { label: "MELHOR DIA", value: bestDay?.label?.split(" ")[0] || "-", sub: liftSign(bestDay?.lift || 0), bg: C.orange, textColor: "#ffffff" },
    { label: "MELHOR PROGRAMA", value: bestProgram?.program?.split(" ").slice(0, 2).join(" ") || "-", sub: liftSign(bestProgram?.avgLift || 0), bg: C.purple, textColor: "#ffffff" },
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
    { label: "LEADS CAPTADOS", value: String(totalLeads), sub: `${liftSignOpt(totalLeadsLift)} vs sem TV`, bg: C.emerald, tc: "#ffffff" },
    { label: "CONTATOS CAPTADOS", value: String(totalContacts), sub: `${liftSignOpt(totalContactsLift)} vs sem TV`, bg: C.darkMid, tc: "#ffffff" },
    { label: "INSERCOES TOTAIS", value: "171", sub: "em 11 dias de campanha", bg: C.blue, tc: "#ffffff" },
    { label: "PROGRAMAS", value: String(programRanking.length), sub: "programas veiculados", bg: C.purple, tc: "#ffffff" },
  ];

  leadsCards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 3);
    roundRect(doc, cx, curY, cardW, 60, 8, card.bg);
    doc.fontSize(7.5).fillColor("#ffffff").font("Helvetica-Bold").text(card.label, cx + 8, curY + 8, { width: cardW - 16 });
    doc.fontSize(card.value.length > 6 ? 18 : 22).fillColor(card.tc).font("Helvetica-Bold").text(card.value, cx + 8, curY + 20, { width: cardW - 16 });
    doc.fontSize(7.5).fillColor("#ffffff").font("Helvetica").text(card.sub, cx + 8, curY + 44, { width: cardW - 16 });
  });

  curY += 72;

  // Bar chart — visitas por dia
  const barChartH = 11 * 18 + 30;
  roundRect(doc, MARGIN, curY, CONTENT_W, barChartH, 8, "#ffffff");
  doc.rect(MARGIN, curY, CONTENT_W, barChartH).stroke(C.lighter);
  doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text("CRESCIMENTO DE VISITAS POR DIA (VS. SEMANA ANTERIOR SEM TV)", MARGIN + 12, curY + 10);

  const maxLift = Math.max(...dailyStats.map(d => Math.abs(d.lift)), 1);
  const barMaxW = CONTENT_W - 140;

  dailyStats.forEach((day, i) => {
    const by = curY + 28 + i * 18;
    doc.fontSize(8).fillColor(C.dark).font("Helvetica-Bold").text(dayShortNames[i] || day.label, MARGIN + 12, by + 1, { width: 35 });
    drawBar(doc, MARGIN + 52, by, barMaxW, Math.abs(day.lift), maxLift, day.lift > 10 ? C.green : day.lift > 0 ? C.gwm : C.red);
    doc.fontSize(8).fillColor(liftColor(day.lift)).font("Helvetica-Bold").text(liftSign(day.lift), MARGIN + 52 + barMaxW + 6, by + 1, { width: 35 });
    doc.fontSize(7.5).fillColor(C.mid).font("Helvetica").text(`${day.total.toLocaleString("pt-BR")} vis.`, MARGIN + 52 + barMaxW + 44, by + 1, { width: 60 });
  });

  doc.fontSize(7).fillColor(C.mid).font("Helvetica");
  doc.rect(MARGIN + 12, curY + barChartH - 12, 8, 6).fill(C.green);
  doc.text("Verde = acima de 10%", MARGIN + 24, curY + barChartH - 12);
  doc.rect(MARGIN + 130, curY + barChartH - 12, 8, 6).fill(C.gwm);
  doc.text("Verde escuro = crescimento", MARGIN + 142, curY + barChartH - 12);
  doc.rect(MARGIN + 260, curY + barChartH - 12, 8, 6).fill(C.red);
  doc.text("Vermelho = queda", MARGIN + 272, curY + barChartH - 12);

  curY += barChartH + 10;

  // Conclusion box
  const conclusionText = `A campanha TV GWM Maio 2026 veiculou 171 insercoes em 11 dias (21-31/05) na Rede Globo e GloboNews. O site registrou ${totalCamp.toLocaleString("pt-BR")} visitas no periodo, com crescimento de ${liftSign(overallLift)} vs. semana anterior sem TV. Melhor dia: ${bestDay?.label || "-"} (${liftSign(bestDay?.lift || 0)}). Melhor programa: ${bestProgram?.program || "-"} (${liftSign(bestProgram?.avgLift || 0)}).`;

  const conclusionH = 52;
  roundRect(doc, MARGIN, curY, CONTENT_W, conclusionH, 8, "#ecfdf5");
  doc.rect(MARGIN, curY, CONTENT_W, conclusionH).stroke("#6ee7b7");
  doc.rect(MARGIN, curY, 4, conclusionH).fill(C.gwm);
  doc.fontSize(8).fillColor(C.gwm).font("Helvetica-Bold").text("CONCLUSAO PRINCIPAL", MARGIN + 12, curY + 8);
  doc.fontSize(8.5).fillColor(C.darkMid).font("Helvetica").text(conclusionText, MARGIN + 12, curY + 20, { width: CONTENT_W - 24, lineGap: 2 });

  drawFooter(doc, 1, TOTAL_PAGES);

  // ================================================================
  // PAGES 2-12: ANALISE POR DIA (11 dias)
  // ================================================================

  campaignDays.forEach((campDay, dayIdx) => {
    doc.addPage();

    const baseDay = baselineDays[dayIdx];
    const dayInsertions = GWM_MAI_INSERTIONS_DATA.filter(ins => ins.date === campDay.date);
    const insertionHours = dayInsertions.map(ins => ins.hour);
    const dayTotal = campDay.hours.reduce((s, h) => s + h.sessions, 0);
    const baseTotal = baseDay?.hours.reduce((s, h) => s + h.sessions, 0) || 0;
    const dayLift = baseTotal > 0 ? Math.round(((dayTotal - baseTotal) / baseTotal) * 100) : 0;

    const dayLeads = leadsByDay[dayIdx];

    // Header badge
    roundRect(doc, MARGIN, MARGIN, 110, 16, 8, C.dark);
    doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("ANALISE DETALHADA", MARGIN + 4, MARGIN + 4, { width: 102, align: "center" });
    doc.fontSize(9).fillColor(C.mid).font("Helvetica").text(`Dia ${dayIdx + 1} de 11`, MARGIN + 118, MARGIN + 4);

    let dy = MARGIN + 24;
    doc.fontSize(9).fillColor(C.mid).font("Helvetica-Bold").text(dayFullLabels[campDay.date] || campDay.label, MARGIN, dy);
    dy += 12;
    doc.fontSize(22).fillColor(C.dark).font("Helvetica-Bold").text(campDay.label, MARGIN, dy);

    const liftC = liftColor(dayLift);
    doc.fontSize(28).fillColor(liftC).font("Helvetica-Bold").text(liftSign(dayLift), PAGE_W - MARGIN - 80, dy - 4, { width: 80, align: "right" });
    doc.fontSize(8).fillColor(C.mid).font("Helvetica").text("vs. semana anterior", PAGE_W - MARGIN - 80, dy + 26, { width: 80, align: "right" });

    dy += 40;

    // 6 mini KPI cards
    const mkW = (CONTENT_W - 15) / 6;
    const miniCards = [
      { label: "VISITAS NO DIA", value: dayTotal.toLocaleString("pt-BR"), bg: C.lightest, valueColor: C.dark },
      { label: "SEM TV (REF.)", value: baseTotal.toLocaleString("pt-BR"), bg: C.lightest, valueColor: C.mid },
      { label: "CRESCIMENTO", value: liftSign(dayLift), bg: liftBg(dayLift), valueColor: liftC },
      { label: "INSERCOES TV", value: String(dayInsertions.length), bg: C.lightest, valueColor: C.orange },
      { label: "LEADS", value: String(dayLeads?.leads || 0), bg: C.gwmBg, valueColor: C.gwm },
      { label: "CONTATOS", value: String(dayLeads?.contacts || 0), bg: C.lightest, valueColor: C.mid },
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
    doc.fontSize(7).fillColor(C.mid).font("Helvetica").text("Verde = trafego com TV (campanha)   Cinza = semana anterior sem TV   Losango laranja = hora com insercao", MARGIN + 10, dy + 18);

    drawHourlyChart(
      doc,
      MARGIN + 8, dy + 28, CONTENT_W - 16, 105,
      campDay.hours,
      baseDay?.hours || campDay.hours.map(h => ({ ...h, sessions: 0 })),
      insertionHours
    );

    dy += 152;

    // Insertions table
    if (dayInsertions.length > 0) {
      // Limit to avoid page overflow: max ~15 rows fit
      const maxRows = Math.min(dayInsertions.length, 14);
      const tableH = 20 + maxRows * 18 + 16;
      const availableH = PAGE_H - dy - MARGIN - 40;
      const finalTableH = Math.min(tableH, availableH);
      const rowsToShow = Math.floor((finalTableH - 36) / 18);

      roundRect(doc, MARGIN, dy, CONTENT_W, finalTableH, 6, "#ffffff");
      doc.rect(MARGIN, dy, CONTENT_W, finalTableH).stroke(C.lighter);
      doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text(`INSERCOES DO DIA (${dayInsertions.length} insercoes)`, MARGIN + 10, dy + 8);

      const tCols = [MARGIN + 8, MARGIN + 58, MARGIN + 200, MARGIN + 300, MARGIN + 390];
      const tHeaders = ["HORARIO", "PROGRAMA", "DURACAO", "IMPACTO\nVISITAS", "JANELA\n3h"];
      roundRect(doc, MARGIN + 4, dy + 18, CONTENT_W - 8, 14, 4, C.lightest);
      tHeaders.forEach((h, i) => {
        const lines = h.split("\n");
        doc.fontSize(6).fillColor(C.mid).font("Helvetica-Bold").text(lines[0], tCols[i], dy + 21, { width: 60, lineBreak: false });
        if (lines[1]) doc.text(" " + lines[1], { continued: false });
      });

      const impactMap: Record<string, number> = {};
      const windowMap: Record<string, number> = {};
      programImpact
        .filter(p => p.date === campDay.date)
        .forEach(p => {
          const key = `${p.date}-${p.hour}-${p.program}`;
          impactMap[key] = p.lift;
          windowMap[key] = p.windowLift;
        });

      // Deduplicate insertions for display (group same program/hour)
      const uniqueInsertions: typeof dayInsertions = [];
      const seen = new Set<string>();
      dayInsertions.forEach(ins => {
        const k = `${ins.hour}-${ins.program}`;
        if (!seen.has(k)) {
          seen.add(k);
          uniqueInsertions.push(ins);
        }
      });

      uniqueInsertions.slice(0, rowsToShow).forEach((ins, i) => {
        const ry = dy + 34 + i * 18;
        if (i % 2 === 0) doc.rect(MARGIN + 4, ry - 2, CONTENT_W - 8, 18).fill("#fafafa");
        const impKey = `${ins.date}-${ins.hour}-${ins.program}`;
        const impLift = impactMap[impKey] || 0;
        const winLift = windowMap[impKey] || 0;
        const timeStr = `${String(ins.hour).padStart(2, "0")}h`;
        doc.fontSize(8.5).fillColor(C.dark).font("Helvetica-Bold").text(timeStr, tCols[0], ry, { width: 48 });
        doc.font("Helvetica").text(ins.program, tCols[1], ry, { width: 138 });
        doc.text(ins.duration, tCols[2], ry, { width: 96 });
        roundRect(doc, tCols[3], ry - 2, 52, 14, 6, liftBg(impLift));
        doc.fontSize(7.5).fillColor(liftColor(impLift)).font("Helvetica-Bold").text(liftSign(impLift), tCols[3], ry, { width: 52, align: "center" });
        roundRect(doc, tCols[4], ry - 2, 52, 14, 6, liftBg(winLift));
        doc.fontSize(7.5).fillColor(liftColor(winLift)).font("Helvetica-Bold").text(liftSign(winLift), tCols[4], ry, { width: 52, align: "center" });
      });

      const noteY = dy + 34 + Math.min(uniqueInsertions.length, rowsToShow) * 18;
      if (noteY < dy + finalTableH - 4) {
        doc.fontSize(6.5).fillColor(C.light).font("Helvetica").text("* Janela 3h = variacao de sessoes nas 3h apos a insercao vs. mesma janela na semana anterior", MARGIN + 8, noteY, { width: CONTENT_W - 16 });
      }
    }

    drawFooter(doc, dayIdx + 2, TOTAL_PAGES);
  });

  // ================================================================
  // PAGE 13: RANKING DE PROGRAMAS + METODOLOGIA
  // ================================================================

  doc.addPage();

  roundRect(doc, MARGIN, MARGIN, 90, 16, 8, C.gwm);
  doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold").text("ANALISE FINAL", MARGIN + 4, MARGIN + 4, { width: 82, align: "center" });
  doc.fontSize(9).fillColor(C.mid).font("Helvetica").text("Ranking de Programas e Metodologia", MARGIN + 98, MARGIN + 4);

  let py = MARGIN + 26;

  doc.fontSize(14).fillColor(C.dark).font("Helvetica-Bold").text("Ranking de Programas por Impacto, GWM Maio 2026", MARGIN, py);
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

  // Leads per day table com comparacao baseline
  doc.fontSize(12).fillColor(C.dark).font("Helvetica-Bold").text("Leads e Contatos por Dia (GWM/Haval)", MARGIN, py);
  py += 14;
  doc.fontSize(8.5).fillColor(C.mid).font("Helvetica").text("Comparacao: campanha com TV (21-31/05) vs semana anterior sem TV. Apenas paginas /gwm e /haval.", MARGIN, py);
  py += 14;

  const ldCols = [MARGIN + 8, MARGIN + 90, MARGIN + 140, MARGIN + 195, MARGIN + 260, MARGIN + 310, MARGIN + 375, MARGIN + 430];
  const ldHeaders = ["DIA", "LEADS\nCOM TV", "LEADS\nSEM TV", "VAR.\nLEADS", "CONT.\nCOM TV", "CONT.\nSEM TV", "VAR.\nCONT.", "TOTAL\nCONV."];
  roundRect(doc, MARGIN, py, CONTENT_W, 18, 4, C.lightest);
  doc.rect(MARGIN, py, CONTENT_W, 18).stroke(C.lighter);
  ldHeaders.forEach((h, i) => {
    const lines = h.split("\n");
    doc.fontSize(6).fillColor(C.mid).font("Helvetica-Bold").text(lines[0], ldCols[i], py + 3, { width: 50, lineBreak: false });
    if (lines[1]) doc.fontSize(5.5).text(" " + lines[1], { continued: false });
  });
  py += 20;

  leadsByDay.forEach((ld, i) => {
    const ry = py + i * 16;
    if (i % 2 === 0) doc.rect(MARGIN, ry - 2, CONTENT_W, 16).fill("#fafafa");
    doc.fontSize(7.5).fillColor(C.dark).font("Helvetica-Bold").text(campaignDays[i]?.label || ld.date, ldCols[0], ry, { width: 80 });
    doc.fillColor(C.gwm).font("Helvetica-Bold").text(String(ld.leads), ldCols[1], ry, { width: 46 });
    doc.fillColor(C.mid).font("Helvetica").text(String(ld.baseLeads ?? 0), ldCols[2], ry, { width: 46 });
    const ll = ld.leadsLift;
    roundRect(doc, ldCols[3], ry - 2, 52, 14, 4, ll == null ? C.lightest : ll >= 0 ? "#d1fae5" : "#fee2e2");
    doc.fontSize(7).fillColor(ll == null ? C.mid : ll >= 0 ? C.gwm : C.red).font("Helvetica-Bold").text(liftSignOpt(ll), ldCols[3], ry, { width: 52, align: "center" });
    doc.fontSize(7.5).fillColor(C.blue).font("Helvetica-Bold").text(String(ld.contacts), ldCols[4], ry, { width: 46 });
    doc.fillColor(C.mid).font("Helvetica").text(String(ld.baseContacts ?? 0), ldCols[5], ry, { width: 46 });
    const cl = ld.contactsLift;
    roundRect(doc, ldCols[6], ry - 2, 52, 14, 4, cl == null ? C.lightest : cl >= 0 ? "#dbeafe" : "#fee2e2");
    doc.fontSize(7).fillColor(cl == null ? C.mid : cl >= 0 ? C.blue : C.red).font("Helvetica-Bold").text(liftSignOpt(cl), ldCols[6], ry, { width: 52, align: "center" });
    doc.fontSize(7.5).fillColor(C.dark).font("Helvetica").text(String(ld.leads + ld.contacts), ldCols[7], ry, { width: 50 });
  });

  const ldTotalY = py + leadsByDay.length * 16;
  roundRect(doc, MARGIN, ldTotalY - 2, CONTENT_W, 16, 4, C.lightest);
  doc.rect(MARGIN, ldTotalY - 2, CONTENT_W, 16).stroke(C.lighter);
  doc.fontSize(8).fillColor(C.dark).font("Helvetica-Bold").text("TOTAL", ldCols[0], ldTotalY, { width: 80 });
  doc.fillColor(C.gwm).text(String(totalLeads), ldCols[1], ldTotalY, { width: 46 });
  doc.fillColor(C.mid).font("Helvetica").text(String(totalBaseLeads), ldCols[2], ldTotalY, { width: 46 });
  roundRect(doc, ldCols[3], ldTotalY - 2, 52, 14, 4, totalLeadsLift != null && totalLeadsLift >= 0 ? "#d1fae5" : "#fee2e2");
  doc.fontSize(7).fillColor(totalLeadsLift != null && totalLeadsLift >= 0 ? C.gwm : C.red).font("Helvetica-Bold").text(liftSignOpt(totalLeadsLift), ldCols[3], ldTotalY, { width: 52, align: "center" });
  doc.fontSize(8).fillColor(C.blue).font("Helvetica-Bold").text(String(totalContacts), ldCols[4], ldTotalY, { width: 46 });
  doc.fillColor(C.mid).font("Helvetica").text(String(totalBaseContacts), ldCols[5], ldTotalY, { width: 46 });
  roundRect(doc, ldCols[6], ldTotalY - 2, 52, 14, 4, totalContactsLift != null && totalContactsLift >= 0 ? "#dbeafe" : "#fee2e2");
  doc.fontSize(7).fillColor(totalContactsLift != null && totalContactsLift >= 0 ? C.blue : C.red).font("Helvetica-Bold").text(liftSignOpt(totalContactsLift), ldCols[6], ldTotalY, { width: 52, align: "center" });
  doc.fontSize(8).fillColor(C.dark).font("Helvetica-Bold").text(String(totalLeads + totalContacts), ldCols[7], ldTotalY, { width: 50 });

  py = ldTotalY + 24;

  // Methodology box
  roundRect(doc, MARGIN, py, CONTENT_W, 90, 8, C.lightest);
  doc.rect(MARGIN, py, CONTENT_W, 90).stroke(C.lighter);
  doc.fontSize(8).fillColor(C.mid).font("Helvetica-Bold").text("METODOLOGIA", MARGIN + 10, py + 8);
  const methodLines = [
    "Baseline (referencia sem TV): Mesma semana do ano anterior ou semana imediatamente anterior, mesmos dias da semana.",
    "Impacto por insercao: Comparacao de sessoes na hora exata da veiculacao vs. mesma hora na semana de referencia.",
    "Janela de 3h: Soma de sessoes nas 3 horas apos a insercao vs. mesma janela na semana de referencia.",
    "Leads e Contatos: Eventos generate_lead e contact do GA4, filtrados por data de campanha.",
    "Fonte dos dados: Google Analytics 4, Propriedade Carrera Novos (ID: 483869089).",
    "Timezone: America/Sao_Paulo (UTC-3). Dados do GA4 podem ter atraso de 4-8h para consolidacao.",
  ];
  methodLines.forEach((line, i) => {
    doc.fontSize(7.5).fillColor(C.darkMid).font("Helvetica").text(`• ${line}`, MARGIN + 10, py + 20 + i * 11, { width: CONTENT_W - 20 });
  });

  drawFooter(doc, 13, TOTAL_PAGES);

  doc.flushPages();
  doc.end();

  const pdfBuffer = await pdfDone;
  console.log(`[PDF-GWM] PDF generated successfully (PDFKit), size: ${pdfBuffer.length}`);
  return pdfBuffer;
}
