#!/usr/bin/env python3
"""Agrega o cruzamento em dados.json, a fonte unica do dash de Conversoes Reais."""
import json
import os
from collections import Counter, defaultdict
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))

MARCA_NOME = {
    "GM": "Chevrolet", "VW": "Volkswagen", "NI": "Nissan", "GWC": "GWM",
    "OJC": "Omoda Jaecoo", "BJC": "Bajaj", "GCC": "GAC", "ZK": "Zeekr",
    "Outros": "Outros",
}

# Rotulos que contam como midia de captacao (espelha RASTREAVEL do cruzamento.py).
RASTREAVEL_LBL = {"Facebook", "WhatsApp", "Webmotors", "Mercado Livre", "OLX", "MobiAuto",
                  "Site Carrera", "Lead Montadora", "OPV Montadora"}

# Operacoes de patio/atacado: nao sao loja de varejo, entram no total mas ficam
# fora do ranking de disciplina de CRM (100% avulso ali e o normal do negocio).
PATIO = {"PAT VW ALPHAVILLE", "X.AGIL", "MAT GM", "MTZ BL"}

rows = [json.loads(l) for l in open(f"{BASE}/dados/vendas_cruzadas.ndjson", encoding="utf-8")]


def bloco(rs):
    """KPIs de um recorte qualquer de vendas."""
    n = len(rs)
    if not n:
        return None
    antes = sum(1 for r in rs if r["classe_declarada"] == "rastreavel")
    depois = sum(1 for r in rs if r["classe_real"] == "rastreavel")
    avulso = sum(1 for r in rs if r["midia_declarada"] == "Lead Avulso")
    return {
        "vendas": n,
        "valor": round(sum(r["valor"] or 0 for r in rs)),
        "antes": antes,
        "depois": depois,
        "recuperadas": sum(1 for r in rs if r["recuperada"]),
        "com_lead": sum(1 for r in rs if r["n_leads"]),
        "avulso": avulso,
        "pct_antes": round(100 * antes / n, 1),
        "pct_depois": round(100 * depois / n, 1),
        "pct_avulso": round(100 * avulso / n, 1),
        "fator": round(depois / antes, 2) if antes else None,
    }


def top_midias(rs, campo, k=6, so_rastreavel=False):
    c = Counter(r[campo] for r in rs)
    if so_rastreavel:
        c = Counter({m: v for m, v in c.items() if m in RASTREAVEL_LBL})
    return [{"midia": m, "n": v} for m, v in c.most_common(k)]


# ---------------------------------------------------------------- grupo
grupo = bloco(rows)
lags = sorted(r["lag_dias"] for r in rows if r["lag_dias"] is not None)
grupo["lag_mediana"] = lags[len(lags) // 2] if lags else None
grupo["lag_ate_30d"] = round(100 * sum(1 for l in lags if l <= 30) / len(lags), 1) if lags else None
grupo["lag_ate_90d"] = round(100 * sum(1 for l in lags if l <= 90) / len(lags), 1) if lags else None

# Afericao do metodo: nas vendas em que o Sales JA sabia a midia e o cruzamento
# tambem achou uma, os dois apontam para a mesma midia? E o teste de credibilidade.
ctrl = [r for r in rows if r["classe_declarada"] == "rastreavel" and r["classe_real"] == "rastreavel"]
acertos = sum(1 for r in ctrl if r["midia_declarada"] == r["midia_real"])
grupo["aferic_base"] = len(ctrl)
grupo["aferic_pct"] = round(100 * acertos / len(ctrl), 1) if ctrl else None

# Sensibilidade: quanto do ganho sobrevive se a janela do lead for mais curta.
base_rastr = grupo["antes"]
recs = [r for r in rows if r["recuperada"] and r["lag_dias"] is not None]
grupo["sens"] = [
    {"janela": "sem limite", "n": grupo["depois"], "pct": grupo["pct_depois"]},
    *[{"janela": f"até {j} dias",
       "n": base_rastr + sum(1 for r in recs if r["lag_dias"] <= j),
       "pct": round(100 * (base_rastr + sum(1 for r in recs if r["lag_dias"] <= j)) / len(rows), 1)}
      for j in (90, 30)],
]

# Mediana do intervalo lead->venda SO nas recuperadas. A mediana geral e 1 dia
# porque e puxada pelos leads de balcao, que nascem no dia da venda; nas
# recuperadas o que interessa e a distancia da midia ate a compra.
lags_rec = sorted(r["lag_dias"] for r in rows if r["recuperada"] and r["lag_dias"] is not None)
grupo["lag_mediana_rec"] = lags_rec[len(lags_rec) // 2] if lags_rec else None

# Distribuicao do intervalo entre o lead e a venda, so nas recuperadas.
faixas = [("Mesmo dia", 0, 0), ("1 a 2 dias", 1, 2), ("3 a 7 dias", 3, 7),
          ("8 a 30 dias", 8, 30), ("31 a 90 dias", 31, 90), ("Mais de 90 dias", 91, 10**6)]
grupo["lag_faixas"] = [
    {"faixa": nome, "n": (q := sum(1 for r in recs if lo <= r["lag_dias"] <= hi)),
     "pct": round(100 * q / len(recs), 1) if recs else 0}
    for nome, lo, hi in faixas
]

# ---------------------------------------------------------------- de-para de midia
decl_c, real_c = Counter(), Counter()
valor_real = defaultdict(float)
for r in rows:
    decl_c[r["midia_declarada"]] += 1
    real_c[r["midia_real"]] += 1
    valor_real[r["midia_real"]] += r["valor"] or 0
midias = [{
    "midia": m,
    "declarado": decl_c[m],
    "real": real_c[m],
    "delta": real_c[m] - decl_c[m],
    "valor_real": round(valor_real[m]),
    "rastreavel": m in RASTREAVEL_LBL,
} for m in sorted(set(decl_c) | set(real_c), key=lambda m: -real_c[m])]

# ---------------------------------------------------------------- mes a mes
por_mes = defaultdict(list)
for r in rows:
    por_mes[r["mes"]].append(r)
meses = [dict(mes=m, **bloco(rs)) for m, rs in sorted(por_mes.items())]

# ---------------------------------------------------------------- marcas
por_marca = defaultdict(list)
for r in rows:
    por_marca[r["marca"] or "Outros"].append(r)
marcas = []
for cod, rs in sorted(por_marca.items(), key=lambda kv: -len(kv[1])):
    b = bloco(rs)
    b.update(codigo=cod, marca=MARCA_NOME.get(cod, cod),
             real_top=top_midias(rs, "midia_real"),
             real_top_rastr=top_midias(rs, "midia_real", so_rastreavel=True),
             decl_top=top_midias(rs, "midia_declarada"))
    marcas.append(b)

# ---------------------------------------------------------------- lojas
por_loja = defaultdict(list)
for r in rows:
    por_loja[r["empresa"] or "Sem loja"].append(r)
lojas = []
for loja, rs in por_loja.items():
    b = bloco(rs)
    cod = loja.split()[-1] if loja and " " in loja else "Outros"
    b.update(loja=loja, codigo=cod, marca=MARCA_NOME.get(cod, "Outros"),
             patio=loja in PATIO)
    lojas.append(b)
lojas.sort(key=lambda x: -x["vendas"])

# ---------------------------------------------------------------- interesse
por_int = defaultdict(list)
for r in rows:
    por_int[r["interesse"] or "Sem interesse"].append(r)
interesses = []
for i, rs in sorted(por_int.items(), key=lambda kv: -len(kv[1])):
    b = bloco(rs)
    b.update(interesse=i, real_top=top_midias(rs, "midia_real"),
             real_top_rastr=top_midias(rs, "midia_real", so_rastreavel=True))
    interesses.append(b)

# ---------------------------------------------------------------- marca x midia real
marca_midia = []
for cod, rs in por_marca.items():
    c = Counter(r["midia_real"] for r in rs)
    for m, v in c.items():
        marca_midia.append({"marca": MARCA_NOME.get(cod, cod), "midia": m, "n": v})

saida = {
    "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "cobertura": {
        "de": min(r["dt_venda"] for r in rows),
        "ate": max(r["dt_venda"] for r in rows),
    },
    "grupo": grupo,
    "midias": midias,
    "meses": meses,
    "marcas": marcas,
    "lojas": lojas,
    "interesses": interesses,
    "marca_midia": marca_midia,
}

with open(f"{BASE}/dados.json", "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False, indent=1)

print(f"dados.json gravado. Vendas {grupo['vendas']:,} | "
      f"rastreavel {grupo['pct_antes']}% -> {grupo['pct_depois']}% "
      f"(fator {grupo['fator']}x) | recuperadas {grupo['recuperadas']:,}")
print(f"Lojas: {len(lojas)} | marcas: {len(marcas)} | meses: {len(meses)}")
