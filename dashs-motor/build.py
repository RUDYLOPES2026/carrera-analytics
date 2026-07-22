#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py , MOTOR UNICO de dashboards Meta Ads Carrera (Marco 1).

Uso:  python3 build.py fichas/nissan.json

O que faz:
  1. Le a ficha da marca + o arquivo de dados (data/<marca>_D.json).
  2. Monta o objeto D final, injetando a config da ficha em D.config.
  3. Injeta `const D=...` no template generico (template.html).
  4. Escreve dist/<marca>_<data>.html.
  5. VALIDA (obrigatorio):
       a) em-dash U+2014 = 0;
       b) roda os <script> inline no node com stubs de DOM/Chart/Leaflet;
          confirma LOAD sem erro e funcoes (render/setWin/setSeg) definidas;
       c) prova que o filtro funciona: setWin('jun') vs setWin('30d') mudam KPI e corpo;
       d) prova a FONTE UNICA: soma das praças+Geral dos cards (G) == soma das
          praças+Geral do consumo por segmento (H) == D.kpi[win].ALL.bruto (±0,5%).

Regra: dado real ou nada. build.py nao inventa numero; so move o D pro template.

==========================================================================
REGRA DE COLETA DE ADS (OBRIGATORIA , nao repetir o bug do ranking sem link)
==========================================================================
Toda coleta de ads para D.ads[win] DEVE incluir, por anuncio:
  - ad_id  (campo "ad"): sem ele o botao "Meta" e o fallback Ad Library
            nao funcionam e o ranking sai sem criativo real.
  - link de PREVIEW real (campo "link"): use preview_shareable_link
            (fb.me), obtido via detalhes_ad(ad_id) -> data.preview_shareable_link.
            O preview_shareable_link abre o anuncio mesmo pausado.
Estrategia eficiente: puxe get_insights level=ad (real, com ad_id) e, para os
anuncios que aparecem no RANKING (top volume + melhor/pior CPR + piores, por
janela ~ algumas dezenas por marca), busque o preview via detalhes_ad e grave
em data/_<marca>_links.json (ad_id -> fb.me). Os demais ficam com o fallback
Ad Library por ad_id (verLink no template garante que NUNCA fica vazio).
SEM ad_id + preview o dashboard fica inutilizavel para o envio diario.
"""
import sys, os, json, re, subprocess, tempfile, datetime

HERE = os.path.dirname(os.path.abspath(__file__))


def die(msg):
    print("\n[X] BUILD ABORTADO:", msg)
    sys.exit(1)


def load_ficha(path):
    if not os.path.isabs(path):
        path = os.path.join(HERE, path)
    if not os.path.exists(path):
        die("ficha nao encontrada: " + path)
    return json.load(open(path, encoding="utf-8")), path


# --- orçamento central (fonte única do budget de pacing) -------------------
MESES_PT = {1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
            7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez"}

# marca da ficha -> chave da marca no ORCAMENTO_MIDIA_CENTRAL.json
ORC_MAP = {
    "Bajaj": "BAJAJ", "Nissan": "NISSAN",
    "Chevrolet SP": "GM/ADELCO", "Chevrolet BSB": "GM BSB",
    "VW": "VW", "VW NV/SN": "VW", "VW VD/PV": "VW",
    "GWM": "GWM", "GAC": "GAC", "Omoda": "OMODA", "ZEEKR": "ZEEKR",
    "BLC": "BLC", "BLC Blindados": "BLC",
    "Ágil": "ÁGIL", "Agil": "ÁGIL", "Prevent": "PREVENT", "Frotas": "FROTAS",
    "Seminovos SP": "SEMINOVOS SP", "Carrera Veículos (Seminovos SP)": "SEMINOVOS SP",
    "Seminovos BSB": "SEMINOVOS BSB", "Carrera Veículos (Seminovos)": "SEMINOVOS SP",
}


def load_orcamento_central():
    """Le o orçamento de mídia central (META por marca/mês). Retorna None se ausente."""
    p = os.path.join(HERE, "ORCAMENTO_MIDIA_CENTRAL.json")  # porte nuvem: mora no dashs-motor/
    if not os.path.exists(p):
        p = os.path.join(HERE, "..", "ORCAMENTO_MIDIA_CENTRAL.json")
    if not os.path.exists(p):
        return None
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return None


def resolve_budget(ficha):
    """Budget do pacing = META do orçamento APROVADO (mês corrente), com fallback
       pro budget fixo da ficha. A ficha pode forçar 'orcamento_mes' ou 'orcamento_key'.

       IMPORTANTE: o central (ORCAMENTO_MIDIA_CENTRAL.json) guarda a META em valor
       LÍQUIDO (sem gross-up, ver 'observacao' do arquivo). O pacing/dashboard exibe
       BRUTO (bate com o orçamento da Carrera). Então a META do central é convertida
       pra bruto aqui: bruto = liquido * gross_up. O 'ficha.budget' (fallback manual)
       é usado como-está (assume-se que a ficha já traz bruto).
       Retorna (valor_bruto, origem)."""
    fallback = ficha.get("budget")
    gross = ficha.get("gross_up", 1.1215)
    # ficha pode travar o budget (bruto) e ignorar o central (ex.: marca ainda em mês
    # anterior cujo pacing não deve migrar). budget_fixo=true -> usa ficha.budget cru.
    if ficha.get("budget_fixo"):
        return fallback, "ficha.budget FIXO (bruto, central ignorado)"
    orc = load_orcamento_central()
    if not orc:
        return fallback, "ficha.budget (central ausente)"
    key = ficha.get("orcamento_key") or ORC_MAP.get(ficha.get("brand"))
    if not key or key not in orc.get("meta", {}):
        return fallback, "ficha.budget (marca sem chave no central)"
    mes = ficha.get("orcamento_mes") or MESES_PT[datetime.date.today().month]
    val = orc["meta"][key].get(mes)
    if val in (None, 0):
        return fallback, "ficha.budget (mes %s sem META no central)" % mes
    bruto = round(val, 2)  # decisao Rudy 06/jul: o valor da central JA e o orcamento bruto (efetivo), sem gross-up. Confirmado pelo gasto real de junho bater com o valor da planilha.
    return bruto, "orcamento META aprovado (%s/%s) = R$ %s bruto direto (sem gross-up)" % (key, mes, val)


def build_config(ficha):
    """Config que vai pra D.config , so o que o template le."""
    return {
        "brand": ficha.get("brand"),
        "subtitle": ficha.get("subtitle", "Acompanhamento Comercial"),
        "account_id": ficha.get("account_id"),
        "segments": ficha.get("segments", ["NV", "SN", "VD"]),
        "segnome": ficha.get("segnome", {}),
        "segshort": ficha.get("segshort", {}),
        "segsub": ficha.get("segsub", {}),
        "segcol": ficha.get("segcol", {}),
        "hasRegion": ficha.get("hasRegion", True),
        "regions": ficha.get("regions", ["SP", "VL", "INT"]),
        "regnome": ficha.get("regnome", {}),
        "regsub": ficha.get("regsub", {}),
        "regcol": ficha.get("regcol", {}),
        "lojas": ficha.get("lojas", {}),
        "channels": ficha.get("channels", ["Form", "WhatsApp"]),
        "channome": ficha.get("channome", {}),
        "budget": ficha.get("budget"),
        "gross_up": ficha.get("gross_up", 1.1215),
        "exceptions": ficha.get("exceptions", {}),
    }


def extract_block(tpl, start_marker, end_marker, label):
    """Extrai o trecho entre dois marcadores (inclusive marcadores) do template."""
    i = tpl.find(start_marker)
    j = tpl.find(end_marker)
    if i < 0 or j < 0 or j < i:
        die("nao achei o bloco '%s' no template (marcadores %s / %s)." % (label, start_marker, end_marker))
    return tpl[i:j + len(end_marker)]


def extract_nd_maio(tpl, D=None):
    """Retorna 'const ND_MAIO={...};' para injetar na one-page.
    Fonte unica: se o D da marca traz nd_maio, usa ele (por marca). Senao cai no
    literal do template (retrocompat Nissan). Marca sem nenhum dos dois -> ''."""
    if D is not None:
        # marca COM D manda: tem nd_maio -> usa; nao tem -> '' (comparativo de mes
        # fechado some). Nunca cair no literal do template, que e da Nissan.
        if isinstance(D.get("nd_maio"), dict) and D["nd_maio"].get("total"):
            return "const ND_MAIO=" + json.dumps(D["nd_maio"], ensure_ascii=False) + ";"
        return ""
    m = re.search(r"const\s+ND_MAIO\s*=\s*(?:\(.*?:\s*)?(\{.*?\})\s*;", tpl, re.S)
    if m:
        return "const ND_MAIO=" + m.group(1) + ";"
    return ""


def build_resumo(tpl, D, d_json, slug, today):
    """Gera a one-page executiva a partir de template_resumo.html, reaproveitando
       o ENGINE insights() e a const ND_MAIO extraidos do template.html (fonte unica)."""
    rtpl_path = os.path.join(HERE, "template_resumo.html")
    if not os.path.exists(rtpl_path):
        die("template_resumo.html ausente.")
    rtpl = open(rtpl_path, encoding="utf-8").read()
    for mk in ("/*__D_INJECT__*/", "/*__ENGINE_INJECT__*/", "/*__ND_INJECT__*/"):
        if mk not in rtpl:
            die("marcador %s ausente em template_resumo.html." % mk)

    engine = extract_block(tpl, "// /*__ENGINE_START__*/", "// /*__ENGINE_END__*/", "ENGINE insights")
    nd_maio = extract_nd_maio(tpl, D)  # '' se a marca nao tiver ND_MAIO (comparativos somem, nao quebra)

    rhtml = rtpl.replace("/*__ENGINE_INJECT__*/", engine, 1)
    rhtml = rhtml.replace("/*__ND_INJECT__*/", nd_maio, 1)
    rhtml = rhtml.replace("/*__D_INJECT__*/{}", d_json, 1)

    out_name = "%s_resumo_%s.html" % (slug, today)
    out_path = os.path.join(HERE, "dist", out_name)
    open(out_path, "w", encoding="utf-8").write(rhtml)
    print("[*] gerado:", out_path, "(%d chars)" % len(rhtml))
    return out_path


def validate_resumo(out_path):
    """Valida a one-page: em-dash=0, carrega no node sem erro, e renderiza os 4 big
       numbers + comparativos + os bullets do engine (resumo e melhorias)."""
    print("\n=============== VALIDACAO ONE-PAGE ===============")
    html = open(out_path, encoding="utf-8").read()
    ok = True
    n_em = html.count("—")
    print("[R1] em-dash U+2014:", n_em, "->", "OK" if n_em == 0 else "FALHA")
    if n_em:
        ok = False

    scripts = []
    for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S):
        scripts.append(m.group(1))
    bundle = "\n;\n".join(scripts)

    harness = r"""
'use strict';
const CAP={};
const elements={};
function elFor(id){
  if(!elements[id]){
    const o={_id:id,style:{},dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false;}},
      appendChild(){},setAttribute(){},addEventListener(){}};
    Object.defineProperty(o,'innerHTML',{get(){return CAP[id]||"";},set(v){CAP[id]=v;}});
    Object.defineProperty(o,'textContent',{get(){return CAP['_t_'+id]||"";},set(v){CAP['_t_'+id]=v;}});
    elements[id]=o;
  }
  return elements[id];
}
const document={getElementById:(id)=>elFor(id),querySelector:()=>elFor('qs'),querySelectorAll:()=>[],
  addEventListener:()=>{},readyState:'complete',createElement:()=>elFor('el'),body:elFor('body')};
const navigator={language:'pt-BR'};
__BUNDLE__
// inspeciona o que foi renderizado
const out={
  bignums: CAP['bignums']||"",
  resumo: CAP['resumoList']||"",
  melhorias: CAP['melhoriasList']||"",
  pacing: CAP['pacingline']||"",
  funcs:{insights:(typeof insights==='function'), renderResumo:(typeof renderResumo==='function')}
};
out.bn_count=(out.bignums.match(/class=\"bn\"/g)||[]).length;
out.cmp_count=(out.bignums.match(/vs [a-zçãéêíóõúâ]+/gi)||[]).length;
out.resumo_count=(out.resumo.match(/insbullet/g)||[]).length;
out.melhorias_count=(out.melhorias.match(/insbullet/g)||[]).length;
console.log("@@R@@"+JSON.stringify(out));
"""
    harness = harness.replace("__BUNDLE__", bundle)
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(harness)
        hp = f.name
    try:
        proc = subprocess.run(["node", hp], capture_output=True, text=True, timeout=60)
    except Exception as e:
        print("[R2] harness: erro ao rodar node:", e)
        return False
    finally:
        try:
            os.unlink(hp)
        except OSError:
            pass
    if proc.returncode != 0:
        print("[R2] LOAD: FALHA (node retornou erro)")
        print(proc.stderr[-3000:])
        return False
    m = re.search(r"@@R@@(\{.*\})", proc.stdout)
    if not m:
        print("[R2] sem RESULT no stdout -> FALHA")
        print(proc.stdout[-1500:], proc.stderr[-1500:])
        return False
    R = json.loads(m.group(1))
    print("[R2] LOAD node sem erro: OK | funcoes:", R["funcs"])
    if not (R["funcs"].get("insights") and R["funcs"].get("renderResumo")):
        ok = False
    print("[R3] big numbers renderizados:", R["bn_count"], "->", "OK" if R["bn_count"] == 4 else "FALHA")
    if R["bn_count"] != 4:
        ok = False
    print("[R4] comparativos vs maio nos big numbers:", R["cmp_count"], "->", "OK" if R["cmp_count"] >= 1 else "FALHA")
    if R["cmp_count"] < 1:
        ok = False
    print("[R5] bullets resumo:", R["resumo_count"], "| bullets melhorias:", R["melhorias_count"],
          "->", "OK" if (R["resumo_count"] >= 1 and R["melhorias_count"] >= 1) else "FALHA")
    if not (R["resumo_count"] >= 1 and R["melhorias_count"] >= 1):
        ok = False
    print("    ->", "OK" if ok else "FALHA")
    return ok


def main():
    if len(sys.argv) < 2:
        die("uso: python3 build.py fichas/<marca>.json")
    ficha, ficha_path = load_ficha(sys.argv[1])
    brand = ficha.get("brand", "marca")
    slug = re.sub(r"[^a-z0-9]+", "_", brand.lower()).strip("_")

    # --- dados de entrada ---
    data_file = ficha.get("data_file")
    if not os.path.isabs(data_file):
        data_file = os.path.join(HERE, data_file)
    if not os.path.exists(data_file):
        die("data_file nao encontrado: " + data_file)
    D = json.load(open(data_file, encoding="utf-8"))

    # --- budget do pacing = META do orçamento APROVADO (mês corrente) ---
    budget_val, budget_src = resolve_budget(ficha)
    ficha["budget"] = budget_val
    print("[*] budget pacing:", budget_val, "| fonte:", budget_src)

    # --- injeta config da ficha em D.config ---
    D["config"] = build_config(ficha)
    # carimbo de HORA da atualização (BRT) — o template mostra junto da data
    try:
        from zoneinfo import ZoneInfo
        D["gerado_hora"] = datetime.datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%H:%M")
    except Exception:
        D["gerado_hora"] = (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).strftime("%H:%M")
    # garante pacing.budget coerente com a ficha (sem inventar, so reflete o briefing)
    if ficha.get("budget") and isinstance(D.get("pacing"), dict):
        D["pacing"]["budget"] = ficha["budget"]

    # --- template ---
    tpl_path = os.path.join(HERE, "template.html")
    if not os.path.exists(tpl_path):
        die("template.html ausente. Rode _make_template.py primeiro.")
    tpl = open(tpl_path, encoding="utf-8").read()
    if "/*__D_INJECT__*/" not in tpl:
        die("marcador /*__D_INJECT__*/ ausente no template.")

    d_json = json.dumps(D, ensure_ascii=False, separators=(",", ":"))
    # injeta o objeto literal no lugar do marcador (substitui o {} placeholder logo apos)
    html = tpl.replace("/*__D_INJECT__*/{}", d_json, 1)

    # --- escreve dist (dash completo) ---
    today = datetime.date.today().isoformat()
    out_name = "%s_%s.html" % (slug, today)
    out_path = os.path.join(HERE, "dist", out_name)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    open(out_path, "w", encoding="utf-8").write(html)
    print("[*] gerado:", out_path, "(%d chars)" % len(html))

    # --- escreve dist (one-page executiva) , reaproveita o ENGINE e ND do template ---
    resumo_path = build_resumo(tpl, D, d_json, slug, today)

    # ============================ VALIDACAO ============================
    print("\n==================== VALIDACAO ====================")
    ok = True

    # 1) em-dash
    n_em = html.count("—")
    print("[1] em-dash U+2014:", n_em, "->", "OK" if n_em == 0 else "FALHA")
    if n_em:
        ok = False

    # 2/3/4) harness node (dash completo)
    harness_report = run_node_harness(html, D)
    ok = ok and harness_report

    # R) validacao da one-page executiva
    ok = validate_resumo(resumo_path) and ok

    print("\n==================================================")
    if ok:
        print("[OK] BUILD VALIDO")
        print("     completo:", out_path)
        print("     one-page:", resumo_path)
    else:
        die("validacao falhou (ver acima).")
    return out_path


# ---------------------------------------------------------------------------
# Harness node: extrai os <script> inline, stub de DOM/Chart/Leaflet,
# roda render(), toggla janelas, e checa a FONTE UNICA.
# ---------------------------------------------------------------------------
def run_node_harness(html, D):
    # extrai todos os <script> SEM src (inline)
    scripts = []
    for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S):
        scripts.append(m.group(1))
    if not scripts:
        print("[2] harness: nenhum script inline encontrado -> FALHA")
        return False

    bundle = "\n;\n".join(scripts)

    harness = r"""
'use strict';
// ---- stubs de ambiente browser ----
function makeProxy(name){
  const store = { innerHTML:"", textContent:"", style:{}, dataset:{}, classList:{toggle(){},add(){},remove(){},contains(){return false;}},
    value:"", checked:false };
  return new Proxy(function(){}, {
    get(t,p){
      if(p in store) return store[p];
      if(p==='length') return 0;
      if(p==='forEach') return function(){};
      if(p==='map') return function(){return [];};
      if(p==='filter') return function(){return [];};
      if(p===Symbol.iterator) return function*(){};
      if(p==='appendChild'||p==='setAttribute'||p==='addEventListener'||p==='removeChild'||p==='remove'||p==='setView'||p==='addTo'||p==='bindPopup'||p==='fitBounds'||p==='update') return function(){return makeProxy(name+'.'+String(p));};
      if(p==='getContext') return function(){return makeProxy('ctx');};
      return makeProxy(name+'.'+String(p));
    },
    set(t,p,v){ store[p]=v; return true; },
    apply(){ return makeProxy(name+'()'); }
  });
}
// captura innerHTML por id (pra inspecionar kpiz/body)
const CAP = {};
const elements = {};
function elFor(id){
  if(!elements[id]){
    const o = { _id:id, style:{}, dataset:{}, classList:{toggle(){},add(){},remove(){},contains(){return false;}},
      appendChild(){}, setAttribute(){}, addEventListener(){}, getContext(){return makeProxy('ctx');},
      querySelector(){return elFor(id+' q');}, querySelectorAll(){return [];} };
    Object.defineProperty(o,'innerHTML',{get(){return CAP[id]||"";},set(v){CAP[id]=v;}});
    Object.defineProperty(o,'textContent',{get(){return CAP['_txt_'+id]||"";},set(v){CAP['_txt_'+id]=v;}});
    elements[id]=o;
  }
  return elements[id];
}
const document = {
  getElementById:(id)=>elFor(id),
  querySelector:()=>elFor('qs'),
  querySelectorAll:()=>[],
  addEventListener:(ev,fn)=>{ if(ev==='DOMContentLoaded'){ /* nao auto-dispara: chamamos manual */ } },
  readyState:'complete',
  createElement:()=>makeProxy('el'),
  body: elFor('body')
};
const window = { addEventListener:(ev,fn)=>{ if(ev==='DOMContentLoaded') window.__dcl=fn; }, };
window.document = document;
const L = { map:()=>makeProxy('map'), tileLayer:()=>makeProxy('tile'), circle:()=>makeProxy('circle') };
function Chart(){ return makeProxy('chart'); }
Chart.register = function(){};
const navigator = { language:'pt-BR' };
// Number toLocaleString ja existe no node.

// ---- bundle do dashboard ----
__BUNDLE__
// ---- runtime de teste ----
const RESULT = { funcs:{}, };
RESULT.funcs.render = (typeof render==='function');
RESULT.funcs.setWin = (typeof setWin==='function');
RESULT.funcs.setSeg = (typeof setSeg==='function');
RESULT.funcs.aggRegion = (typeof aggRegion==='function');

// dispara o ciclo de vida real (DOMContentLoaded handler = buildFilters+render)
if(window.__dcl) window.__dcl();

function snapshot(){ return { kpiz: CAP['kpiz']||"", body: CAP['body']||"" }; }

// (3) toggle de janela usando as funcoes REAIS
setWin('jun');
const jun = snapshot();
setWin('30d');
const d30 = snapshot();
RESULT.toggle = {
  kpiz_changed: jun.kpiz !== d30.kpiz,
  body_changed: jun.body !== d30.body,
  jun_kpiz_len: jun.kpiz.length, d30_kpiz_len: d30.kpiz.length,
  jun_body_len: jun.body.length, d30_body_len: d30.body.length
};

// (4) FONTE UNICA: para cada janela, soma G (cards) e H (consumo por seg) via aggRegion,
//     e compara com D.kpi[win].ALL.bruto.
function sumAgg(A){ return NREG_ORDER.reduce((s,r)=>s+(A[r]?A[r].spend:0),0); }
RESULT.fonteUnica = {};
['jun','30d'].forEach(win=>{
  // G: aggRegion(win, 'ALL') , exatamente o que regionSection usa (SEG=ALL)
  const G = aggRegion(win, 'ALL');
  const somaG = sumAgg(G);
  // H: soma, por segmento, de aggRegion(win, seg) , exatamente o que a secao H monta
  let somaH = 0; const perReg = {};
  NREG_ORDER.forEach(r=>perReg[r]=0);
  SEGMENTS.forEach(seg=>{
    const A = aggRegion(win, seg);
    NREG_ORDER.forEach(r=>{ perReg[r]+=A[r].spend; somaH+=A[r].spend; });
  });
  const total = (D.kpi[win] && D.kpi[win].ALL ? D.kpi[win].ALL.bruto : 0);
  RESULT.fonteUnica[win] = {
    perReg_G: Object.fromEntries(NREG_ORDER.map(r=>[r, Math.round(G[r].spend)])),
    perReg_H: Object.fromEntries(NREG_ORDER.map(r=>[r, Math.round(perReg[r])])),
    somaG: Math.round(somaG), somaH: Math.round(somaH), kpiALL: Math.round(total),
    diffGvsH_pct: somaH? +(((somaG/somaH)-1)*100).toFixed(3) : null,
    diffGvsTotal_pct: total? +(((somaG/total)-1)*100).toFixed(3) : null,
    diffHvsTotal_pct: total? +(((somaH/total)-1)*100).toFixed(3) : null
  };
});

console.log("@@RESULT@@"+JSON.stringify(RESULT));
"""
    harness = harness.replace("__BUNDLE__", bundle)

    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(harness)
        hp = f.name

    try:
        proc = subprocess.run(["node", hp], capture_output=True, text=True, timeout=60)
    except Exception as e:
        print("[2] harness: erro ao rodar node:", e)
        return False
    finally:
        try:
            os.unlink(hp)
        except OSError:
            pass

    if proc.returncode != 0:
        print("[2] harness LOAD: FALHA (node retornou erro)")
        print("---- stderr ----")
        print(proc.stderr[-3000:])
        return False

    m = re.search(r"@@RESULT@@(\{.*\})", proc.stdout)
    if not m:
        print("[2] harness: sem RESULT no stdout -> FALHA")
        print(proc.stdout[-2000:])
        print(proc.stderr[-2000:])
        return False
    R = json.loads(m.group(1))

    ok = True
    # 2) load + funcoes
    fns = R["funcs"]
    miss = [k for k, v in fns.items() if not v]
    print("[2] LOAD node sem erro: OK")
    print("    funcoes definidas:", ", ".join("%s=%s" % (k, "OK" if v else "FALTA") for k, v in fns.items()))
    if miss:
        print("    -> FALHA, faltam:", miss)
        ok = False

    # 3) toggle
    t = R["toggle"]
    tok = t["kpiz_changed"] and t["body_changed"]
    print("[3] TOGGLE janela (setWin jun vs 30d):")
    print("    kpiz muda: %s (len jun=%d, 30d=%d)" % (t["kpiz_changed"], t["jun_kpiz_len"], t["d30_kpiz_len"]))
    print("    body muda: %s (len jun=%d, 30d=%d)" % (t["body_changed"], t["jun_body_len"], t["d30_body_len"]))
    print("    ->", "OK" if tok else "FALHA")
    if not tok:
        ok = False

    # 4) fonte unica
    print("[4] FONTE UNICA (G cards == H consumo/seg == D.kpi[win].ALL.bruto):")
    fu_ok = True
    for win, f in R["fonteUnica"].items():
        print("    --- janela %s ---" % win)
        print("      G por praça:", f["perReg_G"])
        print("      H por praça:", f["perReg_H"])
        print("      somaG=%d  somaH=%d  D.kpi.%s.ALL.bruto=%d" % (f["somaG"], f["somaH"], win, f["kpiALL"]))
        print("      diff G vs H = %.3f%% | G vs total = %.3f%% | H vs total = %.3f%%"
              % (f["diffGvsH_pct"] or 0, f["diffGvsTotal_pct"] or 0, f["diffHvsTotal_pct"] or 0))
        for key in ("diffGvsH_pct", "diffGvsTotal_pct", "diffHvsTotal_pct"):
            if f[key] is None or abs(f[key]) > 0.5:
                fu_ok = False
    print("    ->", "OK (todas dentro de ±0,5%)" if fu_ok else "FALHA (>0,5%)")
    if not fu_ok:
        ok = False

    return ok


if __name__ == "__main__":
    main()
