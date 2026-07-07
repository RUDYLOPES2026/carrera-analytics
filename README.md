# Carrera Analytics Dashboard

Dashboard de analytics do site do Grupo Carrera, conectado em tempo real ao Google Analytics 4 (property 483869089, e 503617174 para o BIO/LPs). Migrado do Manus para GitHub Pages + Cloudflare Workers.

## Arquitetura

- **Frontend** (`client/`): React + Vite + Recharts, hospedado no GitHub Pages. Publicado automaticamente pelo workflow `.github/workflows/deploy-pages.yml` a cada push na `main`.
- **Backend** (`server/`, entry `server/worker.ts`): Cloudflare Worker com tRPC. Consulta o GA4 na hora usando uma service account do Google (JWT assinado com WebCrypto, sem bibliotecas Node).
- **Banco** (D1): usado só pelo coletor de atribuição server-side (`/api/attribution-collect`, chamado pelo GTM Server). Schema em `schema.sql`.
- **PDFs de campanhas passadas** (TV Carrera Days, GWM maio): pré-gerados por `npm run gen:pdfs` e servidos como arquivos estáticos em `client/public/reports/`.

## Desenvolvimento local

```bash
npm install
npm run dev:api   # Worker em http://localhost:8787 (precisa do .env — ver .env.example)
npm run dev       # Frontend em http://localhost:5173
```

Para o Worker local ler as credenciais do GA, crie um arquivo `.dev.vars` (formato do wrangler) com as mesmas variáveis do `.env.example`.

## Deploy

- **Frontend**: push na `main` publica sozinho. A URL da API vem da variável de repositório `VITE_API_URL` (Settings › Secrets and variables › Actions › Variables).
- **Worker**: `npm run deploy:api` (requer `npx wrangler login`). Secrets do GA: `npx wrangler secret put GA_SERVICE_ACCOUNT_EMAIL` (e `GA_PRIVATE_KEY`, `GA_PRIVATE_KEY_ID`, `GA_CLIENT_ID`).
- **D1**: `npx wrangler d1 create carrera-analytics`, colar o `database_id` no `wrangler.toml` e aplicar `npx wrangler d1 execute carrera-analytics --remote --file=schema.sql`.

## GTM Server

A tag de atribuição server-side deve apontar para `https://<worker>/api/attribution-collect` (aceita GET com pixel e POST JSON).
