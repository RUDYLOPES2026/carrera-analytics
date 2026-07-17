#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chevrolet BSB (act_214293593818859) , marca BESPOKE: refresh() PATCHA o
data/chevrolet_bsb_D.json existente (mesma estrutura, inclusive D.nichos).

Port do LEGADO data/_refresh_bsb_0716.py: mesmas regras/contas, dados via
meta_api em vez de dumps do MCP, datas parametrizadas pelo ctx.

Regras (CLAUDE.md da marca):
  - multi-seg (NV/SN/VD comercial; PV fora do total, mas consome verba);
  - praca unica Brasilia (reg="" sempre, lojas=[]);
  - EXCLUI campanhas com 'GRU' no nome (operacao pausada);
  - NICHOS (Func. Publico / Bancario BB / 72Horas) = recorte D.nichos,
    contam dentro de NV e sao exibidos a parte;
  - leads = onsite_conversion.lead_grouped so em Form;
    conv = onsite_conversion.messaging_conversation_started_7d so em WhatsApp;
  - serie diaria repuxa D-1..D-3 integrais + hoje (ctx.days_to_pull);
  - links de preview: reusa o que o D atual tem + common.backfill_links;
  - edits: common.edits_from_activities (adaptado ao formato dt/tipo/obj);
  - em-dash U+2014 proibido (common.jdump ja limpa); dado real ou nada.

Preserva do D atual: conta, account_id, orcamento_bruto, geo, geo_adsets,
geo_alerts, note_verba, nd_maio (snapshot do mes anterior), pacing.budget.
"""
import datetime
from collections import defaultdict

import common

SLUG = "chevrolet_bsb"
ACC = "act_214293593818859"
GENERIC = False  # bespoke: refresh() escreve o D.json direto
TAX = 1.1215

CANM = {"FORM": "Form", "WA": "WhatsApp", "ALCANCE": "Awareness", "AWA": "Awareness",
        "RMKT": "Engaj", "ENG": "Engaj", "REC": "Engaj", "CTL": "Catalogo",
        "CAT": "Catalogo", "TRF": "Trafego"}
COMM = ("NV", "SN", "VD")
NICHO_DISPLAY = {"FUNC": "Funcionario publico", "BANC": "Bancario do BB",
                 "72": "72 Horas de Vendas"}
CANLBL = {"Form": "FORM", "WhatsApp": "WA", "Awareness": "ALCANCE",
          "Engaj": "ENG", "Catalogo": "CTL", "Trafego": "TRF"}
MESES = {1: "Janeiro", 2: "Fevereiro", 3: "Marco", 4: "Abril", 5: "Maio",
         6: "Junho", 7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro",
         11: "Novembro", 12: "Dezembro"}


def is_gru(name):
    return "GRU" in (name or "").upper()


def nicho_of(name):
    u = (name or "").upper()
    if "FUNCION" in u:
        return "FUNC"
    if "BANC" in u:
        return "BANC"
    if "72HORAS" in u or "72 HORAS" in u:
        return "72"
    return ""


def parse(name):
    """campaign_name -> (seg, canal, canraw, nicho). Eixo = segmento (praca unica)."""
    toks = [t.strip() for t in (name or "").split("|")]
    toks = [t for t in toks if t]
    seg = None; si = None
    for i, t in enumerate(toks):
        u = t.upper()
        if u in ("NV", "SN", "VD", "PV"):
            seg = u; si = i; break
    canraw = ""; canal = "Engaj"
    if si is not None and si + 1 < len(toks):
        canraw = toks[si + 1].upper()
        canal = CANM.get(canraw, "Engaj")
    return (seg or "NV"), canal, canraw, nicho_of(name)


def amap(actions):
    m = defaultdict(float)
    for x in actions or []:
        m[x["action_type"]] += float(x["value"])
    return m


def leads_of(m):
    return int(m.get(common.LEAD_KEY, m.get("offsite_complete_registration_add_meta_leads", 0)))


def conv_of(m):
    return int(m.get(common.CONV_KEY, 0))


def r2(x):
    return round(x + 0.0, 2)


# ---------- agregados (adset-level, fonte unica) ----------
def build_agg(insights):
    rows = []
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        sp = float(i["spend"])
        if sp <= 0:
            continue
        seg, canal, canraw, nicho = parse(i["campaign_name"])
        if seg == "PV":
            continue
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        if canal == "WhatsApp":
            leads = 0; conv = msg
        else:
            leads = lg; conv = msg
        rows.append({"seg": seg, "reg": "", "canal": canal, "bruto": r2(sp * TAX),
                     "leads": leads, "conv": conv, "res": leads + conv})
    return rows


def pv_totals(insights):
    sp = 0.0; msg = 0
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        seg, _, _, _ = parse(i["campaign_name"])
        if seg != "PV":
            continue
        sp += float(i["spend"]); msg += conv_of(amap(i.get("actions")))
    return r2(sp * TAX), int(msg)


def kpi_from_agg(rows, pvb, pvc):
    out = {}
    for seg in COMM:
        rs = [r for r in rows if r["seg"] == seg]
        b = r2(sum(r["bruto"] for r in rs))
        out[seg] = {"liq": r2(b / TAX), "bruto": b,
                    "leads": sum(r["leads"] for r in rs),
                    "conv": sum(r["conv"] for r in rs)}
    out["PV"] = {"liq": r2(pvb / TAX), "bruto": pvb, "leads": 0, "conv": pvc}
    allr = [r for r in rows if r["seg"] in COMM]
    b = r2(sum(r["bruto"] for r in allr))
    out["ALL"] = {"liq": r2(b / TAX), "bruto": b,
                  "leads": sum(r["leads"] for r in allr),
                  "conv": sum(r["conv"] for r in allr)}
    return out


def chan_from_agg(rows, pvb, pvc):
    out = {"OUT": {}}
    for seg in COMM:
        d = defaultdict(lambda: {"bruto": 0.0, "leads": 0, "conv": 0})
        for r in rows:
            if r["seg"] != seg:
                continue
            c = r["canal"]
            d[c]["bruto"] += r["bruto"]; d[c]["leads"] += r["leads"]; d[c]["conv"] += r["conv"]
        out[seg] = {c: {"bruto": r2(v["bruto"]), "leads": v["leads"], "conv": v["conv"]}
                    for c, v in d.items()}
    out["PV"] = {"WhatsApp": {"bruto": pvb, "leads": 0, "conv": pvc}} if pvb else {}
    return out


def kpifilter_from_agg(rows):
    out = {}
    for seg in ("ALL", "NV", "SN", "VD", "PV"):
        sub = ([r for r in rows if r["seg"] in COMM] if seg == "ALL"
               else [r for r in rows if r["seg"] == seg])
        out[seg] = {"ALL": {"bruto": round(sum(r["bruto"] for r in sub)),
                            "leads": sum(r["leads"] for r in sub),
                            "conv": sum(r["conv"] for r in sub),
                            "ads": len(sub), "on": len(sub)}}
    return out


# ---------- nichos (recorte dentro de NV, exibidos a parte) ----------
def build_nichos(insights):
    agg = defaultdict(lambda: [0.0, 0, 0])
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        seg, canal, canraw, nicho = parse(i["campaign_name"])
        if not nicho:
            continue
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        agg[nicho][0] += float(i["spend"]) * TAX
        agg[nicho][1] += lg; agg[nicho][2] += msg
    rows = []
    for n in ("FUNC", "BANC", "72"):
        if n not in agg:
            continue
        b, le, cv = agg[n]
        rows.append({"nome": NICHO_DISPLAY[n], "bruto": r2(b), "res": le + cv, "leads": le})
    rows.sort(key=lambda x: -x["bruto"])
    return rows


# ---------- ads (ad-level) + rank ----------
def build_ads(insights, linkmap, stmap):
    out = []
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        sp = float(i["spend"])
        if sp <= 0:
            continue
        seg, canal, canraw, nicho = parse(i["campaign_name"])
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        if canal == "WhatsApp":
            leads = 0; conv = msg
        else:
            leads = lg; conv = msg
        bruto = r2(sp * TAX); res = leads + conv
        adid = i["ad_id"]
        out.append({"seg": seg, "reg": "", "canal": canal, "tipo": canraw or "IMAGEM",
                    "nome": i.get("ad_name") or "", "bruto": bruto, "leads": leads,
                    "conv": conv, "res": res, "cpr": r2(bruto / res) if res else 0,
                    "ad": adid, "ctr": r2(float(i.get("ctr", 0) or 0)),
                    "link": linkmap.get(adid, ""), "st": stmap.get(adid, "ACTIVE"),
                    "dt": "", "off": None, "nicho": nicho})
    return out


def build_rank(ads):
    r = {}
    for s in ("NV", "SN", "VD", "PV"):
        pool = [a for a in ads if a["seg"] == s]
        top = sorted(pool, key=lambda a: -a["res"])[:10]
        withres = [a for a in pool if a["res"] > 0]
        best = sorted(withres, key=lambda a: a["cpr"])[:5] if withres else []
        worst = sorted([a for a in pool if a["res"] == 0 and a["bruto"] > 0],
                       key=lambda a: -a["bruto"])[:5]
        r[s] = {"top": top, "best": best, "worst": worst}
    return r


# ---------- serie diaria (form/wa/aux/pv) ----------
def daily_bucket(insights):
    b = {k: {"spend": 0.0, "leads": 0, "conv": 0} for k in ("form", "wa", "aux", "pv")}
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        sp = float(i["spend"])
        if sp <= 0:
            continue
        seg, canal, canraw, nicho = parse(i["campaign_name"])
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        if seg == "PV":
            b["pv"]["spend"] += sp; b["pv"]["conv"] += msg; continue
        if canal == "Form":
            bk = b["form"]; bk["spend"] += sp; bk["leads"] += lg; bk["conv"] += msg
        elif canal == "WhatsApp":
            bk = b["wa"]; bk["spend"] += sp; bk["conv"] += msg
        else:
            bk = b["aux"]; bk["spend"] += sp; bk["leads"] += lg; bk["conv"] += msg
    for k in b:
        b[k]["spend"] = round(b[k]["spend"], 2)
    return b


# ---------- edits / nd_changes (log real da conta) ----------
def build_edits(activities):
    """common.edits_from_activities -> formato do template (dt/tipo/obj/autor/det).
    o_que = '<tipo> , <obj>' (join do common); split no primeiro ' , ' recupera os dois."""
    out = []
    for e in common.edits_from_activities(activities):
        parts = (e.get("o_que") or "").split(" , ", 1)
        out.append({"dt": e.get("quando", ""), "tipo": parts[0],
                    "obj": parts[1] if len(parts) > 1 else "",
                    "autor": e.get("quem", ""), "det": ""})
    return out


def build_nd_changes(activities, window_dates, max_entregas=10):
    """Contagens reais do log dentro da janela repuxada (D-3..hoje)."""
    novos = pausados = excluidos = 0
    entregas = []
    for ev in activities or []:
        t = (ev.get("event_time") or "")[:10]
        if t not in window_dates:
            continue
        et = (ev.get("event_type") or "").lower()
        extra = (ev.get("extra_data") or "").lower()
        if "create" in et:
            novos += 1
        elif "delete" in et:
            excluidos += 1
        elif "run_status" in et and "paus" in extra:
            pausados += 1
        elif et == "first_delivery_event" and len(entregas) < max_entregas:
            quando = ""
            try:
                dt = (datetime.datetime.strptime(t + ev.get("event_time")[10:19], "%Y-%m-%dT%H:%M:%S")
                      + datetime.timedelta(hours=-3))
                quando = dt.strftime("%d/%m %H:%M")
            except Exception:
                pass
            entregas.append({"dt": quando, "obj": ev.get("object_name") or ""})
    return {"novos": novos, "pausados": pausados, "excluidos": excluidos,
            "entregas": entregas}


# ---------- verba (adsets ativos, mesmo shape do nd_verba atual) ----------
def _canal_of_adset(a, cmap):
    cn = cmap.get(a.get("campaign_id"), "")
    _seg, canal, _raw, _n = parse(cn)
    return canal


# ---------- refresh ----------
def refresh(api, ctx):
    today = ctx["today"]
    h = common.harvest_std(api, ACC, ctx)
    cur = common.jload(f"{SLUG}_D.json")

    agg_mes = build_agg(h["adset_mtd"]); agg_30d = build_agg(h["adset_30d"])
    pv_bm, pv_cm = pv_totals(h["adset_mtd"]); pv_b3, pv_c3 = pv_totals(h["adset_30d"])

    kpi = {"jun": kpi_from_agg(agg_mes, pv_bm, pv_cm),
           "30d": kpi_from_agg(agg_30d, pv_b3, pv_c3)}
    chan = {"jun": chan_from_agg(agg_mes, pv_bm, pv_cm),
            "30d": chan_from_agg(agg_30d, pv_b3, pv_c3)}
    kpifilter = {"jun": kpifilter_from_agg(agg_mes), "30d": kpifilter_from_agg(agg_30d)}
    nichos = {"mes": build_nichos(h["adset_mtd"]), "30d": build_nichos(h["adset_30d"])}

    # links/status: reusa o que o D atual tem; faltantes via backfill_links
    linkmap = {}; stmap = {}
    for w in ("jun", "30d"):
        for a in cur.get("ads", {}).get(w, []):
            if a.get("link"):
                linkmap[a["ad"]] = a["link"]
            if a.get("st"):
                stmap[a["ad"]] = a["st"]
    ads = {"jun": build_ads(h["ad_mtd"], linkmap, stmap),
           "30d": build_ads(h["ad_30d"], linkmap, stmap)}
    common.backfill_links(api, ads)
    rank = {"jun": build_rank(ads["jun"]), "30d": build_rank(ads["30d"])}

    # serie diaria: re-pull integral D-3..D-1 + hoje (regra dos 3 dias fechados)
    newdays = []
    for d in ctx["days_to_pull"]:
        row = {"date": d}
        row.update(daily_bucket(h["days"][d]))
        newdays.append(row)
    cutoff = ctx["days_to_pull"][0]
    nd = [x for x in cur["n_daily"] if x["date"] < cutoff] + newdays
    nd = sorted(nd, key=lambda x: x["date"])[-30:]
    assert nd[-1]["date"] == ctx["iso"], nd[-1]["date"]

    # verba viva (adsets ativos com daily_budget; praca unica, reg="")
    cmap = {i.get("campaign_id"): i.get("campaign_name")
            for i in h["ad_30d"] + h["adset_30d"]}
    nd_verba = common.verba_from_adsets(h["adsets"], lambda a: _canal_of_adset(a, cmap))

    # edits / nd_changes reais (log da conta, janela repuxada)
    edits = build_edits(h["activities"])
    nd_changes = build_nd_changes(h["activities"], set(ctx["days_to_pull"]))

    # monta base preservando o restante do D (conta, geo*, nd_maio, notas...)
    base = cur
    base["kpi"] = kpi; base["chan"] = chan; base["kpifilter"] = kpifilter
    base["agg"] = {"jun": agg_mes, "30d": agg_30d}
    base["ads"] = ads; base["rank"] = rank; base["nichos"] = nichos
    base["n_daily"] = nd; base["nd_verba"] = nd_verba
    base["edits"] = edits; base["nd_changes"] = nd_changes; base["note_edits"] = ""
    base["lojas"] = []
    base["gerado"] = ctx["iso"]
    base["mes_nome"] = MESES[today.month]
    prev = today.replace(day=1) - datetime.timedelta(days=1)
    base["mom_nome"] = MESES[prev.month]
    import calendar
    dim = calendar.monthrange(today.year, today.month)[1]
    asof = today.strftime("%d/%m")
    base["pacing"] = {"budget": base.get("pacing", {}).get("budget", 19850.55),
                      "days": dim, "elapsed": today.day, "asof": asof}
    base["parcial"] = (
        "Formulario e WhatsApp de Novos, Seminovos e Venda Direta (Brasilia, "
        f"{base['mes_nome']} MTD 01-{today.day:02d}). Pos-venda fora do total, mas consome verba. "
        "Nichos (Func. Publico, Bancario BB, 72 Horas) contam em Novos e sao exibidos a parte. "
        f"{asof} parcial.")

    # nd_jun (mes corrente MTD) a partir do agg
    kA = kpi["jun"]["ALL"]; jrt = kA["leads"] + kA["conv"]
    ndj = {"total": {"bruto": kA["bruto"], "leads": kA["leads"], "conv": kA["conv"],
                     "res": jrt, "cpl": r2(kA["bruto"] / jrt) if jrt else 0},
           "lojas": []}
    cagg = defaultdict(lambda: [0.0, 0, 0])
    for r in agg_mes:
        lbl = CANLBL.get(r["canal"], r["canal"])
        key = (r["seg"], r["canal"], lbl)
        cagg[key][0] += r["bruto"]; cagg[key][1] += r["leads"]; cagg[key][2] += r["conv"]
    camps = []
    for (seg, canal, lbl), (b, le, cv) in cagg.items():
        res = le + cv
        camps.append({"nome": "%s , %s" % (seg, lbl), "reg": "", "can": canal,
                      "bruto": r2(b), "res": res, "cpl": r2(b / res) if res else 0})
    camps.sort(key=lambda c: -c["bruto"])
    ndj["campanhas"] = camps
    if pv_bm > 0:
        ndj["pv"] = {"bruto": pv_bm, "leads": 0, "conv": pv_cm,
                     "cpr": r2(pv_bm / pv_cm) if pv_cm else 0}
    base["nd_jun"] = ndj

    common.jdump(f"{SLUG}_D.json", base)

    # sanity prints (mesmos checks do legado)
    for w in ("jun", "30d"):
        aggb = sum(r["bruto"] for r in base["agg"][w]); kall = base["kpi"][w]["ALL"]["bruto"]
        print("  %s agg=%.2f kpi.ALL=%.2f diff%%=%.4f"
              % (w, aggb, kall, (aggb / kall - 1) * 100 if kall else 0))
    print("  n_daily", nd[0]["date"], "..", nd[-1]["date"], len(nd))
    print("  KPI mes:", {s: kpi["jun"][s]["bruto"] for s in ("NV", "SN", "VD", "PV", "ALL")})
    print("  KPI 30d:", {s: kpi["30d"][s]["bruto"] for s in ("NV", "SN", "VD", "PV", "ALL")})
    print("  nichos mes:", nichos["mes"])
    try:
        acct = api.account_spend(ACC, ctx["d30"][0], ctx["d30"][1])
        tot = kpi["30d"]["ALL"]["liq"] + r2(pv_b3 / TAX)
        print("  RECONCILE 30d comercial+PV liq=%.2f vs account %.2f diff%%=%.3f"
              % (tot, acct, (tot / acct - 1) * 100 if acct else 0))
    except Exception as e:
        print("  [aviso] reconcile account_spend falhou:", e)
