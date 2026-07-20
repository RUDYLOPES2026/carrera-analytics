#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Helpers compartilhados do run_daily: harvest padrão via meta_api, série diária
com a regra dos 3 dias fechados, verba, links de preview e edits.

Janelas (iguais às usadas nos dashs desde o início):
  mtd = dia 01 do mês -> hoje        (chave 'jul' nos arquivos, legado)
  d30 = hoje-29 -> hoje              (chave '30d')
"""
import os, json, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

LEAD_KEY = "onsite_conversion.lead_grouped"
CONV_KEY = "onsite_conversion.messaging_conversation_started_7d"


# ---------- io ----------
def jload(name, default=None):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        if default is not None:
            return default
        raise FileNotFoundError(p)
    return json.load(open(p, encoding="utf-8"))


def jdump(name, obj, indent=None):
    p = os.path.join(DATA, name)
    s = json.dumps(obj, ensure_ascii=False, indent=indent)
    s = s.replace("—", ", ").replace("–", "-")  # em/en-dash proibidos
    open(p, "w", encoding="utf-8").write(s)


# ---------- métricas ----------
def av(actions, key):
    for a in actions or []:
        if a.get("action_type") == key:
            return int(float(a.get("value", 0)))
    return 0


def leads_conv(row, canal):
    """Regra única do grupo: leads só em Form, conversas só em WhatsApp."""
    acts = row.get("actions")
    leads = av(acts, LEAD_KEY) if canal == "Form" else 0
    conv = av(acts, CONV_KEY) if canal == "WhatsApp" else 0
    return leads, conv


# ---------- contexto de datas ----------
def make_ctx(today=None, closed=3):
    today = today or datetime.date.today()
    iso = today.isoformat()
    mtd = (today.replace(day=1).isoformat(), iso)
    d30 = ((today - datetime.timedelta(days=29)).isoformat(), iso)
    closed_days = [(today - datetime.timedelta(days=i)).isoformat()
                   for i in range(closed, 0, -1)]  # D-3, D-2, D-1
    return {"today": today, "iso": iso, "mtd": mtd, "d30": d30,
            "closed_days": closed_days, "days_to_pull": closed_days + [iso]}


# ---------- harvest padrão ----------
def harvest_std(api, acc, ctx, want_ads=True, want_days=True,
                want_adsets=True, want_activities=True):
    """Puxa o conjunto padrão de uma conta. days_to_pull cobre a REGRA DOS 3 DIAS
    FECHADOS: todo refresh repuxa D-1..D-3 integrais além do dia corrente."""
    h = {}
    h["adset_30d"] = api.get_insights(acc, level="adset", since=ctx["d30"][0], until=ctx["d30"][1])["insights"]
    h["adset_mtd"] = api.get_insights(acc, level="adset", since=ctx["mtd"][0], until=ctx["mtd"][1])["insights"]
    if want_ads:
        h["ad_30d"] = api.get_insights(acc, level="ad", since=ctx["d30"][0], until=ctx["d30"][1])["insights"]
        h["ad_mtd"] = api.get_insights(acc, level="ad", since=ctx["mtd"][0], until=ctx["mtd"][1])["insights"]
    if want_days:
        h["days"] = {}
        for d in ctx["days_to_pull"]:
            h["days"][d] = api.get_insights(acc, level="adset", since=d, until=d)["insights"]
    if want_adsets:
        h["adsets"] = api.list_adsets(acc)["adsets"]
    if want_activities:
        try:
            h["activities"] = api.atividades_conta(acc, limit=60)["activities"]
        except Exception as e:
            print("  [aviso] atividades_conta falhou:", e)
            h["activities"] = []
    return h


# ---------- série diária ----------
def day_entry(insights, classify, date, seg_filter=None):
    """Agrega um dia em buckets form/wa/aux/pv. seg PV -> pv; senão por canal."""
    b = {"form": [0.0, 0, 0], "wa": [0.0, 0, 0], "aux": [0.0, 0, 0], "pv": [0.0, 0, 0]}
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, _loja = classify(i.get("campaign_name"), i.get("adset_name"))
        if seg is None or (seg_filter and seg not in seg_filter and seg != "PV"):
            continue
        leads, conv = leads_conv(i, canal)
        key = "pv" if seg == "PV" else ("form" if canal == "Form" else ("wa" if canal == "WhatsApp" else "aux"))
        b[key][0] += sp; b[key][1] += leads; b[key][2] += conv
    out = {"date": date}
    for k, v in b.items():
        out[k] = {"spend": round(v[0], 2), "leads": v[1], "conv": v[2]}
    return out


def merge_daily(fname, new_entries, keep=30):
    """Substitui os dias repuxados e mantém a cauda de `keep` dias."""
    daily = jload(fname, default=[])
    dates = {e["date"] for e in new_entries}
    daily = [x for x in daily if x["date"] not in dates] + sorted(new_entries, key=lambda e: e["date"])
    daily.sort(key=lambda e: e["date"])
    daily = daily[-keep:]
    jdump(fname, daily)
    return daily


# ---------- elegibilidade de entrega (verba "viva") ----------
def entrega_encerrada(entity, now=None):
    """True se a campanha/conjunto JÁ ENCERROU (tem stop_time/end_time no passado),
    mesmo que a API devolva effective_status ACTIVE. Meta mantém agendamentos
    vencidos como ACTIVE, mas eles gastam ZERO. Critério (decisão 20/07/2026):
    só conta como verba configurada quem está elegível a entregar HOJE, ou seja
    sem stop_time/end_time, ou com stop_time/end_time no futuro. Sem o campo
    (não pedido/preenchido) = trata como vivo (não encerrado)."""
    import datetime as _dt, re as _re
    now = now or _dt.datetime.now(_dt.timezone.utc)
    for k in ("stop_time", "end_time"):
        v = entity.get(k)
        if not v:
            continue
        try:
            s = str(v).strip().replace("Z", "+00:00")
            # Meta manda offset sem dois pontos (ex.: -0300); fromisoformat (py3.9) exige -03:00
            s = _re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", s)
            t = _dt.datetime.fromisoformat(s)
            if t.tzinfo is None:
                t = t.replace(tzinfo=_dt.timezone.utc)
            if t <= now:
                return True
        except Exception:
            continue
    return False

# ---------- verba (adsets ativos com daily_budget) ----------
def verba_from_adsets(adsets, canal_of, reg_of=None):
    out = []
    for a in adsets:
        if a.get("effective_status") != "ACTIVE":
            continue
        if entrega_encerrada(a):          # ignora agendamento vencido (stop_time no passado)
            continue
        db = a.get("daily_budget")
        if db in ("0", "", None):
            continue
        out.append({"nome": a["name"], "reg": (reg_of(a) if reg_of else ""),
                    "can": canal_of(a), "dailyLiq": round(int(db) / 100, 2),
                    "status": "ACTIVE"})
    out.sort(key=lambda x: -x["dailyLiq"])
    return out


# ---------- links de preview (REGRA DE COLETA DE ADS do build.py) ----------
def backfill_links(api, ads_by_win, top=40, budget_calls=45):
    """Garante preview_shareable_link nos tops de cada janela. Reusa o que já tem
    (campo link) e busca só o que falta, com teto de chamadas."""
    missing = []
    seen = set()
    for win, lst in ads_by_win.items():
        for a in sorted(lst, key=lambda x: -x.get("bruto", 0))[:top]:
            if not a.get("link") and a.get("ad") and a["ad"] not in seen:
                seen.add(a["ad"]); missing.append(a["ad"])
    links = {}
    for aid in missing[:budget_calls]:
        try:
            d = api.detalhes_ad(aid)["data"]
            lk = d.get("preview_shareable_link") or ""
            if lk:
                links[aid] = lk
        except Exception as e:
            print("  [aviso] detalhes_ad", aid, "->", e)
    if links:
        for lst in ads_by_win.values():
            for a in lst:
                if a.get("ad") in links and not a.get("link"):
                    a["link"] = links[a["ad"]]
    print(f"  links: faltavam {len(missing)}, preenchidos {len(links)}")
    return links


# ---------- edits (atividades da conta -> linhas humanas) ----------
_SKIP_EVENTS = {"first_delivery_event", "unknown", "ad_account_billing_charge"}


def edits_from_activities(activities, max_items=8, tz_hours=-3):
    out = []
    for ev in activities or []:
        et = (ev.get("event_type") or "").lower()
        if et in _SKIP_EVENTS:
            continue
        txt = ev.get("translated_event_type") or ev.get("event_type") or ""
        obj = ev.get("object_name") or ""
        quem = ev.get("actor_name") or "Meta"
        t = ev.get("event_time") or ""
        quando = ""
        try:
            dt = datetime.datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S") + datetime.timedelta(hours=tz_hours)
            quando = dt.strftime("%d/%m %H:%M")
        except Exception:
            pass
        o_que = (txt + (" , " + obj if obj else "")).strip()
        out.append({"quando": quando, "quem": quem, "o_que": o_que})
        if len(out) >= max_items:
            break
    return out
