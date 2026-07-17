#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""run_daily.py , ciclo diário completo dos dashboards Meta Ads na nuvem.

Por marca: harvest via meta_api (adset 2 janelas, ad-level + links, série diária
com regra dos 3 dias fechados, verba, atividades) -> data/_<slug>_*.json ->
<slug>_D.json (assemble genérico ou bespoke) -> build.py fichas/<slug>.json
(valida rodando o JS) -> dist/. No fim: build_central.py + publish_site.py --repo
(escreve client/public/, o commit fica por conta do workflow).

Uso:
  META_TOKEN=... python3 run_daily.py                # todas as marcas
  META_TOKEN=... python3 run_daily.py vw bajaj       # subconjunto
  ... --no-publish                                   # só gera dist/

Falha de UMA marca não derruba o ciclo: a marca fica com o dash do dia anterior
(client/public/<slug>/ não é sobrescrito) e o erro sai no resumo + exit code 1.
"""
import os, sys, subprocess, importlib, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)  # data/, fichas/, dist/ são relativos ao motor
sys.path.insert(0, HERE)

import meta_api as api
import common

BRANDS = ["nissan", "bajaj", "chevrolet_sp", "chevrolet_bsb", "omoda",
          "seminovos_sp", "gac", "gwm", "vw"]

# slugs cujo D.json sai do assemble genérico (_assemble_brand.py)
GENERIC_ASSEMBLE = {"gac", "gwm", "vw"}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.stdout.strip():
        print(r.stdout.strip())
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} falhou:\n{r.stderr.strip()[-2000:]}")
    return r


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    publish = "--no-publish" not in sys.argv
    slugs = args or BRANDS
    ctx = common.make_ctx()
    print(f"== run_daily {ctx['iso']} | mtd {ctx['mtd'][0]}..{ctx['mtd'][1]} | "
          f"30d {ctx['d30'][0]}..{ctx['d30'][1]} | repull {ctx['closed_days']} ==")
    ok, fail = [], {}
    for slug in slugs:
        print(f"\n--- {slug} ---")
        try:
            mod = importlib.import_module(f"brands.{slug}")
            mod.refresh(api, ctx)
            if getattr(mod, "GENERIC", slug in GENERIC_ASSEMBLE):
                run([sys.executable, "_assemble_brand.py", slug])
            run([sys.executable, "build.py", f"fichas/{slug}.json"])
            ok.append(slug)
        except Exception:
            fail[slug] = traceback.format_exc()[-1500:]
            print(f"[X] {slug} FALHOU (dash do dia anterior é mantido)")
    if ok:
        try:
            run([sys.executable, "build_central.py"])
        except Exception:
            fail["central"] = traceback.format_exc()[-1500:]
        if publish:
            run([sys.executable, "publish_site.py", "--repo", os.path.join(HERE, "..")])
    print(f"\n== RESUMO: ok={ok} fail={sorted(fail)} ==")
    for slug, tb in fail.items():
        print(f"\n[X] {slug}:\n{tb}")
    # registro do run (vai commitado no cofre; o workflow marca o run como falho
    # DEPOIS do deploy se fail não estiver vazio)
    import json, datetime
    common.jdump("_last_run.json", {
        "quando": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ok": ok, "fail": {s: tb.splitlines()[-1] if tb else "" for s, tb in fail.items()},
    }, indent=1)
    # falha parcial ainda publica o que passou; só falha TOTAL derruba o job aqui
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
