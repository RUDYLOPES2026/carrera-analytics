#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_central.py , gera a CENTRAL executiva do grupo a partir dos 9 <slug>_D.json.
Saida: dist/central_<hoje>.html (self-contained, noindex, Chart.js via CDN).
Visoes: KPIs do grupo, tabela consolidada, alertas de pacing, evolucao diaria por marca,
comparativo mes atual x anterior, participacao por marca, mix Form x WhatsApp.
Comparacao MoM = mes corrente (projecao + MTD real) x mes anterior fechado (nd_maio).
Uso: python3 build_central.py
"""
import os, json, glob, datetime

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
_ORC_PATH = os.path.join(os.path.dirname(HERE), "ORCAMENTO_MIDIA_CENTRAL.json")
_ORC = (json.load(open(_ORC_PATH, encoding="utf-8")).get("meta", {})
        if os.path.exists(_ORC_PATH) else {})
_MES = {1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
        7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez"}
_ORC_KEY = {"nissan": "NISSAN", "bajaj": "BAJAJ", "chevrolet_sp": "GM/ADELCO",
            "chevrolet_bsb": "GM BSB", "omoda": "OMODA", "seminovos_sp": "SEMINOVOS SP",
            "gac": "GAC", "gwm": "GWM", "vw": "VW"}
def approved_budget(fslug, fallback):
    """Orçamento BRUTO aprovado do mês corrente (direto, sem gross-up), fallback = pacing.budget."""
    try:
        v = _ORC[_ORC_KEY[fslug]][_MES[TODAY.month]]
        if v:
            return float(v)
    except Exception:
        pass
    return float(fallback or 0)

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

def load_brand(fslug, kebab, nome, cor):
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
    proj_pay = spend_tot / elapsed * days           # projecao do que vai PAGAR (bruto)
    proj_comm = spend_comm / elapsed * days
    # mes anterior (fechado)
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
    # mesmo periodo do mes anterior = mes anterior fechado (nd_maio) , o pedaco do mes
    # anterior que ainda aparece no n_daily (a janela de 30d deixa exatamente jun (D+1)..fim).
    cm, cy = TODAY.month, TODAY.year
    pm = cm - 1 or 12; py = cy if cm > 1 else cy - 1
    prevym = f"{py:04d}-{pm:02d}"
    jp_leads = sum(x["leads"] for x in daily if x["date"].startswith(prevym))
    jp_conv = sum(x["conv"] for x in daily if x["date"].startswith(prevym))
    jp_comm = sum(x["comm"] for x in daily if x["date"].startswith(prevym))
    prev = D.get("nd_maio", {}).get("total", {})
    pv_full_bruto = float(prev.get("bruto", 0) or 0)
    pv_full_leads = int(prev.get("leads", 0) or 0); pv_full_conv = int(prev.get("conv", 0) or 0)
    psp_leads = max(0, pv_full_leads - jp_leads)
    psp_conv = max(0, pv_full_conv - jp_conv)
    psp_spend = max(0.0, round(pv_full_bruto - jp_comm, 2))
    return {
        "slug": kebab, "nome": nome, "cor": cor,
        "budget": round(budget, 2), "budget_liq": round(budget_liq, 2), "days": days, "elapsed": elapsed,
        "spend_comm": round(spend_comm, 2), "pv": round(pv, 2), "spend_tot": spend_tot,
        "spend_liq": spend_liq, "ideal_liq": round(ideal_liq, 2), "proj_pay": round(proj_pay, 2),
        "leads": leads, "conv": conv, "res": res,
        "spend_comm_30d": round(spend_comm_30d, 2), "leads_30d": leads_30d, "conv_30d": conv_30d,
        "cpl": round(spend_comm / res, 2) if res else 0,
        "ideal": round(ideal_liq, 2), "proj_tot": round(proj_pay, 2), "proj_comm": round(proj_comm, 2),
        "attain": round(spend_tot / budget, 4) if budget else 0,
        "proj_attain": round(proj_pay / budget, 4) if budget else 0,
        "prev_bruto": round(prev_bruto, 2), "prev_leads": prev_leads, "prev_conv": prev_conv,
        "prev_res": prev_leads + prev_conv,
        "psp_leads": psp_leads, "psp_conv": psp_conv, "psp_spend": psp_spend,
        "form_b": round(form_b, 2), "wa_b": round(wa_b, 2), "eng_b": round(eng_b, 2),
        "form_r": form_r, "wa_r": wa_r,
        "daily": daily,
    }

def main():
    brands = []
    for fslug, kebab, nome, cor in BRANDS:
        b = load_brand(fslug, kebab, nome, cor)
        if b: brands.append(b)
    # totais do grupo
    g = {
        "budget": sum(b["budget"] for b in brands),
        "budget_liq": sum(b["budget_liq"] for b in brands),
        "spend_tot": sum(b["spend_tot"] for b in brands),
        "spend_liq": sum(b["spend_liq"] for b in brands),
        "ideal_liq": sum(b["ideal_liq"] for b in brands),
        "proj_pay": sum(b["proj_pay"] for b in brands),
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
    g["res"] = g["leads"] + g["conv"]
    g["attain"] = round(g["spend_tot"] / g["budget"], 4) if g["budget"] else 0
    g["proj_attain"] = round(g["proj_tot"] / g["budget"], 4) if g["budget"] else 0
    # share
    for b in brands:
        b["share"] = round(b["spend_tot"] / g["spend_tot"], 4) if g["spend_tot"] else 0
    # eixo de datas (uniao)
    dates = sorted({d["date"] for b in brands for d in b["daily"]})
    MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
             "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    pm = TODAY.month - 1 or 12
    payload = {"gerado": TODAY_ISO, "asof": TODAY.strftime("%d/%m/%Y"),
               "elapsed": brands[0]["elapsed"] if brands else TODAY.day,
               "days": brands[0]["days"] if brands else 31,
               "mes_nome": MESES[TODAY.month], "mom_nome": MESES[pm],
               "brands": brands, "grupo": g, "dates": dates}
    html = render(payload)
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, f"central_{TODAY_ISO}.html")
    open(out, "w", encoding="utf-8").write(html)
    print(f"[OK] {out}")
    print(f"  grupo: orc R${g['budget']:,.0f} | gasto MTD R${g['spend_tot']:,.0f} "
          f"({g['attain']*100:.0f}%) | projecao R${g['proj_tot']:,.0f} ({g['proj_attain']*100:.0f}%) "
          f"| junho R${g['prev_bruto']:,.0f}")

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
  .wrap{max-width:1180px;margin:0 auto;padding:36px 20px 72px;}
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
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{padding:9px 8px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap;}
  th{color:var(--mut);font-weight:500;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px;}
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

  <div class="kpis" id="kpis"></div>

  <h2>Consolidado por marca <span class="h">mês corrente (MTD) · projeção de fim de mês · orçamento bruto</span></h2>
  <div class="card" style="overflow-x:auto"><table id="tbl"></table></div>

  <h2>Alertas de pacing <span class="h">projeção de fim de mês vs orçamento</span></h2>
  <div class="alerts" id="alerts"></div>

  <h2>Evolução diária por marca <span class="h">investimento/dia, últimos 30 dias</span></h2>
  <div class="chartbox"><canvas id="cDaily" height="150"></canvas></div>

  <h2>Evolução diária por marca <span class="h">resultados (leads + conversas)/dia, últimos 30 dias</span></h2>
  <div class="chartbox"><canvas id="cDailyRes" height="150"></canvas></div>

  <div class="grid2" style="margin-top:16px">
    <div class="chartbox"><div class="t">Mês atual (projeção) x mês anterior , investimento</div><canvas id="cMoM" height="220"></canvas></div>
    <div class="chartbox"><div class="t">Participação de cada marca no investimento do grupo</div><canvas id="cShare" height="220"></canvas></div>
  </div>

  <h2>Mix de canal , Formulário x WhatsApp <span class="h">investimento do mês, por marca</span></h2>
  <div class="chartbox"><canvas id="cMix" height="140"></canvas></div>

  <footer id="foot"></footer>
</div>

<script>
const P = __DATA__;
const BRL = v => "R$ "+Math.round(v).toLocaleString("pt-BR");
const BRL1 = v => "R$ "+(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const PCT = v => (v*100).toFixed(0)+"%";
const G = P.grupo;

document.getElementById("sub").textContent =
  "9 marcas · Meta Ads · dia "+P.elapsed+"/"+P.days+" · atualizado em "+P.asof;

// ---- KPIs do grupo ----
const momInv = G.prev_bruto ? (G.proj_comm/G.prev_bruto-1) : 0;
// comparativo = MESMO PERIODO do mes anterior (ex: dia 1-15 deste mes vs 1-15 do anterior).
// Estavel o mes inteiro: no fim do mes vira mes cheio x mes cheio, nunca mes contra ele mesmo.
const per = P.mom_nome+" 1-"+P.elapsed;
function cmpSP(cur, base, goodUp, fmt){
  if(!base) return `<div class="c mut">, <span class="z">sem base de ${per}</span></div>`;
  const d = cur/base-1;
  const cls = (goodUp===null) ? "mut" : (d>=0 ? (goodUp?"up":"down") : (goodUp?"down":"up"));
  const arw = d>=0 ? "▲" : "▼";
  return `<div class="c ${cls}">${arw} ${(d>=0?"+":"")+(d*100).toFixed(0)}% <span class="z">vs ${per} (${fmt(base)})</span></div>`;
}
const kpis = [
  ["Investimento na Meta", BRL(G.spend_liq), "líquido · "+PCT(G.attain)+" do orçamento de "+BRL(G.budget), cmpSP(G.spend_comm, G.psp_spend, true, BRL)],
  ["Vai pagar (fim do mês)", BRL(G.proj_pay), "com imposto · "+PCT(G.proj_attain)+" do orçamento", ""],
  ["Ideal na Meta hoje", BRL(G.ideal_liq), "líquido · teto do mês "+BRL(G.budget_liq), ""],
  ["Leads (mês)", G.leads.toLocaleString("pt-BR"), "formulário", cmpSP(G.leads, G.psp_leads, true, v=>v.toLocaleString("pt-BR"))],
  ["Conversas (mês)", G.conv.toLocaleString("pt-BR"), "WhatsApp", cmpSP(G.conv, G.psp_conv, true, v=>v.toLocaleString("pt-BR"))],
  ["Mês x anterior", (momInv>=0?"+":"")+PCT(momInv), "projeção do mês vs "+P.mom_nome+" inteiro ("+BRL(G.prev_bruto)+")", ""],
];
document.getElementById("kpis").innerHTML = kpis.map(k=>
  `<div class="kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="s">${k[2]}</div>${k[3]||""}</div>`).join("");

// ---- tabela consolidada ----
function pace(pa){ if(pa>1.08) return ["b","acima"]; if(pa<0.90) return ["w","abaixo"]; return ["g","no ritmo"]; }
const rows = P.brands.slice().sort((a,b)=>b.spend_tot-a.spend_tot).map(b=>{
  const [cls,lab]=pace(b.proj_attain);
  const mom = b.prev_bruto ? (b.proj_comm/b.prev_bruto-1) : 0;
  const momc = mom>=0?"up":"down";
  return `<tr>
    <td><span class="dot" style="background:${b.cor}"></span><a href="../${b.slug}/">${b.nome}</a></td>
    <td>${BRL(b.budget)}</td>
    <td>${BRL(b.spend_liq)}</td>
    <td class="mut">${BRL(b.ideal_liq)}</td>
    <td>${PCT(b.attain)}</td>
    <td>${BRL(b.proj_pay)}</td>
    <td><span class="pill ${cls}">${lab} · ${PCT(b.proj_attain)}</span></td>
    <td>${b.leads.toLocaleString("pt-BR")}</td>
    <td>${b.conv.toLocaleString("pt-BR")}</td>
    <td>${b.cpl?BRL1(b.cpl):","}</td>
    <td class="${momc}">${(mom>=0?"+":"")+PCT(mom)}</td>
  </tr>`;
}).join("");
document.getElementById("tbl").innerHTML =
  `<thead><tr><th>Marca</th><th>Orçamento</th><th>Gasto Meta (líq)</th><th>Ideal hoje (líq)</th><th>Atingido</th>
   <th>Vai pagar</th><th>Pacing</th><th>Leads</th><th>Conversas</th><th>CPL</th><th>vs mês ant.</th></tr></thead>
   <tbody>${rows}</tbody>`;

// ---- alertas de pacing ----
const al = P.brands.map(b=>{const [cls]=pace(b.proj_attain);return {b,cls};})
  .filter(x=>x.cls!=="g").sort((a,b)=>Math.abs(b.b.proj_attain-1)-Math.abs(a.b.proj_attain-1));
const alertsEl=document.getElementById("alerts");
if(!al.length){ alertsEl.innerHTML=`<div class="alert g"><div class="n">Tudo no ritmo</div><div class="d">As 9 marcas projetam fechar o mês entre 90% e 108% do orçamento.</div></div>`; }
else{ alertsEl.innerHTML=al.map(({b,cls})=>{
  const over=b.proj_attain>1;
  const dif=BRL(Math.abs(b.proj_pay-b.budget));
  return `<div class="alert ${cls}"><div class="n">${b.nome} · ${PCT(b.proj_attain)} do orçamento</div>
    <div class="d">Projeção a pagar ${BRL(b.proj_pay)} vs orçamento ${BRL(b.budget)}. ${over?"Tende a ESTOURAR em ~"+dif:"Tende a SOBRAR ~"+dif+" (subutilização)"}. Na Meta até hoje ${BRL(b.spend_liq)} (líq), ideal ${BRL(b.ideal_liq)}.</div></div>`;
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

// MoM (projecao mes atual x mes anterior)
const bs=P.brands.slice().sort((a,b)=>b.proj_comm-a.proj_comm);
new Chart(document.getElementById("cMoM"),{type:"bar",
  data:{labels:bs.map(b=>b.nome),datasets:[
    {label:"Mês anterior",data:bs.map(b=>b.prev_bruto),backgroundColor:"#33414f"},
    {label:"Mês atual (projeção)",data:bs.map(b=>b.proj_comm),backgroundColor:"#f59e0b"}]},
  options:{indexAxis:"y",responsive:true,
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,boxHeight:10}},
      tooltip:{callbacks:{label:c=>c.dataset.label+": "+BRL(c.parsed.x||0)}}},
    scales:{x:{grid:GRID,ticks:{callback:v=>"R$"+(v/1000)+"k"}},y:{grid:{display:false}}}}});

// participacao (donut)
const bss=P.brands.slice().sort((a,b)=>b.spend_tot-a.spend_tot);
new Chart(document.getElementById("cShare"),{type:"doughnut",
  data:{labels:bss.map(b=>b.nome),datasets:[{data:bss.map(b=>b.spend_tot),
    backgroundColor:bss.map(b=>b.cor),borderColor:"#0b0f14",borderWidth:2}]},
  options:{responsive:true,cutout:"58%",
    plugins:{legend:{position:"right",labels:{boxWidth:10,boxHeight:10,padding:8}},
      tooltip:{callbacks:{label:c=>c.label+": "+BRL(c.parsed)+" ("+(c.parsed/G.spend_tot*100).toFixed(0)+"%)"}}}}});

// mix Form x WhatsApp (stacked)
const bm=P.brands.slice().sort((a,b)=>(b.form_b+b.wa_b)-(a.form_b+a.wa_b));
new Chart(document.getElementById("cMix"),{type:"bar",
  data:{labels:bm.map(b=>b.nome),datasets:[
    {label:"Formulário",data:bm.map(b=>b.form_b),backgroundColor:"#2a78d6",stack:"s"},
    {label:"WhatsApp",data:bm.map(b=>b.wa_b),backgroundColor:"#1baf7a",stack:"s"}]},
  options:{responsive:true,
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,boxHeight:10}},
      tooltip:{callbacks:{label:c=>c.dataset.label+": "+BRL(c.parsed.y||0)}}},
    scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:GRID,ticks:{callback:v=>"R$"+(v/1000)+"k"}}}}});

document.getElementById("foot").innerHTML =
  "Documento interno · orçamento e projeção em BRUTO (com imposto, o que se paga) · gasto e ideal do dia em LÍQUIDO "+
  "(valor real que a Meta cobra; imposto de 12,15% entra só no fechamento) · teto líquido na Meta = orçamento ÷ 1,1215 · "+
  "pós-venda incluído no gasto/orçamento e fora do total comercial · projeção = ritmo do mês (gasto ÷ dia atual × dias) · "+
  "comparativo dos big numbers = mesmo período do mês anterior ("+per+").";
</script>
</body>
</html>"""

if __name__ == "__main__":
    main()
