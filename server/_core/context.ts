import type { WorkerEnv } from "./workerTypes";

export type TrpcContext = {
  // Env do Cloudflare Worker (null em scripts locais, ex: geração de PDF)
  env: WorkerEnv | null;
};

export function createContext(env: WorkerEnv | null): TrpcContext {
  return { env };
}
