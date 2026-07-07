// Tipos mínimos do Cloudflare Workers usados pelo projeto.
// Declarados à mão para não conflitar com os tipos DOM do client no mesmo tsconfig.
export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface WorkerEnv {
  DB: D1Database;
  GA_PROPERTY_ID?: string;
  GA_SERVICE_ACCOUNT_EMAIL?: string;
  GA_PRIVATE_KEY?: string;
  GA_PRIVATE_KEY_ID?: string;
  GA_CLIENT_ID?: string;
}
