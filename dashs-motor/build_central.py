#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_central.py , gera a CENTRAL executiva do grupo a partir dos 9 <slug>_D.json.
Saida: dist/central_<hoje>.html (self-contained, noindex, Chart.js via CDN).
Visoes: KPIs do grupo, tabela consolidada, alertas de pacing, evolucao diaria por marca,
comparativo mes atual x anterior, participacao por marca, mix Form x WhatsApp.

SELETOR DE MES (03/ago/2026, pedido do Rudy). A central passou a ter um seletor no topo:
  - MES CORRENTE: MTD comparado com o MESMO PERIODO do mes anterior (dia 1..hoje x
    dia 1..mesmo dia), que e o `nd_mom_sp` que o harvest ja grava por marca;
  - MES FECHADO (julho, junho, ...): mes inteiro comparado com o mes fechado anterior,
    vindo do data/_historico_mensal.json.
O comparativo aparece dentro das colunas Orcamento, Gasto, Leads, Conversas e CPL,
sempre na mesma regua. A coluna solta "vs mes ant." saiu: ela comparava a PROJECAO do
mes com o mes anterior inteiro, mistura que confundia, e ainda por cima usava o bloco
`nd_maio`, que nao virava de mes (em 03/08 ele ainda tinha JUNHO rotulado como julho,
ex. Omoda R$ 62.440 no lugar dos R$ 91.487 que julho fechou). O mes anterior agora sai
do `nd_mom_full`/historico, que e repuxado da API todo ciclo.
Uso: python3 build_central.py
"""
import os, sys, json, glob, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import historico_mensal as hm

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
DIST = os.path.join(HERE, "dist")
TODAY = datetime.date.today()
TODAY_ISO = TODAY.isoformat()

# --- orçamento aprovado (BRUTO = o que se paga, com imposto). Mesma fonte do build.py.
# Regra do Rudy (16/jul): imposto (×1,1215) NAO entra no orçamento (ja e bruto); o gasto/ideal
# do DIA saem em LIQUIDO (valor real que a Meta cobra) e a PROJECAO de fim de mes sai em BRUTO
# (o que vai pagar). Teto liquido de gasto na Meta = orçamento_bruto / TAX.
TAX = 1.1215
_ORC_PATH = os.path.join(HERE, "ORCAMENTO_MIDIA_CENTRAL.json")  # porte nuvem: mora no dashs-motor/
if not os.path.exists(_ORC_PATH):
    _ORC_PATH = os.path.join(os.path.dirname(HERE), "ORCAMENTO_MIDIA_CENTRAL.json")
_ORC = (json.load(open(_ORC_PATH, encoding="utf-8")).get("meta", {})
        if os.path.exists(_ORC_PATH) else {})
_MES = {1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
        7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez"}
_ORC_KEY = {"nissan": "NISSAN", "bajaj": "BAJAJ", "chevrolet_sp": "GM/ADELCO",
            "chevrolet_bsb": "GM BSB", "omoda": "OMODA", "seminovos_sp": "SEMINOVOS SP",
            "gac": "GAC", "gwm": "GWM", "vw": "VW"}
def approved_budget(fslug, fallback, mes=None):
    """Orçamento BRUTO aprovado (direto, sem gross-up), fallback = pacing.budget.
    `mes` = número do mês (1..12); sem ele, mês corrente. Usado também pelos meses
    fechados do seletor, que comparam orçamento contra orçamento."""
    try:
        v = _ORC[_ORC_KEY[fslug]][_MES[mes or TODAY.month]]
        if v:
            return float(v)
    except Exception:
        pass
    return float(fallback or 0)


MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def _mes_anterior(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    return f"{y if m > 1 else y - 1:04d}-{(m - 1) or 12:02d}"


def _view(label, periodo, budget, bruto, leads, conv, prev=None, extra=None):
    """Uma linha de marca em UMA visão do seletor, sempre na mesma régua:
    gasto/orçamento em BRUTO (o que se paga) e CPL em LÍQUIDO (imposto não compra
    mídia, regra do Rudy de 22/jul)."""
    res = int(leads) + int(conv)
    v = {"label": label, "periodo": periodo,
         "budget": round(float(budget or 0), 2), "bruto": round(float(bruto or 0), 2),
         "liq": round(float(bruto or 0) / TAX, 2),
         "leads": int(leads), "conv": int(conv), "res": res,
         "cpl": round(float(bruto or 0) / TAX / res, 2) if res else 0,
         "attain": round(float(bruto or 0) / float(budget), 4) if budget else 0}
    v["prev"] = prev
    if extra:
        v.update(extra)
    return v

# arquivo _D.json -> (slug kebab do site, nome de exibicao, cor)
BRANDS = [
    ("nissan",       "nissan",        "Nissan",             "#f59e0b"),
    ("bajaj",        "bajaj",         "Bajaj",              "#e34948"),
    ("chevrolet_sp", "chevrolet-sp",  "Chevrolet SP",       "#2a78d6"),
    ("chevrolet_bsb","chevrolet-bsb", "Chevrolet Brasília", "#1baf7a"),
    ("omoda",        "omoda",         "Omoda & Jaecoo",     "#e87ba4"),
    ("seminovos_sp", "seminovos",     "Carrera Seminovos",  "#8b98a5"),
    ("gac",          "gac",           "GAC",                "#4a3aa7"),
    ("gwm",          "gwm",           "GWM",                "#eb6834"),
    ("vw",           "vw",            "Volkswagen",         "#00a3e0"),
]

def day_total_split(day):
    """Retorna (total, form_spend, wa_spend, leads, conv, pv_spend) de um dia do n_daily.
    leads/conv contam so canais comerciais (buckets form/wa), fora de aux/inst/pv.
    pv_spend = gasto de pos-venda (bucket 'pv'), pra separar gasto comercial = total , pv."""
    tot = f = w = pv = 0.0; leads = conv = 0
    for k, v in day.items():
        if k == "date" or not isinstance(v, dict):
            continue
        sp = float(v.get("spend", 0) or 0)
        tot += sp
        if k == "pv":
            pv += sp
        elif k == "form" or k.endswith("_form"):
            f += sp; leads += int(v.get("leads", 0) or 0); conv += int(v.get("conv", 0) or 0)
        elif k == "wa" or k.endswith("_wa"):
            w += sp; leads += int(v.get("leads", 0) or 0); conv += int(v.get("conv", 0) or 0)
    return round(tot, 2), round(f, 2), round(w, 2), leads, conv, round(pv, 2)

def load_brand(fslug, kebab, nome, cor, hist=None):
    p = os.path.join(DATA, f"{fslug}_D.json")
    if not os.path.exists(p):
        return None
    D = json.load(open(p, encoding="utf-8"))
    pac = D.get("pacing", {})
    budget = approved_budget(fslug, pac.get("budget", D.get("orcamento_bruto", 0)))  # BRUTO (paga)
    budget_liq = budget / TAX  # teto liquido de gasto na Meta
    days = int(pac.get("days", 31)); elapsed = max(1, int(pac.get("elapsed", TODAY.day)))
    kA = D.get("kpi", {}).get("jun", {}).get("ALL", {})
    spend_comm = float(kA.get("bruto", 0) or 0)
    spend_comm_liq = float(kA.get("liq", spend_comm / TAX) or 0)
    leads = int(kA.get("leads", 0) or 0); conv = int(kA.get("conv", 0) or 0)
    k30 = D.get("kpi", {}).get("30d", {}).get("ALL", {})
    spend_comm_30d = float(k30.get("bruto", 0) or 0)
    leads_30d = int(k30.get("leads", 0) or 0); conv_30d = int(k30.get("conv", 0) or 0)
    pv = float(D.get("nd_jun", {}).get("pv", {}).get("bruto", 0) or 0)
    pv_liq = round(pv / TAX, 2)
    spend_tot = round(spend_comm + pv, 2)          # BRUTO (o que vai pagar por esse gasto)
    spend_liq = round(spend_comm_liq + pv_liq, 2)  # LIQUIDO (o que a Meta cobrou de fato)
    res = leads + conv
    ideal_liq = budget_liq / days * elapsed        # ideal na Meta ate hoje (liquido)
    # MES ANTERIOR INTEIRO , fonte: nd_mom_full (repuxado da API todo ciclo), com o
    # nd_maio so como ultimo recurso. O nd_maio e um bloco PUBLICADO que nao vira de
    # mes: em 03/08 ele ainda carregava junho embaixo do rotulo "julho".
    prev = (D.get("nd_mom_full") or {}).get("total") or {}
    if not prev:
        prev = D.get("nd_maio", {}).get("total", {})
    prev_bruto = float(prev.get("bruto", 0) or 0)
    prev_leads = int(prev.get("leads", 0) or 0); prev_conv = int(prev.get("conv", 0) or 0)
    # mix de canal (MTD, comercial) via agg.jun
    form_b = wa_b = eng_b = 0.0; form_r = wa_r = 0
    for r in D.get("agg", {}).get("jun", []):
        c = r.get("canal", ""); b = float(r.get("bruto", 0) or 0)
        if c == "Form": form_b += b; form_r += int(r.get("res", r.get("leads", 0)) or 0)
        elif c == "WhatsApp": wa_b += b; wa_r += int(r.get("res", r.get("conv", 0)) or 0)
        else: eng_b += b
    # serie diaria
    daily = []
    for d in D.get("n_daily", []):
        t, f, w, lz, cz, pvs = day_total_split(d)
        daily.append({"date": d["date"], "tot": t, "form": f, "wa": w,
                      "leads": lz, "conv": cz, "res": lz + cz,
                      "comm": round(t - pvs, 2)})
    # ---- PROJEÇÃO POR INTENÇÃO (regra de 17/jul, decisão Rudy) ----
    # ritmo futuro = verba diária CONFIGURADA nos conjuntos/campanhas ativos
    # (nd_verba, líquido) -> reage no mesmo dia a ajuste de verba. Guarda-corpos:
    #  - se a média dos últimos 3 dias fechados for MAIOR que a verba (verba
    #    subcontada / CBO fora), usa a média (nunca projeta abaixo do realizado);
    #  - sem verba legível -> média 3d; sem nada -> ritmo médio do mês.
    # projeção líq = gasto fechado (até ontem) + ritmo × (dias restantes + hoje).
    verba_liq = round(sum(float(v.get("dailyLiq", 0) or 0)
                          for v in D.get("nd_verba", [])
                          if (v.get("status") or "ACTIVE") == "ACTIVE"), 2)
    closed = [x["tot"] for x in daily if x["date"] < TODAY_ISO]
    media3d = round(sum(closed[-3:]) / len(closed[-3:]), 2) if closed[-3:] else 0.0
    ritmo_liq = verba_liq if verba_liq > 0 else media3d
    if media3d > ritmo_liq:
        ritmo_liq = media3d
    if ritmo_liq <= 0:
        ritmo_liq = spend_liq / elapsed
    entrega = round(media3d / verba_liq, 4) if (verba_liq > 0 and media3d > 0) else None
    hoje_liq = next((x["tot"] for x in daily if x["date"] == TODAY_ISO), 0.0)
    fechado_liq = max(0.0, spend_liq - hoje_liq)
    proj_liq = fechado_liq + ritmo_liq * (days - elapsed + 1)
    proj_pay = proj_liq * TAX                     # TETO (verba cheia = intenção)
    # TENDÊNCIA REAL: ritmo = entrega recente (média dos dias fechados); fallback verba, depois ritmo do mês.
    ritmo_tend_liq = media3d if media3d > 0 else (verba_liq if verba_liq > 0 else (spend_liq / elapsed if elapsed else 0.0))
    proj_tend_liq = fechado_liq + ritmo_tend_liq * (days - elapsed + 1)
    proj_tend = proj_tend_liq * TAX               # TENDÊNCIA REAL (principal)
    proj_gap = max(0.0, proj_pay - proj_tend)     # verba configurada que a Meta não vem entregando
    proj_comm = proj_tend * (spend_comm / spend_tot if spend_tot else 1.0)
    # mesmo periodo do mes anterior = mes anterior fechado (nd_maio) , o pedaco do mes
    # anterior que ainda aparece no n_daily (a janela de 30d deixa exatamente jun (D+1)..fim).
    cm, cy = TODAY.month, TODAY.year
    pm = cm - 1 or 12; py = cy if cm > 1 else cy - 1
    prevym = f"{py:04d}-{pm:02d}"
    jp_leads = sum(x["leads"] for x in daily if x["date"].startswith(prevym))
    jp_conv = sum(x["conv"] for x in daily if x["date"].startswith(prevym))
    jp_comm = sum(x["comm"] for x in daily if x["date"].startswith(prevym))
    pv_full_bruto = prev_bruto
    pv_full_leads = prev_leads; pv_full_conv = prev_conv
    psp_leads = max(0, pv_full_leads - jp_leads)
    psp_conv = max(0, pv_full_conv - jp_conv)
    psp_spend = max(0.0, round(pv_full_bruto - jp_comm, 2))
    # Fonte boa: nd_mom_sp = harvest do MESMO PERIODO do mes anterior (01 -> mesmo dia),
    # gravado pelo refresh da marca. A subtracao acima (mes inteiro , cauda dentro da
    # janela de 30d) fica so como fallback: ela so fecha enquanto a janela de 30d ainda
    # alcanca o dia 01 do mes anterior.
    mspt = (D.get("nd_mom_sp") or {}).get("total") or {}
    if mspt:
        psp_leads = int(mspt.get("leads", 0) or 0)
        psp_conv = int(mspt.get("conv", 0) or 0)
        psp_spend = round(float(mspt.get("bruto", 0) or 0), 2)
    # ---- VISOES DO SELETOR ----------------------------------------------------
    # "atual": dia 1..hoje x dia 1..mesmo dia do mes anterior (nd_mom_sp).
    # "<ym>" : mes fechado inteiro x mes fechado anterior (historico_mensal).
    # Orcamento entra nos dois lados pelo ORCAMENTO_MIDIA_CENTRAL (mes a mes).
    curym = f"{TODAY.year:04d}-{TODAY.month:02d}"
    dias_sp = int((D.get("nd_mom_sp") or {}).get("dias") or elapsed)
    views = {"atual": _view(
        MESES[TODAY.month], f"1 a {elapsed} de {MESES[TODAY.month].lower()}",
        budget, spend_comm, leads, conv,
        prev=_view(MESES[pm], f"1 a {dias_sp} de {MESES[pm].lower()}",
                   approved_budget(fslug, 0, pm), psp_spend, psp_leads, psp_conv),
        extra={"parcial": True, "elapsed": elapsed, "days": days,
               "liq": spend_comm_liq, "cpl": round(spend_comm_liq / res, 2) if res else 0})}
    hist = hist if hist is not None else hm.carregar()
    for ym in hm.meses_de(hist, fslug):
        d = hm.get(hist, fslug, ym)
        mnum = int(ym[5:7]); pym = _mes_anterior(ym); pd_ = hm.get(hist, fslug, pym)
        pv_ = None
        if pd_:
            pv_ = _view(MESES[int(pym[5:7])], f"{MESES[int(pym[5:7])].lower()} inteiro",
                        approved_budget(fslug, 0, int(pym[5:7])),
                        pd_["bruto"], pd_["leads"], pd_["conv"])
        views[ym] = _view(MESES[mnum], f"{MESES[mnum].lower()} inteiro ({d['dias']} dias)",
                          approved_budget(fslug, 0, mnum),
                          d["bruto"], d["leads"], d["conv"], prev=pv_,
                          extra={"parcial": False, "days": d["dias"], "elapsed": d["dias"]})
    return {
        "slug": kebab, "nome": nome, "cor": cor,
        "budget": round(budget, 2), "budget_liq": round(budget_liq, 2), "days": days, "elapsed": elapsed,
        "spend_comm": round(spend_comm, 2), "pv": round(pv, 2), "spend_tot": spend_tot,
        "spend_liq": spend_liq, "ideal_liq": round(ideal_liq, 2), "proj_pay": round(proj_pay, 2),
        "proj_tend": round(proj_tend, 2), "proj_tend_liq": round(proj_tend_liq, 2),
        "ritmo_tend_liq": round(ritmo_tend_liq, 2), "proj_gap": round(proj_gap, 2),
        "verba_liq": verba_liq, "ritmo_liq": round(ritmo_liq, 2),
        "media3d": media3d, "entrega": entrega,
        "leads": leads, "conv": conv, "res": res,
        "spend_comm_30d": round(spend_comm_30d, 2), "leads_30d": leads_30d, "conv_30d": conv_30d,
        # CPL em LIQUIDO (regra Rudy 22/jul): imposto nao compra midia, entao nao entra em custo
        # por resultado. Mesma unidade do CPL dos dashs individuais.
        "cpl": round(spend_comm_liq / res, 2) if res else 0,
        "ideal": round(ideal_liq, 2), "proj_tot": round(proj_pay, 2), "proj_comm": round(proj_comm, 2),
        "attain": round(spend_tot / budget, 4) if budget else 0,
        "proj_attain": round(proj_tend / budget, 4) if budget else 0,          # PRINCIPAL = tendência real
        "proj_teto_attain": round(proj_pay / budget, 4) if budget else 0,      # referência = teto (verba cheia)
        "prev_bruto": round(prev_bruto, 2), "prev_leads": prev_leads, "prev_conv": prev_conv,
        "prev_res": prev_leads + prev_conv,
        "psp_leads": psp_leads, "psp_conv": psp_conv, "psp_spend": psp_spend,
        "form_b": round(form_b, 2), "wa_b": round(wa_b, 2), "eng_b": round(eng_b, 2),
        "form_r": form_r, "wa_r": wa_r,
        "views": views,
        "daily": daily,
    }

def main():
    # HISTORICO: antes de montar, cada marca deposita o mes fechado que esta carregando
    # (nd_mom_full). E o que faz o seletor ganhar um mes novo sozinho na virada e o que
    # impede o comparativo de envelhecer parado, como o nd_maio envelheceu.
    hist = hm.carregar()
    novos = []
    for fslug, _k, _n, _c in BRANDS:
        p = os.path.join(DATA, f"{fslug}_D.json")
        if not os.path.exists(p):
            continue
        try:
            ym = hm.registrar(hist, fslug, json.load(open(p, encoding="utf-8")))
        except Exception as e:
            print(f"  [historico] {fslug}: {e}")
            continue
        if ym:
            novos.append(f"{fslug}:{ym}")
    if novos:
        print("  [historico] meses novos gravados: " + ", ".join(novos))
    hm.salvar(hist)
    brands = []
    for fslug, kebab, nome, cor in BRANDS:
        b = load_brand(fslug, kebab, nome, cor, hist=hist)
        if b: brands.append(b)
    # totais do grupo
    g = {
        "budget": sum(b["budget"] for b in brands),
        "budget_liq": sum(b["budget_liq"] for b in brands),
        "spend_tot": sum(b["spend_tot"] for b in brands),
        "spend_liq": sum(b["spend_liq"] for b in brands),
        "ideal_liq": sum(b["ideal_liq"] for b in brands),
        "proj_pay": sum(b["proj_pay"] for b in brands),
        "proj_tend": sum(b["proj_tend"] for b in brands),
        "proj_gap": sum(b["proj_gap"] for b in brands),
        "verba_liq": sum(b["verba_liq"] for b in brands),
        "spend_comm": sum(b["spend_comm"] for b in brands),
        "spend_comm_30d": sum(b["spend_comm_30d"] for b in brands),
        "leads_30d": sum(b["leads_30d"] for b in brands),
        "conv_30d": sum(b["conv_30d"] for b in brands),
        "pv": sum(b["pv"] for b in brands),
        "leads": sum(b["leads"] for b in brands),
        "conv": sum(b["conv"] for b in brands),
        "ideal": sum(b["ideal"] for b in brands),
        "proj_tot": sum(b["proj_tot"] for b in brands),
        "proj_comm": sum(b["proj_comm"] for b in brands),
        "prev_bruto": sum(b["prev_bruto"] for b in brands),
        "prev_leads": sum(b["prev_leads"] for b in brands),
        "prev_conv": sum(b["prev_conv"] for b in brands),
        "psp_leads": sum(b["psp_leads"] for b in brands),
        "psp_conv": sum(b["psp_conv"] for b in brands),
        "psp_spend": sum(b["psp_spend"] for b in brands),
        "form_b": sum(b["form_b"] for b in brands),
        "wa_b": sum(b["wa_b"] for b in brands),
    }
    # totais do grupo em CADA visão do seletor. Uma marca sem aquele mês no histórico
    # simplesmente não soma (e some da tabela), em vez de entrar como zero e sujar o total.
    keys = ["atual"] + sorted({k for b in brands for k in b["views"] if k != "atual"}, reverse=True)
    gviews = {}
    for k in keys:
        vs = [b["views"][k] for b in brands if k in b["views"]]
        if not vs:
            continue
        prevs = [v["prev"] for v in vs if v.get("prev")]
        def _soma(lst, campo):
            return round(sum(float(x.get(campo, 0) or 0) for x in lst), 2)
        gv = _view(vs[0]["label"], vs[0]["periodo"],
                   _soma(vs, "budget"), _soma(vs, "bruto"),
                   sum(v["leads"] for v in vs), sum(v["conv"] for v in vs),
                   prev=(_view(prevs[0]["label"], prevs[0]["periodo"],
                               _soma(prevs, "budget"), _soma(prevs, "bruto"),
                               sum(p["leads"] for p in prevs), sum(p["conv"] for p in prevs))
                         if prevs else None),
                   extra={"parcial": vs[0].get("parcial", False),
                          "marcas": len(vs), "days": vs[0].get("days"),
                          "elapsed": vs[0].get("elapsed")})
        gviews[k] = gv
    g["res"] = g["leads"] + g["conv"]
    g["attain"] = round(g["spend_tot"] / g["budget"], 4) if g["budget"] else 0
    g["proj_attain"] = round(g["proj_tend"] / g["budget"], 4) if g["budget"] else 0        # PRINCIPAL = tendência
    g["proj_teto_attain"] = round(g["proj_pay"] / g["budget"], 4) if g["budget"] else 0     # teto (verba cheia)
    # share
    for b in brands:
        b["share"] = round(b["spend_tot"] / g["spend_tot"], 4) if g["spend_tot"] else 0
    # eixo de datas (uniao)
    dates = sorted({d["date"] for b in brands for d in b["daily"]})
    pm = TODAY.month - 1 or 12
    # abas do seletor: mês corrente primeiro, depois os fechados do mais novo pro mais velho
    meses = [{"key": "atual", "nome": MESES[TODAY.month],
              "tag": f"{MESES[TODAY.month]} (em curso)", "parcial": True}]
    for k in keys:
        if k == "atual" or k not in gviews:
            continue
        meses.append({"key": k, "nome": MESES[int(k[5:7])],
                      "tag": f"{MESES[int(k[5:7])]}/{k[2:4]}", "parcial": False})
    try:
        from zoneinfo import ZoneInfo
        _now_brt = datetime.datetime.now(ZoneInfo("America/Sao_Paulo"))
    except Exception:
        _now_brt = datetime.datetime.utcnow() - datetime.timedelta(hours=3)
    # ORÇAMENTO MÊS A MÊS (jan -> mês corrente). Sai direto do ORCAMENTO_MIDIA_CENTRAL,
    # que é o plano aprovado; mês sem valor lançado vira null e a linha só pula o ponto.
    orc_meses = [_MES[m] for m in range(1, TODAY.month + 1)]
    orc_serie = []
    for b in brands:
        fslug = next((f for f, k, _n, _c in BRANDS if k == b["slug"]), None)
        vals = []
        for m in range(1, TODAY.month + 1):
            v = approved_budget(fslug, 0, m) if fslug else 0
            vals.append(round(v, 2) if v else None)
        if any(v for v in vals):
            orc_serie.append({"nome": b["nome"], "cor": b["cor"], "vals": vals})
    payload = {"gerado": TODAY_ISO, "asof": TODAY.strftime("%d/%m/%Y"),
               "hora": _now_brt.strftime("%H:%M"),
               "elapsed": brands[0]["elapsed"] if brands else TODAY.day,
               "days": brands[0]["days"] if brands else 31,
               "mes_nome": MESES[TODAY.month], "mom_nome": MESES[pm],
               "meses": meses, "grupo_views": gviews,
               "orc_meses": orc_meses, "orc_serie": orc_serie,
               "brands": brands, "grupo": g, "dates": dates}
    html = render(payload)
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, f"central_{TODAY_ISO}.html")
    open(out, "w", encoding="utf-8").write(html)
    print(f"[OK] {out}")
    print(f"  grupo: orc R${g['budget']:,.0f} | gasto MTD R${g['spend_tot']:,.0f} "
          f"({g['attain']*100:.0f}%) | tendencia R${g['proj_tend']:,.0f} ({g['proj_attain']*100:.0f}%) "
          f"| teto R${g['proj_pay']:,.0f} ({g['proj_teto_attain']*100:.0f}%) "
          f"| mes anterior R${g['prev_bruto']:,.0f}")

def render(P):
    data_json = json.dumps(P, ensure_ascii=False).replace("—", ", ").replace("</", "<\\/")
    return TEMPLATE.replace("__DATA__", data_json)

TEMPLATE = r"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Carrera · Central de Mídia</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  :root{--bg:#0b0f14;--card:#141b24;--line:#1f2a36;--tx:#e6edf3;--mut:#8b98a5;--acc:#f59e0b;
        --good:#1baf7a;--warn:#eab308;--bad:#e34948;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--tx);
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  a{color:inherit;}
  .wrap{max-width:1760px;margin:0 auto;padding:36px 24px 72px;}
  .top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:8px;}
  h1{font-size:25px;margin:0;letter-spacing:.3px;}
  h1 .b{color:var(--acc);}
  .meta{color:var(--mut);font-size:13.5px;}
  .back{font-size:13px;color:var(--mut);text-decoration:none;border:1px solid var(--line);
        padding:7px 12px;border-radius:9px;white-space:nowrap;}
  .back:hover{border-color:var(--acc);color:var(--tx);}
  h2{font-size:15px;margin:34px 0 12px;color:var(--tx);font-weight:600;letter-spacing:.2px;}
  h2 .h{color:var(--mut);font-weight:400;font-size:12.5px;margin-left:8px;}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:14px;}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px 16px;}
  .kpi .l{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;}
  .kpi .v{font-size:22px;font-weight:650;margin-top:5px;}
  .kpi .s{font-size:12px;color:var(--mut);margin-top:3px;}
  .kpi .c{font-size:11.5px;margin-top:5px;font-weight:600;}
  .kpi .c .z{color:var(--mut);font-weight:400;}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;}
  table{width:100%;border-collapse:collapse;font-size:12.5px;}
  th,td{padding:9px 6px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap;}
  /* o cabeçalho pode quebrar em duas linhas: "Gasto comercial (bruto)" numa linha só
     sozinho já jogava a tabela pra 1.380px e obrigava a arrastar pro lado. */
  th{color:var(--mut);font-weight:500;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px;
     white-space:normal;line-height:1.3;vertical-align:bottom;}
  th:not(:first-child){max-width:96px;}
  th:first-child,td:first-child{text-align:left;}
  tbody tr:hover{background:rgba(245,158,11,.04);}
  td a{text-decoration:none;font-weight:600;}
  td a:hover{color:var(--acc);}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle;}
  .pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11.5px;font-weight:600;}
  .pill.g{background:rgba(27,175,122,.15);color:var(--good);}
  .pill.w{background:rgba(234,179,8,.15);color:var(--warn);}
  .pill.b{background:rgba(227,73,72,.16);color:var(--bad);}
  .mut{color:var(--mut);} .up{color:var(--good);} .down{color:var(--bad);}
  .alerts{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}
  .alert{background:var(--card);border:1px solid var(--line);border-left-width:4px;border-radius:12px;padding:13px 15px;}
  .alert.b{border-left-color:var(--bad);} .alert.w{border-left-color:var(--warn);} .alert.g{border-left-color:var(--good);}
  .alert .n{font-weight:650;font-size:14px;} .alert .d{font-size:12.5px;color:var(--mut);margin-top:4px;line-height:1.5;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  @media(max-width:820px){.grid2{grid-template-columns:1fr;}}
  .chartbox{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 16px 8px;}
  .chartbox .t{font-size:13px;color:var(--mut);margin-bottom:8px;}
  canvas{max-width:100%;}
  /* seletor de mês */
  .segbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:18px 0 2px;}
  .segbar .lb{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;margin-right:4px;}
  .seg{background:var(--card);border:1px solid var(--line);color:var(--mut);font:inherit;font-size:12.5px;
       font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;}
  .seg:hover{color:var(--tx);border-color:#33414f;}
  .seg.on{background:rgba(245,158,11,.14);border-color:var(--acc);color:var(--acc);}
  /* seção recolhível (fica no fim da página, abre sob demanda) */
  details.acc{margin-top:34px;background:var(--card);border:1px solid var(--line);border-radius:14px;}
  details.acc>summary{cursor:pointer;padding:15px 18px;font-size:15px;font-weight:600;
                      list-style:none;letter-spacing:.2px;}
  details.acc>summary::-webkit-details-marker{display:none;}
  details.acc>summary::before{content:"▸";color:var(--acc);margin-right:10px;}
  details.acc[open]>summary::before{content:"▾";}
  details.acc>summary:hover{color:var(--acc);}
  details.acc>summary .h{color:var(--mut);font-weight:400;font-size:12.5px;margin-left:8px;}
  details.acc[open]>summary .h{display:none;}
  details.acc .inner{padding:0 18px 18px;}
  /* comparativo dentro da célula */
  td .cmp{font-size:11px;font-weight:600;margin-top:2px;}
  td .cmp .z{color:var(--mut);font-weight:400;}
  .hide{display:none;}
  footer{margin-top:40px;color:var(--mut);font-size:12px;line-height:1.6;}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <h1>Grupo <span class="b">Carrera</span> , Central de Mídia</h1>
      <div class="meta" id="sub"></div>
    </div>
    <a class="back" href="../dashboards/">← dashboards por marca</a>
  </div>

  <div class="segbar" id="seletor"><span class="lb">Período</span></div>
  <div class="meta" id="segsub" style="margin:8px 0 2px"></div>

  <div class="kpis" id="kpis"></div>

  <h2 id="tblh">Consolidado por marca</h2>
  <div class="card" style="overflow-x:auto"><table id="tbl"></table></div>
  <div class="meta" style="margin-top:10px;line-height:1.6" id="tblnote">
    <b>Os dois números do "Vai pagar" (em bruto, com imposto):</b>
    <b>Tendência</b> = quanto o mês deve fechar se continuar no ritmo de entrega dos últimos dias.
    É a estimativa mais realista e muda todo dia. É o número principal.
    <b>Teto</b> = quanto fecharia se a Meta gastasse toda a verba que está configurada. É o máximo possível, serve de referência.
    O <b>⚠</b> aparece quando a Meta está entregando menos de 85% da verba. A diferença entre o teto e a tendência é
    <b>verba parada</b>: dinheiro disponível que não está sendo gasto, vale revisar público e criativo.
  </div>

  <div id="soAtual">
    <h2>Alertas de pacing <span class="h">projeção de fim de mês vs orçamento</span></h2>
    <div class="alerts" id="alerts"></div>

    <h2>Evolução diária por marca <span class="h">investimento/dia LÍQUIDO, últimos 30 dias</span></h2>
    <div class="chartbox"><canvas id="cDaily" height="150"></canvas></div>

    <h2>Evolução diária por marca <span class="h">resultados (leads + conversas)/dia, últimos 30 dias</span></h2>
    <div class="chartbox"><canvas id="cDailyRes" height="150"></canvas></div>
  </div>

  <div class="grid2" style="margin-top:16px">
    <div class="chartbox"><div class="t" id="momt">investimento BRUTO</div><canvas id="cMoM" height="220"></canvas></div>
    <div class="chartbox"><div class="t" id="sharet">Participação de cada marca no investimento do grupo (bruto)</div><canvas id="cShare" height="220"></canvas></div>
  </div>

  <div id="soAtual2">
    <h2>Mix de canal , Formulário x WhatsApp <span class="h" id="mixh">investimento BRUTO do mês, por marca</span></h2>
    <div class="chartbox"><canvas id="cMix" height="140"></canvas></div>
  </div>
  <div class="meta hide" id="notaFechado" style="margin-top:16px;line-height:1.6"></div>

  <details class="acc" id="accOrc">
    <summary>Orçamento aprovado, mês a mês <span class="h">clique para abrir</span></summary>
    <div class="inner">
      <div class="meta" id="orch" style="margin-bottom:10px"></div>
      <div class="chartbox"><canvas id="cOrc" height="150"></canvas></div>
      <div class="card" style="overflow-x:auto;margin-top:12px"><table id="torc"></table></div>
    </div>
  </details>

  <footer id="foot"></footer>
</div>

<script>
const P = __DATA__;
const BRL = v => "R$ "+Math.round(v).toLocaleString("pt-BR");
const BRL1 = v => "R$ "+(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const PCT = v => (v*100).toFixed(0)+"%";
const G = P.grupo;

document.getElementById("sub").textContent =
  "9 marcas · Meta Ads · dia "+P.elapsed+"/"+P.days+" · atualizado em "+P.asof+(P.hora?(" às "+P.hora):"");

// ================== SELETOR DE PERÍODO ==================
// "atual"  = dia 1..hoje deste mês  x  dia 1..MESMO DIA do mês anterior
// "<ym>"   = mês fechado inteiro    x  mês fechado anterior inteiro
// A régua é a mesma nos dois: gasto/orçamento em BRUTO, CPL em LÍQUIDO.
let VIEW = "atual";
const isAtual = () => VIEW === "atual";
const VW = b => b.views[VIEW];
const GV = () => P.grupo_views[VIEW] || P.grupo_views["atual"];
const brandsIn = () => P.brands.filter(b => b.views[VIEW]);
const NUM = v => (v||0).toLocaleString("pt-BR");

// Δ contra o mesmo número do período de comparação. goodUp=true: subir é bom.
function dlt(cur, base, goodUp, fmt, wrap){
  const cls0 = wrap==="c" ? "c" : "cmp";
  // sem período de comparação (junho/2026 é o começo do histórico): nada de "sem base"
  // repetido em toda célula, o subtítulo do seletor já avisa uma vez.
  if(!base) return "";
  const d = cur/base-1;
  // variação abaixo de 0,5% é ruído: mostra "estável" em vez de um "▲ +0%" que engana
  if(Math.abs(d) < 0.005)
    return `<div class="${cls0} mut">= estável <span class="z">${fmt(base)}</span></div>`;
  const cls = goodUp===null ? "mut" : (d>=0 ? (goodUp?"up":"down") : (goodUp?"down":"up"));
  return `<div class="${cls0} ${cls}">${d>=0?"▲ +":"▼ "}${(d*100).toFixed(0)}%`
       + ` <span class="z">${fmt(base)}</span></div>`;
}
const cel = (txt, cur, base, goodUp, fmt) => `<td>${txt}${dlt(cur,base,goodUp,fmt)}</td>`;

// ---- barra do seletor ----
document.getElementById("seletor").innerHTML =
  '<span class="lb">Período</span>' + P.meses.map(m =>
    `<button class="seg${m.key===VIEW?" on":""}" data-k="${m.key}">${m.tag}</button>`).join("");
document.getElementById("seletor").addEventListener("click", e => {
  const b = e.target.closest(".seg"); if(!b) return;
  VIEW = b.dataset.k;
  document.querySelectorAll("#seletor .seg").forEach(x => x.classList.toggle("on", x.dataset.k===VIEW));
  renderTudo();
});

// ---- KPIs do grupo ----
function renderKpis(){
  const v = GV(), p = v.prev;
  const base = f => p ? p[f] : 0;
  const vs = p ? ("vs "+p.periodo) : "";
  let kpis;
  if(isAtual()){
    kpis = [
      ["Orçamento do mês", BRL(v.budget), "bruto, aprovado", dlt(v.budget, base("budget"), null, BRL, "c")],
      ["Gasto comercial", BRL(v.liq)+" líq", BRL(v.bruto)+" bruto · com pós-venda o grupo já gastou "+BRL(G.spend_tot)+" ("+PCT(G.attain)+" do orçamento)", dlt(v.bruto, base("bruto"), true, BRL, "c")],
      ["Vai pagar (ritmo de agora)", BRL(G.proj_tend)+(G.proj_gap>0?' ⚠':''),
        "No ritmo dos últimos dias o grupo fecha aqui ("+PCT(G.proj_attain)+" do orçamento). Teto se gastar toda a verba: "+BRL(G.proj_pay)+" ("+PCT(G.proj_teto_attain)+")."+(G.proj_gap>0?(" "+BRL(G.proj_gap)+" de verba parada, não está sendo entregue."):""), ""],
      ["Ideal na Meta hoje", BRL(G.ideal_liq)+" líq", "teto do mês "+BRL(G.budget_liq)+" líq ("+BRL(v.budget)+" bruto)", ""],
      ["Leads", NUM(v.leads), "formulário", dlt(v.leads, base("leads"), true, NUM, "c")],
      ["Conversas", NUM(v.conv), "WhatsApp", dlt(v.conv, base("conv"), true, NUM, "c")],
      ["CPL", v.cpl?BRL1(v.cpl):",", "líquido, leads + conversas", dlt(v.cpl, base("cpl"), false, BRL1, "c")],
    ];
  } else {
    kpis = [
      ["Orçamento", BRL(v.budget), "bruto, aprovado", dlt(v.budget, base("budget"), null, BRL, "c")],
      ["Gasto", BRL(v.bruto), BRL(v.liq)+" líq · mês fechado", dlt(v.bruto, base("bruto"), true, BRL, "c")],
      ["Do orçamento", PCT(v.attain), "gasto bruto ÷ orçamento", p&&p.budget?dlt(v.attain, p.bruto/p.budget, null, x=>PCT(x), "c"):""],
      ["Leads", NUM(v.leads), "formulário", dlt(v.leads, base("leads"), true, NUM, "c")],
      ["Conversas", NUM(v.conv), "WhatsApp", dlt(v.conv, base("conv"), true, NUM, "c")],
      ["CPL", v.cpl?BRL1(v.cpl):",", "líquido, leads + conversas", dlt(v.cpl, base("cpl"), false, BRL1, "c")],
    ];
  }
  document.getElementById("kpis").innerHTML = kpis.map(k =>
    `<div class="kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="s">${k[2]}</div>${k[3]||""}</div>`).join("");
  document.getElementById("segsub").innerHTML = p
    ? `Comparando <b>${v.periodo}</b> com <b>${p.periodo}</b>. As setas em Orçamento, Gasto, Leads, Conversas e CPL são sempre esse par.`
    : `<b>${v.periodo}</b>. Sem mês anterior guardado para comparar (o histórico começa em junho/2026).`;
}

// ---- tabela consolidada ----
function pace(pa){ if(pa>1.08) return ["b","acima"]; if(pa<0.90) return ["w","abaixo"]; return ["g","no ritmo"]; }
function renderTabela(){
  const at = isAtual(), gv = GV(), gp = gv.prev;
  const rows = brandsIn().slice().sort((a,b)=>VW(b).bruto-VW(a).bruto).map(b=>{
    const v = VW(b), p = v.prev || {};
    const orc = cel(BRL(v.budget), v.budget, p.budget, null, BRL);
    const gas = cel(BRL(v.bruto), v.bruto, p.bruto, true, BRL);
    const led = cel(NUM(v.leads), v.leads, p.leads, true, NUM);
    const cnv = cel(NUM(v.conv), v.conv, p.conv, true, NUM);
    const cpl = cel(v.cpl?BRL1(v.cpl):",", v.cpl, p.cpl, false, BRL1);
    const marca = `<td><span class="dot" style="background:${b.cor}"></span><a href="../${b.slug}/">${b.nome}</a></td>`;
    if(!at){
      return `<tr>${marca}${orc}${gas}<td>${PCT(v.attain)}</td>${led}${cnv}${cpl}</tr>`;
    }
    const [cls,lab] = pace(b.proj_attain);
    const lowdeliv = (b.entrega!==null && b.entrega<0.85);
    return `<tr>${marca}${orc}
      <td class="mut">${BRL(b.spend_liq)}</td>${gas}
      <td class="mut">${BRL(b.ideal_liq)}</td>
      <td class="mut">${b.verba_liq?BRL(b.verba_liq):","}${lowdeliv?" ⚠":""}</td>
      <td>${PCT(b.attain)}</td>
      <td>${BRL(b.proj_tend)}${(b.proj_gap>0)?' ⚠':''}<div class="mut" style="font-size:11px">teto ${BRL(b.proj_pay)}</div></td>
      <td><span class="pill ${cls}">${lab} · ${PCT(b.proj_attain)}</span></td>
      ${led}${cnv}${cpl}</tr>`;
  }).join("");
  const tot = at
    ? `<tr><td><b>Grupo</b></td><td><b>${BRL(gv.budget)}</b></td><td class="mut">${BRL(G.spend_liq)}</td>
        <td><b>${BRL(gv.bruto)}</b></td><td class="mut">${BRL(G.ideal_liq)}</td><td class="mut">${BRL(G.verba_liq)}</td>
        <td><b>${PCT(gv.attain)}</b></td><td><b>${BRL(G.proj_tend)}</b></td><td></td>
        <td><b>${NUM(gv.leads)}</b></td><td><b>${NUM(gv.conv)}</b></td><td><b>${gv.cpl?BRL1(gv.cpl):","}</b></td></tr>`
    : `<tr><td><b>Grupo</b></td><td><b>${BRL(gv.budget)}</b></td><td><b>${BRL(gv.bruto)}</b></td>
        <td><b>${PCT(gv.attain)}</b></td><td><b>${NUM(gv.leads)}</b></td><td><b>${NUM(gv.conv)}</b></td>
        <td><b>${gv.cpl?BRL1(gv.cpl):","}</b></td></tr>`;
  const head = at
    ? `<tr><th>Marca</th><th>Orçamento (bruto)</th>
       <th title="Gasto total na Meta no mês, incluindo pós-venda. É a régua do pacing e do Atingido.">Gasto total (líq)</th>
       <th title="Só campanhas comerciais, com imposto. É esta linha que entra no comparativo, dos dois lados.">Gasto comercial (bruto)</th>
       <th>Ideal hoje (líq)</th><th>Verba/dia (líq)</th>
       <th title="Gasto total (com pós-venda) sobre o orçamento.">Atingido</th>
       <th title="Em cima: quanto o mês fecha no ritmo de agora (tendência real). Embaixo: teto, se gastar toda a verba configurada.">Vai pagar</th><th>Pacing</th><th>Leads</th><th>Conversas</th><th>CPL (líq)</th></tr>`
    : `<tr><th>Marca</th><th>Orçamento (bruto)</th>
       <th title="Só campanhas comerciais, com imposto.">Gasto comercial (bruto)</th>
       <th>Do orçamento</th><th>Leads</th><th>Conversas</th><th>CPL (líq)</th></tr>`;
  document.getElementById("tbl").innerHTML =
    `<thead>${head}</thead><tbody>${rows}</tbody><tfoot>${tot}</tfoot>`;
  document.getElementById("tblh").innerHTML = at
    ? `Consolidado por marca <span class="h">mês corrente (dia 1 a ${P.elapsed}) · setas = mesmo período de ${gp?gp.label.toLowerCase():"antes"} · projeção = tendência real</span>`
    : `Consolidado por marca <span class="h">${gv.label} fechado · setas = ${gp?gp.label.toLowerCase()+" inteiro":"sem base"}</span>`;
  document.getElementById("tblnote").classList.toggle("hide", !at);
}

// ---- alertas de pacing (só fazem sentido no mês em curso) ----
const al = P.brands.map(b=>{const [cls]=pace(b.proj_attain);return {b,cls};})
  .filter(x=>x.cls!=="g").sort((a,b)=>Math.abs(b.b.proj_attain-1)-Math.abs(a.b.proj_attain-1));
const alertsEl=document.getElementById("alerts");
if(!al.length){ alertsEl.innerHTML=`<div class="alert g"><div class="n">Tudo no ritmo</div><div class="d">As 9 marcas projetam fechar o mês entre 90% e 108% do orçamento.</div></div>`; }
else{ alertsEl.innerHTML=al.map(({b,cls})=>{
  const over=b.proj_attain>1;
  const dif=BRL(Math.abs(b.proj_tend-b.budget));
  const lowdeliv=(b.entrega!==null&&b.entrega<0.85);
  return `<div class="alert ${cls}"><div class="n">${b.nome} · ${PCT(b.proj_attain)} do orçamento</div>
    <div class="d">No ritmo de agora o mês fecha em ${BRL(b.proj_tend)}, contra o orçamento de ${BRL(b.budget)}. ${over?"Tende a passar do orçamento em ~"+dif:"Tende a sobrar ~"+dif+" (verba subutilizada)"}. Se gastasse toda a verba fecharia em ${BRL(b.proj_pay)} (${PCT(b.proj_teto_attain)})${lowdeliv?", mas a Meta entrega só "+PCT(b.entrega)+" da verba, então "+BRL(b.proj_gap)+" ficam parados ⚠":""}. Já gastou ${BRL(b.spend_tot)} (bruto), o ideal para hoje seria ${BRL(b.ideal_liq)} líq.</div></div>`;
}).join(""); }

// ---- Chart.js comum ----
Chart.defaults.color="#8b98a5"; Chart.defaults.font.family="-apple-system,Segoe UI,Roboto,sans-serif";
Chart.defaults.font.size=11; const GRID={color:"rgba(255,255,255,.05)"};

// datas em DD/MM (nao MM/DD)
const fmtDate = d => d.slice(5).split("-").reverse().join("/");
const LABELS = P.dates.map(fmtDate);

// evolucao diaria , investimento
new Chart(document.getElementById("cDaily"),{type:"line",
  data:{labels:LABELS,
    datasets:P.brands.map(b=>{const m=Object.fromEntries(b.daily.map(d=>[d.date,d.tot]));
      return {label:b.nome,data:P.dates.map(d=>m[d]??null),borderColor:b.cor,backgroundColor:b.cor,
        borderWidth:1.8,tension:.3,pointRadius:0,spanGaps:true};})},
  options:{responsive:true,interaction:{mode:"index",intersect:false},
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,boxHeight:10,padding:10}},
      tooltip:{callbacks:{label:c=>c.dataset.label+": "+BRL(c.parsed.y||0)}}},
    scales:{y:{grid:GRID,ticks:{callback:v=>"R$"+(v/1000)+"k"}},x:{grid:{display:false}}}}});

// evolucao diaria , resultados (leads + conversas)
new Chart(document.getElementById("cDailyRes"),{type:"line",
  data:{labels:LABELS,
    datasets:P.brands.map(b=>{const m=Object.fromEntries(b.daily.map(d=>[d.date,d.res]));
      return {label:b.nome,data:P.dates.map(d=>m[d]??null),borderColor:b.cor,backgroundColor:b.cor,
        borderWidth:1.8,tension:.3,pointRadius:0,spanGaps:true};})},
  options:{responsive:true,interaction:{mode:"index",intersect:false},
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,boxHeight:10,padding:10}},
      tooltip:{callbacks:{label:c=>c.dataset.label+": "+(c.parsed.y||0).toLocaleString("pt-BR")+" res."}}},
    scales:{y:{grid:GRID,ticks:{callback:v=>v.toLocaleString("pt-BR")}},x:{grid:{display:false}}}}});

// comparativo de barras , acompanha o seletor.
// No mês em curso compara a PROJEÇÃO (o mês ainda não acabou) com o mês anterior
// inteiro; num mês fechado compara realizado x realizado.
let chMoM=null, chShare=null;
function renderMoM(){
  const at=isAtual(), gp=GV().prev;
  const bs=brandsIn().slice().sort((a,b)=>
    at ? (b.proj_comm-a.proj_comm) : (VW(b).bruto-VW(a).bruto));
  const atualLbl = at ? "Mês atual (tendência)" : GV().label;
  const antLbl = at ? (P.mom_nome+" inteiro") : (gp?gp.label+" inteiro":"sem base");
  document.getElementById("momt").textContent = at
    ? "Mês atual (tendência) x "+P.mom_nome+" inteiro , investimento BRUTO"
    : GV().label+" x "+(gp?gp.label:"sem base")+" , investimento BRUTO realizado";
  if(chMoM) chMoM.destroy();
  chMoM=new Chart(document.getElementById("cMoM"),{type:"bar",
    data:{labels:bs.map(b=>b.nome),datasets:[
      {label:antLbl,data:bs.map(b=>at?b.prev_bruto:((VW(b).prev||{}).bruto||0)),backgroundColor:"#33414f"},
      {label:atualLbl,data:bs.map(b=>at?b.proj_comm:VW(b).bruto),backgroundColor:"#f59e0b"}]},
    options:{indexAxis:"y",responsive:true,
      plugins:{legend:{position:"bottom",labels:{boxWidth:10,boxHeight:10}},
        tooltip:{callbacks:{label:c=>c.dataset.label+": "+BRL(c.parsed.x||0)}}},
      scales:{x:{grid:GRID,ticks:{callback:v=>"R$"+(v/1000)+"k"}},y:{grid:{display:false}}}}});
}

// participacao (donut) , acompanha o seletor
function renderShare(){
  const tot=GV().bruto||1;
  const bss=brandsIn().slice().sort((a,b)=>VW(b).bruto-VW(a).bruto);
  document.getElementById("sharet").textContent =
    "Participação de cada marca no investimento do grupo (bruto) , "+GV().periodo;
  if(chShare) chShare.destroy();
  chShare=new Chart(document.getElementById("cShare"),{type:"doughnut",
    data:{labels:bss.map(b=>b.nome),datasets:[{data:bss.map(b=>VW(b).bruto),
      backgroundColor:bss.map(b=>b.cor),borderColor:"#0b0f14",borderWidth:2}]},
    options:{responsive:true,cutout:"58%",
      plugins:{legend:{position:"right",labels:{boxWidth:10,boxHeight:10,padding:8}},
        tooltip:{callbacks:{label:c=>c.label+": "+BRL(c.parsed)+" ("+(c.parsed/tot*100).toFixed(0)+"%)"}}}}});
}

// mix Form x WhatsApp (stacked) , com o % de cada canal dentro da barra
const bm=P.brands.slice().sort((a,b)=>(b.form_b+b.wa_b)-(a.form_b+a.wa_b));
const mixTot=(i)=>((bm[i]&&bm[i].form_b)||0)+((bm[i]&&bm[i].wa_b)||0);
// subtitulo do bloco: mix do GRUPO inteiro
(function(){
  const t=(G.form_b||0)+(G.wa_b||0);
  if(!t) return;
  document.getElementById("mixh").textContent =
    "investimento BRUTO do mês, por marca · no grupo: Formulário "
    +Math.round(G.form_b/t*100)+"% ("+BRL(G.form_b)+") · WhatsApp "
    +Math.round(G.wa_b/t*100)+"% ("+BRL(G.wa_b)+")";
})();
// plugin inline (sem dependencia externa): escreve o % dentro de cada pedaco.
// Só desenha se o pedaço tiver altura pra caber o texto, senão fica ilegível.
const mixPct={id:"mixPct",afterDatasetsDraw(ch){
  const ctx=ch.ctx; ctx.save();
  ctx.font='700 11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ch.data.datasets.forEach((ds,di)=>{
    ch.getDatasetMeta(di).data.forEach((el,i)=>{
      const v=ds.data[i]||0, tot=mixTot(i);
      if(!tot||v<=0) return;
      const h=Math.abs((el.base!=null?el.base:el.y)-el.y);
      if(h<15) return;
      ctx.fillStyle="rgba(255,255,255,.95)";
      ctx.fillText(Math.round(v/tot*100)+"%", el.x, (el.y+el.base)/2);
    });
  });
  ctx.restore();
}};
new Chart(document.getElementById("cMix"),{type:"bar",
  data:{labels:bm.map(b=>b.nome),datasets:[
    {label:"Formulário",data:bm.map(b=>b.form_b),backgroundColor:"#2a78d6",stack:"s"},
    {label:"WhatsApp",data:bm.map(b=>b.wa_b),backgroundColor:"#1baf7a",stack:"s"}]},
  plugins:[mixPct],
  options:{responsive:true,
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,boxHeight:10}},
      tooltip:{callbacks:{label:c=>{
        const t=mixTot(c.dataIndex), v=c.parsed.y||0;
        return c.dataset.label+": "+BRL(v)+(t?" ("+Math.round(v/t*100)+"% do mix da marca)":"");
      }}}},
    scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:GRID,ticks:{callback:v=>"R$"+(v/1000)+"k"}}}}});

// ---- orçamento aprovado mês a mês (não depende do seletor: é o plano do ano) ----
function renderOrc(){
  const L = P.orc_meses, S = P.orc_serie||[];
  if(!S.length) return;
  new Chart(document.getElementById("cOrc"),{type:"line",
    data:{labels:L.map(m=>m.charAt(0).toUpperCase()+m.slice(1)),
      datasets:S.map(s=>({label:s.nome,data:s.vals,borderColor:s.cor,backgroundColor:s.cor,
        borderWidth:1.8,tension:.25,pointRadius:2.5,spanGaps:true}))},
    options:{responsive:true,interaction:{mode:"index",intersect:false},
      plugins:{legend:{position:"bottom",labels:{boxWidth:10,boxHeight:10,padding:10}},
        tooltip:{callbacks:{label:c=>c.dataset.label+": "+BRL(c.parsed.y||0)}}},
      scales:{y:{grid:GRID,ticks:{callback:v=>"R$"+(v/1000)+"k"}},x:{grid:{display:false}}}}});
  // tabela: valor do mês + variação contra o mês anterior, que é a leitura que interessa
  const cel=(v,ant)=>{
    if(v===null||v===undefined) return `<td class="mut">,</td>`;
    let d="";
    if(ant){
      const r=v/ant-1;
      d = Math.abs(r)<0.005 ? `<div class="cmp mut">= estável</div>`
        : `<div class="cmp ${r>=0?"up":"down"}">${r>=0?"▲ +":"▼ "}${(r*100).toFixed(0)}%</div>`;
    }
    return `<td>${BRL(v)}${d}</td>`;
  };
  const linhas = S.map(s=>`<tr><td><span class="dot" style="background:${s.cor}"></span>${s.nome}</td>`
    + s.vals.map((v,i)=>cel(v, i?s.vals[i-1]:null)).join("") + `</tr>`).join("");
  const tot = L.map((_,i)=>S.reduce((a,s)=>a+(s.vals[i]||0),0));
  const linhaTot = `<tr><td><b>Grupo</b></td>`
    + tot.map((v,i)=>cel(v, i?tot[i-1]:null)).join("") + `</tr>`;
  document.getElementById("torc").innerHTML =
    `<thead><tr><th>Marca</th>${L.map((m,i)=>
      `<th${i===L.length-1?' style="color:var(--acc)"':''}>${m}</th>`).join("")}</tr></thead>`
    + `<tbody>${linhas}</tbody><tfoot>${linhaTot}</tfoot>`;
  document.getElementById("orch").textContent =
    "bruto, por marca · fonte: ORÇAMENTO MÍDIA (plano aprovado) · a seta compara com o mês anterior · "
    + L[L.length-1] + " é o mês em curso";
}
// desenha só quando o bloco é aberto: gráfico dentro de <details> fechado nasce
// com largura zero e sai torto se for criado antes.
(function(){
  const acc = document.getElementById("accOrc");
  let feito = false;
  acc.addEventListener("toggle", () => {
    if(acc.open && !feito){ feito = true; renderOrc(); }
  });
})();

// ---- troca de período: redesenha tudo que depende da visão ----
function renderTudo(){
  renderKpis(); renderTabela(); renderMoM(); renderShare();
  const at=isAtual();
  document.getElementById("soAtual").classList.toggle("hide", !at);
  document.getElementById("soAtual2").classList.toggle("hide", !at);
  const nf=document.getElementById("notaFechado");
  nf.classList.toggle("hide", at);
  if(!at) nf.innerHTML =
    "<b>"+GV().label+" fechado.</b> Pacing, projeção e verba/dia só existem no mês em curso, "+
    "por isso saem da tela. A evolução diária e o mix por canal também: a janela de dados diários "+
    "guarda 30 dias e não cobre um mês fechado inteiro. Voltando para o mês em curso tudo reaparece.";
  document.getElementById("foot").innerHTML =
    "Documento interno · orçamento e gasto em BRUTO (com imposto, o que se paga) · CPL em LÍQUIDO "+
    "(imposto não compra mídia) · bruto = líquido × 1,1215 · teto líquido na Meta = orçamento ÷ 1,1215 · "+
    "o gasto do pacing inclui pós-venda; as colunas de comparativo usam só o comercial, dos dois lados · "+
    "projeção = gasto realizado + verba diária configurada × dias restantes (⚠ quando a entrega recente fica abaixo de 85% da verba) · "+
    (isAtual()
      ? ("comparativo = mesmo período do mês anterior ("+(GV().prev?GV().prev.periodo:"sem base")+"), dia a dia: no dia 10 são os dias 1 a 10 dos dois meses.")
      : ("comparativo = "+(GV().prev?GV().prev.periodo:"sem base")+", mês fechado contra mês fechado."));
}
renderTudo();
</script>
</body>
</html>"""

if __name__ == "__main__":
    main()
