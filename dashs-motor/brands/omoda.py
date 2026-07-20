#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Omoda & Jaecoo (act_9053591018103176), marca BESPOKE (GENERIC=False).
Port do _om_build_0716.py do legado: mesmas regras, dados via meta_api em vez de
dumps do MCP. O refresh faz PATCH no data/omoda_D.json preservando a estrutura.

Regras (CLAUDE.md da marca):
  - mono-seg NV (Novos Omoda & Jaecoo); PV separado, FORA do total (consome verba);
  - 3 praças SP/SJC/SJRP; lojas MOR e VLO dobradas em SP (fold), detalhadas só em nd_jun.lojas;
  - praça/loja resolvida no NÍVEL ADSET quando a campanha é GERAL/sem praça;
  - leads = onsite_conversion.lead_grouped (fallback offsite_complete_registration_add_meta_leads);
    conversas = onsite_conversion.messaging_conversation_started_7d só em WhatsApp;
  - série diária repuxa D-3..D-1 + hoje (ctx.days_to_pull), cauda de 30 dias;
  - links: reusa o que o D atual + _omoda_links.json têm, common.backfill_links completa;
  - edits: common.edits_from_activities (dado real ou nada, sem narrativa inventada);
  - em-dash proibido (common.jdump já escova)."""
import datetime
import calendar
from collections import defaultdict

import common

SLUG = "omoda"
ACC = "act_9053591018103176"
GENERIC = False  # bespoke: refresh escreve data/omoda_D.json direto

TAX = 1.1215
LEAD_FALLBACK = "offsite_complete_registration_add_meta_leads"

REGSET = {"SP", "SJC", "SJRP", "MOR", "VLO"}
REGALIAS = {"SCJ": "SJC", "SJC": "SJC", "SJRP": "SJRP", "SP": "SP", "MOR": "MOR", "VLO": "VLO"}
CANM = {"FORM": "Form", "WA": "WhatsApp", "ENG": "Engaj", "RMKT": "Engaj", "CTL": "Form",
        "AWARENESS": "Awareness", "AWA": "Awareness", "TRAFEGO": "Trafego"}
REGORD = ["SP", "SJC", "SJRP", "G"]
REGN = {"SP": "São Paulo (capital + Morumbi + V. Leopoldina)", "SJC": "Vale (São José dos Campos)",
        "SJRP": "Noroeste (S. J. Rio Preto)", "G": "Geral / múltiplas praças"}
RN2 = {"SP": "São Paulo", "SJC": "São José dos Campos", "SJRP": "S. J. Rio Preto", "G": "Geral"}
LJ_INFO = [("SP", "São Paulo (capital)", "capital: FORM + RMKT/institucional"),
           ("SJC", "São José dos Campos", "loja Vale"),
           ("SJRP", "S. J. Rio Preto", "loja Noroeste"),
           ("MOR", "Morumbi", "loja capital, WhatsApp"),
           ("VLO", "Vila Leopoldina", "loja capital, WhatsApp")]
MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
         "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

LINKS_STATE = f"_{SLUG}_links.json"  # mapa persistente ad_id -> preview link
D_FILE = f"{SLUG}_D.json"


def r2(x):
    return round(x + 0.0, 2)


def toks(cn):
    return [t.strip() for t in (cn or "").split("|")]


def classify(cn, adset_name=""):
    """seg = token 3 da campanha; canal = token 4 (mapa CANM); praça na campanha,
    senão no NOME DO ADSET (regra Omoda: praça/loja no nível adset)."""
    t = toks(cn)
    seg = (t[2].upper() if len(t) > 2 else "?").strip()
    canal = CANM.get((t[3].strip().upper() if len(t) > 3 else ""), "Engaj")
    reg = "G"
    for tk in t:
        u = tk.strip().upper()
        if u in REGSET or u in REGALIAS:
            reg = REGALIAS.get(u, u)
            break
    if reg == "G" or "GERAL" in (cn or "").upper():
        at = [x.strip().upper() for x in (adset_name or "").split("|")]
        cand = [REGALIAS.get(x, x) for x in at if (x in REGSET or x in REGALIAS)]
        if cand:
            reg = cand[-1]
    return seg, canal, reg


def fold(loja):
    return "SP" if loja in ("SP", "MOR", "VLO") else (loja if loja in ("SJC", "SJRP") else "G")


def amap(actions):
    m = defaultdict(float)
    for x in actions or []:
        m[x["action_type"]] += float(x["value"])
    return m


def lc(canal, m):
    lg = int(m.get(common.LEAD_KEY, 0) or m.get(LEAD_FALLBACK, 0))
    msg = int(m.get(common.CONV_KEY, 0))
    return (0, msg) if canal == "WhatsApp" else (lg, msg)


def tipo_of(name):
    u = (name or "").upper()
    if "CARROSSEL" in u or "CARROUSEL" in u:
        return "CARROSSEL"
    if "VIDEO" in u or "VÍDEO" in u or "REELS" in u:
        return "VIDEO"
    return "IMAGEM"


# ---------- adset-level (fonte única do agg/kpi/chan/kpifilter/regperf) ----------
def _load_agg(insights):
    out = []
    pv = [0.0, 0]
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, loja = classify(i.get("campaign_name"), i.get("adset_name", ""))
        m = amap(i.get("actions"))
        if seg == "PV":
            pv[0] += sp
            pv[1] += int(m.get(common.CONV_KEY, 0))
            continue
        le, cv = lc(canal, m)
        out.append({"seg": "NV", "reg": fold(loja), "loja": loja, "canal": canal,
                    "bruto": r2(sp * TAX), "leads": le, "conv": cv, "res": le + cv})
    return out, (r2(pv[0] * TAX), pv[1])


def _kpi_from(rows):
    b = r2(sum(a["bruto"] for a in rows))
    return {"liq": r2(b / TAX), "bruto": b,
            "leads": sum(a["leads"] for a in rows), "conv": sum(a["conv"] for a in rows)}


def _regperf_from(rows):
    ag = defaultdict(lambda: [0.0, 0, 0])
    for a in rows:
        ag[a["reg"]][0] += a["bruto"]; ag[a["reg"]][1] += a["leads"]; ag[a["reg"]][2] += a["conv"]
    out = []
    for r in REGORD:
        d = ag[r]
        tot = d[1] + d[2]
        out.append({"reg": r, "nome": REGN[r], "spend": round(d[0]), "leads": d[1],
                    "conv": d[2], "cpl": r2(d[0] / tot) if tot else 0})
    return out


# ---------- ad-level ----------
def _load_ads(insights, linkmap):
    out = []
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, loja = classify(i.get("campaign_name"), i.get("adset_name", ""))
        if seg == "PV":
            continue
        le, cv = lc(canal, amap(i.get("actions")))
        res = le + cv
        bruto = r2(sp * TAX)
        adid = i.get("ad_id")
        out.append({"seg": "NV", "reg": fold(loja), "canal": canal, "tipo": tipo_of(i.get("ad_name")),
                    "nome": i.get("ad_name") or "", "bruto": bruto, "leads": le, "conv": cv,
                    "res": res, "cpr": r2(bruto / res) if res else 0, "ad": adid,
                    "ctr": r2(float(i.get("ctr", 0) or 0)), "link": linkmap.get(adid, ""),
                    "st": "ACTIVE", "dt": "", "off": ""})
    return out


def _rank_block(ads):
    top = sorted(ads, key=lambda a: -a["res"])[:8]
    pior = sorted([a for a in ads if a["res"] > 0], key=lambda a: -a["cpr"])[:8]
    return {"NV": {"top": top, "pior": pior}}


def _rankids(ads):
    ids = set()
    sub = [a for a in ads if a["res"] > 0]
    for a in sorted(sub, key=lambda a: -a["res"])[:12]:
        ids.add(a["ad"])
    for a in sorted([a for a in sub if a["cpr"] > 0 and a["res"] >= 3], key=lambda a: a["cpr"])[:12]:
        ids.add(a["ad"])
    for a in sorted([a for a in sub if a["cpr"] > 0 and a["res"] >= 3], key=lambda a: -a["cpr"])[:12]:
        ids.add(a["ad"])
    for reg in REGORD:
        for a in sorted([a for a in sub if a["reg"] == reg], key=lambda a: -a["res"])[:6]:
            ids.add(a["ad"])
    return ids


def _fetch_rank_links(api, ads_by_win, budget=25):
    """Complemento do backfill_links: os rankings usam ids fora do top-40 por bruto."""
    need = set()
    for lst in ads_by_win.values():
        need |= {i for i in _rankids(lst) if i}
    have = {a["ad"] for lst in ads_by_win.values() for a in lst if a.get("link")}
    need -= have
    links = {}
    for aid in sorted(need)[:budget]:
        try:
            lk = api.detalhes_ad(aid)["data"].get("preview_shareable_link") or ""
            if lk:
                links[aid] = lk
        except Exception as e:
            print("  [aviso] detalhes_ad(rank)", aid, "->", e)
    for lst in ads_by_win.values():
        for a in lst:
            if a.get("ad") in links and not a.get("link"):
                a["link"] = links[a["ad"]]
    print(f"  links(rank): faltavam {len(need)}, preenchidos {len(links)}")
    return links


# ---------- série diária (buckets bespoke por praça x canal) ----------
DAY_BASE = ("sp_form", "sp_wa", "sjc_form", "sjc_wa", "sjrp_form", "sjrp_wa", "g_wa")


def _bucket_day(insights):
    keys = ("sp_form", "sp_wa", "sjc_form", "sjc_wa", "sjrp_form", "sjrp_wa",
            "g_form", "g_wa", "inst", "pv")
    b = {k: {"spend": 0.0, "leads": 0, "conv": 0} for k in keys}
    for i in insights:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, loja = classify(i.get("campaign_name", ""), i.get("adset_name", ""))
        m = amap(i.get("actions"))
        msg = int(m.get(common.CONV_KEY, 0))
        lg = int(m.get(common.LEAD_KEY, 0) or m.get(LEAD_FALLBACK, 0))
        if seg == "PV":
            b["pv"]["spend"] += sp; b["pv"]["conv"] += msg
            continue
        if canal in ("Engaj", "Awareness", "Trafego"):
            b["inst"]["spend"] += sp; b["inst"]["leads"] += lg; b["inst"]["conv"] += msg
            continue
        reg = fold(loja)
        rkey = reg.lower() if reg in ("SP", "SJC", "SJRP") else "g"
        ckey = "wa" if canal == "WhatsApp" else "form"
        bk = b["%s_%s" % (rkey, ckey)]
        bk["spend"] += sp
        if canal == "WhatsApp":
            bk["conv"] += msg
        else:
            bk["leads"] += lg; bk["conv"] += msg
    out = {}
    for k, v in b.items():
        if v["spend"] > 0 or k in DAY_BASE:
            out[k] = {"spend": r2(v["spend"]), "leads": v["leads"], "conv": v["conv"]}
    return out


# ---------- edits / nd_changes (só dado real do log da conta) ----------
def _fmt_dt(t, tz_hours=-3):
    try:
        dt = datetime.datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S") + datetime.timedelta(hours=tz_hours)
        return dt.strftime("%d/%m %H:%M")
    except Exception:
        return ""


def _edits_block(activities, ctx):
    """edits humanas via common.edits_from_activities (mapeadas pro schema do dash) +
    nd_changes/note_edits contados direto do log. Nada inventado."""
    d0 = ctx["days_to_pull"][0]
    win = [ev for ev in activities or [] if (ev.get("event_time") or "")[:10] >= d0]
    # edits humanas (o helper já pula first_delivery/billing/unknown)
    edits = []
    for e in common.edits_from_activities(win, max_items=8):
        o_que = e.get("o_que") or ""
        if " , " in o_que:
            tipo, obj = o_que.split(" , ", 1)
        else:
            tipo, obj = o_que, ""
        edits.append({"dt": e.get("quando", ""), "tipo": tipo, "obj": obj, "det": "",
                      "autor": e.get("quem", "") or "Meta"})
    # nd_changes contado do log cru
    novos = pausados = excluidos = 0
    entregas = []
    for ev in win:
        et = (ev.get("event_type") or "").lower()
        if et == "first_delivery_event":
            novos += 1
            if len(entregas) < 8:
                entregas.append({"dt": _fmt_dt(ev.get("event_time") or ""),
                                 "obj": (ev.get("object_name") or "") + " (entrega)"})
        elif "pause" in et:
            pausados += 1
        elif "delete" in et or "remove" in et:
            excluidos += 1
    nd_changes = {"novos": novos, "pausados": pausados, "excluidos": excluidos, "entregas": entregas}
    # nota factual, sem narrativa
    j0 = datetime.date.fromisoformat(d0).strftime("%d/%m")
    j1 = ctx["today"].strftime("%d/%m")
    partes = [f"Janela {j0} a {j1}."]
    partes.append(f"{len(edits)} edições humanas registradas no log da conta." if edits
                  else "Sem edições humanas registradas no log da conta nesta janela.")
    if novos:
        partes.append(f"{novos} anúncios entraram em veiculação (first delivery) no período.")
    if pausados or excluidos:
        partes.append(f"{pausados} pausados e {excluidos} excluídos no período.")
    return edits, nd_changes, " ".join(partes)


# ---------- refresh ----------
def refresh(api, ctx):
    h = common.harvest_std(api, ACC, ctx)
    CUR = common.jload(D_FILE)

    # agg adset (2 janelas; chave MTD do D é 'jun', legado)
    agg_jul, pv_jul = _load_agg(h["adset_mtd"])
    agg_30d, pv_30d = _load_agg(h["adset_30d"])
    AGG = {"jun": [{k: a[k] for k in ("seg", "reg", "canal", "bruto", "leads", "conv", "res")} for a in agg_jul],
           "30d": [{k: a[k] for k in ("seg", "reg", "canal", "bruto", "leads", "conv", "res")} for a in agg_30d]}

    kpi, chan, kpifilter = {}, {}, {}
    for win, rows, pv in (("jun", agg_jul, pv_jul), ("30d", agg_30d, pv_30d)):
        kpi[win] = {"NV": _kpi_from(rows), "ALL": _kpi_from(rows),
                    "PV": {"liq": r2(pv[0] / TAX), "bruto": pv[0], "leads": 0, "conv": pv[1]}}
        c = defaultdict(lambda: [0.0, 0, 0])
        for a in rows:
            c[a["canal"]][0] += a["bruto"]; c[a["canal"]][1] += a["leads"]; c[a["canal"]][2] += a["conv"]
        chan[win] = {"NV": {k: {"bruto": r2(v[0]), "leads": v[1], "conv": v[2]} for k, v in c.items()}}
        kf = {"ALL": {}, "NV": {}}
        for seg in ("ALL", "NV"):
            kf[seg]["ALL"] = {"bruto": round(sum(a["bruto"] for a in rows)),
                              "leads": sum(a["leads"] for a in rows),
                              "conv": sum(a["conv"] for a in rows), "ads": len(rows), "on": len(rows)}
            for r in REGORD:
                sub = [a for a in rows if a["reg"] == r]
                kf[seg][r] = {"bruto": round(sum(a["bruto"] for a in sub)),
                              "leads": sum(a["leads"] for a in sub),
                              "conv": sum(a["conv"] for a in sub), "ads": len(sub), "on": len(sub)}
        kpifilter[win] = kf
    regperf = _regperf_from(agg_jul)

    # ads (2 janelas): linkmap = estado persistente + o que o D atual tem
    linkmap = common.jload(LINKS_STATE, default={})
    for win in ("jun", "30d"):
        for a in CUR.get("ads", {}).get(win, []):
            if a.get("ad") and a.get("link"):
                linkmap.setdefault(a["ad"], a["link"])
    ads = {"jun": _load_ads(h["ad_mtd"], linkmap), "30d": _load_ads(h["ad_30d"], linkmap)}
    common.backfill_links(api, ads)
    _fetch_rank_links(api, ads)
    rank = {"jun": _rank_block(ads["jun"]), "30d": _rank_block(ads["30d"])}
    for lst in ads.values():
        for a in lst:
            if a.get("ad") and a.get("link"):
                linkmap[a["ad"]] = a["link"]
    common.jdump(LINKS_STATE, linkmap)

    # n_daily: repuxa D-3..D-1 + hoje, preserva a cauda (30 dias)
    nd = [r for r in CUR["n_daily"] if r["date"] not in set(ctx["days_to_pull"])]
    for d in ctx["days_to_pull"]:
        row = {"date": d}
        row.update(_bucket_day(h["days"][d]))
        nd.append(row)
    nd = sorted(nd, key=lambda r: r["date"])[-30:]
    assert nd[-1]["date"] == ctx["iso"], "n_daily deve terminar %s, veio %s" % (ctx["iso"], nd[-1]["date"])

    # nd_jun (MTD com detalhe das 5 lojas)
    allk = kpi["jun"]["ALL"]
    tres = allk["leads"] + allk["conv"]
    total = {"bruto": allk["bruto"], "leads": allk["leads"], "conv": allk["conv"],
             "res": tres, "cpl": r2(allk["bruto"] / tres) if tres else 0}
    regioes = []
    for r in REGORD:
        sub = [a for a in agg_jul if a["reg"] == r]
        b = r2(sum(a["bruto"] for a in sub)); le = sum(a["leads"] for a in sub); cv = sum(a["conv"] for a in sub)
        res = le + cv
        regioes.append({"reg": r, "nome": REGN[r], "bruto": round(b), "res": res,
                        "cpl": r2(b / res) if res else 0, "leads": le, "conv": cv})
    camps = defaultdict(lambda: [0.0, 0, 0])
    for a in agg_jul:
        k = (a["reg"], a["canal"])
        camps[k][0] += a["bruto"]; camps[k][1] += a["leads"]; camps[k][2] += a["conv"]
    campanhas = []
    for (reg, canal), (b, le, cv) in camps.items():
        res = le + cv
        campanhas.append({"nome": "NV, %s, %s" % (canal, RN2[reg]), "reg": reg, "can": canal,
                          "bruto": r2(b), "res": res, "cpl": r2(b / res) if res else 0})
    campanhas.sort(key=lambda c: -c["bruto"])
    loja_agg = defaultdict(lambda: [0.0, 0, 0])
    for a in agg_jul:
        loja_agg[a["loja"]][0] += a["bruto"]; loja_agg[a["loja"]][1] += a["leads"]; loja_agg[a["loja"]][2] += a["conv"]
    lojas = []
    for code, nome, sub in LJ_INFO:
        b, le, cv = loja_agg.get(code, [0.0, 0, 0])
        res = le + cv
        lojas.append({"reg": code, "nome": nome, "sub": sub, "bruto": r2(b),
                      "res": res, "cpl": r2(b / res) if res else 0})
    pvj = kpi["jun"]["PV"]
    nd_jun = {"total": total, "regioes": regioes, "campanhas": campanhas, "lojas": lojas,
              "pv": {"bruto": pvj["bruto"], "conv": pvj["conv"],
                     "cpr": r2(pvj["bruto"] / pvj["conv"]) if pvj["conv"] else 0}}

    # nd_verba: adsets ativos com daily_budget (campanha dá seg/canal, adset dá loja)
    campmap = {}
    for i in h["adset_mtd"] + h["adset_30d"]:
        campmap[i.get("campaign_id")] = i.get("campaign_name")
    vb = defaultdict(float)
    for a in h["adsets"]:
        if a.get("effective_status") != "ACTIVE" or not a.get("daily_budget"):
            continue
        if common.entrega_encerrada(a):        # ignora agendamento vencido (stop_time no passado)
            continue
        seg, canal, loja = classify(campmap.get(a.get("campaign_id"), ""), a.get("name", ""))
        if seg == "PV":
            continue
        vb[(loja if loja in REGSET else "G", canal)] += int(a["daily_budget"]) / 100
    nd_verba = [{"nome": "NV, %s, %s" % (canal, loja), "reg": fold(loja), "can": canal,
                 "dailyLiq": r2(v), "status": "ACTIVE"}
                for (loja, canal), v in sorted(vb.items(), key=lambda x: -x[1])]
    if not nd_verba:
        nd_verba = CUR.get("nd_verba", [])

    # edits / nd_changes / note_edits (log real da conta)
    edits, nd_changes, note_edits = _edits_block(h["activities"], ctx)

    # ---- apply (PATCH no D atual; geo/nd_maio/zumbis/notas fixas preservados) ----
    today = ctx["today"]
    mom = today.month - 1 or 12
    D = CUR
    D["gerado"] = ctx["iso"]
    D["mes_nome"] = MESES[today.month - 1]; D["mes_num"] = today.month
    D["mom_nome"] = MESES[mom - 1]; D["mom_num"] = mom
    D["kpi"] = kpi; D["chan"] = chan; D["kpifilter"] = kpifilter; D["agg"] = AGG
    D["ads"] = ads; D["rank"] = rank; D["regperf"] = regperf
    D["n_daily"] = nd; D["nd_jun"] = nd_jun; D["nd_verba"] = nd_verba
    D["edits"] = edits; D["nd_changes"] = nd_changes; D["note_edits"] = note_edits
    D["pacing"] = {**CUR.get("pacing", {}), "days": calendar.monthrange(today.year, today.month)[1],
                   "elapsed": today.day, "asof": today.strftime("%d/%m")}
    D["parcial"] = ("Formulário e WhatsApp de Novos (Omoda & Jaecoo), %s MTD 01-%s, filtráveis por praça "
                    "(SP capital, Vale, Noroeste) e canal. Pós-venda fora do total, consome verba. "
                    "Morumbi e V. Leopoldina são lojas da capital (dentro de SP), detalhadas por loja. "
                    "Dados de %s." % (MESES[today.month - 1], today.strftime("%d/%m"),
                                      today.strftime("%d/%m/%Y")))
    common.jdump(D_FILE, D)

    # resumo + reconciliação com o gasto da conta (30d)
    acct = api.account_spend(ACC, ctx["d30"][0], ctx["d30"][1])
    kl = kpi["30d"]["ALL"]["liq"]; pvl = kpi["30d"]["PV"]["liq"]
    print(f"  [{SLUG}] jun bruto={kpi['jun']['ALL']['bruto']:.2f} leads={kpi['jun']['ALL']['leads']} "
          f"conv={kpi['jun']['ALL']['conv']} | 30d bruto={kpi['30d']['ALL']['bruto']:.2f} "
          f"leads={kpi['30d']['ALL']['leads']} conv={kpi['30d']['ALL']['conv']}")
    print(f"  [{SLUG}] ads {len(ads['jun'])}/{len(ads['30d'])} | verba {len(nd_verba)} "
          f"(liq/dia {sum(v['dailyLiq'] for v in nd_verba):.2f}) | n_daily {len(nd)} "
          f"({nd[0]['date']}..{nd[-1]['date']}) | edits {len(edits)} entregas {nd_changes['novos']}")
    if acct:
        print(f"  [{SLUG}] reconcile 30d: conta liq={acct:.2f} | NV liq={kl:.2f} | NV+PV={kl + pvl:.2f} "
              f"| diff NV+PV={((kl + pvl - acct) / acct * 100):+.2f}%")
