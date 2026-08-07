#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""meses.py , meses FECHADOS como período de primeira classe nos dashs por marca.

Pedido do Rudy (07/08/2026): o seletor de período do dash por marca passa a ser igual
ao da central , "Agosto (em curso) / Julho/26 / Junho/26" , com "30 dias" ficando como
quarta opção.

POR QUE UM COFRE
Mês fechado não muda mais. Então cada mês é colhido UMA vez e guardado em
`data/_meses/<slug>_<AAAA-MM>.json`; nos ciclos seguintes o arquivo é lido do disco e
nenhuma chamada é feita. Custo: 3 chamadas por marca/mês na primeira vez (adset do mês,
ad do mês, adset com time_increment=1 pra série diária), zero depois.

COMO A REGRA DE CONTAGEM DE CADA MARCA É RESPEITADA
Nada aqui classifica campanha. Cada `brands/<slug>.py` expõe `month_blocks(adset_ins,
ad_ins, day_ins, linkmap)` que roda as MESMAS funções que a marca já usa no mês corrente
(build_agg/kpi_from_agg/build_ads/rank..., com os nomes e as manias de cada uma). Isso
mantém a fidelidade ao legado que o projeto exige: bajaj/chevrolet_sp/nissan contam
conversa em qualquer canal, as outras só no WhatsApp, e por aqui isso não muda.

CONFERÊNCIA
`conferir()` compara o mês fechado recém-montado com o `nd_mom_full` que o harvest do
mês corrente já grava (mês anterior inteiro, mesmas regras). Se os dois baterem, a
classificação do mês fechado está fiel. Divergência aborta a gravação do cofre.
"""
import os, json, calendar, datetime, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
COFRE = os.path.join(HERE, "data", "_meses")

MES_CURTO = ["", "jan", "fev", "mar", "abr", "mai", "jun",
             "jul", "ago", "set", "out", "nov", "dez"]
MES_LONGO = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
             "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

# quantos meses fechados entram no seletor (2 = o dash mostra mês corrente + 2 anteriores)
QUANTOS = 2


def ym(d):
    return "%04d-%02d" % (d.year, d.month)


def label(chave):
    """'2026-07' -> 'Julho/26' (o mesmo rótulo que a central usa)."""
    a, m = chave.split("-")
    return "%s/%s" % (MES_LONGO[int(m)], a[2:])


def curto(chave):
    a, m = chave.split("-")
    return "%s/%s" % (MES_CURTO[int(m)], a[2:])


def range_do_mes(chave):
    a, m = (int(x) for x in chave.split("-"))
    return ("%04d-%02d-01" % (a, m),
            "%04d-%02d-%02d" % (a, m, calendar.monthrange(a, m)[1]))


def fechados(today=None, quantos=QUANTOS):
    """Os N meses FECHADOS antes do mês corrente, do mais recente pro mais antigo."""
    today = today or datetime.date.today()
    out, d = [], today.replace(day=1)
    for _ in range(quantos):
        d = (d - datetime.timedelta(days=1)).replace(day=1)
        out.append(ym(d))
    return out


def caminho(slug, chave):
    return os.path.join(COFRE, "%s_%s.json" % (slug, chave))


def tem(slug, chave):
    return os.path.exists(caminho(slug, chave))


def _limpa(bloco):
    """Nome de anúncio vem da Meta com travessão (U+2014) e o build.py aborta se achar um
    no HTML , regra do projeto, o mesmo tratamento que os refresh já fazem no mês
    corrente (clean() nas bespoke, replace no JSON do _assemble_brand)."""
    s = json.dumps(bloco, ensure_ascii=False, separators=(",", ":"))
    s = s.replace("—", ", ").replace("–", "-")
    return json.loads(s)


def ler(slug, chave):
    p = caminho(slug, chave)
    if not os.path.exists(p):
        return None
    try:
        return _limpa(json.load(open(p, encoding="utf-8")))
    except Exception as e:
        print("  [meses] cofre ilegível %s: %s" % (os.path.basename(p), e))
        return None


def _grava(slug, chave, bloco):
    os.makedirs(COFRE, exist_ok=True)
    json.dump(_limpa(bloco), open(caminho(slug, chave), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))


def conferir(bloco, D, chave):
    """O mês fechado mais recente tem que bater com o `nd_mom_full` do D (mês anterior
    inteiro, colhido pelo ciclo do mês corrente com as mesmas regras). Tolerância de
    0,5% no gasto e exata nos volumes , é a mesma prova de fonte única do build.py."""
    ndf = (D or {}).get("nd_mom_full") or {}
    if not ndf or ndf.get("desde", "")[:7] != chave:
        return True, "sem nd_mom_full deste mês pra conferir"
    a = bloco.get("total") or {}
    b = ndf.get("total") or {}
    if not b.get("bruto"):
        return True, "nd_mom_full sem total"
    d_br = abs(a.get("bruto", 0) - b["bruto"]) / b["bruto"] * 100
    ok = d_br <= 0.5 and a.get("leads") == b.get("leads") and a.get("conv") == b.get("conv")
    txt = ("bruto %.2f vs %.2f (%.3f%%) | leads %s vs %s | conv %s vs %s"
           % (a.get("bruto", 0), b["bruto"], d_br,
              a.get("leads"), b.get("leads"), a.get("conv"), b.get("conv")))
    return ok, txt


def colher(api, slug, chave, D=None, force=False):
    """Colhe UM mês fechado de UMA marca e guarda no cofre. Se já existe, não chama a
    API. Devolve o bloco (do disco ou recém-colhido) ou None se a marca não sabe montar
    mês fechado."""
    if not force:
        b = ler(slug, chave)
        if b:
            return b
    mod = importlib.import_module("brands.%s" % slug)
    if not hasattr(mod, "month_blocks"):
        print("  [meses] %s ainda não expõe month_blocks(), pulando %s" % (slug, chave))
        return None
    acc = mod.ACC
    desde, ate = range_do_mes(chave)
    print("  [meses] colhendo %s %s (%s a %s)" % (slug, chave, desde, ate))
    adset_ins = api.get_insights(acc, level="adset", since=desde, until=ate)["insights"]
    ad_ins = api.get_insights(acc, level="ad", since=desde, until=ate)["insights"]
    day_ins = api.get_insights(acc, level="adset", since=desde, until=ate,
                               time_increment=1)["insights"]
    linkmap = _linkmap_do_D(D)
    bloco = mod.month_blocks(adset_ins, ad_ins, day_ins, linkmap)
    bloco.update({"slug": slug, "mes": chave, "label": label(chave), "curto": curto(chave),
                  "desde": desde, "ate": ate,
                  "gerado": datetime.date.today().isoformat()})
    ok, txt = conferir(bloco, D, chave)
    print("     confere vs nd_mom_full: %s , %s" % ("OK" if ok else "DIVERGIU", txt))
    if not ok:
        print("     [meses] NAO gravei o cofre de %s %s (conferência falhou)" % (slug, chave))
        return None
    _grava(slug, chave, bloco)
    return bloco


def _linkmap_do_D(D):
    """Reaproveita os previews (fb.me) que a marca já tem no D, pra o ranking do mês
    fechado não nascer sem link. O que faltar cai no fallback Ad Library por ad_id, que
    o template já faz."""
    m = {}
    for w, lst in ((D or {}).get("ads") or {}).items():
        if not isinstance(lst, list):
            continue
        for a in lst:
            if a.get("ad") and a.get("link"):
                m[a["ad"]] = a["link"]
    return m


def atualizar(api, slug, D=None, today=None, quantos=QUANTOS):
    """Garante o cofre dos N meses fechados da marca. Devolve a lista de chaves que
    ficaram disponíveis, da mais recente pra mais antiga."""
    out = []
    for chave in fechados(today, quantos):
        b = colher(api, slug, chave, D=D)
        if b:
            out.append(chave)
    return out


def carregar(slug, today=None, quantos=QUANTOS):
    """Blocos dos meses fechados que existem no cofre (usado pelo build.py)."""
    res = []
    for chave in fechados(today, quantos):
        b = ler(slug, chave)
        if b:
            res.append(b)
    return res
