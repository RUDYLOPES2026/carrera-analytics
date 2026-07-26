#!/usr/bin/env python3
"""Prepara o dataset do dash operacional de vendas por mídia.

Diferente da primeira versão: aqui NÃO se agrega quase nada. Sai um dataset de
linhas compactas (uma por venda) e o JavaScript do painel refiltra tudo por
marca, segmento e período, do jeito que os dashs de Meta já funcionam. Agregar
no Python mataria o filtro do topo, que é justamente o que o Rudy usa.

Compactação: cada texto vira índice num dicionário, senão 19 mil linhas com nome
de campanha repetido viram um JSON de vários MB dentro do HTML.
"""
import json
import os
import re
import unicodedata
from datetime import datetime, timedelta

BASE = os.path.dirname(os.path.abspath(__file__))
DIAS_JANELA = 240  # cobre 90d de análise + 90d de comparação + folga

MARCA_NOME = {"GM": "Chevrolet", "VW": "Volkswagen", "NI": "Nissan", "GWC": "GWM",
              "OJC": "Omoda Jaecoo", "BJC": "Bajaj", "GCC": "GAC", "ZK": "Zeekr"}
# Segmento da VENDA (o que foi comprado), não da campanha
SEG_DE_ESTOQUE = {"Novo": "Novos", "Montada": "Novos", "Usado": "Seminovos"}

SEG_EMOJI = {"🟩": "Novos", "🟧": "Seminovos", "🟦": "Venda Direta",
             "🟫": "Remarketing", "🟥": "Outros"}
MARCA_TOK = {"BJC": "Bajaj", "BAJ": "Bajaj", "BAJAJ": "Bajaj", "GM": "Chevrolet",
             "CHEV": "Chevrolet", "VW": "Volkswagen", "NI": "Nissan", "NISSAN": "Nissan",
             "GWM": "GWM", "GWC": "GWM", "OJ": "Omoda Jaecoo", "OJC": "Omoda Jaecoo",
             "OMODA": "Omoda Jaecoo", "GAC": "GAC", "GCC": "GAC", "ZK": "Zeekr",
             "ZEEKR": "Zeekr"}
FORMATO_TOK = {"FORM": "Formulário", "FORMULARIO": "Formulário", "WPP": "WhatsApp",
               "WA": "WhatsApp", "MSG": "WhatsApp", "MENSAGEM": "WhatsApp",
               "RMKT": "Remarketing", "ALCANCE": "Alcance", "TRAFEGO": "Tráfego"}


def tokens(nome):
    s = "".join(c for c in unicodedata.normalize("NFD", nome)
                if unicodedata.category(c) != "Mn")
    return [t for t in re.split(r"[^A-Za-z0-9]+", s.upper()) if t]


def tags_campanha(nome):
    if not nome:
        return []
    t = []
    for e, seg in SEG_EMOJI.items():
        if nome.startswith(e):
            t.append(seg)
            break
    tk = tokens(nome)
    for d in (MARCA_TOK, FORMATO_TOK):
        for x in tk:
            if x in d and d[x] not in t:
                t.append(d[x])
                break
    return t


def limpa(nome):
    """Tira o emoji do começo: ele vira tag, não precisa poluir o nome."""
    if not nome:
        return nome
    for e in SEG_EMOJI:
        if nome.startswith(e):
            return nome[len(e):].strip()
    return nome.strip()


enr = {}
for line in open(f"{BASE}/dados/leads_enriq.ndjson", encoding="utf-8"):
    r = json.loads(line)
    enr[r["Id"]] = r
todas = [json.loads(l) for l in open(f"{BASE}/dados/vendas_cruzadas.ndjson", encoding="utf-8")]

ATE = max(r["dt_venda"] for r in todas)
ate_dt = datetime.strptime(ATE, "%Y-%m-%d")
desde = (ate_dt - timedelta(days=DIAS_JANELA - 1)).strftime("%Y-%m-%d")
rows = [r for r in todas if r["dt_venda"] >= desde]

# ---------------------------------------------------------------- dicionarios
dims = {"dia": [], "marca": [], "seg": [], "origem": [], "campanha": [], "anuncio": [],
        "utm": [], "loja": []}
idx = {k: {} for k in dims}


def ix(dim, val):
    if val is None or val == "":
        return -1
    d, m = dims[dim], idx[dim]
    if val not in m:
        m[val] = len(d)
        d.append(val)
    return m[val]


CLASSES = ["captacao", "outra_origem", "sem_origem"]
linhas = []
for r in rows:
    e = enr.get(r["lead_id_capt"]) or {}
    seg = SEG_DE_ESTOQUE.get(r["tipo_estoque"] or "", None)
    if seg is None:
        seg = "Venda Direta" if (r["interesse"] or "").startswith(("Venda", "Corporate")) \
            else "Outros"
    linhas.append([
        ix("dia", r["dt_venda"]),
        ix("marca", MARCA_NOME.get(r["marca"], "Outros")),
        ix("seg", seg),
        ix("origem", r["midia_real"]),
        CLASSES.index(r["classe_real"]),
        ix("campanha", limpa(e.get("CampaignName__c"))),
        ix("anuncio", e.get("AdName__c")),
        ix("utm", e.get("UTM_Campaign__c")),
        ix("loja", r["empresa"]),
        round((r["valor"] or 0) / 1000),  # em milhares, o painel nao usa centavo
        1 if r["captacao_real"] else 0,
    ])

# classe de cada origem, para o painel colorir sem recalcular
classe_origem = {}
for r in rows:
    classe_origem[r["midia_real"]] = CLASSES.index(r["classe_real"])
origem_classe = [classe_origem.get(o, 2) for o in dims["origem"]]

# tags de cada campanha, calculadas uma vez so
camp_tags = [tags_campanha(c) for c in dims["campanha"]]

# ---------------------------------------------------------------- cobertura
capt = [r for r in todas if r["captacao_real"]]
fb90 = [r for r in capt if r["captacao_real"] == "Facebook"
        and r["dt_venda"] >= (ate_dt - timedelta(days=89)).strftime("%Y-%m-%d")]
com = lambda rs, c: sum(1 for r in rs if (enr.get(r["lead_id_capt"]) or {}).get(c))
cobertura = {
    "fb90_total": len(fb90), "fb90_camp": com(fb90, "CampaignName__c"),
    "capt_total": len(capt), "capt_camp": com(capt, "CampaignName__c"),
    "utm": com(capt, "UTM_Campaign__c"),
}
cobertura["fb90_pct"] = round(100 * cobertura["fb90_camp"] / max(cobertura["fb90_total"], 1))
cobertura["capt_pct"] = round(100 * cobertura["capt_camp"] / max(cobertura["capt_total"], 1))

saida = {
    "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "ate": ATE, "desde": desde,
    "dims": dims,
    "origem_classe": origem_classe,
    "camp_tags": camp_tags,
    "linhas": linhas,
    "cobertura": cobertura,
}
with open(f"{BASE}/dados_midia.json", "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))

kb = os.path.getsize(f"{BASE}/dados_midia.json") / 1024
print(f"dados_midia.json: {len(linhas):,} vendas de {desde} a {ATE} ({kb:.0f} KB)")
print(f"  marcas {len(dims['marca'])} | origens {len(dims['origem'])} | "
      f"campanhas {len(dims['campanha'])} | anúncios {len(dims['anuncio'])} | "
      f"UTMs {len(dims['utm'])}")
print(f"  cobertura Facebook 90d: {cobertura['fb90_pct']}%")
