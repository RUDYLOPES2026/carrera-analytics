#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""validate_central.py , roda o JS da central no node e confere o que ela desenha.

`node --check` só pega erro de sintaxe. O que quebra de verdade nesses dashs é falha
silenciosa em tempo de execução (tabela vazia, seletor que não troca nada, comparativo
sem base). Aqui o HTML é carregado num harness com document/Chart falsos, e depois o
clique de CADA mês do seletor é disparado de propósito.

Uso: python3 validate_central.py [caminho.html]   (default: dist/central_<hoje>.html)
"""
import os, re, sys, json, glob, subprocess, datetime

HERE = os.path.dirname(os.path.abspath(__file__))

HARNESS = r"""
'use strict';
const CAP = {};            // innerHTML/textContent por id
const LISTENERS = {};      // id -> [fn]
const CHARTS = [];         // {id, labels, datasets}
function node(id){
  const o = {_id:id, style:{}, dataset:{},
    classList:{_s:new Set(), toggle(c,v){ v?this._s.add(c):this._s.delete(c); },
               add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
               contains(c){return this._s.has(c);}},
    appendChild(){}, setAttribute(){}, getContext(){return {};},
    addEventListener(ev,fn){ (LISTENERS[id]=LISTENERS[id]||[]).push(fn); },
    closest(){ return o; }};
  Object.defineProperty(o,'innerHTML',{get(){return CAP[id]||"";},set(v){CAP[id]=v;}});
  Object.defineProperty(o,'textContent',{get(){return CAP['_t_'+id]||"";},set(v){CAP['_t_'+id]=v;}});
  return o;
}
const EL = {};
const el = id => (EL[id] = EL[id] || node(id));
global.document = {
  getElementById: el,
  querySelectorAll(sel){
    // só o seletor de meses precisa disso
    if(sel.indexOf("#seletor") === 0){
      return (global.__MESES__ || []).map(m => { const n = node("seg_"+m.key); n.dataset.k = m.key; return n; });
    }
    return [];
  },
  addEventListener(){},
};
global.window = global;
global.Chart = class {
  constructor(ctx, cfg){ this.cfg = cfg; CHARTS.push({id: ctx && ctx._id, cfg}); }
  destroy(){}
};
global.Chart.defaults = {color:"", font:{}, plugins:{}};
"""

FOOTER = r"""
// dispara o clique de cada mês do seletor e guarda o que a tela virou
const SNAP = {};
function snap(k){
  SNAP[k] = {kpis: CAP["kpis"]||"", tbl: CAP["tbl"]||"", segsub: CAP["segsub"]||"",
             tblh: CAP["tblh"]||"", nota: CAP["notaFechado"]||"",
             momt: CAP["_t_momt"]||"", charts: CHARTS.length};
}
snap("atual");
for(const m of (global.__MESES__||[])){
  if(m.key === "atual") continue;
  const fn = (LISTENERS["seletor"]||[])[0];
  if(!fn){ throw new Error("seletor sem listener de clique"); }
  const alvo = node("seg_"+m.key); alvo.dataset.k = m.key;
  fn({target:{closest:()=>alvo}});
  snap(m.key);
}
console.log("__SNAP__" + JSON.stringify(SNAP));
"""


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        cands = sorted(glob.glob(os.path.join(HERE, "dist", "central_*.html")))
        if not cands:
            print("[FALHA] nenhum dist/central_*.html"); return 1
        path = cands[-1]
    html = open(path, encoding="utf-8").read()
    print("=============== VALIDACAO CENTRAL ===============")
    print("[..]", os.path.basename(path), f"({len(html)} chars)")
    ok = True

    n_em = html.count("—")
    print("[R1] em-dash U+2014:", n_em, "->", "OK" if n_em == 0 else "FALHA")
    ok = ok and n_em == 0

    scripts = [m.group(1) for m in
               re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)]
    if not scripts:
        print("[R2] script inline: FALHA (nenhum)"); return 1
    # os meses precisam existir ANTES do bundle (o querySelectorAll do harness usa)
    mm = re.search(r'"meses":\s*(\[.*?\])', scripts[0], re.S)
    meses = json.loads(mm.group(1)) if mm else []
    bundle = (HARNESS + f"\nglobal.__MESES__ = {json.dumps(meses)};\n"
              + "\n;\n".join(scripts) + FOOTER)
    tmp = os.path.join(HERE, "dist", "_central_check.js")
    open(tmp, "w", encoding="utf-8").write(bundle)
    r = subprocess.run(["node", tmp], capture_output=True, text=True)
    if r.returncode != 0:
        print("[R2] executa no node: FALHA\n", r.stderr.strip()[-1500:]); return 1
    print("[R2] executa no node: OK")
    os.remove(tmp)

    snap = {}
    for ln in r.stdout.splitlines():
        if ln.startswith("__SNAP__"):
            snap = json.loads(ln[len("__SNAP__"):])
    print("[R3] meses no seletor:", ", ".join(m["tag"] for m in meses),
          "->", "OK" if len(meses) >= 2 else "FALHA (só o mês corrente)")
    ok = ok and len(meses) >= 2

    for m in meses:
        k = m["key"]; s = snap.get(k)
        if not s:
            print(f"[R4] {k}: FALHA (não renderizou)"); ok = False; continue
        linhas = s["tbl"].count("<tr>")
        setas = s["tbl"].count("▲") + s["tbl"].count("▼")
        grupo = "Grupo" in s["tbl"]
        semb = s["tbl"].count("sem base")
        bad = (linhas < 5) or (not grupo)
        print(f"[R4] {m['tag']:<16} linhas={linhas:<3} setas={setas:<4} total_grupo={'sim' if grupo else 'NAO'}"
              f" sem_base={semb} -> {'OK' if not bad else 'FALHA'}")
        ok = ok and not bad
        print(f"     periodo: {re.sub('<[^>]+>', '', s['segsub'])[:150]}")

    # o mês corrente tem que manter pacing/projeção; o fechado, não
    at = snap.get("atual", {})
    tem_pacing = "Vai pagar" in at.get("tbl", "")
    print("[R5] mês corrente mantém 'Vai pagar'/pacing:", "OK" if tem_pacing else "FALHA")
    ok = ok and tem_pacing
    fechados = [m["key"] for m in meses if m["key"] != "atual"]
    if fechados:
        f0 = snap.get(fechados[0], {})
        limpo = "Vai pagar" not in f0.get("tbl", "") and "fechado" in f0.get("nota", "")
        print("[R6] mês fechado esconde projeção e explica o porquê:", "OK" if limpo else "FALHA")
        ok = ok and limpo
    print("=============== " + ("TUDO OK" if ok else "TEM FALHA") + " ===============")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
