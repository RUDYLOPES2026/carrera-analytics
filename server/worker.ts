// Entry point do Cloudflare Worker: tRPC + coletor de atribuição do GTM Server.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { loadEnv } from "./_core/env";
import type { WorkerEnv } from "./_core/workerTypes";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-trpc-source",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Pixel GIF transparente 1x1 para a tag de imagem do GTM
const PIXEL_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function pixelResponse(): Response {
  const binary = atob(PIXEL_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return withCors(
    new Response(bytes, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
    })
  );
}

// Coletor de atribuição server-side (GTM Server). Não armazena dados pessoais:
// sem IP, sem client_id — apenas source/medium/campaign/página/evento agregados.
async function handleAttributionCollect(request: Request, env: WorkerEnv): Promise<Response> {
  try {
    let params: Record<string, unknown>;
    if (request.method === "POST") {
      const contentType = request.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        params = (await request.json()) as Record<string, unknown>;
      } else {
        const form = await request.formData().catch(() => null);
        params = form ? Object.fromEntries(form.entries()) : {};
      }
    } else {
      params = Object.fromEntries(new URL(request.url).searchParams.entries());
    }

    const rawPageLocation = String(params.page_location || params.page_path || params.landingPage || "/");
    // Tentar extrair UTMs do page_location (pode estar URL-encoded ou não)
    const utmFromPageLocation = { source: "", medium: "", campaign: "" };
    try {
      const pageUrl = new URL(rawPageLocation.startsWith("http") ? rawPageLocation : `https://x.com${rawPageLocation}`);
      utmFromPageLocation.source = pageUrl.searchParams.get("utm_source") || "";
      utmFromPageLocation.medium = pageUrl.searchParams.get("utm_medium") || "";
      utmFromPageLocation.campaign = pageUrl.searchParams.get("utm_campaign") || "";
    } catch { /* ignorar erros de parse */ }
    // Quando o GTM Server não URL-encoda o page_location, os UTMs chegam como params separados
    const utmFromParams = {
      source: String(params.utm_source || "").trim(),
      medium: String(params.utm_medium || "").trim(),
      campaign: String(params.utm_campaign || "").trim(),
    };
    // Prioridade: params diretos (source/medium/campaign) > UTMs do page_location > UTMs separados > defaults
    const rawSource = String(params.source || "").trim();
    const rawMedium = String(params.medium || "").trim();
    const rawCampaign = String(params.campaign || "").trim();
    const source = (rawSource && rawSource !== "undefined" ? rawSource
      : utmFromPageLocation.source || utmFromParams.source || "(direct)").slice(0, 255);
    const medium = (rawMedium && rawMedium !== "undefined" ? rawMedium
      : utmFromPageLocation.medium || utmFromParams.medium || "(none)").slice(0, 255);
    const campaign = (rawCampaign && rawCampaign !== "undefined" ? rawCampaign
      : utmFromPageLocation.campaign || utmFromParams.campaign || "(not set)").slice(0, 255);
    const eventName = String(params.event_name || params.eventName || "page_view").slice(0, 100);
    // Extrair apenas o path da landing page, sem query string
    let landingPage = rawPageLocation;
    try {
      const url = new URL(landingPage.startsWith("http") ? landingPage : `https://x.com${landingPage}`);
      landingPage = url.pathname.slice(0, 500);
    } catch {
      landingPage = landingPage.slice(0, 500);
    }
    // Data e hora no fuso de São Paulo
    const now = new Date();
    const spDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const [d, m, y] = spDate.split("/");
    const eventDate = `${y}-${m}-${d}`;
    const eventHour = parseInt(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(now));

    await env.DB
      .prepare(
        "INSERT INTO serverAttributionEvents (eventDate, eventHour, source, medium, campaign, landingPage, eventName, hitCount) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
      )
      .bind(eventDate, eventHour, source, medium, campaign, landingPage, eventName)
      .run();

    if (request.method === "GET") return pixelResponse();
    return withCors(Response.json({ ok: true }));
  } catch (err) {
    console.error("[Attribution] Error saving event:", err);
    return withCors(Response.json({ error: "Erro ao salvar evento" }, { status: 500 }));
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    loadEnv(env as unknown as Record<string, string | undefined>);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/attribution-collect") {
      return handleAttributionCollect(request, env);
    }

    if (url.pathname.startsWith("/api/trpc")) {
      const response = await fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext: () => createContext(env),
      });
      return withCors(response);
    }

    if (url.pathname === "/" || url.pathname === "/api/health") {
      return withCors(Response.json({ ok: true, service: "carrera-analytics-api" }));
    }

    return withCors(Response.json({ error: "Not found" }, { status: 404 }));
  },
};
