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
          f"30d {ctx['d30'][0]}..{ctx['d30'][1]} | "
          f"mom mesmo periodo {ctx['mom_sp'][0]}..{ctx['mom_sp'][1]} ({ctx['mom_sp_dias']}d) | "
          f"repull {ctx['closed_days']} ==")
    def poda_dias_futuros(slug):
        """Remove da serie diaria do <slug>_D.json qualquer dia POSTERIOR a hoje.

        Motivo (22/jul): ate 21/jul o job da nuvem rodava em UTC, entao os runs entre 21h e
        meia-noite BRT gravavam uma linha com a data de amanha. Com o job em BRT o merge de
        cada marca bate no assert 'n_daily tem que terminar hoje' e a marca falha. A poda
        limpa o residuo e, de quebra, deixa o ciclo imune a qualquer descompasso de relogio.
        """
        p = os.path.join(HERE, "data", f"{slug}_D.json")
        if not os.path.exists(p):
            return
        import json
        D = json.load(open(p, encoding="utf-8"))
        nd = D.get("n_daily")
        if not isinstance(nd, list):
            return
        limpo = [r for r in nd if r.get("date", "") <= ctx["iso"]]
        if len(limpo) != len(nd):
            futuros = [r.get("date") for r in nd if r.get("date", "") > ctx["iso"]]
            D["n_daily"] = limpo
            json.dump(D, open(p, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"[poda] {slug}: removido(s) dia(s) no futuro {futuros} (hoje={ctx['iso']})")

    def process(slug):
        try:
            mod = importlib.import_module(f"brands.{slug}")
            poda_dias_futuros(slug)
            mod.refresh(api, ctx)
            if getattr(mod, "GENERIC", slug in GENERIC_ASSEMBLE):
                run([sys.executable, "_assemble_brand.py", slug])
            run([sys.executable, "build.py", f"fichas/{slug}.json"])
            return None
        except Exception:
            return traceback.format_exc()[-1500:]

    ok, fail = [], {}
    for slug in slugs:
        print(f"\n--- {slug} ---")
        tb = process(slug)
        if tb is None:
            ok.append(slug)
        else:
            fail[slug] = tb
            print(f"[X] {slug} FALHOU (retry no fim do ciclo)")
    # transientes da Meta (rate limit/5xx) costumam passar em minutos:
    # segunda chance NO MESMO run pras marcas que falharam
    if fail:
        import time
        print(f"\n== RETRY em 150s: {sorted(fail)} ==")
        time.sleep(150)
        for slug in sorted(fail):
            print(f"\n--- retry {slug} ---")
            tb = process(slug)
            if tb is None:
                ok.append(slug); fail.pop(slug)
                print(f"[OK] {slug} recuperou no retry")
            else:
                fail[slug] = tb
                print(f"[X] {slug} falhou de novo (dash anterior é mantido)")
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
