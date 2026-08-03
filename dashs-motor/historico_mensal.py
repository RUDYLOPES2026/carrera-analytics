#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""historico_mensal.py , memória de meses fechados por marca.

Problema que isso resolve: o motor só carrega o mês corrente e o mês anterior. Quando
o mês virava, o mês retrasado sumia, e o bloco `nd_maio` (comparativo publicado)
ficava parado com o número do mês velho embaixo do rótulo do mês novo. Foi o que
aconteceu na virada de agosto/2026: a central comparava agosto com JUNHO chamando de
julho (Omoda R$ 62.440 = junho, quando julho fechou R$ 91.487).

A fonte da verdade aqui é o bloco `nd_mom_full` de cada <slug>_D.json: mês anterior
INTEIRO, repuxado da API a cada refresh, com a regra de contagem da própria marca.
Todo ciclo grava esse mês fechado no arquivo. Custo zero de API: o dado já vem.

Formato (data/_historico_mensal.json):
    {"atualizado": "2026-08-03",
     "marcas": {"omoda": {"2026-07": {"bruto":..,"leads":..,"conv":..,"res":..,
                                      "cpl":..,"desde":..,"ate":..,"dias":31}}}}

cpl guardado em BRUTO (é o que o _tot_rows do common.py devolve); quem quiser líquido
divide por TAX na hora de exibir, como a central faz.
"""
import os, json, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
HIST_PATH = os.path.join(HERE, "data", "_historico_mensal.json")


def carregar(path=HIST_PATH):
    if not os.path.exists(path):
        return {"atualizado": None, "marcas": {}}
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception:
        return {"atualizado": None, "marcas": {}}
    d.setdefault("marcas", {})
    return d


def salvar(h, path=HIST_PATH):
    h["atualizado"] = datetime.date.today().isoformat()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)


def _mes_fechado(bloco):
    """Valida o nd_mom_full: só serve se cobrir um mês inteiro e já ter terminado.
    Devolve (ym, dados) ou (None, None)."""
    if not isinstance(bloco, dict):
        return None, None
    tot = bloco.get("total") or {}
    desde, ate = bloco.get("desde"), bloco.get("ate")
    if not (desde and ate and tot):
        return None, None
    try:
        d1 = datetime.date.fromisoformat(desde)
        d2 = datetime.date.fromisoformat(ate)
    except Exception:
        return None, None
    if d1.day != 1 or d1.year != d2.year or d1.month != d2.month:
        return None, None          # janela quebrada, não é mês cheio
    ultimo = (d2.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1)
    if d2 != ultimo or d2 >= datetime.date.today():
        return None, None          # mês ainda não fechou
    dados = {"bruto": round(float(tot.get("bruto", 0) or 0), 2),
             "leads": int(tot.get("leads", 0) or 0),
             "conv": int(tot.get("conv", 0) or 0),
             "desde": desde, "ate": ate, "dias": d2.day}
    dados["res"] = dados["leads"] + dados["conv"]
    dados["cpl"] = round(dados["bruto"] / dados["res"], 2) if dados["res"] else 0
    if dados["bruto"] <= 0 and not dados["res"]:
        return None, None
    return f"{d1.year:04d}-{d1.month:02d}", dados


def registrar(h, slug, D, sobrescrever=False):
    """Grava no histórico o mês fechado que o <slug>_D.json carrega (nd_mom_full).
    Devolve o ym gravado ou None. Por padrão não sobrescreve mês já guardado: o
    primeiro registro (feito no dia 1, com o mês recém-fechado) é o bom."""
    ym, dados = _mes_fechado(D.get("nd_mom_full"))
    if not ym:
        return None
    m = h["marcas"].setdefault(slug, {})
    if ym in m and not sobrescrever:
        return None
    m[ym] = dados
    return ym


def meses_de(h, slug):
    """Meses fechados da marca, do mais novo para o mais velho."""
    return sorted(h.get("marcas", {}).get(slug, {}).keys(), reverse=True)


def get(h, slug, ym):
    return (h.get("marcas", {}).get(slug) or {}).get(ym)
