#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GAC (act_1174941344352331) , marca GENÉRICA (assemble via _assemble_brand).
Port do _gac_refresh_0716.py: mesmas regras, dados via meta_api em vez de dumps do MCP.
Regras: campanha precisa conter 'GAC'; segmentos NV/SN/VD/PV (PV = pós-venda real,
fica fora do total comercial, o assemble cuida); lojas MOR/VLO/COT; sem região."""
import re
import common

SLUG = "gac"
ACC = "act_1174941344352331"
GENERIC = True  # D.json sai do _assemble_brand.build(SLUG)

SEGS = ("NV", "SN", "VD", "PV")
COMM = ("NV", "SN", "VD")  # PV vai pro bucket 'pv' do daily via day_entry


def classify(cn, an):
    cn = cn or ""; an = an or ""
    if "GAC" not in cn:
        return None, None, None
    parts = [p.strip() for p in cn.split("|")]
    seg = parts[2] if len(parts) > 2 else None
    if seg not in SEGS:
        return None, None, None
    ct = (parts[3] if len(parts) > 3 else "").upper()
    canal = "Form" if ct == "FORM" else ("WhatsApp" if ct == "WA" else "Engaj")
    m = re.search(r"(?<![A-Z])(MOR|VLO|COT)(?![A-Z])", an.upper())
    loja = m.group(1) if m else "REGIONAL"
    return seg, canal, loja


def _rows(insights):
    lst = []
    for i in insights:
        sp = round(float(i.get("spend", 0) or 0), 2)
        if sp <= 0:
            continue
        seg, canal, loja = classify(i.get("campaign_name"), i.get("adset_name"))
        if seg is None:
            continue
        leads, conv = common.leads_conv(i, canal)
        lst.append({"seg": seg, "canal": canal, "loja": loja, "spend": sp,
                    "leads": leads, "conv": conv})
    return lst


def _tot(lst):
    return {"spend": round(sum(r["spend"] for r in lst), 2),
            "leads": sum(r["leads"] for r in lst),
            "conv": sum(r["conv"] for r in lst)}


def _tipo_guess(nm, canal, old):
    if old:
        return old
    u = (nm or "").upper()
    if "VIDEO" in u or "REELS" in u or "BLINDAD" in u:
        return "VIDEO"
    return "WA" if canal == "WhatsApp" else "FORM"


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
            if seg is None:
                continue
            aid = i.get("ad_id"); nm = i.get("ad_name")
            leads, conv = common.leads_conv(i, canal)
            bruto = round(sp * TAX, 2)
            res = leads if canal == "Form" else (conv if canal == "WhatsApp" else 0)
            o = omap.get(aid, {})
            lst.append({"ad": aid, "nome": nm, "seg": seg, "canal": canal, "loja": loja,
                        "tipo": _tipo_guess(nm, canal, o.get("tipo", "")), "bruto": bruto,
                        "leads": leads, "conv": conv, "res": res,
                        "cpr": round(bruto / res, 2) if res else 0,
                        "link": o.get("link", "") or "", "st": o.get("st"),
                        "dt": o.get("dt", "") or ""})
        lst.sort(key=lambda x: -x["bruto"])
        out[win] = lst
    return out


def _canal_of_name(cn):
    """Canal pelo nome da CAMPANHA (posição fixa, igual ao legado)."""
    parts = [p.strip() for p in (cn or "").split("|")]
    ct = (parts[3] if len(parts) > 3 else "").upper()
    return {"FORM": "Form", "WA": "WhatsApp"}.get(ct, "Engaj")


def _verba(api, adsets):
    """Legado GAC é majoritariamente CBO (verba na campanha) + 2 campanhas ABO.
    Genérico: adsets ativos com daily_budget (ABO) via common.verba_from_adsets +
    campanhas ativas com daily_budget próprio (CBO). Sem dupla contagem: adset sob
    CBO não tem daily_budget e campanha ABO não tem daily_budget."""
    camps = api.list_campaigns(ACC)["campaigns"]
    cmap = {c.get("id"): c.get("name", "") for c in camps}
    gac_adsets = [a for a in adsets if "GAC" in cmap.get(a.get("campaign_id"), "")]
    out = common.verba_from_adsets(
        gac_adsets, lambda a: _canal_of_name(cmap.get(a.get("campaign_id"), "")))
    for c in camps:
        if c.get("effective_status") != "ACTIVE":
            continue
        if common.entrega_encerrada(c):      # ignora campanha CBO já encerrada (stop_time no passado)
            continue
        db = c.get("daily_budget")
        if db in (None, "", "0"):
            continue
        nm = c.get("name", "")
        if "GAC" not in nm:
            continue
        out.append({"nome": nm, "reg": "", "can": _canal_of_name(nm),
                    "dailyLiq": round(int(db) / 100, 2), "status": "ACTIVE"})
    out.sort(key=lambda x: -x["dailyLiq"])
    return out


def refresh(api, ctx):
    h = common.harvest_std(api, ACC, ctx)
    # CORE (adset 2 janelas, fonte única; inclui PV)
    rows = {"30d": _rows(h["adset_30d"]), "jul": _rows(h["adset_mtd"])}
    core = {"totais": {w: _tot(r) for w, r in rows.items()},
            "30d": rows["30d"], "jul": rows["jul"],
            "edits": common.edits_from_activities(h["activities"]),
            # MoM justo: mesmo período do mês anterior (01 -> mesmo dia)
            "mom_sp": common.mom_sp_block(_rows(h["adset_mom_sp"]), COMM, ctx)}
    common.jdump(f"_{SLUG}_core.json", core, indent=1)
    # ADS (ad-level 2 janelas + links reusados/backfill)
    ads = _ads(h)
    common.backfill_links(api, ads)
    common.jdump(f"_{SLUG}_ads.json", ads)
    # DAILY (repull 3 dias fechados + hoje; seg PV cai no bucket 'pv')
    entries = [common.day_entry(h["days"][d], classify, d, seg_filter=COMM)
               for d in ctx["days_to_pull"]]
    common.merge_daily(f"_{SLUG}_daily.json", entries)
    # VERBA (ABO adsets + CBO campanhas)
    verba = _verba(api, h["adsets"])
    common.jdump(f"_{SLUG}_verba.json", verba)
    print(f"  [{SLUG}] core 30d={len(rows['30d'])}r jul={len(rows['jul'])}r "
          f"liq30d={core['totais']['30d']['spend']:.2f} | ads {len(ads['30d'])}/{len(ads['jul'])} "
          f"| verba {len(verba)}")
