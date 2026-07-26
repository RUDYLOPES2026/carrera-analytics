#!/usr/bin/env python3
"""Extração direta da REST API do Salesforce (read-only, GET) com paginação.

Reusa as credenciais do MCP salescloud-carrera (.env). Grava NDJSON.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

ENV_PATH = os.environ.get(
    "SF_ENV_PATH", "/Users/rudy/projetos/carrera/salescloud-mcp-carrera/.env")

CHAVES = ("SF_CLIENT_ID", "SF_CLIENT_SECRET", "SF_REFRESH_TOKEN",
          "SF_INSTANCE_URL", "SF_LOGIN_URL", "SF_API_VERSION")


def load_env(path):
    """Variavel de ambiente ganha do arquivo: no Actions o .env nao existe,
    as credenciais chegam como secrets."""
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    for k in CHAVES:
        if os.environ.get(k):
            env[k] = os.environ[k]
    faltando = [k for k in CHAVES[:4] if not env.get(k)]
    if faltando:
        sys.exit(f"credenciais do Salesforce ausentes: {', '.join(faltando)}")
    return env


def get_token(env):
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": env["SF_CLIENT_ID"],
        "client_secret": env["SF_CLIENT_SECRET"],
        "refresh_token": env["SF_REFRESH_TOKEN"],
    }).encode()
    url = env.get("SF_LOGIN_URL", "https://login.salesforce.com").rstrip("/") + "/services/oauth2/token"
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        payload = json.load(r)
    return payload["access_token"], payload.get("instance_url", env["SF_INSTANCE_URL"]).rstrip("/")


def soql_stream(token, instance, api_version, query, out_path):
    """Roda SOQL paginada, gravando cada registro como uma linha NDJSON."""
    path = f"/services/data/{api_version}/query?q=" + urllib.parse.quote(query)
    url = instance + path
    n = 0
    with open(out_path, "w", encoding="utf-8") as f:
        while url:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=120) as r:
                result = json.load(r)
            for rec in result.get("records", []):
                rec.pop("attributes", None)
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                n += 1
            nxt = result.get("nextRecordsUrl")
            url = instance + nxt if nxt else None
            print(f"  {out_path}: {n} registros...", flush=True)
    return n


if __name__ == "__main__":
    env = load_env(ENV_PATH)
    api_version = env.get("SF_API_VERSION", "v60.0")
    token, instance = get_token(env)
    print("Token OK, instance:", instance)

    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    for job in jobs:
        print("==>", job["out"])
        total = soql_stream(token, instance, api_version, job["query"], job["out"])
        print(f"<== {job['out']}: {total} registros")
