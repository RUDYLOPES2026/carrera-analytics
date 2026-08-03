#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""backfill_historico.py , reconstrói o histórico mensal a partir do git.

Rodar UMA vez (ou de novo, sem medo: é idempotente). Cada commit dos <slug>_D.json
carrega o bloco `nd_mom_full` = mês anterior inteiro do dia daquele commit. Varrendo o
histórico do repositório dá pra recuperar os meses que o motor já jogou fora , em
agosto/2026 isso recupera junho (os commits começam em 16/07).

Para cada mês, vale o commit MAIS NOVO que ainda reportava aquele mês: é o dado mais
assentado (a Meta ainda mexe em gasto/conversa alguns dias depois).

Uso:
    python3 backfill_historico.py            # grava data/_historico_mensal.json
    python3 backfill_historico.py --dry-run  # só mostra o que acharia
"""
import os, sys, json, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import historico_mensal as hm

BRANDS = ["nissan", "bajaj", "chevrolet_sp", "chevrolet_bsb", "omoda",
          "seminovos_sp", "gac", "gwm", "vw"]


def git(*args):
    r = subprocess.run(["git", "-C", REPO] + list(args),
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    return r.stdout


def commits_do(slug):
    """Commits que tocaram o _D.json da marca, do mais NOVO para o mais velho."""
    rel = f"dashs-motor/data/{slug}_D.json"
    out = git("log", "--follow", "--format=%H %ad", "--date=short", "--", rel)
    if not out:
        return []
    return [ln.split(" ", 1) for ln in out.strip().splitlines() if ln.strip()]


def main():
    dry = "--dry-run" in sys.argv
    h = hm.carregar()
    achados = 0
    for slug in BRANDS:
        rel = f"dashs-motor/data/{slug}_D.json"
        vistos = {}   # ym -> (data do commit, dados)   , primeiro visto = commit mais novo
        for sha, data in commits_do(slug):
            blob = git("show", f"{sha}:{rel}")
            if not blob:
                continue
            try:
                D = json.loads(blob)
            except Exception:
                continue
            ym, dados = hm._mes_fechado(D.get("nd_mom_full"))
            if ym and ym not in vistos:
                vistos[ym] = (data, dados)
        m = h["marcas"].setdefault(slug, {})
        for ym, (data, dados) in sorted(vistos.items()):
            if ym in m:
                print(f"  {slug:14s} {ym}  já no histórico, mantido")
                continue
            m[ym] = dados
            achados += 1
            print(f"  {slug:14s} {ym}  R$ {dados['bruto']:>12,.2f}  "
                  f"{dados['leads']:>6} leads  {dados['conv']:>6} conversas   (commit de {data})")
    if dry:
        print(f"\n[dry-run] {achados} meses seriam gravados")
        return
    hm.salvar(h)
    print(f"\n[OK] {achados} meses novos , {hm.HIST_PATH}")


if __name__ == "__main__":
    main()
