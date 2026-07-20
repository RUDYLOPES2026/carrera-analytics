#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seminovos SP (act_8320926344651440) , marca BESPOKE (GENERIC=False).
Port do _sn_build_0716.py do legado: mesmas regras, dados via meta_api em vez de
dumps do MCP; refresh() faz PATCH no data/seminovos_sp_D.json preservando a
estrutura exata do D (janelas 'jun'=MTD e '30d').

Regras (CLAUDE.md da marca):
  - mono-segmento SN; só SP (hasRegion=false, sem bloco de região);
  - praça/loja no NÍVEL ADSET (token da campanha primeiro, depois adset);
  - 5 lojas: SP (capital/regional), BUT, REB, FMO, VLO;
  - leads = onsite_conversion.lead_grouped só em Form;
    conv  = onsite_conversion.messaging_conversation_started_7d só em WhatsApp
    (common.leads_conv, regra única do grupo);
  - NÃO tem nd_maio (bloco do mês anterior ausente , preservado como está);
  - série diária: repull D-1..D-3 + hoje (ctx['days_to_pull']);
  - links de preview: reusa cache data/_sn_links.json + o que o D já tem,
    completa com common.backfill_links;
  - edits via common.edits_from_activities (mapeados pro formato dt/tipo/obj/
    det/autor que o template usa); em-dash proibido (common.jdump já limpa).
"""
import re
import json
import datetime
import calendar
from collections import defaultdict

import common

SLUG = "seminovos_sp"
ACC = "act_8320926344651440"
GENERIC = False  # bespoke: refresh() escreve o <slug>_D.json direto
TAX = 1.1215
DFILE = f"{SLUG}_D.json"
LINKS_FILE = "_sn_links.json"

LOJAS = {"SP", "BUT", "REB", "FMO", "VLO"}
MESES = {1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio",
         6: "Junho", 7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro",
         11: "Novembro", 12: "Dezembro"}


def r2(x):
    return round(x + 0.0, 2)


# ---------- classificação (idêntica ao legado _sn_build_0716.py) ----------
def toks(cn):
    s = re.sub(r"^[^A-Za-z]*", "", cn or "")
    return [t.strip().upper() for t in s.split("|")]


def canal_of(cn):
    t = toks(cn)
    c = t[2] if len(t) > 2 else ""
    return {"FORM": "Form", "WA": "WhatsApp", "ENG": "Engaj",
            "RMKT": "Engaj", "CTL": "Form"}.get(c, "Form")


def loja_of(cn, adset_name=""):
    t = toks(cn)
    l3 = t[3] if len(t) > 3 else ""
    if l3 in LOJAS:
        return l3
    at = [x.strip().upper() for x in (adset_name or "").split("|")]
    for tk in t + at:
        if tk in ("BUT", "REB", "FMO", "VLO"):
            return tk
    for tk in t + at:
        if tk == "SP":
            return "SP"
    return "SP"


def classify(cn, an):
    """Contrato do common.day_entry: (seg, canal, loja). Conta mono-seg SN."""
    return "SN", canal_of(cn), loja_of(cn, an)


def tipo_of(canal, name):
    u = (name or "").upper()
    if canal == "WhatsApp":
        return "WA"
    if canal == "Form":
        return "FORM"
    if "CARROSSEL" in u or "CARROUSEL" in u:
        return "CARROSSEL"
    if "VIDEO" in u or "VÍDEO" in u or "REELS" in u:
        return "VIDEO"
    return "IMAGEM"


# ---------- agregações ----------
def _agg_rows(insights):
    """Linhas adset-level (fonte única de kpi/chan/kpifilter/agg/lojas)."""
    out = []
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        canal = canal_of(i.get("campaign_name"))
        loja = loja_of(i.get("campaign_name"), i.get("adset_name", ""))
        le, cv = common.leads_conv(i, canal)
        out.append({"seg": "SN", "reg": loja, "loja": loja, "canal": canal,
                    "bruto": r2(sp * TAX), "leads": le, "conv": cv,
                    "res": le + cv})
    return out


def _kpi_from(rows):
    b = r2(sum(a["bruto"] for a in rows))
    return {"liq": r2(b / TAX), "bruto": b,
            "leads": sum(a["leads"] for a in rows),
            "conv": sum(a["conv"] for a in rows)}


def _ads_rows(insights, linkmap):
    out = []
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        canal = canal_of(i.get("campaign_name"))
        loja = loja_of(i.get("campaign_name"), i.get("adset_name", ""))
        le, cv = common.leads_conv(i, canal)
        res = le + cv
        bruto = r2(sp * TAX)
        adid = i.get("ad_id")
        out.append({"seg": "SN", "reg": loja, "loja": loja, "canal": canal,
                    "tipo": tipo_of(canal, i.get("ad_name")),
                    "nome": i.get("ad_name") or "",
                    "bruto": bruto, "leads": le, "conv": cv, "res": res,
                    "cpr": r2(bruto / res) if res else 0,
                    "ad": adid, "ctr": r2(float(i.get("ctr", 0) or 0)),
                    "link": linkmap.get(adid, ""),
                    "st": "ACTIVE", "dt": "", "off": ""})
    return out


def _rank_block(ads):
    top = sorted(ads, key=lambda a: -a["res"])[:8]
    pior = sorted([a for a in ads if a["res"] > 0], key=lambda a: -a["cpr"])[:8]
    return {"SN": {"top": top, "pior": pior}}


# ---------- edits / nd_changes (atividades reais da conta) ----------
def _edits_from(activities):
    """common.edits_from_activities -> formato do template (dt/tipo/obj/det/autor)."""
    out = []
    for e in common.edits_from_activities(activities, max_items=8):
        parts = (e.get("o_que") or "").split(" , ", 1)
        out.append({"dt": e.get("quando", ""), "tipo": parts[0],
                    "obj": parts[1] if len(parts) > 1 else "",
                    "det": "", "autor": e.get("quem", "")})
    return out


def _nd_changes(activities, since_iso):
    """Conta criados/pausados/excluídos SÓ na janela do refresh (>= D-3).
    O log da Meta repete o mesmo evento pro mesmo anúncio: dedup por objeto."""
    seen_new, seen_del, seen_pause = set(), set(), set()
    entregas = []
    for ev in activities or []:
        t = (ev.get("event_time") or "")[:10]
        if t and t < since_iso:
            continue
        et = (ev.get("event_type") or "").lower()
        xd = json.dumps(ev.get("extra_data") or "")
        quando = ""
        try:
            dt = datetime.datetime.strptime((ev.get("event_time") or "")[:19],
                                            "%Y-%m-%dT%H:%M:%S") - datetime.timedelta(hours=3)
            quando = dt.strftime("%d/%m %H:%M")
        except Exception:
            pass
        obj = ev.get("object_name") or ""
        if et == "create_ad" and obj not in seen_new:
            seen_new.add(obj)
            if len(entregas) < 10:
                entregas.append({"dt": quando, "obj": obj})
        elif et == "delete_ad":
            seen_del.add(obj)
        elif et == "update_ad_run_status" and "paused" in xd.lower():
            seen_pause.add(obj)
    return {"novos": len(seen_new), "pausados": len(seen_pause),
            "excluidos": len(seen_del), "entregas": entregas}


# ---------- refresh ----------
def refresh(api, ctx):
    today = ctx["today"]
    h = common.harvest_std(api, ACC, ctx)
    CUR = common.jload(DFILE)

    # linkmap: cache persistente + o que o D atual já tem
    linkmap = common.jload(LINKS_FILE, default={})
    for win in ("jun", "30d"):
        for a in CUR.get("ads", {}).get(win, []):
            if a.get("ad") and a.get("link"):
                linkmap.setdefault(a["ad"], a["link"])

    # CORE adset-level (2 janelas; chave legada 'jun' = MTD)
    agg_mtd = _agg_rows(h["adset_mtd"])
    agg_30d = _agg_rows(h["adset_30d"])
    AGG = {w: [{k: a[k] for k in ("seg", "reg", "canal", "bruto", "leads", "conv", "res")}
               for a in rows]
           for w, rows in (("jun", agg_mtd), ("30d", agg_30d))}
    kpi, chan, kpifilter = {}, {}, {}
    for win, rows in (("jun", agg_mtd), ("30d", agg_30d)):
        k = _kpi_from(rows)
        kpi[win] = {"SN": k, "ALL": k}
        c = defaultdict(lambda: [0.0, 0, 0])
        for a in rows:
            c[a["canal"]][0] += a["bruto"]; c[a["canal"]][1] += a["leads"]; c[a["canal"]][2] += a["conv"]
        cd = {}
        for kk, v in c.items():
            res = v[1] + v[2]
            cd[kk] = {"bruto": r2(v[0]), "leads": v[1], "conv": v[2], "res": res,
                      "cpr": r2(v[0] / res) if res else 0}
        chan[win] = {"SN": cd, "ALL": cd}
        kfb = {"bruto": round(sum(a["bruto"] for a in rows)),
               "leads": sum(a["leads"] for a in rows),
               "conv": sum(a["conv"] for a in rows),
               "ads": len(rows), "on": len(rows)}
        kpifilter[win] = {"ALL": {"ALL": {"ALL": kfb}}, "SN": {"ALL": {"ALL": kfb}}}

    # ADS ad-level (2 janelas) + links (reuso + backfill com teto de chamadas)
    ads = {"jun": _ads_rows(h["ad_mtd"], linkmap),
           "30d": _ads_rows(h["ad_30d"], linkmap)}
    new_links = common.backfill_links(api, ads)
    if new_links:
        linkmap.update(new_links)
    common.jdump(LINKS_FILE, linkmap, indent=0)
    for win in ("jun", "30d"):
        ads[win].sort(key=lambda a: -a["bruto"])
    rank = {"jun": _rank_block(ads["jun"]), "30d": _rank_block(ads["30d"])}

    # N_DAILY: repull D-3..D-1 + hoje (adset single-day), merge na série do D
    entries = [common.day_entry(h["days"][d], classify, d) for d in ctx["days_to_pull"]]
    dates = {e["date"] for e in entries}
    nd = [r for r in CUR.get("n_daily", []) if r["date"] not in dates] + entries
    nd = sorted(nd, key=lambda r: r["date"])[-30:]
    assert nd[-1]["date"] == ctx["iso"], \
        f"n_daily precisa terminar em {ctx['iso']}, terminou em {nd[-1]['date']}"

    # LOJAS (top-level) + ND_JUN (detalhe MTD por loja; campanhas fica [] como no legado)
    loja_agg = defaultdict(lambda: [0.0, 0, 0])
    for a in agg_mtd:
        loja_agg[a["loja"]][0] += a["bruto"]; loja_agg[a["loja"]][1] += a["leads"]; loja_agg[a["loja"]][2] += a["conv"]
    LJ = [("SP", "Capital / Regional SP", "SP"), ("BUT", "Butantã", "BUT"),
          ("REB", "Rebouças", "REB"), ("FMO", "Freguesia (FMO)", "FMO"),
          ("VLO", "Osasco / Valo", "VLO")]
    lojas_top = []
    for code, nome, sub in LJ:
        b, le, cv = loja_agg.get(code, [0.0, 0, 0]); res = le + cv
        lojas_top.append({"reg": code, "nome": nome, "sub": sub, "bruto": r2(b),
                          "res": res, "cpl": r2(b / res) if res else 0})
    allk = kpi["jun"]["ALL"]; tres = allk["leads"] + allk["conv"]
    total = {"bruto": allk["bruto"], "leads": allk["leads"], "conv": allk["conv"],
             "res": tres, "cpl": r2(allk["bruto"] / tres) if tres else 0}
    LJ2 = {"SP": "São Paulo (capital)", "BUT": "Butantã", "REB": "Rebouças",
           "FMO": "Francisco Morato", "VLO": "Villa Lobos"}
    LJ2S = {"SP": "campanha institucional capital", "BUT": "loja, WhatsApp",
            "REB": "loja, WhatsApp", "FMO": "loja, WhatsApp", "VLO": "loja, WhatsApp"}
    nd_lojas = []
    for code in ("SP", "BUT", "REB", "FMO", "VLO"):
        b, le, cv = loja_agg.get(code, [0.0, 0, 0]); res = le + cv
        nd_lojas.append({"reg": code, "nome": LJ2[code], "sub": LJ2S[code],
                         "bruto": r2(b), "res": res, "cpl": r2(b / res) if res else 0})
    nd_jun = {"total": total, "campanhas": [], "lojas": nd_lojas,
              "pv": {"bruto": 0.0, "conv": 0, "cpr": 0}}

    # ND_VERBA: adsets ativos com daily_budget; canal/loja via nome da campanha
    campmap = {i.get("campaign_id"): i.get("campaign_name")
               for i in h["adset_mtd"] + h["adset_30d"]}
    nd_verba = []
    for a in h["adsets"]:
        if a.get("effective_status") != "ACTIVE" or not a.get("daily_budget"):
            continue
        if common.entrega_encerrada(a):      # ignora adset com agendamento vencido (stop_time no passado)
            continue
        cn = campmap.get(a.get("campaign_id"), "")
        nd_verba.append({"nome": a.get("name", ""), "reg": loja_of(cn, a.get("name", "")),
                         "can": canal_of(cn),
                         "dailyLiq": r2(int(a["daily_budget"]) / 100),
                         "status": "ACTIVE"})
    nd_verba.sort(key=lambda x: -x["dailyLiq"])
    if not nd_verba:
        nd_verba = CUR.get("nd_verba", [])

    # EDITS / ND_CHANGES / NOTE (log real da conta; dado real ou nada)
    edits = _edits_from(h["activities"])
    nd_changes = _nd_changes(h["activities"], ctx["closed_days"][0])
    note_edits = ("Log automático das últimas atividades da conta via API "
                  "(horário de Brasília)." if edits else "")

    # APPLY (patch no D atual: geo/conta/orcamento/notas preservados; SEM nd_maio)
    D = CUR
    D["gerado"] = ctx["iso"]
    D["mes_nome"] = MESES[today.month]
    prev = today.replace(day=1) - datetime.timedelta(days=1)
    D["mom_nome"] = MESES[prev.month]
    D["kpi"] = kpi; D["chan"] = chan; D["kpifilter"] = kpifilter; D["agg"] = AGG
    D["ads"] = ads; D["rank"] = rank
    D["lojas"] = lojas_top; D["n_daily"] = nd; D["nd_jun"] = nd_jun
    D["nd_verba"] = nd_verba
    D["edits"] = edits; D["nd_changes"] = nd_changes; D["note_edits"] = note_edits
    dim = calendar.monthrange(today.year, today.month)[1]
    D["pacing"] = {**CUR.get("pacing", {}), "days": dim, "elapsed": today.day,
                   "asof": f"{today.day:02d}/{today.month:02d}"}
    D["parcial"] = (f"Formulário e WhatsApp de Seminovos (mono-segmento SN), praças "
                    f"Capital/Butantã/Rebouças/Freguesia/Osasco ({MESES[today.month]}, "
                    f"MTD 01-{today.day:02d}/{today.month:02d}). Catálogo, Remarketing e "
                    f"Engajamento como canais auxiliares. Dados de "
                    f"{today.day:02d}/{today.month:02d}/{today.year}.")
    common.jdump(DFILE, D)  # jdump já remove em/en-dash

    # resumo + reconciliação com o gasto da conta (30d)
    print(f"  [{SLUG}] jun agg={kpi['jun']['ALL']['bruto']:.2f} "
          f"leads={kpi['jun']['ALL']['leads']} conv={kpi['jun']['ALL']['conv']} | "
          f"30d agg={kpi['30d']['ALL']['bruto']:.2f} leads={kpi['30d']['ALL']['leads']} "
          f"conv={kpi['30d']['ALL']['conv']} | ads {len(ads['jun'])}/{len(ads['30d'])} "
          f"| verba {len(nd_verba)} | n_daily {nd[0]['date']}..{nd[-1]['date']} ({len(nd)})")
    try:
        acct_liq = api.account_spend(ACC, ctx["d30"][0], ctx["d30"][1])
        if acct_liq:
            diff = (kpi["30d"]["ALL"]["liq"] - acct_liq) / acct_liq * 100
            print(f"  [{SLUG}] RECON 30d: comercial_liq={kpi['30d']['ALL']['liq']:.2f} "
                  f"vs conta={acct_liq:.2f} diff={diff:.2f}%")
    except Exception as e:
        print(f"  [{SLUG}] [aviso] recon falhou: {e}")
