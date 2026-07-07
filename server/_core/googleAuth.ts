// Autenticação de service account do Google via JWT assinado com WebCrypto.
// Funciona tanto no Cloudflare Workers quanto em Node >= 18, sem google-auth-library.
import { ENV } from "./env";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(): Promise<string> {
  const privateKeyPem = ENV.gaPrivateKey.replace(/\\n/g, "\n");
  if (!privateKeyPem || !ENV.gaServiceAccountEmail) {
    throw new Error("Credenciais do GA não configuradas (GA_SERVICE_ACCOUNT_EMAIL / GA_PRIVATE_KEY)");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: ENV.gaPrivateKeyId || undefined };
  const claims = {
    iss: ENV.gaServiceAccountEmail,
    scope: SCOPE,
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const jwt = await signJwt();
  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Falha ao obter token do Google (${response.status}): ${error}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  // Renova 5 minutos antes de expirar
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
  return data.access_token;
}
