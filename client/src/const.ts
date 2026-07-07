// URL base da API (Cloudflare Worker). Em dev local aponta pro wrangler dev.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8787";
