#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VW NV/SN (act_1579684322929898) , marca GENÉRICA (assemble via _assemble_brand).
Port do _vw_refresh_0716.py: mesmas regras, dados via meta_api em vez de dumps do MCP.
Regras (CLAUDE.md): só NV/SN; lojas ALP/OSA/SUM/VLO; sem PV; sem região."""
import re
import common

SLUG = "vw"
ACC = "act_1579684322929898"
GENERIC = True  # D.json sai do _assemble_brand.build(SLUG)


def classify(cn, an):
    cn = cn or ""; an = an or ""
    parts = [p.strip() for p in cn.split("|")]
    seg = None; canaltok = None
    if "VW" in parts:
        i = parts.index("VW")
        if i + 1 < len(parts): seg = parts[i + 1]
        if i + 2 < len(parts): canaltok = parts[i + 2]
    if seg not in ("NV", "SN"):
        m = re.search(r"(?<![A-Z])(NV|SN)(?![A-Z])", cn.upper())
        seg = m.group(1) if m else None
    ct = (canaltok or "").upper()
    canal = "Form" if ct == "FORM" else ("WhatsApp" if ct == "WA" else "Engaj")
    m = re.search(r"(ALP|OSA|SUM|VLO)", an.upper())
    loja = m.group(1) if m else "REGIONAL"
    return seg, canal, loja


def _rows(insights):
    lst = []
    for i in insights:
        sp = round(float(i.get("spend", 0) or 0), 2)
        if sp <= 0:
            continue
        seg, canal, loja = classify(i.get("campaign_name"), i.get("adset_name"))
        if seg not in ("NV", "SN"):
            continue
        leads, conv = common.leads_conv(i, canal)
        lst.append({"seg": seg, "canal": canal, "loja": loja, "spend": sp,
                    "leads": leads, "conv": conv})
    return lst


def _tot(lst):
    return {"spend": round(sum(r["spend"] for r in lst), 2),
            "leads": sum(r["leads"] for r in lst),
            "conv": sum(r["conv"] for r in lst)}


def _tipo_guess(nm, old):
    if old:
        return old
    u = (nm or "").upper()
    return "VIDEO" if ("VIDEO" in u or "REELS" in u or "BLINDADO" in u) else "IMAGEM"


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
            if seg not in ("NV", "SN"):
                continue
            aid = i.get("ad_id"); nm = i.get("ad_name")
            leads, conv = common.leads_conv(i, canal)
            bruto = round(sp * TAX, 2)
            res = leads if canal == "Form" else (conv if canal == "WhatsApp" else 0)
            o = omap.get(aid, {})
            lst.append({"ad": aid, "nome": nm, "seg": seg, "canal": canal, "loja": loja,
                        "tipo": _tipo_guess(nm, o.get("tipo", "")), "bruto": bruto,
                        "leads": leads, "conv": conv, "res": res,
                        "cpr": round(bruto / res, 2) if res else 0,
                        "link": o.get("link", "") or "", "st": o.get("st"),
                        "dt": o.get("dt", "") or ""})
        lst.sort(key=lambda x: -x["bruto"])
        out[win] = lst
    return out


def _canal_of_adset(a, cmap):
    cn = cmap.get(a.get("campaign_id"), "")
    parts = [p.strip() for p in cn.split("|")]
    ct = ""
    if "VW" in parts and parts.index("VW") + 2 < len(parts):
        ct = parts[parts.index("VW") + 2].upper()
    if ct == "FORM":
        return "Form"
    if ct == "WA":
        return "WhatsApp"
    if "MENSAGEM" in cn.upper():
        return "Engaj"
    u = (a.get("name") or "").upper()
    if re.search(r"(ALP|OSA|SUM|VLO)", u) and "FORM" not in u:
        return "WhatsApp"
    return "Form"


def refresh(api, ctx):
    h = common.harvest_std(api, ACC, ctx)
    # CORE (adset 2 janelas, fonte única)
    rows = {"30d": _rows(h["adset_30d"]), "jul": _rows(h["adset_mtd"])}
    core = {"totais": {w: _tot(r) for w, r in rows.items()},
            "30d": rows["30d"], "jul": rows["jul"],
            "edits": common.edits_from_activities(h["activities"]),
            # MoM justo: mesmo período do mês anterior (01 -> mesmo dia)
            "mom_sp": common.mom_sp_block(_rows(h["adset_mom_sp"]), ("NV", "SN"), ctx)}
    common.jdump(f"_{SLUG}_core.json", core, indent=1)
    # ADS (ad-level 2 janelas + links reusados/backfill)
    ads = _ads(h)
    common.backfill_links(api, ads)
    common.jdump(f"_{SLUG}_ads.json", ads)
    # DAILY (repull 3 dias fechados + hoje)
    entries = [common.day_entry(h["days"][d], classify, d, seg_filter=("NV", "SN"))
               for d in ctx["days_to_pull"]]
    common.merge_daily(f"_{SLUG}_daily.json", entries)
    # VERBA
    cmap = {i.get("campaign_id"): i.get("campaign_name") for i in h["ad_30d"] + h["adset_30d"]}
    verba = common.verba_from_adsets(h["adsets"], lambda a: _canal_of_adset(a, cmap))
    common.jdump(f"_{SLUG}_verba.json", verba)
    print(f"  [{SLUG}] core 30d={len(rows['30d'])}r jul={len(rows['jul'])}r "
          f"liq30d={core['totais']['30d']['spend']:.2f} | ads {len(ads['30d'])}/{len(ads['jul'])} "
          f"| verba {len(verba)}")
