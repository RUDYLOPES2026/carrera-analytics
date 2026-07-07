// Configuração carregada em runtime: no Cloudflare Worker via loadEnv(env),
// em scripts locais (ex: geração de PDF) via loadEnv(process.env).
export const ENV = {
  gaPropertyId: "483869089",
  gaServiceAccountEmail: "",
  gaPrivateKey: "",
  gaPrivateKeyId: "",
  gaClientId: "",
};

export function loadEnv(src: Record<string, string | undefined>) {
  if (src.GA_PROPERTY_ID) ENV.gaPropertyId = src.GA_PROPERTY_ID;
  if (src.GA_SERVICE_ACCOUNT_EMAIL) ENV.gaServiceAccountEmail = src.GA_SERVICE_ACCOUNT_EMAIL;
  if (src.GA_PRIVATE_KEY) ENV.gaPrivateKey = src.GA_PRIVATE_KEY;
  if (src.GA_PRIVATE_KEY_ID) ENV.gaPrivateKeyId = src.GA_PRIVATE_KEY_ID;
  if (src.GA_CLIENT_ID) ENV.gaClientId = src.GA_CLIENT_ID;
}
