// Gera os PDFs das campanhas passadas (TV Carrera Days e GWM maio) como
// arquivos estáticos em client/public/reports/, servidos pelo GitHub Pages.
// Requer credenciais do GA num .env na raiz (mesmas variáveis do Worker).
// Uso: npm run gen:pdfs
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { loadEnv } from "../server/_core/env";
import { generateTVCampaignPDF } from "../server/pdfReport";
import { generateGWMCampaignPDF } from "../server/pdfReportGWM";

loadEnv(process.env);

const OUT_DIR = path.resolve(import.meta.dirname, "..", "client", "public", "reports");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const jobs: { file: string; gen: () => Promise<Buffer> }[] = [
    { file: "Relatorio-TV-Carrera-Days-2026.pdf", gen: () => generateTVCampaignPDF() },
    { file: "Relatorio-TV-Carrera-Days-Chevrolet-2026.pdf", gen: () => generateTVCampaignPDF("Chevrolet") },
    { file: "Relatorio-TV-Carrera-Days-GWM-2026.pdf", gen: () => generateTVCampaignPDF("GWM") },
    { file: "Relatorio-TV-Carrera-Days-VW-2026.pdf", gen: () => generateTVCampaignPDF("VW") },
    { file: "Relatorio-TV-GWM-Maio-2026.pdf", gen: () => generateGWMCampaignPDF("mai") },
    { file: "Relatorio-TV-GWM-Junho-2026.pdf", gen: () => generateGWMCampaignPDF("jun") },
  ];

  for (const job of jobs) {
    console.log(`Gerando ${job.file}...`);
    const pdf = await job.gen();
    writeFileSync(path.join(OUT_DIR, job.file), pdf);
    console.log(`  ok (${Math.round(pdf.length / 1024)} KB)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
