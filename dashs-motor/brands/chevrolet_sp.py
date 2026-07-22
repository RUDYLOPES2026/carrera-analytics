#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chevrolet SP (act_1397341790604853) , marca BESPOKE (GENERIC=False): o refresh
atualiza data/chevrolet_sp_D.json direto, preservando a estrutura do D.

Port do _refresh_chevsp_0716.py (LEGADO), trocando os dumps do conector MCP por
chamadas diretas ao meta_api e parametrizando as datas via ctx.

Regras (CLAUDE.md da marca, replicadas do legado):
  - multi-seg NV/SN/VD/PV; SEM regiao (cards por segmento);
  - EXCLUI campanhas com 'GRU' (Grupo Seminovos) de tudo;
  - PV fora do total comercial, mas o gasto conta no pacing;
  - loja so nos adsets NV-WhatsApp (ALP/BFU/BUT/FAC/OSA/SUM/VLO);
  - agg/kpi vem do ADSET-level (fonte unica); ads/rank do AD-level;
  - leads = onsite_conversion.lead_grouped (fallback offsite_complete_registration_
    add_meta_leads); conv = messaging_conversation_started_7d; em WhatsApp os
    leads sao zerados (conv fica), nos demais canais ficam leads E conv , essa
    e a regra EXATA do legado, mantida pra preservar os numeros do D;
  - serie diaria repuxa D-1..D-3 + hoje (ctx['days_to_pull']);
  - em-dash proibido (common.jdump ja limpa); dado real ou nada.

Preserva do D atual: geo, geo_adsets, geo_alerts, note_verba, nd_maio (mes
anterior fechado), pacing.budget. Reconstroi: kpi, chan, kpifilter, agg, ads,
rank, lojas, n_daily, nd_jun, nd_verba (adsets ativos, mesma estrutura),
edits/nd_changes/note_edits (via common.edits_from_activities).
"""
import re
import calendar
from collections import defaultdict, Counter

import common

SLUG = "chevrolet_sp"
ACC = "act_1397341790604853"
GENERIC = False
TAX = 1.1215

CANM = {"FORM": "Form", "WA": "WhatsApp", "CTL": "Catalogo", "CATALOGO": "Catalogo",
        "CAT": "Catalogo", "TRF": "Trafego", "TRAFEGO": "Trafego", "AWA": "Awareness",
        "AWARENESS": "Awareness", "ALCANCE": "Awareness", "RMKT": "RMKT",
        "ENG": "Engaj", "REC": "Awareness"}
LOJACODES = ["ALP", "BFU", "BUT", "FAC", "OSA", "SUM", "VLO"]
LOJANOME = {"ALP": "Alphaville", "BFU": "Barra-Funda", "BUT": "Butanta",
            "FAC": "Edgar-Faco", "OSA": "Osasco", "SUM": "Sumare", "VLO": "Villa-Lobos"}
COMM = ("NV", "SN", "VD")
MESN = {1: "Janeiro", 2: "Fevereiro", 3: "Marco", 4: "Abril", 5: "Maio", 6: "Junho",
        7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"}


# ---------- classificacao (copiada 1:1 do legado) ----------
def is_gru(name):
    return "GRU" in (name or "").upper()


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
    return (seg or "NV"), canal


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


def loja_of(adset_name):
    for t in re.split(r"[^A-Za-z0-9]+", (adset_name or "").upper()):
        if t in LOJACODES:
            return t
    return None


def tipo_of(n):
    u = (n or "").upper()
    if "CRSL" in u or "CARROSSEL" in u or "CARROUSEL" in u:
        return "CARROSSEL"
    if "VIDEO" in u or "REELS" in u or "VID" in u:
        return "VIDEO"
    return "IMAGEM"


# ---------- agg (adset-level, PV/GRU fora) ----------
def build_agg(insights):
    rows = []
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        sp = float(i["spend"])
        if sp <= 0:
            continue
        seg, canal = camp_parse(i["campaign_name"])
        if seg == "PV":
            continue
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        if canal == "WhatsApp":
            leads = 0; conv = msg
        else:
            leads = lg; conv = msg
        bruto = round(sp * TAX, 2)
        rows.append({"seg": seg, "reg": "", "canal": canal, "bruto": bruto,
                     "leads": leads, "conv": conv, "res": leads + conv})
    return rows


def pv_totals(insights):
    sp = 0.0; msg = 0
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        seg, _ = camp_parse(i["campaign_name"])
        if seg != "PV":
            continue
        sp += float(i["spend"]); msg += conv_of(amap(i.get("actions")))
    return round(sp * TAX, 2), int(msg)


def gru_liq(insights):
    sp = 0.0
    for i in insights:
        if is_gru(i["campaign_name"]):
            sp += float(i["spend"])
    return round(sp, 2)


def kpi_from_agg(rows, pv_bruto, pv_conv):
    out = {}
    for seg in COMM:
        rs = [r for r in rows if r["seg"] == seg]
        bru = round(sum(r["bruto"] for r in rs), 2)
        out[seg] = {"liq": round(bru / TAX, 2), "bruto": bru,
                    "leads": sum(r["leads"] for r in rs), "conv": sum(r["conv"] for r in rs)}
    out["PV"] = {"liq": round(pv_bruto / TAX, 2), "bruto": pv_bruto, "leads": 0, "conv": pv_conv}
    allr = [r for r in rows if r["seg"] in COMM]
    bru = round(sum(r["bruto"] for r in allr), 2)
    out["ALL"] = {"liq": round(bru / TAX, 2), "bruto": bru,
                  "leads": sum(r["leads"] for r in allr), "conv": sum(r["conv"] for r in allr)}
    return out


def chan_from_agg(rows, pv_bruto, pv_conv):
    out = {}
    for seg in COMM:
        d = defaultdict(lambda: {"bruto": 0.0, "leads": 0, "conv": 0})
        for r in rows:
            if r["seg"] != seg:
                continue
            c = r["canal"]
            d[c]["bruto"] += r["bruto"]; d[c]["leads"] += r["leads"]; d[c]["conv"] += r["conv"]
        out[seg] = {c: {"bruto": round(v["bruto"], 2), "leads": v["leads"], "conv": v["conv"]}
                    for c, v in d.items()}
    out["PV"] = {"WhatsApp": {"bruto": pv_bruto, "leads": 0, "conv": pv_conv}} if pv_bruto else {}
    out["OUT"] = {}
    return out


def kpifilter_from_agg(rows):
    out = {}
    for seg in ("ALL", "NV", "SN", "VD", "PV"):
        sub = [r for r in rows if r["seg"] in COMM] if seg == "ALL" else [r for r in rows if r["seg"] == seg]
        out[seg] = {"ALL": {"bruto": round(sum(r["bruto"] for r in sub)),
                            "leads": sum(r["leads"] for r in sub),
                            "conv": sum(r["conv"] for r in sub),
                            "ads": len(sub), "on": len(sub)}}
    return out


# ---------- ads (ad-level, ranking) ----------
def build_ads(insights, linkmap):
    out = []
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        sp = float(i["spend"])
        if sp <= 0:
            continue
        seg, canal = camp_parse(i["campaign_name"])
        m = amap(i.get("actions")); lg = leads_of(m); msg = conv_of(m)
        if canal == "WhatsApp":
            leads = 0; conv = msg
        else:
            leads = lg; conv = msg
        bruto = round(sp * TAX, 2); res = leads + conv
        cpr = round(bruto / res, 2) if res else 0
        adid = i["ad_id"]; lk = linkmap.get(adid, {})
        out.append({"seg": seg, "reg": "", "canal": canal, "tipo": tipo_of(i.get("ad_name")),
                    "nome": clean(i.get("ad_name")), "bruto": bruto, "leads": leads,
                    "conv": conv, "res": res, "cpr": cpr, "ad": adid,
                    "ctr": round(float(i.get("ctr", 0) or 0), 2),
                    "link": lk.get("link", ""), "st": lk.get("st", ""),
                    "dt": lk.get("dt", ""), "off": None})
    return out


DETAIL = ["nome", "canal", "tipo", "bruto", "leads", "conv", "res", "cpr", "ad", "ctr", "link", "st", "dt"]


def _detail(a):
    return {k: a.get(k, "") for k in DETAIL}


def _rank_candidates(ads, seg):
    sub = [a for a in ads if a["seg"] == seg]
    top = sorted(sub, key=lambda a: a["res"], reverse=True)[:8]
    pior = sorted([a for a in sub if a["res"] > 0], key=lambda a: a["cpr"], reverse=True)[:8]
    return top, pior


# ---------- serie diaria (form/wa/aux/pv, gasto LIQUIDO como no legado) ----------
def daily_bucket(insights):
    b = {k: {"spend": 0.0, "leads": 0, "conv": 0} for k in ("form", "wa", "aux", "pv")}
    for i in insights:
        if is_gru(i["campaign_name"]):
            continue
        sp = float(i["spend"])
        if sp <= 0:
            continue
        seg, canal = camp_parse(i["campaign_name"])
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


# ---------- verba (adsets ativos com daily_budget, sem GRU) ----------
def _nd_verba(api, adsets):
    try:
        camps = api.list_campaigns(ACC)["campaigns"]
        cnm = {c.get("id"): c.get("name", "") for c in camps}
    except Exception as e:
        print("  [aviso] list_campaigns falhou (verba fica sem canal fino):", e)
        cnm = {}
    keep = [a for a in adsets if not is_gru(cnm.get(a.get("campaign_id"), ""))
            and not is_gru(a.get("name"))]
    return common.verba_from_adsets(
        keep, lambda a: camp_parse(cnm.get(a.get("campaign_id"), ""))[1])


# ---------- refresh ----------
def refresh(api, ctx):
    h = common.harvest_std(api, ACC, ctx)
    cur = common.jload(f"{SLUG}_D.json")
    today = ctx["today"]; iso = ctx["iso"]
    adset_jul, adset_30d = h["adset_mtd"], h["adset_30d"]
    ad_jul, ad_30d = h["ad_mtd"], h["ad_30d"]

    # agg / kpi / chan / kpifilter (fonte unica = adset-level)
    agg_jul = build_agg(adset_jul); agg_30d = build_agg(adset_30d)
    pv_bj, pv_cj = pv_totals(adset_jul); pv_b3, pv_c3 = pv_totals(adset_30d)
    kpi = {"jun": kpi_from_agg(agg_jul, pv_bj, pv_cj), "30d": kpi_from_agg(agg_30d, pv_b3, pv_c3)}
    chan = {"jun": chan_from_agg(agg_jul, pv_bj, pv_cj), "30d": chan_from_agg(agg_30d, pv_b3, pv_c3)}
    kpifilter = {"jun": kpifilter_from_agg(agg_jul), "30d": kpifilter_from_agg(agg_30d)}

    # ads: reusa link/st/dt do D atual (mapa por ad_id)
    linkmap = {}
    for w in ("jun", "30d"):
        for a in cur.get("ads", {}).get(w, []):
            if a.get("link") or a.get("st") or a.get("dt"):
                linkmap[a["ad"]] = {"link": a.get("link", ""), "st": a.get("st", ""),
                                    "dt": a.get("dt", "")}
    ads_jul = build_ads(ad_jul, linkmap); ads_30d = build_ads(ad_30d, linkmap)

    # backfill de preview links SO nos ads que entram no ranking e estao sem link
    need, seen = [], set()
    for ads in (ads_jul, ads_30d):
        for seg in COMM:
            top, pior = _rank_candidates(ads, seg)
            for a in top + pior:
                if not a.get("link") and a["ad"] not in seen:
                    seen.add(a["ad"]); need.append(a)
    links = common.backfill_links(api, {"need": need})
    if links:  # propaga pro dict irmao na outra janela (objetos distintos, mesmo ad_id)
        for ads in (ads_jul, ads_30d):
            for a in ads:
                if a["ad"] in links and not a.get("link"):
                    a["link"] = links[a["ad"]]

    rank = {w: {s: (lambda tp: {"top": [_detail(x) for x in tp[0]],
                                "pior": [_detail(x) for x in tp[1]]})(_rank_candidates(ads, s))
                for s in COMM}
            for w, ads in (("jun", ads_jul), ("30d", ads_30d))}

    # lojas (NV-WhatsApp, MTD)
    ld = defaultdict(lambda: {"bruto": 0.0, "leads": 0, "conv": 0})
    for i in adset_jul:
        if is_gru(i["campaign_name"]):
            continue
        seg, canal = camp_parse(i["campaign_name"])
        if seg != "NV" or canal != "WhatsApp":
            continue
        lj = loja_of(i["adset_name"])
        if not lj:
            continue
        m = amap(i.get("actions"))
        ld[lj]["bruto"] += float(i["spend"]) * TAX
        ld[lj]["conv"] += conv_of(m); ld[lj]["leads"] += leads_of(m)
    lojas = []
    for lj in LOJACODES:
        if lj not in ld:
            continue
        x = ld[lj]; res = x["conv"] + x["leads"]
        lojas.append({"reg": "", "nome": LOJANOME[lj], "sub": lj, "bruto": round(x["bruto"], 2),
                      "res": res, "cpl": round(x["bruto"] / res, 2) if res else 0})
    lojas.sort(key=lambda z: -z["bruto"])

    # n_daily: repuxa D-3..D-1 + hoje, mantem a cauda do D atual (30 dias)
    pulled = set(ctx["days_to_pull"])
    newdays = []
    for d in ctx["days_to_pull"]:
        row = {"date": d}; row.update(daily_bucket(h["days"][d])); newdays.append(row)
    nd = [x for x in cur["n_daily"] if x["date"] not in pulled] + newdays
    nd = sorted(nd, key=lambda x: x["date"])[-30:]
    assert nd[-1]["date"] == iso, nd[-1]["date"]

    # ---------- monta o D preservando o resto (geo, nd_maio, note_verba...) ----------
    base = cur
    base["kpi"] = kpi; base["chan"] = chan; base["kpifilter"] = kpifilter
    base["agg"] = {"jun": agg_jul, "30d": agg_30d}
    base["ads"] = {"jun": ads_jul, "30d": ads_30d}
    base["rank"] = rank; base["lojas"] = lojas; base["n_daily"] = nd
    mes = MESN[today.month]; mom = MESN[12 if today.month == 1 else today.month - 1]
    dd = "%02d" % today.day; mm = "%02d" % today.month
    base["gerado"] = iso; base["mes_nome"] = mes; base["mom_nome"] = mom
    base["pacing"] = {"budget": base.get("pacing", {}).get("budget", 89720.0),
                      "days": calendar.monthrange(today.year, today.month)[1],
                      "elapsed": today.day, "asof": f"{dd}/{mm}"}
    base["parcial"] = (f"Formulario e WhatsApp de Novos, Seminovos e Venda Direta ({mes}, MTD 01-{dd}). "
                       f"Pos-venda fora do total, mas consome verba. Campanhas GRU (Grupo Seminovos) "
                       f"excluidas. {dd}/{mm} parcial (dia em curso).")

    # nd_jun (mes corrente MTD): total, pv, lojas, top campanhas
    kA = kpi["jun"]["ALL"]; jrt = kA["leads"] + kA["conv"]
    base["nd_jun"]["total"] = {"bruto": kA["bruto"], "leads": kA["leads"], "conv": kA["conv"],
                               "res": jrt, "cpl": round(kA["bruto"] / jrt, 2) if jrt else 0}
    base["nd_jun"]["pv"] = {"bruto": pv_bj, "conv": pv_cj,
                            "cpr": round(pv_bj / pv_cj, 2) if pv_cj else 0}
    base["nd_jun"]["lojas"] = lojas
    cmap = {i["ad_id"]: i["campaign_name"] for i in ad_jul}
    capg = defaultdict(lambda: {"bruto": 0.0, "res": 0, "cans": Counter()})
    for a in ads_jul:
        cn = cmap.get(a["ad"], "")
        capg[cn]["bruto"] += a["bruto"]; capg[cn]["res"] += a["res"]; capg[cn]["cans"][a["canal"]] += 1
    base["nd_jun"]["campanhas"] = []
    for cn, x in sorted(capg.items(), key=lambda kv: -kv[1]["bruto"])[:15]:
        can = x["cans"].most_common(1)[0][0] if x["cans"] else ""
        base["nd_jun"]["campanhas"].append(
            {"nome": clean(cn), "reg": "", "can": can, "bruto": round(x["bruto"], 2),
             "res": x["res"], "cpl": round(x["bruto"] / x["res"], 2) if x["res"] else 0})

    # edits / nd_changes / note_edits: log REAL da conta via atividades (sem narrativa manual)
    ev = common.edits_from_activities(h["activities"], max_items=10)
    humans = [e for e in ev if (e.get("quem") or "Meta") != "Meta"]
    base["edits"] = [{"dt": e["quando"], "tipo": "Edicao na conta (log da API)",
                      "autor": e["quem"], "obj": e["o_que"], "det": ""} for e in humans]
    base["nd_changes"] = {"novos": 0, "pausados": 0, "excluidos": 0,
                          "entregas": [{"dt": e["quando"], "obj": e["o_que"]} for e in ev]}
    base["note_edits"] = (f"Log automatico da conta via API (atividades mais recentes, ate {dd}/{mm}). "
                          "Edicoes manuais da agencia, quando registradas, aparecem destacadas; "
                          "os demais eventos sao entregas e execucoes automaticas da Meta.")

    # nd_verba: adsets ATIVOS com daily_budget (mesma estrutura; note_verba preservada)
    base["nd_verba"] = _nd_verba(api, h["adsets"])

    # nd_mom_sp: MESMO PERIODO do mes anterior (01 -> mesmo dia), para o comparativo
    # MoM nao misturar MTD com mes anterior inteiro
    base["nd_mom_sp"] = common.mom_sp_block(build_agg(h["adset_mom_sp"]), COMM, ctx)

    common.jdump(f"{SLUG}_D.json", base)

    # ---------- prints de conferencia (mesmo espirito do legado) ----------
    for w in ("jun", "30d"):
        aggb = sum(r["bruto"] for r in base["agg"][w]); kall = base["kpi"][w]["ALL"]["bruto"]
        print("  %s agg=%.2f kpi.ALL=%.2f diff%%=%.4f" % (w, aggb, kall, (aggb / kall - 1) * 100 if kall else 0))
    print("  n_daily", nd[0]["date"], "..", nd[-1]["date"], len(nd))
    print("  KPI mtd:", {s: kpi["jun"][s]["bruto"] for s in ("NV", "SN", "VD", "PV", "ALL")})
    print("  KPI 30d:", {s: kpi["30d"][s]["bruto"] for s in ("NV", "SN", "VD", "PV", "ALL")})
    print("  lojas:", [(l["sub"], l["bruto"]) for l in lojas])
    try:
        acct = api.account_spend(ACC, ctx["d30"][0], ctx["d30"][1])
        com30 = kpi["30d"]["ALL"]["liq"]; pv30 = round(pv_b3 / TAX, 2); g30 = gru_liq(adset_30d)
        print("  RECONCILE 30d: comercial+PV liq=%.2f | GRU liq=%.2f | soma+GRU=%.2f vs account %.2f diff%%=%.3f"
              % (com30 + pv30, g30, com30 + pv30 + g30, acct,
                 ((com30 + pv30 + g30) / acct - 1) * 100 if acct else 0))
    except Exception as e:
        print("  [aviso] reconcile 30d indisponivel:", e)
    semlink = sum(1 for w in ("jun", "30d") for s in COMM
                  for a in rank[w][s]["top"] + rank[w][s]["pior"] if not a.get("link"))
    print(f"  rank ads sem link: {semlink} | ads mtd com link: "
          f"{sum(1 for a in ads_jul if a['link'])}/{len(ads_jul)} | verba {len(base['nd_verba'])}")
