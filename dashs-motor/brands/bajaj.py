#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bajaj (act_595755266003929) , marca BESPOKE: refresh() faz PATCH no data/bajaj_D.json.
Port do LEGADO data/_bj_build_0716.py: mesmas regras, dados via meta_api em vez de
dumps do MCP. Regras (CLAUDE.md): mono-seg NV; praças SP/BSB/G (BUT/OSA=SP, TAG/SIA=BSB);
praça/loja no nível ADSET; kpifilter com alias kf["ALL"]=kf["NV"];
CONTAGEM = FIDELIDADE AO LEGADO (decisão de integração 2026-07-16): conv conta
messaging_conversation_started_7d em QUALQUER canal (Bajaj é WhatsApp-driven e parte dos
CTWA não tem 'WA' no nome); leads = lead_grouped (fallback offsite_complete_registration_
add_meta_leads) em todo canal exceto WhatsApp. NÃO usar common.leads_conv aqui.
em-dash proibido (jdump escova). Blocos preservados do D atual: geo, nd_maio, nd_verba,
note_verba, geo_alerts, geo_adsets, note_geo, orcamento, segnome/segcount, zumbis.

Nota de janela: a 1ª janela do dash usa a CHAVE legada "jun" mas contém o MTD do mês
corrente (ctx["mtd"]); "30d" = últimos 30 dias. O template só conhece 'jun'/'30d'.
"""
import re
import datetime
from collections import defaultdict

import common

SLUG = "bajaj"
ACC = "act_595755266003929"
GENERIC = False  # bespoke: refresh() escreve o bajaj_D.json direto
TAX = 1.1215
MTD_KEY = "jun"  # chave legada da janela MTD no D (o template usa 'jun'/'30d')

MESES = {1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho",
         7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"}
REGN = {"SP": "São Paulo", "BSB": "Brasília", "G": "Geral"}
LSUB = {"SP": "BUT · OSA", "BSB": "TAG · SIA", "G": "campanhas de evento/sem região"}
CANM = {"FORM": "Form", "WA": "WhatsApp", "ENG": "Engaj", "REC": "Engaj",
        "AWARENESS": "Awareness", "AWA": "Awareness", "TRAFEGO": "Trafego"}


def r2(x):
    return round(x + 0.0, 2)


# ---------- classificação (idêntica ao _bj_build_0716) ----------
def _toks(cn):
    s = re.sub(r'^[^A-Za-z]*', '', cn or '')
    return [t.strip() for t in s.split('|')]


def canal_of(cn):
    t = _toks(cn)
    return CANM.get((t[3] if len(t) > 3 else "").upper(), "Engaj")


def reg_of(adset_name, cn):
    u = (adset_name or "").upper()
    if re.search(r'\bTAG\b', u) or re.search(r'\bSIA\b', u):
        return "BSB"
    if re.search(r'\bOSA\b', u) or re.search(r'\bBUT\b', u):
        return "SP"
    if re.search(r'\bSP\b', u) or 'PV-SP' in u:
        return "SP"
    t = _toks(cn)
    rr = (t[4] if len(t) > 4 else "").upper()
    if rr in ("SP", "BSB"):
        return rr
    return "G"


def _leads_conv(row, canal):
    """Contagem LEGADA (_bj_build_0716): conv em qualquer canal; leads zerados só no WhatsApp."""
    m = defaultdict(float)
    for x in row.get("actions") or []:
        m[x["action_type"]] += float(x["value"])
    lg = int(m.get("onsite_conversion.lead_grouped", 0)
             or m.get("offsite_complete_registration_add_meta_leads", 0))
    msg = int(m.get("onsite_conversion.messaging_conversation_started_7d", 0))
    if canal == "WhatsApp":
        return 0, msg
    return lg, msg


def tipo_of(name):
    u = (name or "").upper()
    if "CARROSSEL" in u or "CARROUSEL" in u:
        return "CARROSSEL"
    if "VIDEO" in u or "VÍDEO" in u or "REELS" in u:
        return "VIDEO"
    return "IMAGEM"


# ---------- agregados adset-level (fonte única do topo) ----------
def _agg_rows(insights):
    out = []
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        canal = canal_of(i.get("campaign_name"))
        reg = reg_of(i.get("adset_name"), i.get("campaign_name"))
        le, cv = _leads_conv(i, canal)
        out.append({"seg": "NV", "reg": reg, "canal": canal, "bruto": r2(sp * TAX),
                    "leads": le, "conv": cv, "res": le + cv})
    return out


def _kpi_from(rows):
    b = r2(sum(a["bruto"] for a in rows))
    return {"liq": r2(b / TAX), "bruto": b,
            "leads": sum(a["leads"] for a in rows), "conv": sum(a["conv"] for a in rows)}


def _chan_from(rows):
    c = defaultdict(lambda: [0.0, 0, 0])
    for a in rows:
        c[a["canal"]][0] += a["bruto"]; c[a["canal"]][1] += a["leads"]; c[a["canal"]][2] += a["conv"]
    return {"NV": {k: {"bruto": r2(v[0]), "leads": v[1], "conv": v[2]} for k, v in c.items()}}


def _kpifilter_from(rows):
    kf = {"NV": {}}
    for r in ("ALL", "SP", "BSB", "G"):
        sub = rows if r == "ALL" else [a for a in rows if a["reg"] == r]
        kf["NV"][r] = {"bruto": round(sum(a["bruto"] for a in sub)),
                       "leads": sum(a["leads"] for a in sub),
                       "conv": sum(a["conv"] for a in sub),
                       "ads": len(sub), "on": len(sub)}
    kf["ALL"] = kf["NV"]  # alias mono-seg: evita kpifilter[win].ALL undefined no filtro de praça
    return kf


def _regperf_from(rows):
    ag = defaultdict(lambda: [0.0, 0, 0])
    for a in rows:
        ag[a["reg"]][0] += a["bruto"]; ag[a["reg"]][1] += a["leads"]; ag[a["reg"]][2] += a["conv"]
    out = []
    for r in ("SP", "BSB", "G"):
        d = ag[r]; tot = d[1] + d[2]
        out.append({"reg": r, "nome": REGN[r], "spend": round(d[0]),
                    "leads": d[1], "conv": d[2], "cpl": r2(d[0] / tot) if tot else 0})
    return out


# ---------- ad-level (D.ads + rank) ----------
def _ads_rows(insights, linkmap):
    out = []
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        canal = canal_of(i.get("campaign_name"))
        reg = reg_of(i.get("adset_name"), i.get("campaign_name"))
        le, cv = _leads_conv(i, canal)
        res = le + cv; bruto = r2(sp * TAX); adid = i.get("ad_id")
        out.append({"seg": "NV", "reg": reg, "canal": canal, "tipo": tipo_of(i.get("ad_name")),
                    "nome": i.get("ad_name") or "", "bruto": bruto, "leads": le, "conv": cv,
                    "res": res, "cpr": r2(bruto / res) if res else 0, "ad": adid,
                    "ctr": r2(float(i.get("ctr", 0) or 0)), "link": linkmap.get(adid, ""),
                    "st": "ACTIVE", "dt": "", "off": ""})
    out.sort(key=lambda a: -a["bruto"])
    return out


def _rank_block(ads):
    top = sorted(ads, key=lambda a: -a["res"])[:8]
    pior = sorted([a for a in ads if a["res"] > 0], key=lambda a: -a["cpr"])[:8]
    return {"NV": {"top": top, "pior": pior}}


# ---------- série diária (buckets legados por praça×canal, spend LÍQUIDO) ----------
def _bucket_day(insights, date):
    b = {k: {"spend": 0.0, "leads": 0, "conv": 0}
         for k in ("sp_form", "sp_wa", "bsb_form", "bsb_wa", "inst", "g_form", "g_wa", "pv")}
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        canal = canal_of(i.get("campaign_name", ""))
        reg = reg_of(i.get("adset_name", ""), i.get("campaign_name", ""))
        le, cv = _leads_conv(i, canal)
        if canal == "Form":
            key = {"SP": "sp_form", "BSB": "bsb_form"}.get(reg, "g_form")
        elif canal == "WhatsApp":
            key = {"SP": "sp_wa", "BSB": "bsb_wa"}.get(reg, "g_wa")
        else:
            key = "inst"
        b[key]["spend"] += sp; b[key]["leads"] += le; b[key]["conv"] += cv
    for k in b:
        b[k]["spend"] = r2(b[k]["spend"])
    row = {"date": date}
    row.update(b)
    return row


# ---------- nd_jun (mês corrente agregado: total/regiões/campanhas/lojas) ----------
def _nd_mtd(rows):
    allk = _kpi_from(rows)
    tres = allk["leads"] + allk["conv"]
    total = {"bruto": allk["bruto"], "leads": allk["leads"], "conv": allk["conv"],
             "res": tres, "cpl": r2(allk["bruto"] / tres) if tres else 0}
    regioes = []
    for r in ("SP", "BSB", "G"):
        sub = [a for a in rows if a["reg"] == r]
        b = r2(sum(a["bruto"] for a in sub))
        le = sum(a["leads"] for a in sub); cv = sum(a["conv"] for a in sub); res = le + cv
        nome = REGN[r] if r != "G" else "Geral (multi-praça)"
        regioes.append({"reg": r, "nome": nome, "bruto": round(b), "res": res,
                        "cpl": r2(b / res) if res else 0, "leads": le, "conv": cv})
    camps = defaultdict(lambda: [0.0, 0, 0])
    for a in rows:
        k = (a["reg"], a["canal"])
        camps[k][0] += a["bruto"]; camps[k][1] += a["leads"]; camps[k][2] += a["conv"]
    campanhas = []
    for (reg, canal), (b, le, cv) in camps.items():
        res = le + cv
        campanhas.append({"nome": "NV, %s, %s" % (canal, REGN[reg]), "reg": reg, "can": canal,
                          "bruto": r2(b), "res": res, "cpl": r2(b / res) if res else 0})
    campanhas.sort(key=lambda c: -c["bruto"])
    lojas = [{"reg": r["reg"], "nome": r["nome"], "sub": LSUB[r["reg"]],
              "bruto": r["bruto"], "res": r["res"], "cpl": r["cpl"]} for r in regioes]
    return {"total": total, "regioes": regioes, "campanhas": campanhas, "lojas": lojas,
            "pv": {"bruto": 0, "conv": 0, "cpr": 0}}


# ---------- edits / nd_changes (log real da conta) ----------
def _edits(activities):
    """common.edits_from_activities -> shape do template ({dt,tipo,obj,det,autor})."""
    out = []
    for e in common.edits_from_activities(activities, max_items=8):
        oq = e.get("o_que", "")
        parts = oq.split(" , ", 1)
        out.append({"dt": e.get("quando", ""), "tipo": parts[0],
                    "obj": parts[1] if len(parts) > 1 else "", "det": "",
                    "autor": e.get("quem", "") or "Meta"})
    return out


def _fmt_dt(t, tz_hours=-3):
    try:
        dt = datetime.datetime.strptime((t or "")[:19], "%Y-%m-%dT%H:%M:%S") + datetime.timedelta(hours=tz_hours)
        return dt.strftime("%d/%m %H:%M")
    except Exception:
        return ""


def _nd_changes(activities):
    novos = pausados = excluidos = 0
    entregas = []
    for ev in activities or []:
        et = (ev.get("event_type") or "").lower()
        if et == "first_delivery_event":
            if len(entregas) < 6:
                entregas.append({"dt": _fmt_dt(ev.get("event_time")),
                                 "obj": ev.get("object_name") or ""})
        elif et == "create_ad":
            novos += 1
        elif "delete" in et:
            excluidos += 1
        elif et in ("update_ad_run_status", "update_ad_set_run_status", "update_campaign_run_status"):
            if "PAUS" in str(ev.get("extra_data") or "").upper():
                pausados += 1
    return {"novos": novos, "pausados": pausados, "excluidos": excluidos, "entregas": entregas}


# ---------- refresh ----------
def refresh(api, ctx):
    h = common.harvest_std(api, ACC, ctx, want_adsets=True)
    D = common.jload("bajaj_D.json")  # PATCH: preserva geo/nd_maio/notas

    # agregados adset (fonte única do topo)
    agg = {MTD_KEY: _agg_rows(h["adset_mtd"]), "30d": _agg_rows(h["adset_30d"])}
    kpi, chan, kpifilter = {}, {}, {}
    for win, rows in agg.items():
        k = _kpi_from(rows)
        kpi[win] = {"NV": k, "ALL": dict(k)}
        chan[win] = _chan_from(rows)
        kpifilter[win] = _kpifilter_from(rows)

    # links: reusa o mapa existente (D atual + seeds _bajaj_links*/_bj_newlinks)
    linkmap = {}
    for win in (MTD_KEY, "30d"):
        for a in D.get("ads", {}).get(win, []):
            if a.get("ad") and a.get("link"):
                linkmap[a["ad"]] = a["link"]
    for lf in ("_bajaj_links.json", "_bajaj_links_1.json", "_bajaj_links_2.json", "_bj_newlinks.json"):
        for k, v in common.jload(lf, default={}).items():
            linkmap.setdefault(k, v)

    ads = {MTD_KEY: _ads_rows(h["ad_mtd"], linkmap), "30d": _ads_rows(h["ad_30d"], linkmap)}
    common.backfill_links(api, ads)
    rank = {win: _rank_block(lst) for win, lst in ads.items()}

    # série diária: repuxa D-3..D-1 + hoje, mantém a cauda de 30 dias
    nd = [r for r in D.get("n_daily", []) if r["date"] not in set(ctx["days_to_pull"])]
    nd += [_bucket_day(h["days"][d], d) for d in ctx["days_to_pull"]]
    nd = sorted(nd, key=lambda r: r["date"])[-30:]

    today = ctx["today"]
    mom = (today.replace(day=1) - datetime.timedelta(days=1))
    dias_mes = ((today.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
                - today.replace(day=1)).days

    D["gerado"] = ctx["iso"]
    D["mes_nome"] = MESES[today.month]; D["mom_nome"] = MESES[mom.month]
    D["mes_num"] = today.month; D["mom_num"] = mom.month
    D["kpi"] = kpi; D["chan"] = chan; D["kpifilter"] = kpifilter; D["agg"] = agg
    D["ads"] = ads; D["rank"] = rank; D["regperf"] = _regperf_from(agg[MTD_KEY])
    D["n_daily"] = nd; D["nd_jun"] = _nd_mtd(agg[MTD_KEY])
    D["edits"] = _edits(h["activities"])
    D["nd_changes"] = _nd_changes(h["activities"])
    D["note_edits"] = ""
    pac = D.get("pacing", {})
    D["pacing"] = {**pac, "budget": pac.get("budget", 45981.5), "days": dias_mes,
                   "elapsed": today.day, "asof": today.strftime("%d/%m")}
    D["parcial"] = ("Formulário e WhatsApp de Novos (%s, MTD %s-%s): anúncios com gasto, "
                    "filtráveis por praça (SP/Brasília) e canal. Auxiliares (Engajamento) "
                    "somados ao total de verba. Série diária dos últimos 30 dias. Dados de %s."
                    % (D["mes_nome"], today.replace(day=1).strftime("%d/%m"),
                       today.strftime("%d/%m"), today.strftime("%d/%m/%Y")))

    # nd_verba VIVA (era preservada do legado): adsets ativos + campanhas CBO.
    # Necessária pra projeção por intenção da central (verba/dia configurada).
    cmap = {r.get("campaign_id"): r.get("campaign_name", "")
            for r in h["ad_30d"] + h["adset_30d"]}
    verba = []
    for a in h.get("adsets", []):
        if a.get("effective_status") != "ACTIVE":
            continue
        db = a.get("daily_budget")
        if db in (None, "", "0"):
            continue
        cn = cmap.get(a.get("campaign_id"), "")
        verba.append({"nome": a["name"], "reg": reg_of(a["name"], cn),
                      "can": canal_of(cn), "dailyLiq": round(int(db) / 100, 2),
                      "status": "ACTIVE"})
    try:
        for c in api.list_campaigns(ACC)["campaigns"]:
            if c.get("effective_status") == "ACTIVE" and c.get("daily_budget") not in (None, "", "0"):
                verba.append({"nome": c["name"], "reg": reg_of("", c["name"]),
                              "can": canal_of(c["name"]),
                              "dailyLiq": round(int(c["daily_budget"]) / 100, 2),
                              "status": "ACTIVE"})
    except Exception as e:
        print("  [aviso] list_campaigns:", e)
    if verba:
        verba.sort(key=lambda x: -x["dailyLiq"])
        D["nd_verba"] = verba
    common.jdump("bajaj_D.json", D)
    kA = kpi[MTD_KEY]["ALL"]; k3 = kpi["30d"]["ALL"]
    print("  [%s] mtd bruto=%.2f leads=%d conv=%d | 30d bruto=%.2f leads=%d conv=%d | "
          "ads %d/%d | n_daily %d..%s" % (SLUG, kA["bruto"], kA["leads"], kA["conv"],
          k3["bruto"], k3["leads"], k3["conv"], len(ads[MTD_KEY]), len(ads["30d"]),
          len(nd), nd[-1]["date"]))
