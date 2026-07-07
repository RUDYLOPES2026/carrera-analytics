-- Schema do D1 (aplicar com: npx wrangler d1 execute carrera-analytics --remote --file=schema.sql)
CREATE TABLE IF NOT EXISTS serverAttributionEvents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventDate TEXT NOT NULL,          -- YYYY-MM-DD no fuso de Sao Paulo
  eventHour INTEGER NOT NULL,       -- 0-23 no fuso de Sao Paulo
  source TEXT NOT NULL DEFAULT '(direct)',
  medium TEXT NOT NULL DEFAULT '(none)',
  campaign TEXT NOT NULL DEFAULT '(not set)',
  landingPage TEXT NOT NULL DEFAULT '/',
  eventName TEXT NOT NULL DEFAULT 'page_view',
  hitCount INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attribution_eventDate ON serverAttributionEvents (eventDate);
