#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""backfill_cells.py , preenche as CELULAS de filtro no histórico já publicado.

As células ([seg, praça, canal, gasto líquido, leads, conversas]) são o que faz os
filtros do topo (segmento / praça / canal) valerem no gráfico de evolução diária e no
comparativo com o mês anterior. O refresh diário só repuxa D-3..hoje, então sem esse
backfill os ~26 dias antigos da série ficariam zerados quando alguém filtrasse.

Roda uma vez (ou depois da virada de mês, se quiser recompor a cauda):
    META_TOKEN=... python3 backfill_cells.py            # todas as marcas
    META_TOKEN=... python3 backfill_cells.py nissan vw  # subconjunto

Para cada marca: 1 chamada com time_increment=1 cobrindo a série inteira (em vez de 30
chamadas de 1 dia) + 1 chamada do mês anterior inteiro (nd_mom_full). Usa a MESMA função
de linhas adset da marca, então a classificação/contagem é idêntica à dos KPIs.
"""
import os, sys, collections, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, HERE)

import meta_api as api
import common

# slug -> (função de linhas adset da marca, segmentos que formam o total comercial)
BRANDS = {
    "nissan":        (lambda m: m.build_agg,               ("NV", "SN", "VD")),
    "chevrolet_sp":  (lambda m: m.build_agg,               ("NV", "SN", "VD")),
    "chevrolet_bsb": (lambda m: m.build_agg,               ("NV", "SN", "VD")),
    "bajaj":         (lambda m: m._agg_rows,               ("NV",)),
    "omoda":         (lambda m: (lambda i: m._load_agg(i)[0]), ("NV",)),
    "seminovos_sp":  (lambda m: m._agg_rows,               ("SN",)),
    "gac":           (lambda m: m._rows,                   ("NV", "SN", "VD")),
    "gwm":           (lambda m: m._rows,                   ("NV", "VD")),
    "vw":            (lambda m: m._rows,                   ("NV", "SN")),
}


def por_dia(insights):
    """Agrupa as linhas de um pull com time_increment=1 por date_start."""
    out = collections.defaultdict(list)
    for i in insights:
        d = i.get("date_start")
        if d:
            out[d].append(i)
    return out


def main():
    slugs = [a for a in sys.argv[1:] if not a.startswith("--")] or list(BRANDS)
    ctx = common.make_ctx()
    for slug in slugs:
        mod = importlib.import_module(f"brands.{slug}")
        aggfn = BRANDS[slug][0](mod)
        seg_total = BRANDS[slug][1]
        acc = getattr(mod, "ACC", None) or getattr(mod, "ACCOUNT", None)
        D = common.jload(f"{slug}_D.json")
        nd = D.get("n_daily") or []
        if not nd:
            print(f"[{slug}] sem n_daily, pulei"); continue
        since, until = nd[0]["date"], nd[-1]["date"]
        rows = api.get_insights(acc, level="adset", since=since, until=until,
                                time_increment=1)["insights"]
        dias = por_dia(rows)
        feitos = 0
        for r in nd:
            cels = common.cells_from_rows(aggfn(dias.get(r["date"], [])))
            if cels:
                r["c"] = cels; feitos += 1
            else:
                r.setdefault("c", [])
        # mês anterior inteiro (base do comparativo filtrado na janela de 30 dias)
        pf = ctx["prev_full"]
        prev = api.get_insights(acc, level="adset", since=pf[0], until=pf[1])["insights"]
        D["nd_mom_full"] = common.mom_full_block(aggfn(prev), seg_total, ctx)
        # mesmo período do mês anterior (base do comparativo na janela do mês corrente):
        # recalcula o bloco inteiro, idêntico ao que o refresh faz, agora já com células
        ms = ctx["mom_sp"]
        msp = api.get_insights(acc, level="adset", since=ms[0], until=ms[1])["insights"]
        D["nd_mom_sp"] = common.mom_sp_block(aggfn(msp), seg_total, ctx)
        common.jdump(f"{slug}_D.json", D)
        print(f"[{slug}] {since}..{until}: {feitos}/{len(nd)} dias com célula | "
              f"nd_mom_full {pf[0]}..{pf[1]} ({len(D['nd_mom_full']['cells'])} células, "
              f"bruto {D['nd_mom_full']['total']['bruto']:.2f})")


if __name__ == "__main__":
    main()
