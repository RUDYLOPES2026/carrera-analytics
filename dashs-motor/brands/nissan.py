# -*- coding: utf-8 -*-
"""Nissan (act_464593798098397) , marca BESPOKE (stateful): carrega data/nissan_D.json,
repuxa via meta_api e substitui as partes vivas. Port do LEGADO _refresh_nissan_0716.py,
trocando os dumps do MCP por chamadas diretas e parametrizando as datas via ctx.

Regras (CLAUDE.md): multi-seg NV/SN/VD/PV; pracas SP/VL/INT/G (loja no NIVEL ADSET);
PV fora do total comercial (gasto conta no pacing via bruto do mes, exibido a parte);
leads = lead_grouped so em Form; conv = messaging_conversation_started_7d so em WhatsApp.

Vivo (rebuild): kpi, chan, rank, kpifilter, regperf, ads, agg, n_daily, nd_jun,
                edits, nd_changes, note_edits, pacing, parcial, gerado, mes/mom.
Preservado:     geo, geo_adsets, geo_alerts, note_geo, nd_verba, note_verba,
                nd_maio (comparativo do mes anterior), segnome, segcount, zumbis.
"""
import re
import calendar
import datetime
from collections import defaultdict, Counter

import common

SLUG = "nissan"
ACC = "act_464593798098397"
GENERIC = False  # bespoke: refresh() escreve data/nissan_D.json direto
TAX = 1.1215
COMM = ("NV", "SN", "VD")

MESES = ["", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

# ---- classificacao (identica ao legado) ----
LOJAS = {"SP": ["BRA", "BUT", "BFU", "COT", "MOR", "SUM", "VOL"],
         "VL": ["GUA", "PIN", "SJC", "TBT"],
         "INT": ["ARQ", "SCA", "CAT", "VOT"]}
LOJA2REG = {lj: reg for reg, ls in LOJAS.items() for lj in ls}
CANM = {"FORM": "Form", "WA": "WhatsApp", "ENG": "Engaj", "RMKT": "Engaj", "CTL": "Form",
        "AWARENESS": "Awareness", "AWA": "Awareness", "TRAFEGO": "Trafego", "TRF": "Trafego"}
REGWORD = {"SP": "SP", "SAO": "SP", "CAPITAL": "SP", "VL": "VL", "VALE": "VL",
           "INT": "INT", "INTERIOR": "INT"}


def camp_parse(name):
    toks = [t.strip() for t in (name or "").split("|")]
    toks = [t for t in toks if t]
    seg = None; si = None
    for i, t in enumerate(toks):
        u = t.upper()
        if u in ("NV", "SN", "VD", "PV"):
            seg = u; si = i; break
    canal = "Engaj"
    if si is not None and si + 1 < len(toks):
        canal = CANM.get(toks[si + 1].upper(), "Engaj")
    creg = "G"
    for t in toks:
        if t.upper() in REGWORD:
            creg = REGWORD[t.upper()]; break
    return (seg or "NV"), canal, creg


def adset_reg(adset_name, camp_creg):
    """Praca/loja vem do NIVEL ADSET; a campanha so da o fallback."""
    toks = re.split(r"[^A-Za-z0-9]+", (adset_name or "").upper())
    for t in toks:
        if t in LOJA2REG:
            return LOJA2REG[t]
    for t in toks:
        if t in REGWORD:
            return REGWORD[t]
    return camp_creg if camp_creg in ("SP", "VL", "INT") else "G"


def amap(a):
    m = defaultdict(float)
    for x in a or []:
        m[x["action_type"]] += float(x["value"])
    return m


def leads_of(m):
    return int(m.get("onsite_conversion.lead_grouped",
                     m.get("offsite_complete_registration_add_meta_leads", 0)))


def conv_of(m):
    return int(m.get("onsite_conversion.messaging_conversation_started_7d", 0))


def clean(s):
    return (s or "").replace("—", ", ").replace("–", "-")


# ============ ADSET AGG (fonte unica dos KPIs) ============
def build_agg(insights):
    rows = []
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, creg = camp_parse(i.get("campaign_name"))
        if seg == "PV":
            continue
        reg = adset_reg(i.get("adset_name"), creg)
        m = amap(i.get("actions"))
        lg = leads_of(m); msg = conv_of(m)
        if canal == "WhatsApp":
            leads = 0; conv = msg
        else:
            leads = lg; conv = msg
        bruto = round(sp * TAX, 2); res = leads + conv
        rows.append({"seg": seg, "reg": reg, "canal": canal, "bruto": bruto,
                     "leads": leads, "conv": conv, "res": res})
    return rows


def pv_totals(insights):
    sp = 0.0; msg = 0
    for i in insights:
        seg, _, _ = camp_parse(i.get("campaign_name"))
        if seg != "PV":
            continue
        sp += float(i.get("spend", 0) or 0)
        msg += conv_of(amap(i.get("actions")))
    return round(sp * TAX, 2), int(msg)


def kpi_from_agg(rows):
    out = {}
    for seg in COMM:
        rs = [r for r in rows if r["seg"] == seg]
        bru = round(sum(r["bruto"] for r in rs), 2)
        out[seg] = {"liq": round(bru / TAX, 2), "bruto": bru,
                    "leads": sum(r["leads"] for r in rs), "conv": sum(r["conv"] for r in rs)}
    allr = [r for r in rows if r["seg"] in COMM]
    bru = round(sum(r["bruto"] for r in allr), 2)
    out["ALL"] = {"liq": round(bru / TAX, 2), "bruto": bru,
                  "leads": sum(r["leads"] for r in allr), "conv": sum(r["conv"] for r in allr)}
    return out


def chan_from_agg(rows):
    out = {}
    for seg in COMM:
        d = defaultdict(lambda: {"bruto": 0.0, "leads": 0, "conv": 0})
        for r in rows:
            if r["seg"] != seg:
                continue
            c = r["canal"]
            d[c]["bruto"] += r["bruto"]; d[c]["leads"] += r["leads"]; d[c]["conv"] += r["conv"]
        o = {}
        for c in ("Form", "WhatsApp", "Engaj", "Awareness", "Trafego"):
            if c in d:
                o[c] = {"bruto": round(d[c]["bruto"], 2), "leads": d[c]["leads"], "conv": d[c]["conv"]}
        out[seg] = o
    return out


def kpifilter_from_agg(rows):
    out = {}
    for seg in ("ALL",) + COMM:
        base = [r for r in rows if r["seg"] in COMM] if seg == "ALL" else [r for r in rows if r["seg"] == seg]
        inner = {}
        for reg in ("ALL", "SP", "VL", "INT", "G"):
            sub = base if reg == "ALL" else [r for r in base if r["reg"] == reg]
            inner[reg] = {"bruto": round(sum(r["bruto"] for r in sub)),
                          "leads": sum(r["leads"] for r in sub),
                          "conv": sum(r["conv"] for r in sub),
                          "ads": len(sub), "on": len(sub)}
        out[seg] = inner
    return out


REGN = {"SP": "São Paulo", "VL": "Vale", "INT": "Interior", "G": "Geral"}


def regperf_from(rows):
    d = defaultdict(lambda: {"spend": 0.0, "leads": 0, "conv": 0})
    for r in rows:
        d[r["reg"]]["spend"] += r["bruto"]; d[r["reg"]]["leads"] += r["leads"]; d[r["reg"]]["conv"] += r["conv"]
    out = []
    for reg in ("SP", "VL", "INT", "G"):
        x = d[reg]; tot = x["leads"] + x["conv"]
        out.append({"reg": reg, "nome": REGN[reg], "spend": round(x["spend"]),
                    "leads": x["leads"], "conv": x["conv"],
                    "cpl": round(x["spend"] / tot, 2) if tot else 0})
    return out


# ============ ADS (ranking) ============
def tipo_of(name):
    u = (name or "").upper().replace("Í", "I").replace("Ó", "O")
    if "CARROSSEL" in u or "CARROUSEL" in u:
        return "CARROSSEL"
    if "VIDEO" in u or "REELS" in u:
        return "VIDEO"
    return "IMAGEM"


def link_map(cur):
    """Reusa links/farol ja acumulados: primeiro do D atual, depois dos seeds de estado."""
    LINK = {}
    for w in ("jun", "30d"):
        for a in cur.get("ads", {}).get(w, []):
            if a.get("link") or a.get("st") or a.get("dt"):
                LINK[a["ad"]] = {"link": a.get("link", ""), "st": a.get("st", ""), "dt": a.get("dt", "")}
    for fn in ("_nissan_links_jul07.json", "_nissan_links_1.json", "_nissan_links_2.json"):
        for ad, v in common.jload(fn, default={}).items():
            if isinstance(v, dict) and v.get("link"):
                LINK.setdefault(ad, {})
                LINK[ad]["link"] = v["link"]
                if v.get("st"):
                    LINK[ad]["st"] = v["st"]
                if v.get("dt"):
                    LINK[ad]["dt"] = v["dt"]
    for ad, v in common.jload("_nissan_newlinks.json", default={}).items():
        lk = v.get("link", "") if isinstance(v, dict) else v
        if lk:
            LINK.setdefault(ad, {})["link"] = lk
    return LINK


def build_ads(insights, LINK):
    out = []
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, creg = camp_parse(i.get("campaign_name"))
        if seg == "PV":
            continue
        reg = adset_reg(i.get("adset_name", ""), creg)
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        if canal == "WhatsApp":
            leads = 0; conv = msg
        else:
            leads = lg; conv = msg
        bruto = round(sp * TAX, 2); res = leads + conv
        cpr = round(bruto / res, 2) if res else 0
        adid = i["ad_id"]; lk = LINK.get(adid, {})
        out.append({"seg": seg, "reg": reg, "canal": canal, "tipo": tipo_of(i.get("ad_name")),
                    "nome": clean(i.get("ad_name")), "bruto": bruto, "leads": leads,
                    "conv": conv, "res": res, "cpr": cpr, "ad": adid,
                    "ctr": round(float(i.get("ctr", 0) or 0), 2),
                    "link": lk.get("link", ""), "st": lk.get("st", ""),
                    "dt": lk.get("dt", ""), "off": ""})
    return out


DETAIL = ["nome", "canal", "tipo", "bruto", "leads", "conv", "res", "cpr",
          "ad", "ctr", "link", "st", "dt", "reg"]


def rank_block(ads, seg):
    sub = [a for a in ads if a["seg"] == seg]
    top = sorted(sub, key=lambda a: a["res"], reverse=True)[:8]
    pior = sorted([a for a in sub if a["res"] > 0], key=lambda a: a["cpr"], reverse=True)[:8]
    det = lambda a: {k: a.get(k, "") for k in DETAIL}
    return {"top": [det(a) for a in top], "pior": [det(a) for a in pior]}


# ============ n_daily ============
def daily_bucket(insights):
    b = {k: {"spend": 0.0, "leads": 0, "conv": 0} for k in
         ("sp_form", "sp_wa", "vl_form", "vl_wa", "int_form", "int_wa",
          "g_form", "g_wa", "inst", "pv")}
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, creg = camp_parse(i.get("campaign_name"))
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        if seg == "PV":
            b["pv"]["spend"] += sp; b["pv"]["conv"] += msg; continue
        if canal in ("Engaj", "Awareness", "Trafego"):
            b["inst"]["spend"] += sp; b["inst"]["leads"] += lg; b["inst"]["conv"] += msg; continue
        rk = {"SP": "sp", "VL": "vl", "INT": "int", "G": "g"}.get(creg, "g")
        ck = "wa" if canal == "WhatsApp" else "form"
        bk = b["%s_%s" % (rk, ck)]; bk["spend"] += sp
        if canal == "WhatsApp":
            bk["conv"] += msg
        else:
            bk["leads"] += lg; bk["conv"] += msg
    for k in b:
        b[k]["spend"] = round(b[k]["spend"], 2)
    return b


# ============ edits / nd_changes (log REAL da conta) ============
def _fmt_ev_dt(t, tz_hours=-3):
    try:
        dt = datetime.datetime.strptime((t or "")[:19], "%Y-%m-%dT%H:%M:%S") + datetime.timedelta(hours=tz_hours)
        return dt.strftime("%d/%m %H:%M")
    except Exception:
        return ""


def edits_block(activities, ctx):
    """edits no schema do template Nissan (dt/tipo/autor/obj/det) a partir do log real,
    via common.edits_from_activities; nd_changes contado do mesmo log. Dado real ou nada."""
    edits = []
    for e in common.edits_from_activities(activities):
        parts = (e.get("o_que") or "").split(" , ", 1)
        edits.append({"dt": e.get("quando", ""), "tipo": parts[0],
                      "autor": e.get("quem", ""),
                      "obj": parts[1] if len(parts) > 1 else "", "det": ""})
    win = ctx["days_to_pull"][-3:]  # janela de 3 dias (D-2..hoje), como no legado
    novos = pausados = excluidos = 0
    entregas = []
    for ev in activities or []:
        d = (ev.get("event_time") or "")[:10]
        if d not in win:
            continue
        et = (ev.get("event_type") or "").lower()
        xd = str(ev.get("extra_data") or "").upper()
        if et == "first_delivery_event":
            if len(entregas) < 8:
                entregas.append({"dt": _fmt_ev_dt(ev.get("event_time")),
                                 "obj": clean(ev.get("object_name") or "")})
            continue
        if et in ("create_ad", "ad_created"):
            novos += 1
        elif "delete" in et and "ad" in et:
            excluidos += 1
        elif "run_status" in et and "PAUSED" in xd:
            pausados += 1
    nd_changes = {"novos": novos, "pausados": pausados, "excluidos": excluidos,
                  "entregas": entregas}
    d0 = win[0][8:10]; d1 = win[-1][8:10]; mm = win[-1][5:7]
    if edits or entregas:
        note = ("Janela %s-%s/%s. Log automatico da conta via API de atividades: "
                "%d evento(s) relevante(s) listados acima e %d primeira(s) entrega(s) de anuncio "
                "somadas em Mudancas. Sem interpretacao editorial: apenas o registro bruto do log."
                % (d0, d1, mm, len(edits), len(entregas)))
    else:
        note = ("Janela %s-%s/%s. Nenhum evento registrado no log da conta nesta janela."
                % (d0, d1, mm))
    return edits, nd_changes, note


# ============ refresh ============
def refresh(api, ctx):
    CUR = common.jload(f"{SLUG}_D.json")
    today = ctx["today"]; iso = ctx["iso"]
    mes = today.month; mom = mes - 1 if mes > 1 else 12

    # harvest: adset+ad em 2 janelas, dias repuxados, atividades (sem list_adsets:
    # nd_verba/note_verba sao preservados do D, como no legado)
    h = common.harvest_std(api, ACC, ctx, want_adsets=True)
    ADSET_MTD = h["adset_mtd"]; ADSET_30D = h["adset_30d"]
    AD_MTD = h["ad_mtd"]; AD_30D = h["ad_30d"]

    # ---- agg (fonte unica) + kpi/chan/kpifilter/regperf ----
    agg_mtd = build_agg(ADSET_MTD); agg_30d = build_agg(ADSET_30D)
    kpi = {"jun": kpi_from_agg(agg_mtd), "30d": kpi_from_agg(agg_30d)}
    chan = {"jun": chan_from_agg(agg_mtd), "30d": chan_from_agg(agg_30d)}
    kpifilter = {"jun": kpifilter_from_agg(agg_mtd), "30d": kpifilter_from_agg(agg_30d)}
    regperf = regperf_from(agg_30d)  # label do template = ultimos 30 dias

    # ---- ads + rank (links reusados do D + seeds; backfill so no que falta) ----
    LINK = link_map(CUR)
    ads_mtd = build_ads(AD_MTD, LINK); ads_30d = build_ads(AD_30D, LINK)
    rank = {w: {s: rank_block(ads, s) for s in COMM}
            for w, ads in (("jun", ads_mtd), ("30d", ads_30d))}
    # backfill: so os ads do RANK sem link (mutacao in-place nos dicts do rank)
    need = []; seen = set()
    for w in ("jun", "30d"):
        for s in COMM:
            for a in rank[w][s]["top"] + rank[w][s]["pior"]:
                if not a.get("link") and a["ad"] not in seen:
                    seen.add(a["ad"]); need.append(a)
    newlinks = common.backfill_links(api, {"rank": need})
    if newlinks:
        for lst in (ads_mtd, ads_30d):
            for a in lst:
                if a["ad"] in newlinks and not a.get("link"):
                    a["link"] = newlinks[a["ad"]]
        for w in ("jun", "30d"):
            for s in COMM:
                for a in rank[w][s]["top"] + rank[w][s]["pior"]:
                    if a["ad"] in newlinks and not a.get("link"):
                        a["link"] = newlinks[a["ad"]]

    # ---- n_daily (repuxa D-3..hoje; preserva a cauda; mantem 30 dias) ----
    repulled = set(ctx["days_to_pull"])
    newdays = []
    for d in ctx["days_to_pull"]:
        row = {"date": d}; row.update(daily_bucket(h["days"][d])); newdays.append(row)
    nd = [x for x in CUR["n_daily"] if x["date"] not in repulled] + newdays
    nd = sorted(nd, key=lambda x: x["date"])[-30:]
    assert nd[-1]["date"] == iso, nd[-1]["date"]

    # ---- monta o D (stateful: so as partes vivas mudam) ----
    base = CUR
    base["kpi"] = kpi; base["chan"] = chan; base["rank"] = rank
    base["kpifilter"] = kpifilter; base["regperf"] = regperf
    base["agg"] = {"jun": agg_mtd, "30d": agg_30d}
    base["ads"] = {"jun": ads_mtd, "30d": ads_30d}
    base["n_daily"] = nd
    base["gerado"] = iso
    base["mes_nome"] = MESES[mes]; base["mom_nome"] = MESES[mom]
    base["mes_num"] = mes; base["mom_num"] = mom
    ndays = calendar.monthrange(today.year, mes)[1]
    base["pacing"] = {"budget": round(float(CUR.get("orcamento_bruto", 75000)) * TAX, 2),
                      "days": ndays, "elapsed": today.day,
                      "asof": today.strftime("%d/%m")}
    dd = today.strftime("%d"); mm2 = today.strftime("%m")
    base["parcial"] = ("Formulario/Catalogo e WhatsApp de Novos, Seminovos e Venda Direta "
                       "(%s, MTD 01-%s/%s): TODOS os anuncios com gasto, filtraveis por segmento, "
                       "praca (SP/Vale/Interior) e canal. Auxiliares (Engajamento/Awareness) e "
                       "pos-venda (PV) somados a parte. Serie diaria dos ultimos 30 dias. "
                       "%s/%s vem parcial (dia em curso). Dados de %s."
                       % (MESES[mes], dd, mm2, dd, mm2, today.strftime("%d/%m/%Y")))

    # ---- nd_jun (bloco do mes corrente) ----
    pv_bruto, pv_conv = pv_totals(ADSET_MTD)
    kA = kpi["jun"]["ALL"]; jrt = kA["leads"] + kA["conv"]
    base["nd_jun"]["total"] = {"bruto": kA["bruto"], "leads": kA["leads"], "conv": kA["conv"],
                               "res": jrt, "cpl": round(kA["bruto"] / jrt, 2) if jrt else 0}
    base["nd_jun"]["pv"] = {"bruto": pv_bruto, "conv": pv_conv,
                            "cpr": round(pv_bruto / pv_conv, 2) if pv_conv else 0}
    ra = defaultdict(lambda: {"bruto": 0.0, "leads": 0, "conv": 0})
    for r in agg_mtd:
        ra[r["reg"]]["bruto"] += r["bruto"]; ra[r["reg"]]["leads"] += r["leads"]; ra[r["reg"]]["conv"] += r["conv"]
    RN2 = {"SP": "Sao Paulo", "VL": "Vale", "INT": "Interior", "G": "Geral (multi-praca)"}
    base["nd_jun"]["regioes"] = []
    for reg in ("SP", "VL", "INT", "G"):
        x = ra[reg]; res = x["leads"] + x["conv"]
        base["nd_jun"]["regioes"].append({"reg": reg, "nome": RN2[reg], "bruto": round(x["bruto"], 2),
                                          "res": res, "cpl": round(x["bruto"] / res, 2) if res else 0,
                                          "leads": x["leads"], "conv": x["conv"]})
    cmap = {i["ad_id"]: i.get("campaign_name", "") for i in AD_MTD}
    capg = defaultdict(lambda: {"bruto": 0.0, "res": 0, "regs": Counter(), "cans": Counter()})
    for a in ads_mtd:
        cn = cmap.get(a["ad"], "")
        capg[cn]["bruto"] += a["bruto"]; capg[cn]["res"] += a["res"]
        capg[cn]["regs"][a["reg"]] += 1; capg[cn]["cans"][a["canal"]] += 1
    base["nd_jun"]["campanhas"] = []
    for cn, x in sorted(capg.items(), key=lambda kv: -kv[1]["bruto"])[:15]:
        reg = x["regs"].most_common(1)[0][0] if x["regs"] else "G"
        can = x["cans"].most_common(1)[0][0] if x["cans"] else ""
        base["nd_jun"]["campanhas"].append({"nome": clean(cn), "reg": reg, "can": can,
                                            "bruto": round(x["bruto"], 2), "res": x["res"],
                                            "cpl": round(x["bruto"] / x["res"], 2) if x["res"] else 0})
    LSUB = {"SP": "BRA, BUT, BFU, COT, MOR, SUM, VOL", "VL": "GUA, PIN, SJC, TBT",
            "INT": "ARQ, SCA, CAT, VOT", "G": "catalogo SN, VD, RMKT, institucional"}
    LNOME = {"SP": "Sao Paulo", "VL": "Vale", "INT": "Interior", "G": "Geral (sem praca)"}
    base["nd_jun"]["lojas"] = []
    for reg in ("SP", "VL", "INT", "G"):
        x = ra[reg]; res = x["leads"] + x["conv"]
        base["nd_jun"]["lojas"].append({"reg": reg, "nome": LNOME[reg], "sub": LSUB[reg],
                                        "bruto": round(x["bruto"], 2), "res": res,
                                        "cpl": round(x["bruto"] / res, 2) if res else 0})

    # ---- edits / nd_changes / note_edits (log REAL, sem texto editorial) ----
    base["edits"], base["nd_changes"], base["note_edits"] = edits_block(h["activities"], ctx)

    # ---- nd_verba VIVA (era preservada): adsets ativos + campanhas CBO.
    # Necessária pra projeção por intenção da central (verba/dia configurada).
    cmap = {r.get("campaign_id"): r.get("campaign_name", "")
            for r in AD_30D + ADSET_30D}
    verba = []
    for a in h.get("adsets", []):
        if a.get("effective_status") != "ACTIVE":
            continue
        if common.entrega_encerrada(a):        # ignora agendamento vencido (stop_time no passado)
            continue
        db = a.get("daily_budget")
        if db in (None, "", "0"):
            continue
        cn = cmap.get(a.get("campaign_id"), "")
        _seg, canal, creg = camp_parse(cn)
        verba.append({"nome": a["name"], "reg": adset_reg(a["name"], creg),
                      "can": canal, "dailyLiq": round(int(db) / 100, 2),
                      "status": "ACTIVE"})
    try:
        for c in api.list_campaigns(ACC)["campaigns"]:
            if (c.get("effective_status") == "ACTIVE" and c.get("daily_budget") not in (None, "", "0")
                    and not common.entrega_encerrada(c)):   # exclui campanha CBO já encerrada
                _seg, canal, creg = camp_parse(c["name"])
                verba.append({"nome": c["name"], "reg": creg, "can": canal,
                              "dailyLiq": round(int(c["daily_budget"]) / 100, 2),
                              "status": "ACTIVE"})
    except Exception as e:
        print("  [aviso] list_campaigns:", e)
    if verba:
        verba.sort(key=lambda x: -x["dailyLiq"])
        base["nd_verba"] = verba

    # ---- grava (jdump ja troca em/en-dash) ----
    common.jdump(f"{SLUG}_D.json", base)

    # ---- resumo / reconciliacao ----
    for w in ("jun", "30d"):
        aggb = sum(r["bruto"] for r in base["agg"][w]); kall = base["kpi"][w]["ALL"]["bruto"]
        print("  [%s] %s agg=%.2f kpi.ALL=%.2f diff%%=%.4f"
              % (SLUG, w, aggb, kall, (aggb / kall - 1) * 100 if kall else 0))
    print("  [%s] n_daily %s..%s (%d) | regperf30d %s"
          % (SLUG, nd[0]["date"], nd[-1]["date"], len(nd),
             [(r["reg"], r["spend"]) for r in regperf]))
    print("  [%s] KPI mtd ALL: %s | PV mtd bruto %.2f conv %d"
          % (SLUG, kpi["jun"]["ALL"], pv_bruto, pv_conv))
    print("  [%s] KPI 30d ALL: %s" % (SLUG, kpi["30d"]["ALL"]))
    try:
        acct_liq = api.account_spend(ACC, ctx["d30"][0], ctx["d30"][1])
        pv_b30, _ = pv_totals(ADSET_30D)
        tot_liq = kpi["30d"]["ALL"]["liq"] + round(pv_b30 / TAX, 2)
        print("  [%s] RECONCILE 30d comercial+PV liq=%.2f vs conta %.2f diff%%=%.3f"
              % (SLUG, tot_liq, acct_liq, (tot_liq / acct_liq - 1) * 100 if acct_liq else 0))
    except Exception as e:
        print("  [aviso] reconcile falhou:", e)
    faltam = sum(1 for w in ("jun", "30d") for s in COMM
                 for a in rank[w][s]["top"] + rank[w][s]["pior"] if not a.get("link"))
    print("  [%s] rank sem link: %d | ads mtd com link: %d/%d"
          % (SLUG, faltam, sum(1 for a in ads_mtd if a["link"]), len(ads_mtd)))
