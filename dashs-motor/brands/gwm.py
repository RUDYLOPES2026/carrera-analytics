#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GWM (act_1615350695589358) , marca GENÉRICA (assemble via _assemble_brand).
Port do _gwm_refresh_0715.py: mesmas regras, dados via meta_api em vez de dumps do MCP.
Regras do legado: segmentos NV/VD (token PV = pré-venda, conta como NV); sem PV real;
canal pelo nome da CAMPANHA (WHATSAPP/MENSAGEM/WA -> WhatsApp, FORM -> Form, senão
Engaj); lojas VLO/FMO/EUR/ALP/ELD/MOR por token no nome do adset; sem região."""
import re
import common

SLUG = "gwm"
ACC = "act_1615350695589358"
GENERIC = True  # D.json sai do _assemble_brand.build(SLUG)

LOJAS = {"VLO", "FMO", "EUR", "ALP", "ELD", "MOR"}
COMM = ("NV", "VD")


def _seg_of(cn):
    t = re.split(r"[^A-Za-z0-9]+", (cn or "").upper())
    if "VD" in t:
        return "VD"
    if "PV" in t:
        return "NV"  # pré-venda conta como NV (regra do legado)
    if "NV" in t:
        return "NV"
    return "NV"


def _canal_of(cn):
    u = (cn or "").upper()
    if "WHATSAPP" in u or "MENSAGEM" in u or re.search(r"\bWA\b", u):
        return "WhatsApp"
    if "FORM" in u:
        return "Form"
    return "Engaj"


def _loja_of(an):
    for t in re.split(r"[^A-Za-z0-9]+", (an or "").upper()):
        if t in LOJAS:
            return t
    return "REGIONAL"


def classify(cn, an):
    return _seg_of(cn), _canal_of(cn), _loja_of(an)


def _rows(insights):
    lst = []
    for i in insights:
        sp = round(float(i.get("spend", 0) or 0), 2)
        if sp <= 0:
            continue
        seg, canal, loja = classify(i.get("campaign_name"), i.get("adset_name"))
        leads, conv = common.leads_conv(i, canal)
        lst.append({"seg": seg, "canal": canal, "loja": loja, "spend": sp,
                    "leads": leads, "conv": conv})
    return lst


def _tot(lst):
    return {"spend": round(sum(r["spend"] for r in lst), 2),
            "leads": sum(r["leads"] for r in lst),
            "conv": sum(r["conv"] for r in lst)}


def _tipo_guess(canal, old):
    if old:
        return old
    return "WA" if canal == "WhatsApp" else ("FORM" if canal == "Form" else "IMAGEM")


TAX = 1.1215


def _ads(h):
    old = common.jload(f"_{SLUG}_ads.json", default={})
    omap = {}
    if isinstance(old, dict):
        for w in ("30d", "jul"):
            for a in old.get(w, []):
                omap[a["ad"]] = {"link": a.get("link", ""), "st": a.get("st"),
                                 "dt": a.get("dt", ""), "tipo": a.get("tipo", "")}
    out = {}
    for win, ins in {"30d": h["ad_30d"], "jul": h["ad_mtd"]}.items():
        lst = []
        for i in ins:
            sp = float(i.get("spend", 0) or 0)
            if sp <= 0:
                continue
            seg, canal, loja = classify(i.get("campaign_name"), i.get("adset_name"))
            aid = i.get("ad_id"); nm = i.get("ad_name")
            leads, conv = common.leads_conv(i, canal)
            bruto = round(sp * TAX, 2)
            res = leads if canal == "Form" else (conv if canal == "WhatsApp" else 0)
            o = omap.get(aid, {})
            lst.append({"ad": aid, "nome": nm, "seg": seg, "canal": canal, "loja": loja,
                        "tipo": _tipo_guess(canal, o.get("tipo", "")), "bruto": bruto,
                        "leads": leads, "conv": conv, "res": res,
                        "cpr": round(bruto / res, 2) if res else 0,
                        "link": o.get("link", "") or "", "st": o.get("st"),
                        "dt": o.get("dt", "") or ""})
        lst.sort(key=lambda x: -x["bruto"])
        out[win] = lst
    return out


def _verba(api, adsets):
    """Legado GWM: adsets ativos com daily_budget (canal pelo nome da campanha,
    fallback nome do adset) + campanhas CBO ativas com daily_budget próprio.
    Sem dupla contagem: adset sob CBO não tem daily_budget."""
    camps = api.list_campaigns(ACC)["campaigns"]
    cmap = {c.get("id"): c.get("name", "") for c in camps}
    out = common.verba_from_adsets(
        adsets,
        lambda a: _canal_of(cmap.get(a.get("campaign_id")) or a.get("name", "")))
    for c in camps:
        if c.get("effective_status") != "ACTIVE":
            continue
        db = c.get("daily_budget")
        if db in (None, "", "0"):
            continue
        nm = c.get("name", "")
        out.append({"nome": nm, "reg": "", "can": _canal_of(nm),
                    "dailyLiq": round(int(db) / 100, 2), "status": "ACTIVE"})
    out.sort(key=lambda x: -x["dailyLiq"])
    return out


def refresh(api, ctx):
    h = common.harvest_std(api, ACC, ctx)
    # CORE (adset 2 janelas, fonte única)
    rows = {"30d": _rows(h["adset_30d"]), "jul": _rows(h["adset_mtd"])}
    core = {"totais": {w: _tot(r) for w, r in rows.items()},
            "30d": rows["30d"], "jul": rows["jul"],
            "edits": common.edits_from_activities(h["activities"])}
    common.jdump(f"_{SLUG}_core.json", core, indent=1)
    # ADS (ad-level 2 janelas + links reusados/backfill)
    ads = _ads(h)
    common.backfill_links(api, ads)
    common.jdump(f"_{SLUG}_ads.json", ads)
    # DAILY (repull 3 dias fechados + hoje; sem PV, bucket 'pv' fica zerado)
    entries = [common.day_entry(h["days"][d], classify, d, seg_filter=COMM)
               for d in ctx["days_to_pull"]]
    common.merge_daily(f"_{SLUG}_daily.json", entries)
    # VERBA (adsets ABO + campanhas CBO)
    verba = _verba(api, h["adsets"])
    common.jdump(f"_{SLUG}_verba.json", verba)
    print(f"  [{SLUG}] core 30d={len(rows['30d'])}r jul={len(rows['jul'])}r "
          f"liq30d={core['totais']['30d']['spend']:.2f} | ads {len(ads['30d'])}/{len(ads['jul'])} "
          f"| verba {len(verba)}")
