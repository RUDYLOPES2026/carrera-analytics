#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""meta_api.py , cliente direto da Graph API da Meta que REPLICA o conector meta-ads-carrera.

Feito para rodar HEADLESS (GitHub Actions), sem o Cowork. Usa só `requests`.
Token: variável de ambiente META_TOKEN (system user, ads_read). Nunca hardcode.

Cada função devolve o MESMO formato que o conector devolvia, pra o motor (build.py, os
refresh/assemble) não precisar mudar a lógica de classificação:
  - get_insights(...)  -> {"ok":True,"count":N,"insights":[...]}  (com paginação automática)
  - atividades_conta(account_id) -> {"ok":True,"activities":[...]}
  - list_adsets(account_id)      -> {"ok":True,"adsets":[...]}     (name,daily_budget,status,targeting)
  - list_campaigns(account_id)   -> {"ok":True,"campaigns":[...]}
  - detalhes_ad(ad_id)           -> {"ok":True,"data":{...,"preview_shareable_link":...}}

Robustez: retry com backoff em rate-limit (code 4/17/32/613) e em erro de rede.
"""
import os, time, json, urllib.parse, urllib.request, urllib.error

API_VER = os.environ.get("META_API_VER", "v21.0")
BASE = f"https://graph.facebook.com/{API_VER}"
TOKEN = os.environ.get("META_TOKEN", "")

INSIGHT_FIELDS = ("spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,"
                  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,"
                  "actions,action_values,cost_per_action_type,date_start,date_stop")

class MetaError(Exception):
    pass

def _get(path, params, tries=6):
    """GET autenticado com retry/backoff. Retorna o JSON já decodificado (dict)."""
    if not TOKEN:
        raise MetaError("META_TOKEN ausente no ambiente")
    params = dict(params or {}); params["access_token"] = TOKEN
    url = f"{BASE}/{path.lstrip('/')}?" + urllib.parse.urlencode(params)
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                err = json.loads(body).get("error", {})
            except Exception:
                err = {"message": body[:200]}
            code = err.get("code")
            # rate-limit / transient -> backoff e retry (1/2 = unknown/service unavailable,
            # exceto o code 1 "reduce the amount of data", que é determinístico e o
            # list_adsets resolve degradando o page size)
            transient = code in (1, 2, 4, 17, 32, 613, 80000, 80004) or e.code in (429, 500, 503)
            if code == 1 and "reduce the amount" in str(err.get("message", "")).lower():
                transient = False
            if transient:
                last = err; time.sleep(min(60, 8 * (i + 1))); continue
            raise MetaError(f"Graph API erro {code}: {err.get('message')}")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e; time.sleep(min(60, 8 * (i + 1))); continue
    raise MetaError(f"Graph API falhou após {tries} tentativas: {last}")

def _paged(path, params, node_limit=500):
    """Segue paging.next até acabar, juntando data[]. Preserva o formato de linha."""
    out = []; params = dict(params or {}); params.setdefault("limit", node_limit)
    j = _get(path, params)
    while True:
        out.extend(j.get("data", []))
        nxt = (j.get("paging") or {}).get("next")
        if not nxt:
            break
        # 'next' já vem com access_token e cursor; chamar direto, com o MESMO
        # tratamento de transientes do _get (403 de rate limit, 429, 5xx, rede).
        # Antes era 1 retry ingênuo de 5s e o HTTPError cru vazava (falha da
        # Nissan no cron de 18/07, 403 no meio da paginação).
        last = None
        for i in range(6):
            try:
                with urllib.request.urlopen(nxt, timeout=90) as r:
                    j = json.loads(r.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")
                try:
                    err = json.loads(body).get("error", {})
                except Exception:
                    err = {"message": body[:200]}
                if e.code in (403, 429, 500, 503) or err.get("code") in (1, 2, 4, 17, 32, 613, 80000, 80004):
                    last = err; time.sleep(min(60, 8 * (i + 1))); continue
                raise MetaError(f"Graph API erro {err.get('code')} na paginação: {err.get('message')}")
            except (urllib.error.URLError, TimeoutError) as e:
                last = e; time.sleep(min(60, 8 * (i + 1))); continue
        else:
            raise MetaError(f"Graph API paginação falhou após 6 tentativas: {last}")
    return out

def get_insights(object_id, level="campaign", since=None, until=None,
                 date_preset=None, breakdowns=None, fields=INSIGHT_FIELDS):
    """Igual ao conector: métricas no nível pedido, janela por since/until ou date_preset."""
    p = {"level": level, "fields": fields}
    if since and until:
        p["time_range"] = json.dumps({"since": since, "until": until})
    elif date_preset:
        p["date_preset"] = date_preset
    if breakdowns:
        p["breakdowns"] = json.dumps(breakdowns) if not isinstance(breakdowns, str) else breakdowns
    # "reduce the amount of data" em conta grande (ex.: Nissan ad-level 30d):
    # degrada o page size; a paginação junta tudo do mesmo jeito.
    last = None
    for lim in (500, 100, 25):
        try:
            rows = _paged(f"{object_id}/insights", dict(p), node_limit=lim)
            return {"ok": True, "count": len(rows), "insights": rows}
        except MetaError as e:
            last = e
            if "reduce the amount" not in str(e).lower():
                raise
    raise last

def atividades_conta(account_id, limit=200, since=None, until=None):
    p = {"fields": "event_type,event_time,translated_event_type,actor_name,extra_data,object_name", "limit": limit}
    if since and until:
        p["time_range"] = json.dumps({"since": since, "until": until})
    rows = _paged(f"{account_id}/activities", p)
    return {"ok": True, "activities": rows}

def list_adsets(account_id, limit=200):
    # `targeting` pesa: contas grandes estouram "reduce the amount of data".
    # Degrada o page size até passar (paginação junta tudo do mesmo jeito).
    p = {"fields": "name,daily_budget,lifetime_budget,status,effective_status,campaign_id,start_time,end_time,targeting"}
    last = None
    for lim in (limit, 50, 25, 10):
        try:
            rows = _paged(f"{account_id}/adsets", dict(p), node_limit=lim)
            return {"ok": True, "adsets": rows}
        except MetaError as e:
            last = e
            if "reduce the amount" not in str(e).lower():
                raise
    raise last

def list_campaigns(account_id, limit=500):
    p = {"fields": "name,daily_budget,lifetime_budget,status,effective_status,start_time,stop_time", "limit": limit}
    rows = _paged(f"{account_id}/campaigns", p)
    return {"ok": True, "campaigns": rows}

def detalhes_ad(ad_id):
    p = {"fields": "name,status,effective_status,preview_shareable_link,creative"}
    j = _get(f"{ad_id}", p)
    return {"ok": True, "data": j}

def account_spend(account_id, since, until):
    """Atalho: gasto líquido total da conta numa janela (pra reconciliação)."""
    r = get_insights(account_id, level="account", since=since, until=until, fields="spend")
    ins = r["insights"]
    return float(ins[0]["spend"]) if ins else 0.0

if __name__ == "__main__":
    # smoke test (precisa META_TOKEN no ambiente): gasto da conta GAC nos últimos 7 dias.
    import datetime
    acc = os.environ.get("SMOKE_ACC", "act_1174941344352331")
    u = datetime.date.today().isoformat()
    s = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    print("smoke:", acc, s, "->", u)
    print("spend =", account_spend(acc, s, u))
